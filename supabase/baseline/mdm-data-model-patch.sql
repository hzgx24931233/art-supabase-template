-- ===========================================================================
-- 主数据（MDM）数据模型补丁
--
-- 用途：把主数据四块（物料 / 工程 / 销售 / 生产）所需的数据库对象补进已存在的项目（xmgl）。
--       对象定义从 scripts/build-platform-baseline.ts 生成的 platform-baseline.sql 中原样抽取。
--
-- 内容：34 张 mdm_* 表及其序列、约束、外键、索引、RLS 策略、触发器与授权，
--       以及迁移代码与表定义依赖而目标库缺失的 16 个函数。
--       全新项目执行 platform-baseline.sql + platform-seed.sql 即可，不需要本文件。
--
-- 幂等：块内均为 IF NOT EXISTS / DROP ... IF EXISTS / CREATE OR REPLACE，整段包在事务里。
--
-- 应用方式：node .artifacts/run-sql.mjs supabase/baseline/mdm-data-model-patch.sql
-- ===========================================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET check_function_bodies = false;

begin;

-- Name: apply_vehicle_type_profile(); Type: FUNCTION; Schema: app_private
--

--

CREATE OR REPLACE FUNCTION "app_private"."apply_vehicle_type_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_profile public.vehicle_type_profile%rowtype;
begin
  if new.vehicle_type_profile_id is null then
    if tg_op = 'UPDATE' and old.vehicle_type_profile_id is not null then
      new.spec_length_m := null;
      new.volume_m3 := null;
      new.load_tons := null;
    end if;
    return new;
  end if;
  select * into v_profile
  from public.vehicle_type_profile p
  where p.id = new.vehicle_type_profile_id
    and p.tenant_id = new.tenant_id;
  if not found then
    raise exception '所选车型不属于当前车辆租户' using errcode = '42501';
  end if;
  if v_profile.status <> '1' then
    if tg_op = 'INSERT' then
      raise exception '所选车型已禁用，请重新参选';
    end if;
    if tg_op = 'UPDATE' then
      if new.vehicle_type_profile_id is distinct from old.vehicle_type_profile_id then
        raise exception '所选车型已禁用，请重新参选';
      end if;
    end if;
  end if;
  new.vehicle_type := v_profile.category;
  new.spec_length_m := v_profile.length_m;
  new.volume_m3 := v_profile.volume_m3;
  new.load_tons := v_profile.load_tons;
  return new;
end;
$$;


ALTER FUNCTION "app_private"."apply_vehicle_type_profile"() OWNER TO "postgres";

--

--

-- Name: can_access_vms_vehicle_reference_data(); Type: FUNCTION; Schema: app_private
--

--

CREATE OR REPLACE FUNCTION "app_private"."can_access_vms_vehicle_reference_data"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.sys_menu menu_row
      where menu_row.type = 'menu'
        and (
          menu_row.name like 'Vehicle%'
          or menu_row.name = any(array[
            'Console',
            'TmsCarrier',
            'TmsCarrierDetail',
            'TmsDriver',
            'TmsCarrierPrice',
            'TmsCarrierPriceDetail',
            'TmsCarrierPriceEdit',
            'TmsOrderOpen',
            'TmsOrderList',
            'TmsPendingWaybillList',
            'TmsLoadedWaybillList',
            'TmsWaybillDetail',
            'TmsInTransitMonitor'
          ]::text[])
        )
        and app_private.can_access_business_menu(menu_row.name)
    );
$$;


ALTER FUNCTION "app_private"."can_access_vms_vehicle_reference_data"() OWNER TO "postgres";

--

--

-- Name: mdm_change_request_state_audit(); Type: FUNCTION; Schema: app_private
--

--

CREATE OR REPLACE FUNCTION "app_private"."mdm_change_request_state_audit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_action text;
  v_comment text;
  v_actor_user_id uuid;
  v_actor_email text;
begin
  if tg_op = 'UPDATE' and new.state is not distinct from old.state then
    return new;
  end if;

  v_action := coalesce(
    nullif(current_setting('app.mdm_change_action', true), ''),
    case when tg_op = 'INSERT' then 'create' else 'system_transition' end
  );
  v_comment := nullif(current_setting('app.mdm_change_comment', true), '');

  begin
    v_actor_user_id := app_private.mdm_current_actor_user_id();
    v_actor_email := app_private.mdm_current_actor_email();
  exception when sqlstate '42501' then
    v_actor_user_id := null;
    v_actor_email := 'system';
  end;

  insert into public.mdm_change_request_event (
    tenant_id,
    request_id,
    from_state,
    to_state,
    action,
    actor_user_id,
    actor_email,
    comment,
    snapshot
  ) values (
    new.tenant_id,
    new.id,
    case when tg_op = 'UPDATE' then old.state else null end,
    new.state,
    v_action,
    v_actor_user_id,
    v_actor_email,
    v_comment,
    jsonb_build_object(
      'requestNo', new.request_no,
      'domainKey', new.domain_key,
      'sourceType', new.source_type,
      'sourceRecordId', new.source_record_id,
      'operation', new.operation,
      'version', new.version,
      'effectiveAt', new.effective_at,
      'beforeData', new.before_data,
      'proposedData', new.proposed_data
    )
  );

  perform app_private.mdm_emit_outbox_event(
    new.tenant_id,
    'change_request',
    new.id,
    'mdm.change-request.' || replace(new.state, '_', '-'),
    jsonb_build_object(
      'requestId', new.id,
      'requestNo', new.request_no,
      'sourceType', new.source_type,
      'sourceRecordId', new.source_record_id,
      'operation', new.operation,
      'state', new.state,
      'effectiveAt', new.effective_at,
      'beforeData', new.before_data,
      'proposedData', new.proposed_data
    )
  );

  return new;
end
$$;


ALTER FUNCTION "app_private"."mdm_change_request_state_audit"() OWNER TO "postgres";

--

--

-- Name: mdm_current_actor_email(); Type: FUNCTION; Schema: app_private
--

--

CREATE OR REPLACE FUNCTION "app_private"."mdm_current_actor_email"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_email text;
begin
  select u.user_email
    into v_email
  from public.sys_user u
  where u.auth_user_id = (select auth.uid())
    and u.status = '1'
    and u.deleted_at is null;

  if nullif(btrim(v_email), '') is null then
    raise exception '当前业务账号邮箱不可用' using errcode = '42501';
  end if;
  return v_email;
end
$$;


ALTER FUNCTION "app_private"."mdm_current_actor_email"() OWNER TO "postgres";

--

--

-- Name: mdm_emit_outbox_event("uuid", "text", "uuid", "text", "jsonb", "uuid", "uuid"); Type: FUNCTION; Schema: app_private
--

--

CREATE OR REPLACE FUNCTION "app_private"."mdm_emit_outbox_event"("p_tenant_id" "uuid", "p_aggregate_type" "text", "p_aggregate_id" "uuid", "p_event_type" "text", "p_payload" "jsonb", "p_correlation_id" "uuid" DEFAULT NULL::"uuid", "p_causation_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_event_id uuid;
begin
  if nullif(btrim(p_aggregate_type), '') is null
    or nullif(btrim(p_event_type), '') is null
    or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception '主数据事件参数不完整' using errcode = '22023';
  end if;

  insert into public.mdm_outbox_event (
    tenant_id,
    aggregate_type,
    aggregate_id,
    event_type,
    event_version,
    payload,
    correlation_id,
    causation_id
  ) values (
    p_tenant_id,
    p_aggregate_type,
    p_aggregate_id,
    p_event_type,
    1,
    p_payload,
    p_correlation_id,
    p_causation_id
  ) returning id into v_event_id;

  insert into public.mdm_outbox_delivery (tenant_id, event_id, consumer_id)
  select consumer.tenant_id, v_event_id, consumer.id
  from public.mdm_outbox_consumer consumer
  where consumer.tenant_id = p_tenant_id
    and consumer.enabled
    and ('*' = any (consumer.event_types) or p_event_type = any (consumer.event_types));

  return v_event_id;
end
$$;


ALTER FUNCTION "app_private"."mdm_emit_outbox_event"("p_tenant_id" "uuid", "p_aggregate_type" "text", "p_aggregate_id" "uuid", "p_event_type" "text", "p_payload" "jsonb", "p_correlation_id" "uuid", "p_causation_id" "uuid") OWNER TO "postgres";

--

--

-- Name: mdm_prevent_immutable_event_mutation(); Type: FUNCTION; Schema: app_private
--

--

CREATE OR REPLACE FUNCTION "app_private"."mdm_prevent_immutable_event_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  raise exception '主数据审计事件为不可变记录，禁止修改或删除' using errcode = '42501';
end
$$;


ALTER FUNCTION "app_private"."mdm_prevent_immutable_event_mutation"() OWNER TO "postgres";

--

--

-- Name: mdm_quality_issue_state_audit(); Type: FUNCTION; Schema: app_private
--

--

CREATE OR REPLACE FUNCTION "app_private"."mdm_quality_issue_state_audit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_action text;
  v_comment text;
  v_actor_user_id uuid;
  v_actor_email text;
begin
  if tg_op = 'UPDATE' and new.state is not distinct from old.state then
    return new;
  end if;

  v_action := coalesce(
    nullif(current_setting('app.mdm_issue_action', true), ''),
    case when tg_op = 'INSERT' then 'detected' else 'system_reassessment' end
  );
  v_comment := nullif(current_setting('app.mdm_issue_comment', true), '');

  begin
    v_actor_user_id := app_private.mdm_current_actor_user_id();
    v_actor_email := app_private.mdm_current_actor_email();
  exception when sqlstate '42501' then
    v_actor_user_id := null;
    v_actor_email := 'system';
  end;

  insert into public.mdm_quality_issue_event (
    tenant_id,
    issue_id,
    from_state,
    to_state,
    action,
    actor_user_id,
    actor_email,
    comment,
    event_data
  ) values (
    new.tenant_id,
    new.id,
    case when tg_op = 'UPDATE' then old.state else null end,
    new.state,
    v_action,
    v_actor_user_id,
    v_actor_email,
    v_comment,
    jsonb_build_object(
      'observedStatus', new.observed_status,
      'severity', new.severity,
      'detectionCount', new.detection_count
    )
  );

  perform app_private.mdm_emit_outbox_event(
    new.tenant_id,
    'quality_issue',
    new.id,
    'mdm.quality-issue.' || replace(new.state, '_', '-'),
    jsonb_build_object(
      'issueId', new.id,
      'ruleId', new.rule_id,
      'sourceType', new.source_type,
      'sourceRecordId', new.source_record_id,
      'state', new.state,
      'observedStatus', new.observed_status,
      'dueAt', new.due_at
    )
  );

  return new;
end
$$;


ALTER FUNCTION "app_private"."mdm_quality_issue_state_audit"() OWNER TO "postgres";

--

--

-- Name: mdm_shift_schedule_occurrence_overlap("date", "date", smallint[], "date", "date", smallint[]); Type: FUNCTION; Schema: app_private
--

--

CREATE OR REPLACE FUNCTION "app_private"."mdm_shift_schedule_occurrence_overlap"("p_left_start" "date", "p_left_end" "date", "p_left_weekdays" smallint[], "p_right_start" "date", "p_right_end" "date", "p_right_weekdays" smallint[]) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
with bounds as (
  select greatest(p_left_start,p_right_start) start_date,
    least(coalesce(p_left_end,'infinity'::date),coalesce(p_right_end,'infinity'::date)) end_date
), candidate_dates as (
  select day::date work_date from bounds
  cross join lateral generate_series(
    start_date::timestamp,least(end_date,start_date+6)::timestamp,interval '1 day'
  ) day where end_date>=start_date
)
select exists(
  select 1 from candidate_dates
  where extract(dow from work_date)::smallint=any(p_left_weekdays)
    and extract(dow from work_date)::smallint=any(p_right_weekdays)
)
$$;


ALTER FUNCTION "app_private"."mdm_shift_schedule_occurrence_overlap"("p_left_start" "date", "p_left_end" "date", "p_left_weekdays" smallint[], "p_right_start" "date", "p_right_end" "date", "p_right_weekdays" smallint[]) OWNER TO "postgres";

--

--

-- Name: set_supplier_child_tenant(); Type: FUNCTION; Schema: app_private
--

--

CREATE OR REPLACE FUNCTION "app_private"."set_supplier_child_tenant"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare v_tenant_id uuid;
begin
  if tg_op='UPDATE' and new.supplier_id is distinct from old.supplier_id then
    raise exception '不能更改关联供应商' using errcode='23514';
  end if;
  select s.tenant_id into v_tenant_id from public.mdm_supplier s where s.id=new.supplier_id;
  if v_tenant_id is null then raise exception '供应商不存在' using errcode='23503'; end if;
  new.tenant_id := v_tenant_id;
  if tg_op='UPDATE' then new.update_time := now(); end if;
  return new;
end $$;


ALTER FUNCTION "app_private"."set_supplier_child_tenant"() OWNER TO "postgres";

--

--

-- Name: set_vehicle_archive_creator_identity(); Type: FUNCTION; Schema: app_private
--

--

CREATE OR REPLACE FUNCTION "app_private"."set_vehicle_archive_creator_identity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_current_user_id uuid := app_private.current_app_user_id();
  v_current_user_tenant_id uuid;
begin
  if tg_op = 'INSERT' then
    if v_current_user_id is not null then
      select user_row.tenant_id
      into v_current_user_tenant_id
      from public.sys_user user_row
      where user_row.id = v_current_user_id;
    end if;

    if v_current_user_id is not null and v_current_user_tenant_id = new.tenant_id then
      new.created_by_user_id := v_current_user_id;
    elsif v_current_user_id is null and new.created_by_user_id is null then
      select user_row.id
      into new.created_by_user_id
      from public.sys_user user_row
      where user_row.tenant_id = new.tenant_id
        and lower(user_row.user_email) = lower(new.create_by)
        and user_row.deleted_at is null
      order by user_row.create_time, user_row.id
      limit 1;
    end if;

    if new.created_by_user_id is null or not exists (
      select 1
      from public.sys_user user_row
      where user_row.id = new.created_by_user_id
        and user_row.tenant_id = new.tenant_id
    ) then
      raise exception 'Authenticated vehicle archive creator identity is required'
        using errcode = '42501';
    end if;
  elsif new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'Vehicle archive creator identity is immutable' using errcode = '42501';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "app_private"."set_vehicle_archive_creator_identity"() OWNER TO "postgres";

--

--

-- Name: sync_mdm_business_partner_role(); Type: FUNCTION; Schema: app_private
--

--

CREATE OR REPLACE FUNCTION "app_private"."sync_mdm_business_partner_role"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  source_row jsonb;
  source_id_value uuid;
  tenant_id_value uuid;
  role_code_value text;
  source_code_value text;
  partner_code_value text;
  partner_name_value text;
  legal_name_value text;
  registration_no_value text;
  tax_no_value text;
  enabled_value boolean;
  status_value text;
  region_value text;
  address_value text;
  contact_name_value text;
  contact_phone_value text;
  contact_email_value text;
  old_source_id uuid;
  old_tenant_id uuid;
begin
  if tg_op = 'DELETE' then
    source_row := to_jsonb(old);
  else
    source_row := to_jsonb(new);
  end if;

  source_id_value := (source_row ->> 'id')::uuid;
  tenant_id_value := (source_row ->> 'tenant_id')::uuid;

  case tg_table_name
    when 'mdm_customer' then
      role_code_value := 'customer';
      source_code_value := source_row ->> 'customer_code';
      partner_name_value := source_row ->> 'customer_name';
      legal_name_value := coalesce(nullif(source_row ->> 'invoice_title', ''), partner_name_value);
      tax_no_value := nullif(source_row ->> 'tax_no', '');
      enabled_value := coalesce((source_row ->> 'enabled')::boolean, true);
      status_value := case when enabled_value then 'enabled' else 'disabled' end;
      contact_name_value := source_row ->> 'contact_name';
    when 'mdm_carrier' then
      role_code_value := 'carrier';
      source_code_value := source_row ->> 'carrier_code';
      partner_name_value := source_row ->> 'company_name';
      legal_name_value := partner_name_value;
      registration_no_value := nullif(source_row ->> 'business_license_no', '');
      tax_no_value := coalesce(nullif(source_row ->> 'tax_no', ''), nullif(source_row ->> 'tax_registration_no', ''));
      enabled_value := coalesce((source_row ->> 'enabled')::boolean, true);
      status_value := case when enabled_value then 'enabled' else 'disabled' end;
      contact_name_value := source_row ->> 'contact_name';
    when 'mdm_supplier' then
      role_code_value := 'supplier';
      source_code_value := source_row ->> 'supplier_code';
      partner_name_value := source_row ->> 'supplier_name';
      legal_name_value := partner_name_value;
      enabled_value := true;
      status_value := 'enabled';
      contact_name_value := source_row ->> 'contact_person';
    when 'mdm_insurance_company' then
      role_code_value := 'insurance_company';
      partner_name_value := source_row ->> 'company_name';
      legal_name_value := partner_name_value;
      enabled_value := true;
      status_value := 'enabled';
      contact_name_value := source_row ->> 'contact_person';
    when 'mdm_external_vendor' then
      role_code_value := 'external_vendor';
      source_code_value := source_row ->> 'vendor_code';
      partner_name_value := source_row ->> 'vendor_name';
      legal_name_value := partner_name_value;
      registration_no_value := nullif(source_row ->> 'registration_no', '');
      status_value := coalesce(nullif(source_row ->> 'status', ''), 'draft');
      enabled_value := status_value not in ('disabled', 'inactive', 'archived');
      contact_name_value := source_row ->> 'contact_name';
    else
      raise exception 'Unsupported MDM role source table: %', tg_table_name;
  end case;

  partner_code_value := role_code_value || ':' || coalesce(nullif(btrim(source_code_value), ''), source_id_value::text);
  region_value := source_row ->> 'region';
  address_value := source_row ->> 'address_detail';
  contact_phone_value := source_row ->> 'contact_phone';
  contact_email_value := source_row ->> 'contact_email';

  if tg_op = 'DELETE' then
    delete from public.mdm_business_partner_role
    where source_table = tg_table_name and source_id = source_id_value;

    delete from public.mdm_business_partner partner
    where partner.id = source_id_value
      and partner.tenant_id = tenant_id_value
      and not exists (
        select 1
        from public.mdm_business_partner_role role_record
        where role_record.partner_id = partner.id
          and role_record.tenant_id = partner.tenant_id
      );
    return old;
  end if;

  if tg_op = 'UPDATE' then
    old_source_id := old.id;
    old_tenant_id := old.tenant_id;
    if old_source_id <> source_id_value or old_tenant_id <> tenant_id_value then
      delete from public.mdm_business_partner_role
      where source_table = tg_table_name and source_id = old_source_id;

      delete from public.mdm_business_partner partner
      where partner.id = old_source_id
        and partner.tenant_id = old_tenant_id
        and not exists (
          select 1
          from public.mdm_business_partner_role role_record
          where role_record.partner_id = partner.id
            and role_record.tenant_id = partner.tenant_id
        );
    end if;
  end if;

  insert into public.mdm_business_partner (
    id,
    tenant_id,
    partner_code,
    source_code,
    partner_name,
    legal_name,
    registration_no,
    tax_no,
    enabled,
    status,
    region,
    address_detail,
    contact_name,
    contact_phone,
    contact_email
  ) values (
    source_id_value,
    tenant_id_value,
    partner_code_value,
    source_code_value,
    partner_name_value,
    legal_name_value,
    registration_no_value,
    tax_no_value,
    enabled_value,
    status_value,
    region_value,
    address_value,
    contact_name_value,
    contact_phone_value,
    contact_email_value
  )
  on conflict (id) do update
  set partner_code = excluded.partner_code,
      source_code = excluded.source_code,
      partner_name = excluded.partner_name,
      legal_name = excluded.legal_name,
      registration_no = excluded.registration_no,
      tax_no = excluded.tax_no,
      enabled = excluded.enabled,
      status = excluded.status,
      region = excluded.region,
      address_detail = excluded.address_detail,
      contact_name = excluded.contact_name,
      contact_phone = excluded.contact_phone,
      contact_email = excluded.contact_email
  where mdm_business_partner.tenant_id = excluded.tenant_id;

  if not found then
    raise exception 'Business partner UUID % is already owned by another tenant', source_id_value;
  end if;

  insert into public.mdm_business_partner_role (
    tenant_id,
    partner_id,
    role_code,
    source_table,
    source_id
  ) values (
    tenant_id_value,
    source_id_value,
    role_code_value,
    tg_table_name,
    source_id_value
  )
  on conflict (source_table, source_id) do update
  set tenant_id = excluded.tenant_id,
      partner_id = excluded.partner_id,
      role_code = excluded.role_code;

  return new;
end;
$$;


ALTER FUNCTION "app_private"."sync_mdm_business_partner_role"() OWNER TO "postgres";

--

--

-- Name: tms_cargo_apply_material(); Type: FUNCTION; Schema: app_private
--

--

CREATE OR REPLACE FUNCTION "app_private"."tms_cargo_apply_material"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_material public.mdm_material%rowtype;
begin
  if tg_op='UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'Cargo tenant cannot be changed' using errcode='42501';
  end if;
  if new.material_id is not null then
    if (select auth.uid()) is not null and not app_private.tenant_in_current_read_scope(new.tenant_id) then
      raise exception 'Cargo material is outside the selected tenant scope' using errcode='42501';
    end if;
    select * into v_material from public.mdm_material
    where id=new.material_id and tenant_id=new.tenant_id and status='enabled';
    if not found then raise exception 'MDM material is unavailable for this tenant'; end if;
    new.cargo_code := v_material.material_code;
    new.cargo_name := v_material.material_name;
    new.spec_model := v_material.specification_model;
    new.unit := v_material.basic_unit;
    if new.material_group_id is null then
      new.material_group_id := v_material.material_group_id;
    end if;
  end if;
  if new.material_group_id is not null and not exists (
    select 1 from public.mdm_master_group
    where id=new.material_group_id and tenant_id=new.tenant_id
      and domain='material' and enabled
  ) then raise exception 'Material group is unavailable for this tenant'; end if;
  return new;
end $$;


ALTER FUNCTION "app_private"."tms_cargo_apply_material"() OWNER TO "postgres";

--

--

-- Name: mdm_driver; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_driver" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "carrier_id" "uuid" NOT NULL,
    "driver_name" character varying(50) NOT NULL,
    "phone" character varying(20) NOT NULL,
    "gender" character varying(20) NOT NULL,
    "id_card_no" character varying(30) NOT NULL,
    "license_type" character varying(20) NOT NULL,
    "license_expire_date" "date",
    "home_address" character varying(255),
    "emergency_contact_name" character varying(50),
    "emergency_contact_phone" character varying(20),
    "enabled" boolean DEFAULT true NOT NULL,
    "id_card_front_url" "text",
    "id_card_back_url" "text",
    "driver_license_front_url" "text",
    "driver_license_back_url" "text",
    "remark" "text",
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL,
    "driver_type" character varying(20) DEFAULT 'primary'::character varying NOT NULL,
    "created_by_user_id" "uuid" NOT NULL,
    "employee_id" "uuid",
    CONSTRAINT "tms_driver_driver_type_check" CHECK ((("driver_type")::"text" = ANY (ARRAY[('primary'::character varying)::"text", ('secondary'::character varying)::"text"])))
);


ALTER TABLE "public"."mdm_driver" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_driver"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_driver" IS 'MDM 驾驶员主数据；连接承运商、内部员工身份与驾驶资质。';


--

--

-- Name: trg_require_workflow_for_vehicle_review(); Type: FUNCTION; Schema: app_private
--

--

CREATE OR REPLACE FUNCTION "app_private"."trg_require_workflow_for_vehicle_review"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if (
    new.audit_status is distinct from old.audit_status
    or new.audit_by is distinct from old.audit_by
    or new.audit_time is distinct from old.audit_time
    or new.audit_remark is distinct from old.audit_remark
  ) and coalesce(
    pg_catalog.current_setting('app.workflow_engine', true),
    ''
  ) <> 'on' then
    raise exception '车辆档案审核状态与审核信息必须通过审批中心流转';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "app_private"."trg_require_workflow_for_vehicle_review"() OWNER TO "postgres";

--

--

-- Name: validate_mdm_shift_schedule(); Type: FUNCTION; Schema: app_private
--

--

CREATE OR REPLACE FUNCTION "app_private"."validate_mdm_shift_schedule"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare v_permission text; v_pattern public.mdm_production_shift_pattern%rowtype; v_shift jsonb;
begin
  v_permission:=case when tg_op='INSERT' then 'MdmShiftScheduling:Add'
    when new.deleted_at is not null and old.deleted_at is null then 'MdmShiftScheduling:Delete'
    else 'MdmShiftScheduling:Edit' end;
  if auth.uid() is null or not app_private.has_permission(v_permission) then
    raise exception '没有排班维护权限' using errcode='42501';
  end if;
  if tg_op='UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception '不能更改排班所属租户';
  end if;
  if new.date_mode not in ('single','ongoing','range')
    or (new.date_mode='single' and new.end_date is distinct from new.start_date)
    or (new.date_mode='ongoing' and new.end_date is not null)
    or (new.date_mode='range' and (new.end_date is null or new.end_date<new.start_date)) then
    raise exception '排班日期范围无效';
  end if;
  if cardinality(new.weekdays) is null or cardinality(new.weekdays) not between 1 and 7
    or array_position(new.weekdays,null) is not null
    or exists(select 1 from unnest(new.weekdays) weekday where weekday not between 0 and 6) then
    raise exception '请至少选择一个有效的参与星期';
  end if;
  select * into v_pattern from public.mdm_production_shift_pattern p
  where p.id=new.pattern_id and p.department_id=new.department_id and p.tenant_id=new.tenant_id;
  if not found then raise exception '轮班模式不属于当前部门或产线'; end if;
  if new.shift_index<1 or new.shift_index>jsonb_array_length(v_pattern.shifts) then
    raise exception '请选择有效班次';
  end if;
  v_shift:=v_pattern.shifts->(new.shift_index-1);
  new.shift_name:=btrim(v_shift->>'name');
  new.shift_start_time:=(v_shift->>'startTime')::time;
  new.shift_end_time:=(v_shift->>'endTime')::time;
  if new.deleted_at is null and exists(
    select 1 from public.mdm_shift_schedule s
    where s.tenant_id=new.tenant_id and s.department_id=new.department_id
      and s.pattern_id=new.pattern_id and s.shift_index=new.shift_index
      and s.deleted_at is null and s.id<>new.id
      and app_private.mdm_shift_schedule_occurrence_overlap(
        s.start_date,s.end_date,s.weekdays,new.start_date,new.end_date,new.weekdays
      )
  ) then raise exception '该班次在所选参与日期内已有排班，请编辑现有排班'; end if;
  if new.deleted_at is null and tg_op='UPDATE' and exists(
    select 1 from public.mdm_shift_schedule_member mine
    join public.mdm_shift_schedule_member other
      on other.personnel_id=mine.personnel_id and other.tenant_id=mine.tenant_id
    join public.mdm_shift_schedule other_schedule
      on other_schedule.id=other.schedule_id and other_schedule.deleted_at is null
    where mine.schedule_id=new.id and other.schedule_id<>new.id
      and app_private.mdm_shift_schedule_occurrence_overlap(
        other_schedule.start_date,other_schedule.end_date,other_schedule.weekdays,
        new.start_date,new.end_date,new.weekdays
      )
  ) then raise exception '班组中有人员在所选参与日期内已安排其他班次'; end if;
  return new;
end
$$;


ALTER FUNCTION "app_private"."validate_mdm_shift_schedule"() OWNER TO "postgres";

--

--

-- Name: validate_mdm_shift_schedule_member(); Type: FUNCTION; Schema: app_private
--

--

CREATE OR REPLACE FUNCTION "app_private"."validate_mdm_shift_schedule_member"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare v_row public.mdm_shift_schedule_member%rowtype := case when tg_op='DELETE' then old else new end; v_schedule public.mdm_shift_schedule%rowtype;
begin
  if auth.uid() is null or not app_private.has_permission('MdmShiftScheduling:Edit') then if tg_op='INSERT' and app_private.has_permission('MdmShiftScheduling:Add') then null; else raise exception '没有班组人员维护权限' using errcode='42501'; end if; end if;
  select * into v_schedule from public.mdm_shift_schedule where id=v_row.schedule_id and tenant_id=v_row.tenant_id and deleted_at is null;
  if not found then raise exception '排班不存在或已删除'; end if;
  if tg_op<>'DELETE' then
    if not exists(with recursive department_scope as (select id from public.mdm_production_department where id=v_schedule.department_id and tenant_id=v_schedule.tenant_id union all select d.id from public.mdm_production_department d join department_scope s on d.parent_id=s.id where d.tenant_id=v_schedule.tenant_id) select 1 from public.mdm_production_personnel p join department_scope d on d.id=p.department_id where p.id=new.personnel_id and p.tenant_id=v_schedule.tenant_id and p.enabled) then raise exception '班组人员不属于当前部门或下级产线'; end if;
    if exists(select 1 from public.mdm_shift_schedule_member m join public.mdm_shift_schedule s on s.id=m.schedule_id and s.deleted_at is null where m.tenant_id=v_schedule.tenant_id and m.personnel_id=new.personnel_id and m.schedule_id<>v_schedule.id and app_private.mdm_shift_schedule_range(s.start_date,s.end_date) && app_private.mdm_shift_schedule_range(v_schedule.start_date,v_schedule.end_date)) then raise exception '所选人员在该日期范围内已有其他排班'; end if;
  end if;
  return v_row;
end $$;


ALTER FUNCTION "app_private"."validate_mdm_shift_schedule_member"() OWNER TO "postgres";

--

--

-- Name: mdm_vehicle; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_vehicle" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL,
    "plate_no" character varying(30) NOT NULL,
    "company_name" character varying(120),
    "self_no" character varying(60),
    "vehicle_type" character varying(80) NOT NULL,
    "origin_type" character varying(20),
    "vin" character varying(80),
    "manufacturer" character varying(120),
    "brand_model" character varying(120),
    "operation_cert_no" character varying(80),
    "purchase_cert_no" character varying(80),
    "registration_cert_no" character varying(80),
    "vehicle_color" character varying(40),
    "chassis_no" character varying(80),
    "ac_code" character varying(80),
    "gearbox_serial_no" character varying(80),
    "register_date" "date",
    "issue_date" "date",
    "invoice_date" "date",
    "start_use_date" "date",
    "service_years" integer,
    "approved_passenger_count" integer,
    "seat_count" integer,
    "business_type" character varying(80),
    "is_air_conditioned" boolean DEFAULT false NOT NULL,
    "operation_status" character varying(40) DEFAULT 'operating'::character varying NOT NULL,
    "operation_status_change_date" "date",
    "purchase_status" character varying(40),
    "purchase_status_change_date" "date",
    "inspection_start_date" "date",
    "vehicle_level" character varying(80),
    "is_new_energy" boolean DEFAULT false NOT NULL,
    "three_guarantee_mileage" numeric(12,2),
    "three_guarantee_duration" integer,
    "warranty_mileage" numeric(12,2),
    "warranty_duration" integer,
    "remark" character varying(1000),
    "gross_mass" numeric(12,2),
    "curb_weight" numeric(12,2),
    "approved_load_mass" numeric(12,2),
    "overall_length" numeric(12,2),
    "overall_width" numeric(12,2),
    "overall_height" numeric(12,2),
    "platform" character varying(80),
    "front_track" numeric(12,2),
    "rear_track" numeric(12,2),
    "wheelbase" numeric(12,2),
    "axle_count" integer,
    "tire_count" integer,
    "leaf_spring_count" integer,
    "is_double_deck" boolean DEFAULT false NOT NULL,
    "engine_no" character varying(80),
    "engine_model" character varying(120),
    "fuel_type" character varying(40),
    "displacement" numeric(12,2),
    "emission_standard" character varying(80),
    "engine_power" numeric(12,2),
    "rated_torque_speed" numeric(12,2),
    "engine_torque" numeric(12,2),
    "plate_color" character varying(40),
    "transport_industry" character varying(80),
    "operation_type" character varying(80),
    "owner_id" character varying(80),
    "owner_name" character varying(120),
    "owner_phone" character varying(40),
    "terminal_phone" character varying(40),
    "owner_gender" character varying(20),
    "id_card_no" character varying(80),
    "mailing_address" character varying(300),
    "tonnage_or_seat" character varying(80),
    "driver_one_name" character varying(120),
    "driver_one_phone" character varying(40),
    "driver_two_name" character varying(120),
    "driver_two_phone" character varying(40),
    "operation_route" character varying(300),
    "license_plate_code" character varying(80),
    "service_start_time" "date",
    "service_end_time" "date",
    "support_photo" boolean DEFAULT false NOT NULL,
    "vehicle_photo_url" "text",
    "driving_license_front_url" "text",
    "driving_license_back_url" "text",
    "operation_license_url" "text",
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "audit_status" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "audit_remark" character varying(1000),
    "audit_by" "text",
    "audit_time" timestamp with time zone,
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "carrier_id" "uuid",
    "primary_driver_id" "uuid",
    "secondary_driver_id" "uuid",
    "created_by_user_id" "uuid" NOT NULL,
    "vehicle_ownership" "text" DEFAULT 'self_operated'::"text" NOT NULL,
    "vehicle_type_profile_id" "uuid",
    "spec_length_m" numeric(8,2),
    "volume_m3" numeric(10,2),
    "load_tons" numeric(10,2),
    CONSTRAINT "mdm_vehicle_vehicle_ownership_check" CHECK (("vehicle_ownership" = ANY (ARRAY['self_operated'::"text", 'franchise'::"text", 'third_party'::"text"]))),
    CONSTRAINT "vehicle_archive_distinct_driver_ids_check" CHECK ((("primary_driver_id" IS NULL) OR ("secondary_driver_id" IS NULL) OR ("primary_driver_id" <> "secondary_driver_id")))
);


ALTER TABLE "public"."mdm_vehicle" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_vehicle"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_vehicle" IS 'MDM 车辆主数据；供 VMS、TMS、FMS 与安全业务统一引用。';


--

--

-- Name: mdm_station; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_station" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "station_code" "text" NOT NULL,
    "station_name" "text" NOT NULL,
    "station_type" "text" NOT NULL,
    "region_code" "text",
    "manager_name" "text",
    "contact_phone" "text",
    "enabled" boolean DEFAULT true NOT NULL,
    "sort" integer DEFAULT 0 NOT NULL,
    "remark" "text",
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL,
    CONSTRAINT "tms_station_code_not_blank" CHECK (("btrim"("station_code") <> ''::"text")),
    CONSTRAINT "tms_station_name_not_blank" CHECK (("btrim"("station_name") <> ''::"text")),
    CONSTRAINT "tms_station_type_not_blank" CHECK (("btrim"("station_type") <> ''::"text"))
);


ALTER TABLE "public"."mdm_station" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_station"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_station" IS 'MDM 运输站点主数据；供线路、订单、运单与站点能力配置统一引用。';


--

--

-- Name: set_vehicle_parts_category_level(); Type: FUNCTION; Schema: public
--

--

CREATE OR REPLACE FUNCTION "public"."set_vehicle_parts_category_level"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
  parent_level integer;
begin
  if new.parent_id is null then
    new.category_level := 1;
  else
    select category_level into parent_level
    from public.mdm_part_category
    where id = new.parent_id;

    if parent_level is null then
      raise exception 'Parent category % does not exist', new.parent_id;
    end if;

    new.category_level := parent_level + 1;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_vehicle_parts_category_level"() OWNER TO "postgres";

--

--

-- Name: mdm_business_partner; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_business_partner" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL,
    "partner_code" "text" NOT NULL,
    "source_code" "text",
    "partner_name" "text" NOT NULL,
    "legal_name" "text",
    "registration_no" "text",
    "tax_no" "text",
    "enabled" boolean DEFAULT true NOT NULL,
    "status" "text" DEFAULT 'enabled'::"text" NOT NULL,
    "region" "text",
    "address_detail" "text",
    "contact_name" "text",
    "contact_phone" "text",
    "contact_email" "text",
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_business_partner_code_not_blank" CHECK (("btrim"("partner_code") <> ''::"text")),
    CONSTRAINT "mdm_business_partner_name_not_blank" CHECK (("btrim"("partner_name") <> ''::"text"))
);


ALTER TABLE "public"."mdm_business_partner" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_business_partner"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_business_partner" IS 'MDM canonical business-party identity. Role-specific attributes remain in mdm_customer, mdm_carrier, mdm_supplier, mdm_insurance_company, and mdm_external_vendor during the transition.';


--

--

-- Name: mdm_cargo; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_cargo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cargo_code" "text" NOT NULL,
    "cargo_name" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "length_m" numeric(10,2),
    "width_m" numeric(10,2),
    "height_m" numeric(10,2),
    "volume_m3" numeric(12,3),
    "weight_kg" numeric(12,2),
    "value_amount" numeric(14,2),
    "enabled" boolean DEFAULT true NOT NULL,
    "remark" "text",
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL,
    "spec_model" "text",
    "material_id" "uuid",
    "material_group_id" "uuid",
    CONSTRAINT "tms_cargo_height_nonnegative" CHECK ((("height_m" IS NULL) OR ("height_m" >= (0)::numeric))),
    CONSTRAINT "tms_cargo_length_nonnegative" CHECK ((("length_m" IS NULL) OR ("length_m" >= (0)::numeric))),
    CONSTRAINT "tms_cargo_value_nonnegative" CHECK ((("value_amount" IS NULL) OR ("value_amount" >= (0)::numeric))),
    CONSTRAINT "tms_cargo_volume_nonnegative" CHECK ((("volume_m3" IS NULL) OR ("volume_m3" >= (0)::numeric))),
    CONSTRAINT "tms_cargo_weight_nonnegative" CHECK ((("weight_kg" IS NULL) OR ("weight_kg" >= (0)::numeric))),
    CONSTRAINT "tms_cargo_width_nonnegative" CHECK ((("width_m" IS NULL) OR ("width_m" >= (0)::numeric)))
);


ALTER TABLE "public"."mdm_cargo" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_cargo"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_cargo" IS 'MDM 货物主数据；供合同、价格、订单和运单统一引用。';


--

--

-- Name: mdm_insurance_company; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_insurance_company" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_name" "text" NOT NULL,
    "contact_person" "text",
    "contact_phone" "text",
    "region" "text",
    "address_detail" "text",
    "remark" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "create_by" "text",
    "update_by" "text",
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL
);


ALTER TABLE "public"."mdm_insurance_company" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_insurance_company"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_insurance_company" IS 'MDM 保险机构主数据；供车辆、设备与保险业务统一引用。';


--

--

-- Name: mdm_part; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_part" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL,
    "part_name" character varying(100) NOT NULL,
    "part_code" character varying(60) NOT NULL,
    "category_id" "uuid",
    "brand" character varying(80),
    "model" character varying(80),
    "unit" character varying(20) NOT NULL,
    "supplier_id" "uuid",
    "manufacturer" character varying(100),
    "supplier_contact" character varying(100),
    "is_consumable" boolean DEFAULT false NOT NULL,
    "warranty_mileage" numeric(12,2),
    "warranty_duration" integer,
    "service_life" integer,
    "service_mileage" numeric(12,2),
    "status" character varying(1) DEFAULT '1'::character varying NOT NULL,
    "remark" character varying(500),
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vehicle_parts_service_life_check" CHECK ((("service_life" IS NULL) OR ("service_life" >= 0))),
    CONSTRAINT "vehicle_parts_service_mileage_check" CHECK ((("service_mileage" IS NULL) OR ("service_mileage" >= (0)::numeric))),
    CONSTRAINT "vehicle_parts_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('1'::character varying)::"text", ('2'::character varying)::"text"]))),
    CONSTRAINT "vehicle_parts_warranty_duration_check" CHECK ((("warranty_duration" IS NULL) OR ("warranty_duration" >= 0))),
    CONSTRAINT "vehicle_parts_warranty_mileage_check" CHECK ((("warranty_mileage" IS NULL) OR ("warranty_mileage" >= (0)::numeric)))
);


ALTER TABLE "public"."mdm_part" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_part"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_part" IS 'MDM 零部件主数据；连接分类、供应商与维护业务。';


--

--

-- Name: mdm_part_category; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_part_category" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_id" "uuid",
    "category_name" character varying(80) NOT NULL,
    "category_code" character varying(50) NOT NULL,
    "category_level" integer DEFAULT 1 NOT NULL,
    "sort" integer DEFAULT 1 NOT NULL,
    "status" character varying(1) DEFAULT '1'::character varying NOT NULL,
    "remark" character varying(500),
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL,
    CONSTRAINT "vehicle_parts_category_no_self_parent" CHECK ((("parent_id" IS NULL) OR ("parent_id" <> "id"))),
    CONSTRAINT "vehicle_parts_category_sort_check" CHECK ((("sort" >= 0) AND ("sort" <= 9999))),
    CONSTRAINT "vehicle_parts_category_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('1'::character varying)::"text", ('2'::character varying)::"text"])))
);


ALTER TABLE "public"."mdm_part_category" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_part_category"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_part_category" IS 'MDM 零部件分类主数据；租户级树形分类。';


--

--

-- Name: mdm_business_partner_role; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_business_partner_role" (
    "tenant_id" "uuid" NOT NULL,
    "partner_id" "uuid" NOT NULL,
    "role_code" "text" NOT NULL,
    "source_table" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_business_partner_role_code_check" CHECK (("role_code" = ANY (ARRAY['customer'::"text", 'carrier'::"text", 'supplier'::"text", 'insurance_company'::"text", 'external_vendor'::"text"]))),
    CONSTRAINT "mdm_business_partner_role_source_check" CHECK (("source_table" = ANY (ARRAY['mdm_customer'::"text", 'mdm_carrier'::"text", 'mdm_supplier'::"text", 'mdm_insurance_company'::"text", 'mdm_external_vendor'::"text"])))
);


ALTER TABLE "public"."mdm_business_partner_role" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_business_partner_role"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_business_partner_role" IS 'Maps a canonical business party to its current role-specific master record. Maintained by database triggers while legacy role writers are active.';


--

--

-- Name: mdm_change_request; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_change_request" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL,
    "request_no" "text" NOT NULL,
    "domain_key" "text" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_record_id" "uuid",
    "operation" "text" NOT NULL,
    "title" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "before_data" "jsonb",
    "proposed_data" "jsonb" NOT NULL,
    "state" "text" DEFAULT 'draft'::"text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "effective_at" timestamp with time zone NOT NULL,
    "requester_user_id" "uuid" NOT NULL,
    "requester_email" "text" NOT NULL,
    "submitted_at" timestamp with time zone,
    "reviewer_user_id" "uuid",
    "reviewer_email" "text",
    "reviewed_at" timestamp with time zone,
    "review_comment" "text",
    "publisher_user_id" "uuid",
    "publisher_email" "text",
    "published_at" timestamp with time zone,
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_change_request_before_object" CHECK ((("before_data" IS NULL) OR ("jsonb_typeof"("before_data") = 'object'::"text"))),
    CONSTRAINT "mdm_change_request_domain_check" CHECK (("domain_key" = ANY (ARRAY['organization'::"text", 'partner'::"text", 'logistics'::"text", 'asset'::"text", 'material'::"text"]))),
    CONSTRAINT "mdm_change_request_four_eye_check" CHECK ((("reviewer_user_id" IS NULL) OR ("reviewer_user_id" <> "requester_user_id"))),
    CONSTRAINT "mdm_change_request_operation_check" CHECK (("operation" = ANY (ARRAY['create'::"text", 'update'::"text", 'enable'::"text", 'disable'::"text", 'retire'::"text", 'merge'::"text"]))),
    CONSTRAINT "mdm_change_request_proposed_object" CHECK (("jsonb_typeof"("proposed_data") = 'object'::"text")),
    CONSTRAINT "mdm_change_request_reason_not_blank" CHECK (("btrim"("reason") <> ''::"text")),
    CONSTRAINT "mdm_change_request_source_not_blank" CHECK (("btrim"("source_type") <> ''::"text")),
    CONSTRAINT "mdm_change_request_state_check" CHECK (("state" = ANY (ARRAY['draft'::"text", 'submitted'::"text", 'approved'::"text", 'rejected'::"text", 'published'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "mdm_change_request_title_not_blank" CHECK (("btrim"("title") <> ''::"text")),
    CONSTRAINT "mdm_change_request_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."mdm_change_request" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_change_request"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_change_request" IS 'Four-eye MDM change request and scheduled publication workflow.';


--

--

-- Name: mdm_change_request_event; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_change_request_event" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "from_state" "text",
    "to_state" "text" NOT NULL,
    "action" "text" NOT NULL,
    "actor_user_id" "uuid",
    "actor_email" "text" NOT NULL,
    "comment" "text",
    "snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_change_request_event_action_not_blank" CHECK (("btrim"("action") <> ''::"text")),
    CONSTRAINT "mdm_change_request_event_actor_not_blank" CHECK (("btrim"("actor_email") <> ''::"text")),
    CONSTRAINT "mdm_change_request_event_snapshot_object" CHECK (("jsonb_typeof"("snapshot") = 'object'::"text"))
);


ALTER TABLE "public"."mdm_change_request_event" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_change_request_event"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_change_request_event" IS 'Append-only change-request lifecycle and payload snapshot evidence.';


--

--

-- Name: mdm_data_steward; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_data_steward" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL,
    "domain_key" "text" NOT NULL,
    "source_type" "text",
    "steward_user_id" "uuid" NOT NULL,
    "escalation_user_id" "uuid",
    "sla_hours" integer DEFAULT 48 NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_data_steward_distinct_users" CHECK ((("escalation_user_id" IS NULL) OR ("escalation_user_id" <> "steward_user_id"))),
    CONSTRAINT "mdm_data_steward_domain_check" CHECK (("domain_key" = ANY (ARRAY['organization'::"text", 'partner'::"text", 'logistics'::"text", 'asset'::"text", 'material'::"text"]))),
    CONSTRAINT "mdm_data_steward_sla_check" CHECK ((("sla_hours" >= 1) AND ("sla_hours" <= 8760))),
    CONSTRAINT "mdm_data_steward_source_not_blank" CHECK ((("source_type" IS NULL) OR ("btrim"("source_type") <> ''::"text")))
);


ALTER TABLE "public"."mdm_data_steward" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_data_steward"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_data_steward" IS 'Tenant-scoped MDM data ownership, SLA and escalation assignments.';


--

--

-- Name: mdm_golden_record; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_golden_record" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL,
    "domain_key" "text" NOT NULL,
    "source_type" "text" NOT NULL,
    "golden_key" "text" NOT NULL,
    "golden_data" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "merged_into_id" "uuid",
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_golden_record_data_object" CHECK (("jsonb_typeof"("golden_data") = 'object'::"text")),
    CONSTRAINT "mdm_golden_record_domain_check" CHECK (("domain_key" = ANY (ARRAY['organization'::"text", 'partner'::"text", 'logistics'::"text", 'asset'::"text", 'material'::"text"]))),
    CONSTRAINT "mdm_golden_record_key_not_blank" CHECK (("btrim"("golden_key") <> ''::"text")),
    CONSTRAINT "mdm_golden_record_not_self_merged" CHECK ((("merged_into_id" IS NULL) OR ("merged_into_id" <> "id"))),
    CONSTRAINT "mdm_golden_record_source_not_blank" CHECK (("btrim"("source_type") <> ''::"text")),
    CONSTRAINT "mdm_golden_record_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'merged'::"text", 'retired'::"text"]))),
    CONSTRAINT "mdm_golden_record_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."mdm_golden_record" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_golden_record"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_golden_record" IS 'Governed golden identity and survivorship snapshot without mutating source records.';


--

--

-- Name: mdm_match_candidate; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_match_candidate" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL,
    "domain_key" "text" NOT NULL,
    "source_type" "text" NOT NULL,
    "left_record_id" "uuid" NOT NULL,
    "right_record_id" "uuid" NOT NULL,
    "match_score" numeric(5,4) NOT NULL,
    "match_basis" "jsonb" NOT NULL,
    "state" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_comment" "text",
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_match_candidate_basis_object" CHECK (("jsonb_typeof"("match_basis") = 'object'::"text")),
    CONSTRAINT "mdm_match_candidate_distinct_records" CHECK (("left_record_id" <> "right_record_id")),
    CONSTRAINT "mdm_match_candidate_domain_check" CHECK (("domain_key" = ANY (ARRAY['organization'::"text", 'partner'::"text", 'logistics'::"text", 'asset'::"text", 'material'::"text"]))),
    CONSTRAINT "mdm_match_candidate_ordered_records" CHECK ((("left_record_id")::"text" < ("right_record_id")::"text")),
    CONSTRAINT "mdm_match_candidate_review_pair_check" CHECK ((("reviewed_by" IS NULL) = ("reviewed_at" IS NULL))),
    CONSTRAINT "mdm_match_candidate_score_check" CHECK ((("match_score" >= (0)::numeric) AND ("match_score" <= (1)::numeric))),
    CONSTRAINT "mdm_match_candidate_source_not_blank" CHECK (("btrim"("source_type") <> ''::"text")),
    CONSTRAINT "mdm_match_candidate_state_check" CHECK (("state" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text", 'superseded'::"text"])))
);


ALTER TABLE "public"."mdm_match_candidate" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_match_candidate"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_match_candidate" IS 'Human-reviewed candidate matches; scanners never auto-merge source records.';


--

--

-- Name: mdm_merge_event; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_merge_event" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "golden_record_id" "uuid" NOT NULL,
    "candidate_id" "uuid",
    "operation" "text" DEFAULT 'merge'::"text" NOT NULL,
    "winner_record_id" "uuid" NOT NULL,
    "merged_record_ids" "uuid"[] NOT NULL,
    "actor_user_id" "uuid" NOT NULL,
    "actor_email" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "before_snapshot" "jsonb" NOT NULL,
    "after_snapshot" "jsonb" NOT NULL,
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_merge_event_after_object" CHECK (("jsonb_typeof"("after_snapshot") = 'object'::"text")),
    CONSTRAINT "mdm_merge_event_before_object" CHECK (("jsonb_typeof"("before_snapshot") = 'object'::"text")),
    CONSTRAINT "mdm_merge_event_operation_check" CHECK (("operation" = ANY (ARRAY['merge'::"text", 'split'::"text"]))),
    CONSTRAINT "mdm_merge_event_reason_not_blank" CHECK (("btrim"("reason") <> ''::"text")),
    CONSTRAINT "mdm_merge_event_records_check" CHECK (("cardinality"("merged_record_ids") > 0))
);


ALTER TABLE "public"."mdm_merge_event" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_merge_event"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_merge_event" IS 'Append-only merge and split evidence for golden-record lineage.';


--

--

-- Name: mdm_outbound_rule_sort; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_outbound_rule_sort" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "rule_id" "uuid" NOT NULL,
    "field_code" "text" NOT NULL,
    "direction" "text" DEFAULT 'asc'::"text" NOT NULL,
    "sort" integer DEFAULT 10 NOT NULL,
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_outbound_rule_sort_direction_check" CHECK (("direction" = ANY (ARRAY['asc'::"text", 'desc'::"text"]))),
    CONSTRAINT "mdm_outbound_rule_sort_sort_check" CHECK ((("sort" >= 0) AND ("sort" <= 999999)))
);


ALTER TABLE "public"."mdm_outbound_rule_sort" OWNER TO "postgres";

--

--

-- Name: mdm_outbound_sort_field; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_outbound_sort_field" (
    "field_code" "text" NOT NULL,
    "source_code" "text" NOT NULL,
    "source_name" "text" NOT NULL,
    "field_name" "text" NOT NULL,
    "field_key" "text" NOT NULL,
    "allowed_directions" "text"[] DEFAULT ARRAY['asc'::"text", 'desc'::"text"] NOT NULL,
    "description" "text",
    "sort" integer DEFAULT 10 NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_outbound_sort_field_code_check" CHECK (("field_code" ~ '^[A-Z][A-Z0-9_]{0,59}$'::"text")),
    CONSTRAINT "mdm_outbound_sort_field_directions_check" CHECK ((("cardinality"("allowed_directions") > 0) AND ("allowed_directions" <@ ARRAY['asc'::"text", 'desc'::"text"]))),
    CONSTRAINT "mdm_outbound_sort_field_names_check" CHECK ((("btrim"("source_name") <> ''::"text") AND ("btrim"("field_name") <> ''::"text") AND ("btrim"("field_key") <> ''::"text")))
);


ALTER TABLE "public"."mdm_outbound_sort_field" OWNER TO "postgres";

--

--

-- Name: mdm_outbox_consumer; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_outbox_consumer" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL,
    "consumer_key" "text" NOT NULL,
    "consumer_name" "text" NOT NULL,
    "event_types" "text"[] DEFAULT ARRAY['*'::"text"] NOT NULL,
    "contract_version" integer DEFAULT 1 NOT NULL,
    "visibility_timeout_seconds" integer DEFAULT 60 NOT NULL,
    "max_attempts" integer DEFAULT 10 NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_outbox_consumer_attempts_check" CHECK ((("max_attempts" >= 1) AND ("max_attempts" <= 100))),
    CONSTRAINT "mdm_outbox_consumer_events_check" CHECK ((("cardinality"("event_types") > 0) AND ("array_position"("event_types", ''::"text") IS NULL))),
    CONSTRAINT "mdm_outbox_consumer_key_not_blank" CHECK (("btrim"("consumer_key") <> ''::"text")),
    CONSTRAINT "mdm_outbox_consumer_name_not_blank" CHECK (("btrim"("consumer_name") <> ''::"text")),
    CONSTRAINT "mdm_outbox_consumer_version_check" CHECK (("contract_version" > 0)),
    CONSTRAINT "mdm_outbox_consumer_visibility_check" CHECK ((("visibility_timeout_seconds" >= 10) AND ("visibility_timeout_seconds" <= 3600)))
);


ALTER TABLE "public"."mdm_outbox_consumer" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_outbox_consumer"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_outbox_consumer" IS 'Versioned downstream consumer contract and delivery policy.';


--

--

-- Name: mdm_outbox_delivery; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_outbox_delivery" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "event_id" "uuid" NOT NULL,
    "consumer_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "available_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_at" timestamp with time zone,
    "locked_by" "text",
    "delivered_at" timestamp with time zone,
    "last_error" "text",
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_outbox_delivery_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "mdm_outbox_delivery_lock_pair_check" CHECK ((("locked_at" IS NULL) = ("locked_by" IS NULL))),
    CONSTRAINT "mdm_outbox_delivery_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'retry'::"text", 'delivered'::"text", 'dead_letter'::"text"])))
);


ALTER TABLE "public"."mdm_outbox_delivery" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_outbox_delivery"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_outbox_delivery" IS 'Per-consumer delivery, retry, lock and dead-letter state.';


--

--

-- Name: mdm_outbox_event; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_outbox_event" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL,
    "aggregate_type" "text" NOT NULL,
    "aggregate_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_version" integer DEFAULT 1 NOT NULL,
    "payload" "jsonb" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "correlation_id" "uuid",
    "causation_id" "uuid",
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_outbox_event_aggregate_not_blank" CHECK (("btrim"("aggregate_type") <> ''::"text")),
    CONSTRAINT "mdm_outbox_event_payload_object" CHECK (("jsonb_typeof"("payload") = 'object'::"text")),
    CONSTRAINT "mdm_outbox_event_type_not_blank" CHECK (("btrim"("event_type") <> ''::"text")),
    CONSTRAINT "mdm_outbox_event_version_check" CHECK (("event_version" > 0))
);


ALTER TABLE "public"."mdm_outbox_event" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_outbox_event"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_outbox_event" IS 'Immutable transactionally committed MDM integration event.';


--

--

-- Name: mdm_personnel_common_work_center; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_personnel_common_work_center" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL,
    "personnel_id" "uuid" NOT NULL,
    "work_center_id" "uuid" NOT NULL,
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mdm_personnel_common_work_center" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_personnel_common_work_center"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_personnel_common_work_center" IS '生产人员在作业端优先展示的常用工作中心配置。';


--

--

-- Name: mdm_production_calendar_day_setting; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_production_calendar_day_setting" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "department_id" "uuid" NOT NULL,
    "work_date" "date" NOT NULL,
    "day_type" "text" NOT NULL,
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "create_by" "text",
    "update_by" "text",
    CONSTRAINT "mdm_production_calendar_day_setting_day_type_check" CHECK (("day_type" = ANY (ARRAY['rest_day'::"text", 'statutory_holiday'::"text", 'work_day'::"text", 'half_work_day'::"text"])))
);


ALTER TABLE "public"."mdm_production_calendar_day_setting" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_production_calendar_day_setting"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_production_calendar_day_setting" IS '工厂日历手工日类型；优先于组织法定节假日，独立于轮班安排';


--

--

-- Name: mdm_quality_issue; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_quality_issue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL,
    "rule_id" "uuid" NOT NULL,
    "domain_key" "text" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_record_id" "uuid" NOT NULL,
    "source_code" "text",
    "source_name" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "state" "text" DEFAULT 'open'::"text" NOT NULL,
    "observed_status" "text" DEFAULT 'failing'::"text" NOT NULL,
    "detected_details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "assigned_steward_id" "uuid",
    "first_detected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_detected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "due_at" timestamp with time zone NOT NULL,
    "detection_count" integer DEFAULT 1 NOT NULL,
    "resolution_summary" "text",
    "resolution_by" "uuid",
    "resolution_at" timestamp with time zone,
    "verified_by" "uuid",
    "verified_at" timestamp with time zone,
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_quality_issue_details_object" CHECK (("jsonb_typeof"("detected_details") = 'object'::"text")),
    CONSTRAINT "mdm_quality_issue_detection_count_check" CHECK (("detection_count" > 0)),
    CONSTRAINT "mdm_quality_issue_four_eye_check" CHECK ((("verified_by" IS NULL) OR ("resolution_by" IS NULL) OR ("verified_by" <> "resolution_by"))),
    CONSTRAINT "mdm_quality_issue_observed_status_check" CHECK (("observed_status" = ANY (ARRAY['failing'::"text", 'passing'::"text", 'unknown'::"text"]))),
    CONSTRAINT "mdm_quality_issue_resolution_pair_check" CHECK ((("resolution_by" IS NULL) = ("resolution_at" IS NULL))),
    CONSTRAINT "mdm_quality_issue_severity_check" CHECK (("severity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "mdm_quality_issue_state_check" CHECK (("state" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'pending_verification'::"text", 'resolved'::"text", 'waived'::"text", 'reopened'::"text"]))),
    CONSTRAINT "mdm_quality_issue_verification_pair_check" CHECK ((("verified_by" IS NULL) = ("verified_at" IS NULL)))
);


ALTER TABLE "public"."mdm_quality_issue" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_quality_issue"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_quality_issue" IS 'Operational MDM data-quality issue queue with SLA and four-eye verification.';


--

--

-- Name: mdm_quality_issue_event; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_quality_issue_event" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "issue_id" "uuid" NOT NULL,
    "from_state" "text",
    "to_state" "text" NOT NULL,
    "action" "text" NOT NULL,
    "actor_user_id" "uuid",
    "actor_email" "text" NOT NULL,
    "comment" "text",
    "event_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_quality_issue_event_action_not_blank" CHECK (("btrim"("action") <> ''::"text")),
    CONSTRAINT "mdm_quality_issue_event_actor_not_blank" CHECK (("btrim"("actor_email") <> ''::"text")),
    CONSTRAINT "mdm_quality_issue_event_data_object" CHECK (("jsonb_typeof"("event_data") = 'object'::"text"))
);


ALTER TABLE "public"."mdm_quality_issue_event" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_quality_issue_event"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_quality_issue_event" IS 'Append-only audit trail for MDM quality issue transitions.';


--

--

-- Name: mdm_quality_rule; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_quality_rule" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL,
    "rule_code" "text" NOT NULL,
    "version" integer NOT NULL,
    "rule_name" "text" NOT NULL,
    "domain_key" "text" NOT NULL,
    "source_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'medium'::"text" NOT NULL,
    "threshold" numeric(5,2) DEFAULT 90 NOT NULL,
    "sla_hours" integer DEFAULT 48 NOT NULL,
    "definition" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "effective_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "effective_to" timestamp with time zone,
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_quality_rule_code_not_blank" CHECK (("btrim"("rule_code") <> ''::"text")),
    CONSTRAINT "mdm_quality_rule_definition_object" CHECK (("jsonb_typeof"("definition") = 'object'::"text")),
    CONSTRAINT "mdm_quality_rule_domain_check" CHECK (("domain_key" = ANY (ARRAY['organization'::"text", 'partner'::"text", 'logistics'::"text", 'asset'::"text", 'material'::"text"]))),
    CONSTRAINT "mdm_quality_rule_effective_period_check" CHECK ((("effective_to" IS NULL) OR ("effective_to" > "effective_from"))),
    CONSTRAINT "mdm_quality_rule_name_not_blank" CHECK (("btrim"("rule_name") <> ''::"text")),
    CONSTRAINT "mdm_quality_rule_severity_check" CHECK (("severity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "mdm_quality_rule_sla_check" CHECK ((("sla_hours" >= 1) AND ("sla_hours" <= 8760))),
    CONSTRAINT "mdm_quality_rule_source_not_blank" CHECK (("btrim"("source_type") <> ''::"text")),
    CONSTRAINT "mdm_quality_rule_threshold_check" CHECK ((("threshold" >= (0)::numeric) AND ("threshold" <= (100)::numeric))),
    CONSTRAINT "mdm_quality_rule_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."mdm_quality_rule" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_quality_rule"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_quality_rule" IS 'Immutable version lineage for executable MDM data-quality policies.';


--

--

-- Name: mdm_shift_schedule; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_shift_schedule" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL,
    "department_id" "uuid" NOT NULL,
    "pattern_id" "uuid" NOT NULL,
    "shift_index" smallint NOT NULL,
    "shift_name" "text" NOT NULL,
    "shift_start_time" time without time zone NOT NULL,
    "shift_end_time" time without time zone NOT NULL,
    "date_mode" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "weekdays" smallint[] DEFAULT ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (0)::smallint] NOT NULL,
    "include_statutory_holidays" boolean DEFAULT true NOT NULL,
    CONSTRAINT "mdm_shift_schedule_date_mode_check" CHECK (("date_mode" = ANY (ARRAY['single'::"text", 'ongoing'::"text", 'range'::"text"]))),
    CONSTRAINT "mdm_shift_schedule_date_shape_check" CHECK (((("date_mode" = 'single'::"text") AND ("end_date" = "start_date")) OR (("date_mode" = 'ongoing'::"text") AND ("end_date" IS NULL)) OR (("date_mode" = 'range'::"text") AND ("end_date" IS NOT NULL) AND ("end_date" >= "start_date")))),
    CONSTRAINT "mdm_shift_schedule_shift_index_check" CHECK ((("shift_index" >= 1) AND ("shift_index" <= 12))),
    CONSTRAINT "mdm_shift_schedule_shift_name_check" CHECK ((("length"("btrim"("shift_name")) >= 1) AND ("length"("btrim"("shift_name")) <= 120))),
    CONSTRAINT "mdm_shift_schedule_weekdays_check" CHECK ((("cardinality"("weekdays") >= 1) AND ("cardinality"("weekdays") <= 7) AND ("array_position"("weekdays", NULL::smallint) IS NULL) AND ("weekdays" <@ ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint])))
);


ALTER TABLE "public"."mdm_shift_schedule" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_shift_schedule"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_shift_schedule" IS '部门/产线班次排班；引用轮班模式并保留班次时段快照。';


--

--

-- Name: mdm_shift_schedule_member; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_shift_schedule_member" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "personnel_id" "uuid" NOT NULL,
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mdm_shift_schedule_member" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_shift_schedule_member"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_shift_schedule_member" IS '排班班组人员；人员来源于 MDM 生产人员配置。';


--

--

-- Name: mdm_source_crosswalk; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_source_crosswalk" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL,
    "golden_record_id" "uuid" NOT NULL,
    "source_app" "text" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_record_id" "uuid" NOT NULL,
    "source_key" "text",
    "match_method" "text" NOT NULL,
    "match_confidence" numeric(5,4) NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_source_crosswalk_app_not_blank" CHECK (("btrim"("source_app") <> ''::"text")),
    CONSTRAINT "mdm_source_crosswalk_confidence_check" CHECK ((("match_confidence" >= (0)::numeric) AND ("match_confidence" <= (1)::numeric))),
    CONSTRAINT "mdm_source_crosswalk_method_check" CHECK (("match_method" = ANY (ARRAY['manual'::"text", 'exact_identifier'::"text", 'approved_candidate'::"text", 'source_declared'::"text"]))),
    CONSTRAINT "mdm_source_crosswalk_type_not_blank" CHECK (("btrim"("source_type") <> ''::"text"))
);


ALTER TABLE "public"."mdm_source_crosswalk" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_source_crosswalk"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_source_crosswalk" IS 'Audited mapping between source identities and tenant golden records.';


--

--

-- Name: mdm_stock_movement_type; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_stock_movement_type" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "movement_code" "text" NOT NULL,
    "movement_name" "text" NOT NULL,
    "direction" "text" NOT NULL,
    "reverse_type_id" "uuid",
    "reversal" boolean DEFAULT false NOT NULL,
    "other_io" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'enabled'::"text" NOT NULL,
    "remark" "text",
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_stock_movement_type_code_format" CHECK (("movement_code" ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$'::"text")),
    CONSTRAINT "mdm_stock_movement_type_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text", 'transfer'::"text"]))),
    CONSTRAINT "mdm_stock_movement_type_name_length" CHECK ((("char_length"("btrim"("movement_name")) >= 1) AND ("char_length"("btrim"("movement_name")) <= 100))),
    CONSTRAINT "mdm_stock_movement_type_no_self_reverse" CHECK (("reverse_type_id" IS DISTINCT FROM "id")),
    CONSTRAINT "mdm_stock_movement_type_remark_length" CHECK (("char_length"(COALESCE("remark", ''::"text")) <= 500)),
    CONSTRAINT "mdm_stock_movement_type_status_check" CHECK (("status" = ANY (ARRAY['enabled'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."mdm_stock_movement_type" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_stock_movement_type"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_stock_movement_type" IS '租户级出入库移动类型主数据';


--

--

-- Name: mdm_supplier_bank; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_supplier_bank" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "bank_account" "text" NOT NULL,
    "account_name" "text" NOT NULL,
    "iban" "text",
    "bank_name" "text" NOT NULL,
    "currency_code" "text" NOT NULL,
    "payee_address" "text",
    "payee_phone" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_supplier_bank_account_name_check" CHECK ((("char_length"("btrim"("account_name")) >= 1) AND ("char_length"("btrim"("account_name")) <= 120))),
    CONSTRAINT "mdm_supplier_bank_bank_account_check" CHECK ((("char_length"("btrim"("bank_account")) >= 1) AND ("char_length"("btrim"("bank_account")) <= 64))),
    CONSTRAINT "mdm_supplier_bank_bank_name_check" CHECK ((("char_length"("btrim"("bank_name")) >= 1) AND ("char_length"("btrim"("bank_name")) <= 120))),
    CONSTRAINT "mdm_supplier_bank_currency_code_check" CHECK (("currency_code" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "mdm_supplier_bank_iban_check" CHECK ((("iban" IS NULL) OR ("char_length"("iban") <= 40))),
    CONSTRAINT "mdm_supplier_bank_payee_address_check" CHECK ((("payee_address" IS NULL) OR ("char_length"("payee_address") <= 300))),
    CONSTRAINT "mdm_supplier_bank_payee_phone_check" CHECK ((("payee_phone" IS NULL) OR ("char_length"("payee_phone") <= 40)))
);


ALTER TABLE "public"."mdm_supplier_bank" OWNER TO "postgres";

--

--

-- Name: mdm_supplier_contact; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_supplier_contact" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "alias" "text",
    "gender" "text",
    "position" "text",
    "department" "text",
    "phone" "text",
    "fax" "text",
    "wechat" "text",
    "qq" "text",
    "email" "text",
    "remark" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_supplier_contact_alias_check" CHECK ((("alias" IS NULL) OR ("char_length"("alias") <= 60))),
    CONSTRAINT "mdm_supplier_contact_department_check" CHECK ((("department" IS NULL) OR ("char_length"("department") <= 80))),
    CONSTRAINT "mdm_supplier_contact_email_check" CHECK ((("email" IS NULL) OR ("char_length"("email") <= 160))),
    CONSTRAINT "mdm_supplier_contact_fax_check" CHECK ((("fax" IS NULL) OR ("char_length"("fax") <= 40))),
    CONSTRAINT "mdm_supplier_contact_gender_check" CHECK ((("gender" IS NULL) OR ("char_length"("gender") <= 20))),
    CONSTRAINT "mdm_supplier_contact_name_check" CHECK ((("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 60))),
    CONSTRAINT "mdm_supplier_contact_phone_check" CHECK ((("phone" IS NULL) OR ("char_length"("phone") <= 40))),
    CONSTRAINT "mdm_supplier_contact_position_check" CHECK ((("position" IS NULL) OR ("char_length"("position") <= 80))),
    CONSTRAINT "mdm_supplier_contact_qq_check" CHECK ((("qq" IS NULL) OR ("char_length"("qq") <= 40))),
    CONSTRAINT "mdm_supplier_contact_remark_check" CHECK ((("remark" IS NULL) OR ("char_length"("remark") <= 500))),
    CONSTRAINT "mdm_supplier_contact_wechat_check" CHECK ((("wechat" IS NULL) OR ("char_length"("wechat") <= 80)))
);


ALTER TABLE "public"."mdm_supplier_contact" OWNER TO "postgres";

--

--

-- Name: mdm_supply_chain_code_attribute; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_supply_chain_code_attribute" (
    "attribute_code" "text" NOT NULL,
    "attribute_name" "text" NOT NULL,
    "attribute_type" "text" NOT NULL,
    "default_format" "text",
    "description" "text",
    "sort" integer DEFAULT 10 NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_supply_chain_code_attribute_code_check" CHECK (("attribute_code" ~ '^[A-Z][A-Z0-9_]{0,39}$'::"text")),
    CONSTRAINT "mdm_supply_chain_code_attribute_name_check" CHECK ((("btrim"("attribute_name") <> ''::"text") AND ("char_length"("attribute_name") <= 100))),
    CONSTRAINT "mdm_supply_chain_code_attribute_type_check" CHECK (("attribute_type" = ANY (ARRAY['constant'::"text", 'date'::"text", 'sequence'::"text", 'text'::"text"])))
);


ALTER TABLE "public"."mdm_supply_chain_code_attribute" OWNER TO "postgres";

--

--

-- Name: mdm_supply_chain_code_segment; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_supply_chain_code_segment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "rule_id" "uuid" NOT NULL,
    "attribute_code" "text" NOT NULL,
    "use_mode" "text" DEFAULT 'full'::"text" NOT NULL,
    "format" "text",
    "configured_value" "text",
    "length" integer,
    "step" integer DEFAULT 1 NOT NULL,
    "padding_char" "text" DEFAULT '0'::"text" NOT NULL,
    "pad_direction" "text" DEFAULT 'left'::"text" NOT NULL,
    "truncate" boolean DEFAULT false NOT NULL,
    "sequence_source" boolean DEFAULT false NOT NULL,
    "sort" integer DEFAULT 10 NOT NULL,
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_supply_chain_code_segment_direction_check" CHECK (("pad_direction" = ANY (ARRAY['left'::"text", 'right'::"text"]))),
    CONSTRAINT "mdm_supply_chain_code_segment_format_check" CHECK (("char_length"(COALESCE("format", ''::"text")) <= 30)),
    CONSTRAINT "mdm_supply_chain_code_segment_length_check" CHECK ((("length" IS NULL) OR (("length" >= 1) AND ("length" <= 60)))),
    CONSTRAINT "mdm_supply_chain_code_segment_mode_check" CHECK (("use_mode" = ANY (ARRAY['full'::"text", 'configured'::"text"]))),
    CONSTRAINT "mdm_supply_chain_code_segment_padding_check" CHECK (("char_length"("padding_char") = 1)),
    CONSTRAINT "mdm_supply_chain_code_segment_sort_check" CHECK ((("sort" >= 0) AND ("sort" <= 999999))),
    CONSTRAINT "mdm_supply_chain_code_segment_step_check" CHECK ((("step" >= 1) AND ("step" <= 999999))),
    CONSTRAINT "mdm_supply_chain_code_segment_value_check" CHECK (("char_length"(COALESCE("configured_value", ''::"text")) <= 60))
);


ALTER TABLE "public"."mdm_supply_chain_code_segment" OWNER TO "postgres";

--

--

-- Name: mdm_work_center_activity; Type: TABLE; Schema: public
--

--

CREATE TABLE IF NOT EXISTS "public"."mdm_work_center_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "app_private"."current_user_tenant_id"() NOT NULL,
    "work_center_id" "uuid" NOT NULL,
    "activity_name" "text" NOT NULL,
    "activity_type" "text" NOT NULL,
    "maintenance_rule" "text" DEFAULT 'no_check'::"text" NOT NULL,
    "base_quantity" numeric(18,2) DEFAULT 0 NOT NULL,
    "activity_unit" "text" DEFAULT 'minute'::"text" NOT NULL,
    "plan_formula_id" "uuid",
    "report_formula_id" "uuid",
    "backflush" boolean DEFAULT false NOT NULL,
    "remark" "text" DEFAULT ''::"text" NOT NULL,
    "sort" integer DEFAULT 0 NOT NULL,
    "create_by" "text",
    "create_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_by" "text",
    "update_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mdm_work_center_activity_base_quantity_check" CHECK (("base_quantity" >= (0)::numeric)),
    CONSTRAINT "mdm_work_center_activity_maintenance_rule_check" CHECK (("maintenance_rule" = ANY (ARRAY['check'::"text", 'no_check'::"text"]))),
    CONSTRAINT "mdm_work_center_activity_name_check" CHECK (("activity_name" = ANY (ARRAY['rated_preparation'::"text", 'rated_machine'::"text", 'rated_labor'::"text", 'rated_auxiliary'::"text", 'rated_other'::"text", 'planned_processing'::"text", 'planned_preparation'::"text"]))),
    CONSTRAINT "mdm_work_center_activity_remark_check" CHECK (("length"("remark") <= 500)),
    CONSTRAINT "mdm_work_center_activity_sort_check" CHECK (("sort" >= 0)),
    CONSTRAINT "mdm_work_center_activity_type_check" CHECK (("activity_type" = ANY (ARRAY['machine'::"text", 'labor'::"text", 'depreciation'::"text", 'auxiliary'::"text", 'other'::"text"]))),
    CONSTRAINT "mdm_work_center_activity_unit_check" CHECK (("activity_unit" = ANY (ARRAY['hour'::"text", 'minute'::"text", 'second'::"text"])))
);


ALTER TABLE "public"."mdm_work_center_activity" OWNER TO "postgres";

--

--

-- Name: TABLE "mdm_work_center_activity"; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE "public"."mdm_work_center_activity" IS '工作中心活动信息；维护活动类型、基数、单位、计划/汇报公式与倒冲规则。';


--

--

-- Name: mdm_insurance_company insurance_company_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'insurance_company_pkey'
       AND c.conrelid = 'public.mdm_insurance_company'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_insurance_company"
    ADD CONSTRAINT "insurance_company_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_business_partner mdm_business_partner_id_tenant_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_business_partner_id_tenant_key'
       AND c.conrelid = 'public.mdm_business_partner'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_business_partner"
    ADD CONSTRAINT "mdm_business_partner_id_tenant_key" UNIQUE ("id", "tenant_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_business_partner mdm_business_partner_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_business_partner_pkey'
       AND c.conrelid = 'public.mdm_business_partner'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_business_partner"
    ADD CONSTRAINT "mdm_business_partner_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_business_partner_role mdm_business_partner_role_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_business_partner_role_pkey'
       AND c.conrelid = 'public.mdm_business_partner_role'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_business_partner_role"
    ADD CONSTRAINT "mdm_business_partner_role_pkey" PRIMARY KEY ("tenant_id", "partner_id", "role_code");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_business_partner_role mdm_business_partner_role_source_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_business_partner_role_source_key'
       AND c.conrelid = 'public.mdm_business_partner_role'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_business_partner_role"
    ADD CONSTRAINT "mdm_business_partner_role_source_key" UNIQUE ("source_table", "source_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_change_request_event mdm_change_request_event_id_tenant_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_change_request_event_id_tenant_key'
       AND c.conrelid = 'public.mdm_change_request_event'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_change_request_event"
    ADD CONSTRAINT "mdm_change_request_event_id_tenant_key" UNIQUE ("id", "tenant_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_change_request_event mdm_change_request_event_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_change_request_event_pkey'
       AND c.conrelid = 'public.mdm_change_request_event'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_change_request_event"
    ADD CONSTRAINT "mdm_change_request_event_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_change_request mdm_change_request_id_tenant_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_change_request_id_tenant_key'
       AND c.conrelid = 'public.mdm_change_request'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_change_request"
    ADD CONSTRAINT "mdm_change_request_id_tenant_key" UNIQUE ("id", "tenant_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_change_request mdm_change_request_number_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_change_request_number_key'
       AND c.conrelid = 'public.mdm_change_request'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_change_request"
    ADD CONSTRAINT "mdm_change_request_number_key" UNIQUE ("tenant_id", "request_no");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_change_request mdm_change_request_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_change_request_pkey'
       AND c.conrelid = 'public.mdm_change_request'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_change_request"
    ADD CONSTRAINT "mdm_change_request_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_data_steward mdm_data_steward_id_tenant_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_data_steward_id_tenant_key'
       AND c.conrelid = 'public.mdm_data_steward'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_data_steward"
    ADD CONSTRAINT "mdm_data_steward_id_tenant_key" UNIQUE ("id", "tenant_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_data_steward mdm_data_steward_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_data_steward_pkey'
       AND c.conrelid = 'public.mdm_data_steward'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_data_steward"
    ADD CONSTRAINT "mdm_data_steward_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_driver mdm_driver_tenant_id_id_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_driver_tenant_id_id_key'
       AND c.conrelid = 'public.mdm_driver'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_driver"
    ADD CONSTRAINT "mdm_driver_tenant_id_id_key" UNIQUE ("tenant_id", "id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_golden_record mdm_golden_record_id_tenant_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_golden_record_id_tenant_key'
       AND c.conrelid = 'public.mdm_golden_record'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_golden_record"
    ADD CONSTRAINT "mdm_golden_record_id_tenant_key" UNIQUE ("id", "tenant_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_golden_record mdm_golden_record_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_golden_record_key'
       AND c.conrelid = 'public.mdm_golden_record'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_golden_record"
    ADD CONSTRAINT "mdm_golden_record_key" UNIQUE ("tenant_id", "source_type", "golden_key");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_golden_record mdm_golden_record_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_golden_record_pkey'
       AND c.conrelid = 'public.mdm_golden_record'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_golden_record"
    ADD CONSTRAINT "mdm_golden_record_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_match_candidate mdm_match_candidate_id_tenant_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_match_candidate_id_tenant_key'
       AND c.conrelid = 'public.mdm_match_candidate'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_match_candidate"
    ADD CONSTRAINT "mdm_match_candidate_id_tenant_key" UNIQUE ("id", "tenant_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_match_candidate mdm_match_candidate_pair_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_match_candidate_pair_key'
       AND c.conrelid = 'public.mdm_match_candidate'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_match_candidate"
    ADD CONSTRAINT "mdm_match_candidate_pair_key" UNIQUE ("tenant_id", "source_type", "left_record_id", "right_record_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_match_candidate mdm_match_candidate_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_match_candidate_pkey'
       AND c.conrelid = 'public.mdm_match_candidate'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_match_candidate"
    ADD CONSTRAINT "mdm_match_candidate_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_merge_event mdm_merge_event_id_tenant_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_merge_event_id_tenant_key'
       AND c.conrelid = 'public.mdm_merge_event'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_merge_event"
    ADD CONSTRAINT "mdm_merge_event_id_tenant_key" UNIQUE ("id", "tenant_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_merge_event mdm_merge_event_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_merge_event_pkey'
       AND c.conrelid = 'public.mdm_merge_event'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_merge_event"
    ADD CONSTRAINT "mdm_merge_event_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_outbound_rule_sort mdm_outbound_rule_sort_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_outbound_rule_sort_pkey'
       AND c.conrelid = 'public.mdm_outbound_rule_sort'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_outbound_rule_sort"
    ADD CONSTRAINT "mdm_outbound_rule_sort_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_outbound_rule_sort mdm_outbound_rule_sort_rule_field_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_outbound_rule_sort_rule_field_key'
       AND c.conrelid = 'public.mdm_outbound_rule_sort'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_outbound_rule_sort"
    ADD CONSTRAINT "mdm_outbound_rule_sort_rule_field_key" UNIQUE ("rule_id", "field_code");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_outbound_sort_field mdm_outbound_sort_field_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_outbound_sort_field_pkey'
       AND c.conrelid = 'public.mdm_outbound_sort_field'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_outbound_sort_field"
    ADD CONSTRAINT "mdm_outbound_sort_field_pkey" PRIMARY KEY ("field_code");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_outbound_sort_field mdm_outbound_sort_field_source_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_outbound_sort_field_source_key'
       AND c.conrelid = 'public.mdm_outbound_sort_field'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_outbound_sort_field"
    ADD CONSTRAINT "mdm_outbound_sort_field_source_key" UNIQUE ("source_code", "field_key");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_outbox_consumer mdm_outbox_consumer_id_tenant_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_outbox_consumer_id_tenant_key'
       AND c.conrelid = 'public.mdm_outbox_consumer'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_outbox_consumer"
    ADD CONSTRAINT "mdm_outbox_consumer_id_tenant_key" UNIQUE ("id", "tenant_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_outbox_consumer mdm_outbox_consumer_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_outbox_consumer_key'
       AND c.conrelid = 'public.mdm_outbox_consumer'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_outbox_consumer"
    ADD CONSTRAINT "mdm_outbox_consumer_key" UNIQUE ("tenant_id", "consumer_key");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_outbox_consumer mdm_outbox_consumer_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_outbox_consumer_pkey'
       AND c.conrelid = 'public.mdm_outbox_consumer'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_outbox_consumer"
    ADD CONSTRAINT "mdm_outbox_consumer_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_outbox_delivery mdm_outbox_delivery_event_consumer_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_outbox_delivery_event_consumer_key'
       AND c.conrelid = 'public.mdm_outbox_delivery'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_outbox_delivery"
    ADD CONSTRAINT "mdm_outbox_delivery_event_consumer_key" UNIQUE ("event_id", "consumer_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_outbox_delivery mdm_outbox_delivery_id_tenant_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_outbox_delivery_id_tenant_key'
       AND c.conrelid = 'public.mdm_outbox_delivery'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_outbox_delivery"
    ADD CONSTRAINT "mdm_outbox_delivery_id_tenant_key" UNIQUE ("id", "tenant_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_outbox_delivery mdm_outbox_delivery_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_outbox_delivery_pkey'
       AND c.conrelid = 'public.mdm_outbox_delivery'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_outbox_delivery"
    ADD CONSTRAINT "mdm_outbox_delivery_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_outbox_event mdm_outbox_event_id_tenant_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_outbox_event_id_tenant_key'
       AND c.conrelid = 'public.mdm_outbox_event'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_outbox_event"
    ADD CONSTRAINT "mdm_outbox_event_id_tenant_key" UNIQUE ("id", "tenant_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_outbox_event mdm_outbox_event_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_outbox_event_pkey'
       AND c.conrelid = 'public.mdm_outbox_event'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_outbox_event"
    ADD CONSTRAINT "mdm_outbox_event_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_part_category mdm_part_category_tenant_id_id_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_part_category_tenant_id_id_key'
       AND c.conrelid = 'public.mdm_part_category'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_part_category"
    ADD CONSTRAINT "mdm_part_category_tenant_id_id_key" UNIQUE ("tenant_id", "id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_personnel_common_work_center mdm_personnel_common_work_center_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_personnel_common_work_center_pkey'
       AND c.conrelid = 'public.mdm_personnel_common_work_center'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_personnel_common_work_center"
    ADD CONSTRAINT "mdm_personnel_common_work_center_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_personnel_common_work_center mdm_personnel_common_work_center_unique; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_personnel_common_work_center_unique'
       AND c.conrelid = 'public.mdm_personnel_common_work_center'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_personnel_common_work_center"
    ADD CONSTRAINT "mdm_personnel_common_work_center_unique" UNIQUE ("tenant_id", "personnel_id", "work_center_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_production_calendar_day_setting mdm_production_calendar_day_s_tenant_id_department_id_work__key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_production_calendar_day_s_tenant_id_department_id_work__key'
       AND c.conrelid = 'public.mdm_production_calendar_day_setting'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_production_calendar_day_setting"
    ADD CONSTRAINT "mdm_production_calendar_day_s_tenant_id_department_id_work__key" UNIQUE ("tenant_id", "department_id", "work_date");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_production_calendar_day_setting mdm_production_calendar_day_setting_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_production_calendar_day_setting_pkey'
       AND c.conrelid = 'public.mdm_production_calendar_day_setting'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_production_calendar_day_setting"
    ADD CONSTRAINT "mdm_production_calendar_day_setting_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_quality_issue_event mdm_quality_issue_event_id_tenant_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_quality_issue_event_id_tenant_key'
       AND c.conrelid = 'public.mdm_quality_issue_event'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_quality_issue_event"
    ADD CONSTRAINT "mdm_quality_issue_event_id_tenant_key" UNIQUE ("id", "tenant_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_quality_issue_event mdm_quality_issue_event_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_quality_issue_event_pkey'
       AND c.conrelid = 'public.mdm_quality_issue_event'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_quality_issue_event"
    ADD CONSTRAINT "mdm_quality_issue_event_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_quality_issue mdm_quality_issue_id_tenant_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_quality_issue_id_tenant_key'
       AND c.conrelid = 'public.mdm_quality_issue'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_quality_issue"
    ADD CONSTRAINT "mdm_quality_issue_id_tenant_key" UNIQUE ("id", "tenant_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_quality_issue mdm_quality_issue_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_quality_issue_pkey'
       AND c.conrelid = 'public.mdm_quality_issue'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_quality_issue"
    ADD CONSTRAINT "mdm_quality_issue_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_quality_issue mdm_quality_issue_record_rule_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_quality_issue_record_rule_key'
       AND c.conrelid = 'public.mdm_quality_issue'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_quality_issue"
    ADD CONSTRAINT "mdm_quality_issue_record_rule_key" UNIQUE ("tenant_id", "rule_id", "source_record_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_quality_rule mdm_quality_rule_id_tenant_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_quality_rule_id_tenant_key'
       AND c.conrelid = 'public.mdm_quality_rule'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_quality_rule"
    ADD CONSTRAINT "mdm_quality_rule_id_tenant_key" UNIQUE ("id", "tenant_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_quality_rule mdm_quality_rule_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_quality_rule_pkey'
       AND c.conrelid = 'public.mdm_quality_rule'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_quality_rule"
    ADD CONSTRAINT "mdm_quality_rule_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_quality_rule mdm_quality_rule_version_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_quality_rule_version_key'
       AND c.conrelid = 'public.mdm_quality_rule'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_quality_rule"
    ADD CONSTRAINT "mdm_quality_rule_version_key" UNIQUE ("tenant_id", "rule_code", "version");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_shift_schedule_member mdm_shift_schedule_member_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_shift_schedule_member_pkey'
       AND c.conrelid = 'public.mdm_shift_schedule_member'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_shift_schedule_member"
    ADD CONSTRAINT "mdm_shift_schedule_member_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_shift_schedule_member mdm_shift_schedule_member_schedule_personnel_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_shift_schedule_member_schedule_personnel_key'
       AND c.conrelid = 'public.mdm_shift_schedule_member'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_shift_schedule_member"
    ADD CONSTRAINT "mdm_shift_schedule_member_schedule_personnel_key" UNIQUE ("schedule_id", "personnel_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_shift_schedule mdm_shift_schedule_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_shift_schedule_pkey'
       AND c.conrelid = 'public.mdm_shift_schedule'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_shift_schedule"
    ADD CONSTRAINT "mdm_shift_schedule_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_shift_schedule mdm_shift_schedule_tenant_id_id_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_shift_schedule_tenant_id_id_key'
       AND c.conrelid = 'public.mdm_shift_schedule'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_shift_schedule"
    ADD CONSTRAINT "mdm_shift_schedule_tenant_id_id_key" UNIQUE ("tenant_id", "id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_source_crosswalk mdm_source_crosswalk_id_tenant_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_source_crosswalk_id_tenant_key'
       AND c.conrelid = 'public.mdm_source_crosswalk'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_source_crosswalk"
    ADD CONSTRAINT "mdm_source_crosswalk_id_tenant_key" UNIQUE ("id", "tenant_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_source_crosswalk mdm_source_crosswalk_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_source_crosswalk_pkey'
       AND c.conrelid = 'public.mdm_source_crosswalk'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_source_crosswalk"
    ADD CONSTRAINT "mdm_source_crosswalk_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_source_crosswalk mdm_source_crosswalk_source_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_source_crosswalk_source_key'
       AND c.conrelid = 'public.mdm_source_crosswalk'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_source_crosswalk"
    ADD CONSTRAINT "mdm_source_crosswalk_source_key" UNIQUE ("tenant_id", "source_app", "source_type", "source_record_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_stock_movement_type mdm_stock_movement_type_code_unique; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_stock_movement_type_code_unique'
       AND c.conrelid = 'public.mdm_stock_movement_type'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_stock_movement_type"
    ADD CONSTRAINT "mdm_stock_movement_type_code_unique" UNIQUE ("tenant_id", "movement_code");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_stock_movement_type mdm_stock_movement_type_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_stock_movement_type_pkey'
       AND c.conrelid = 'public.mdm_stock_movement_type'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_stock_movement_type"
    ADD CONSTRAINT "mdm_stock_movement_type_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_stock_movement_type mdm_stock_movement_type_tenant_id_unique; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_stock_movement_type_tenant_id_unique'
       AND c.conrelid = 'public.mdm_stock_movement_type'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_stock_movement_type"
    ADD CONSTRAINT "mdm_stock_movement_type_tenant_id_unique" UNIQUE ("tenant_id", "id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_supplier_bank mdm_supplier_bank_account_unique; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_supplier_bank_account_unique'
       AND c.conrelid = 'public.mdm_supplier_bank'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_supplier_bank"
    ADD CONSTRAINT "mdm_supplier_bank_account_unique" UNIQUE ("tenant_id", "supplier_id", "bank_account");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_supplier_bank mdm_supplier_bank_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_supplier_bank_pkey'
       AND c.conrelid = 'public.mdm_supplier_bank'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_supplier_bank"
    ADD CONSTRAINT "mdm_supplier_bank_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_supplier_contact mdm_supplier_contact_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_supplier_contact_pkey'
       AND c.conrelid = 'public.mdm_supplier_contact'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_supplier_contact"
    ADD CONSTRAINT "mdm_supplier_contact_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_supply_chain_code_attribute mdm_supply_chain_code_attribute_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_supply_chain_code_attribute_pkey'
       AND c.conrelid = 'public.mdm_supply_chain_code_attribute'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_supply_chain_code_attribute"
    ADD CONSTRAINT "mdm_supply_chain_code_attribute_pkey" PRIMARY KEY ("attribute_code");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_supply_chain_code_segment mdm_supply_chain_code_segment_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_supply_chain_code_segment_pkey'
       AND c.conrelid = 'public.mdm_supply_chain_code_segment'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_supply_chain_code_segment"
    ADD CONSTRAINT "mdm_supply_chain_code_segment_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_supply_chain_code_segment mdm_supply_chain_code_segment_rule_attribute_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_supply_chain_code_segment_rule_attribute_key'
       AND c.conrelid = 'public.mdm_supply_chain_code_segment'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_supply_chain_code_segment"
    ADD CONSTRAINT "mdm_supply_chain_code_segment_rule_attribute_key" UNIQUE ("rule_id", "attribute_code");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_work_center_activity mdm_work_center_activity_center_sort_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_work_center_activity_center_sort_key'
       AND c.conrelid = 'public.mdm_work_center_activity'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_work_center_activity"
    ADD CONSTRAINT "mdm_work_center_activity_center_sort_key" UNIQUE ("work_center_id", "sort");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_work_center_activity mdm_work_center_activity_id_tenant_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_work_center_activity_id_tenant_key'
       AND c.conrelid = 'public.mdm_work_center_activity'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_work_center_activity"
    ADD CONSTRAINT "mdm_work_center_activity_id_tenant_key" UNIQUE ("id", "tenant_id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_work_center_activity mdm_work_center_activity_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_work_center_activity_pkey'
       AND c.conrelid = 'public.mdm_work_center_activity'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_work_center_activity"
    ADD CONSTRAINT "mdm_work_center_activity_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_cargo tms_cargo_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'tms_cargo_pkey'
       AND c.conrelid = 'public.mdm_cargo'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_cargo"
    ADD CONSTRAINT "tms_cargo_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_driver tms_driver_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'tms_driver_pkey'
       AND c.conrelid = 'public.mdm_driver'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_driver"
    ADD CONSTRAINT "tms_driver_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_station tms_station_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'tms_station_pkey'
       AND c.conrelid = 'public.mdm_station'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_station"
    ADD CONSTRAINT "tms_station_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_station tms_station_tenant_code_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'tms_station_tenant_code_key'
       AND c.conrelid = 'public.mdm_station'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_station"
    ADD CONSTRAINT "tms_station_tenant_code_key" UNIQUE ("tenant_id", "station_code");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_station tms_station_tenant_name_key; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'tms_station_tenant_name_key'
       AND c.conrelid = 'public.mdm_station'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_station"
    ADD CONSTRAINT "tms_station_tenant_name_key" UNIQUE ("tenant_id", "station_name");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_vehicle uq_vehicle_archive_tenant_plate_no; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'uq_vehicle_archive_tenant_plate_no'
       AND c.conrelid = 'public.mdm_vehicle'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_vehicle"
    ADD CONSTRAINT "uq_vehicle_archive_tenant_plate_no" UNIQUE ("tenant_id", "plate_no");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_vehicle vehicle_archive_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'vehicle_archive_pkey'
       AND c.conrelid = 'public.mdm_vehicle'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_vehicle"
    ADD CONSTRAINT "vehicle_archive_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_part_category vehicle_parts_category_code_unique; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'vehicle_parts_category_code_unique'
       AND c.conrelid = 'public.mdm_part_category'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_part_category"
    ADD CONSTRAINT "vehicle_parts_category_code_unique" UNIQUE ("category_code");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_part_category vehicle_parts_category_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'vehicle_parts_category_pkey'
       AND c.conrelid = 'public.mdm_part_category'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_part_category"
    ADD CONSTRAINT "vehicle_parts_category_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_part vehicle_parts_pkey; Type: CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'vehicle_parts_pkey'
       AND c.conrelid = 'public.mdm_part'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_part"
    ADD CONSTRAINT "vehicle_parts_pkey" PRIMARY KEY ("id");


--
  END IF;
END
$already_exists$;

--

-- Name: idx_mdm_driver_tenant_carrier; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_mdm_driver_tenant_carrier" ON "public"."mdm_driver" USING "btree" ("tenant_id", "carrier_id") WHERE ("carrier_id" IS NOT NULL);


--

--

-- Name: idx_mdm_part_category_tenant_parent; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_mdm_part_category_tenant_parent" ON "public"."mdm_part_category" USING "btree" ("tenant_id", "parent_id") WHERE ("parent_id" IS NOT NULL);


--

--

-- Name: idx_mdm_part_tenant_category; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_mdm_part_tenant_category" ON "public"."mdm_part" USING "btree" ("tenant_id", "category_id") WHERE ("category_id" IS NOT NULL);


--

--

-- Name: idx_mdm_part_tenant_supplier; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_mdm_part_tenant_supplier" ON "public"."mdm_part" USING "btree" ("tenant_id", "supplier_id") WHERE ("supplier_id" IS NOT NULL);


--

--

-- Name: idx_mdm_vehicle_tenant_carrier; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_mdm_vehicle_tenant_carrier" ON "public"."mdm_vehicle" USING "btree" ("tenant_id", "carrier_id") WHERE ("carrier_id" IS NOT NULL);


--

--

-- Name: idx_tms_cargo_tenant_create_time; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_tms_cargo_tenant_create_time" ON "public"."mdm_cargo" USING "btree" ("tenant_id", "create_time" DESC);


--

--

-- Name: idx_tms_cargo_tenant_enabled; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_tms_cargo_tenant_enabled" ON "public"."mdm_cargo" USING "btree" ("tenant_id", "enabled");


--

--

-- Name: idx_tms_cargo_tenant_unit; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_tms_cargo_tenant_unit" ON "public"."mdm_cargo" USING "btree" ("tenant_id", "unit");


--

--

-- Name: idx_tms_driver_carrier_id; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_tms_driver_carrier_id" ON "public"."mdm_driver" USING "btree" ("carrier_id");


--

--

-- Name: idx_tms_driver_create_time; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_tms_driver_create_time" ON "public"."mdm_driver" USING "btree" ("create_time" DESC);


--

--

-- Name: idx_tms_driver_driver_type; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_tms_driver_driver_type" ON "public"."mdm_driver" USING "btree" ("tenant_id", "carrier_id", "driver_type");


--

--

-- Name: idx_tms_driver_enabled; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_tms_driver_enabled" ON "public"."mdm_driver" USING "btree" ("enabled");


--

--

-- Name: idx_tms_driver_phone; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_tms_driver_phone" ON "public"."mdm_driver" USING "btree" ("phone");


--

--

-- Name: idx_tms_station_tenant_enabled; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_tms_station_tenant_enabled" ON "public"."mdm_station" USING "btree" ("tenant_id", "enabled");


--

--

-- Name: idx_tms_station_tenant_sort; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_tms_station_tenant_sort" ON "public"."mdm_station" USING "btree" ("tenant_id", "sort", "station_code");


--

--

-- Name: idx_tms_station_tenant_type; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_tms_station_tenant_type" ON "public"."mdm_station" USING "btree" ("tenant_id", "station_type");


--

--

-- Name: idx_vehicle_archive_audit_status; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_vehicle_archive_audit_status" ON "public"."mdm_vehicle" USING "btree" ("audit_status");


--

--

-- Name: idx_vehicle_archive_carrier_id; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_vehicle_archive_carrier_id" ON "public"."mdm_vehicle" USING "btree" ("carrier_id");


--

--

-- Name: idx_vehicle_archive_create_time; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_vehicle_archive_create_time" ON "public"."mdm_vehicle" USING "btree" ("create_time" DESC);


--

--

-- Name: idx_vehicle_archive_plate_no; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_vehicle_archive_plate_no" ON "public"."mdm_vehicle" USING "btree" ("plate_no");


--

--

-- Name: idx_vehicle_archive_primary_driver_id; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_vehicle_archive_primary_driver_id" ON "public"."mdm_vehicle" USING "btree" ("primary_driver_id");


--

--

-- Name: idx_vehicle_archive_secondary_driver; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_vehicle_archive_secondary_driver" ON "public"."mdm_vehicle" USING "btree" ("secondary_driver_id") WHERE ("secondary_driver_id" IS NOT NULL);


--

--

-- Name: idx_vehicle_archive_tenant_id; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_vehicle_archive_tenant_id" ON "public"."mdm_vehicle" USING "btree" ("tenant_id");


--

--

-- Name: idx_vehicle_insurance_company_tenant_id; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_vehicle_insurance_company_tenant_id" ON "public"."mdm_insurance_company" USING "btree" ("tenant_id");


--

--

-- Name: idx_vehicle_insurance_company_tenant_name; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_vehicle_insurance_company_tenant_name" ON "public"."mdm_insurance_company" USING "btree" ("tenant_id", "company_name");


--

--

-- Name: idx_vehicle_parts_category_id; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_vehicle_parts_category_id" ON "public"."mdm_part" USING "btree" ("category_id");


--

--

-- Name: idx_vehicle_parts_category_parent_id; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_vehicle_parts_category_parent_id" ON "public"."mdm_part_category" USING "btree" ("parent_id");


--

--

-- Name: idx_vehicle_parts_category_sort; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_vehicle_parts_category_sort" ON "public"."mdm_part_category" USING "btree" ("parent_id", "sort", "create_time" DESC);


--

--

-- Name: idx_vehicle_parts_category_status; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_vehicle_parts_category_status" ON "public"."mdm_part_category" USING "btree" ("status");


--

--

-- Name: idx_vehicle_parts_category_tenant_code; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_vehicle_parts_category_tenant_code" ON "public"."mdm_part_category" USING "btree" ("tenant_id", "category_code");


--

--

-- Name: idx_vehicle_parts_category_tenant_id; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_vehicle_parts_category_tenant_id" ON "public"."mdm_part_category" USING "btree" ("tenant_id");


--

--

-- Name: idx_vehicle_parts_supplier_id; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_vehicle_parts_supplier_id" ON "public"."mdm_part" USING "btree" ("supplier_id");


--

--

-- Name: idx_vehicle_parts_tenant_category; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_vehicle_parts_tenant_category" ON "public"."mdm_part" USING "btree" ("tenant_id", "category_id");


--

--

-- Name: idx_vehicle_parts_tenant_create_time; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_vehicle_parts_tenant_create_time" ON "public"."mdm_part" USING "btree" ("tenant_id", "create_time" DESC);


--

--

-- Name: idx_vehicle_parts_tenant_supplier; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "idx_vehicle_parts_tenant_supplier" ON "public"."mdm_part" USING "btree" ("tenant_id", "supplier_id");


--

--

-- Name: insurance_company_company_name_key; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX IF NOT EXISTS "insurance_company_company_name_key" ON "public"."mdm_insurance_company" USING "btree" ("company_name");


--

--

-- Name: insurance_company_create_time_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "insurance_company_create_time_idx" ON "public"."mdm_insurance_company" USING "btree" ("create_time" DESC);


--

--

-- Name: mdm_business_partner_role_partner_tenant_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_business_partner_role_partner_tenant_idx" ON "public"."mdm_business_partner_role" USING "btree" ("partner_id", "tenant_id");


--

--

-- Name: mdm_business_partner_role_tenant_role_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_business_partner_role_tenant_role_idx" ON "public"."mdm_business_partner_role" USING "btree" ("tenant_id", "role_code", "partner_id");


--

--

-- Name: mdm_business_partner_tenant_code_uq; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX IF NOT EXISTS "mdm_business_partner_tenant_code_uq" ON "public"."mdm_business_partner" USING "btree" ("tenant_id", "lower"("partner_code"));


--

--

-- Name: mdm_business_partner_tenant_name_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_business_partner_tenant_name_idx" ON "public"."mdm_business_partner" USING "btree" ("tenant_id", "lower"("partner_name"));


--

--

-- Name: mdm_business_partner_tenant_registration_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_business_partner_tenant_registration_idx" ON "public"."mdm_business_partner" USING "btree" ("tenant_id", "lower"("registration_no")) WHERE (("registration_no" IS NOT NULL) AND ("btrim"("registration_no") <> ''::"text"));


--

--

-- Name: mdm_business_partner_tenant_tax_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_business_partner_tenant_tax_idx" ON "public"."mdm_business_partner" USING "btree" ("tenant_id", "lower"("tax_no")) WHERE (("tax_no" IS NOT NULL) AND ("btrim"("tax_no") <> ''::"text"));


--

--

-- Name: mdm_cargo_legacy_name_unique; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX IF NOT EXISTS "mdm_cargo_legacy_name_unique" ON "public"."mdm_cargo" USING "btree" ("tenant_id", "cargo_name") WHERE ("material_id" IS NULL);


--

--

-- Name: mdm_cargo_material_group_tenant_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_cargo_material_group_tenant_idx" ON "public"."mdm_cargo" USING "btree" ("material_group_id", "tenant_id");


--

--

-- Name: mdm_cargo_material_tenant_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_cargo_material_tenant_idx" ON "public"."mdm_cargo" USING "btree" ("material_id", "tenant_id");


--

--

-- Name: mdm_cargo_tenant_material_unique; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX IF NOT EXISTS "mdm_cargo_tenant_material_unique" ON "public"."mdm_cargo" USING "btree" ("tenant_id", "material_id") WHERE ("material_id" IS NOT NULL);


--

--

-- Name: mdm_change_request_event_history_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_change_request_event_history_idx" ON "public"."mdm_change_request_event" USING "btree" ("request_id", "tenant_id", "create_time" DESC);


--

--

-- Name: mdm_change_request_queue_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_change_request_queue_idx" ON "public"."mdm_change_request" USING "btree" ("tenant_id", "state", "effective_at", "create_time" DESC);


--

--

-- Name: mdm_change_request_source_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_change_request_source_idx" ON "public"."mdm_change_request" USING "btree" ("tenant_id", "source_type", "source_record_id") WHERE ("source_record_id" IS NOT NULL);


--

--

-- Name: mdm_data_steward_escalation_user_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_data_steward_escalation_user_idx" ON "public"."mdm_data_steward" USING "btree" ("escalation_user_id", "tenant_id") WHERE (("escalation_user_id" IS NOT NULL) AND "enabled");


--

--

-- Name: mdm_data_steward_scope_key; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX IF NOT EXISTS "mdm_data_steward_scope_key" ON "public"."mdm_data_steward" USING "btree" ("tenant_id", "domain_key", COALESCE("source_type", ''::"text"));


--

--

-- Name: mdm_data_steward_user_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_data_steward_user_idx" ON "public"."mdm_data_steward" USING "btree" ("steward_user_id", "tenant_id") WHERE "enabled";


--

--

-- Name: mdm_golden_record_status_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_golden_record_status_idx" ON "public"."mdm_golden_record" USING "btree" ("tenant_id", "source_type", "status", "update_time" DESC);


--

--

-- Name: mdm_match_candidate_queue_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_match_candidate_queue_idx" ON "public"."mdm_match_candidate" USING "btree" ("tenant_id", "state", "match_score" DESC, "create_time");


--

--

-- Name: mdm_merge_event_history_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_merge_event_history_idx" ON "public"."mdm_merge_event" USING "btree" ("golden_record_id", "tenant_id", "create_time" DESC);


--

--

-- Name: mdm_outbound_rule_sort_field_code_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_outbound_rule_sort_field_code_idx" ON "public"."mdm_outbound_rule_sort" USING "btree" ("field_code");


--

--

-- Name: mdm_outbound_rule_sort_rule_sort_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_outbound_rule_sort_rule_sort_idx" ON "public"."mdm_outbound_rule_sort" USING "btree" ("rule_id", "tenant_id", "sort", "id");


--

--

-- Name: mdm_outbox_delivery_claim_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_outbox_delivery_claim_idx" ON "public"."mdm_outbox_delivery" USING "btree" ("consumer_id", "status", "available_at", "create_time") WHERE ("status" = ANY (ARRAY['pending'::"text", 'retry'::"text", 'processing'::"text"]));


--

--

-- Name: mdm_outbox_delivery_dead_letter_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_outbox_delivery_dead_letter_idx" ON "public"."mdm_outbox_delivery" USING "btree" ("tenant_id", "create_time" DESC) WHERE ("status" = 'dead_letter'::"text");


--

--

-- Name: mdm_outbox_event_aggregate_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_outbox_event_aggregate_idx" ON "public"."mdm_outbox_event" USING "btree" ("tenant_id", "aggregate_type", "aggregate_id", "occurred_at" DESC);


--

--

-- Name: mdm_outbox_event_stream_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_outbox_event_stream_idx" ON "public"."mdm_outbox_event" USING "btree" ("tenant_id", "event_type", "occurred_at", "id");


--

--

-- Name: mdm_personnel_common_work_center_center_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_personnel_common_work_center_center_idx" ON "public"."mdm_personnel_common_work_center" USING "btree" ("tenant_id", "work_center_id");


--

--

-- Name: mdm_personnel_common_work_center_personnel_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_personnel_common_work_center_personnel_idx" ON "public"."mdm_personnel_common_work_center" USING "btree" ("tenant_id", "personnel_id");


--

--

-- Name: mdm_quality_issue_event_history_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_quality_issue_event_history_idx" ON "public"."mdm_quality_issue_event" USING "btree" ("issue_id", "tenant_id", "create_time" DESC);


--

--

-- Name: mdm_quality_issue_queue_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_quality_issue_queue_idx" ON "public"."mdm_quality_issue" USING "btree" ("tenant_id", "state", "due_at", "severity");


--

--

-- Name: mdm_quality_issue_source_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_quality_issue_source_idx" ON "public"."mdm_quality_issue" USING "btree" ("tenant_id", "source_type", "source_record_id");


--

--

-- Name: mdm_quality_issue_steward_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_quality_issue_steward_idx" ON "public"."mdm_quality_issue" USING "btree" ("assigned_steward_id", "tenant_id", "state") WHERE ("assigned_steward_id" IS NOT NULL);


--

--

-- Name: mdm_quality_rule_one_active_version; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX IF NOT EXISTS "mdm_quality_rule_one_active_version" ON "public"."mdm_quality_rule" USING "btree" ("tenant_id", "rule_code") WHERE "active";


--

--

-- Name: mdm_quality_rule_scope_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_quality_rule_scope_idx" ON "public"."mdm_quality_rule" USING "btree" ("tenant_id", "source_type", "active", "effective_from" DESC);


--

--

-- Name: mdm_shift_schedule_department_dates_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_shift_schedule_department_dates_idx" ON "public"."mdm_shift_schedule" USING "btree" ("tenant_id", "department_id", "start_date", "end_date") WHERE ("deleted_at" IS NULL);


--

--

-- Name: mdm_shift_schedule_member_personnel_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_shift_schedule_member_personnel_idx" ON "public"."mdm_shift_schedule_member" USING "btree" ("tenant_id", "personnel_id", "schedule_id");


--

--

-- Name: mdm_shift_schedule_member_schedule_fk_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_shift_schedule_member_schedule_fk_idx" ON "public"."mdm_shift_schedule_member" USING "btree" ("tenant_id", "schedule_id");


--

--

-- Name: mdm_shift_schedule_pattern_fk_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_shift_schedule_pattern_fk_idx" ON "public"."mdm_shift_schedule" USING "btree" ("tenant_id", "department_id", "pattern_id");


--

--

-- Name: mdm_shift_schedule_pattern_shift_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_shift_schedule_pattern_shift_idx" ON "public"."mdm_shift_schedule" USING "btree" ("tenant_id", "pattern_id", "shift_index") WHERE ("deleted_at" IS NULL);


--

--

-- Name: mdm_source_crosswalk_golden_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_source_crosswalk_golden_idx" ON "public"."mdm_source_crosswalk" USING "btree" ("golden_record_id", "tenant_id") WHERE "active";


--

--

-- Name: mdm_stock_movement_type_reverse_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_stock_movement_type_reverse_idx" ON "public"."mdm_stock_movement_type" USING "btree" ("tenant_id", "reverse_type_id") WHERE ("reverse_type_id" IS NOT NULL);


--

--

-- Name: mdm_stock_movement_type_tenant_direction_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_stock_movement_type_tenant_direction_idx" ON "public"."mdm_stock_movement_type" USING "btree" ("tenant_id", "direction", "movement_code");


--

--

-- Name: mdm_supplier_bank_supplier_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_supplier_bank_supplier_idx" ON "public"."mdm_supplier_bank" USING "btree" ("tenant_id", "supplier_id");


--

--

-- Name: mdm_supplier_contact_supplier_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_supplier_contact_supplier_idx" ON "public"."mdm_supplier_contact" USING "btree" ("tenant_id", "supplier_id");


--

--

-- Name: mdm_supply_chain_code_segment_attribute_code_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_supply_chain_code_segment_attribute_code_idx" ON "public"."mdm_supply_chain_code_segment" USING "btree" ("attribute_code");


--

--

-- Name: mdm_supply_chain_code_segment_rule_sort_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_supply_chain_code_segment_rule_sort_idx" ON "public"."mdm_supply_chain_code_segment" USING "btree" ("rule_id", "tenant_id", "sort", "id");


--

--

-- Name: mdm_supply_chain_code_segment_sequence_source_uidx; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX IF NOT EXISTS "mdm_supply_chain_code_segment_sequence_source_uidx" ON "public"."mdm_supply_chain_code_segment" USING "btree" ("rule_id") WHERE "sequence_source";


--

--

-- Name: mdm_vehicle_type_profile_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_vehicle_type_profile_idx" ON "public"."mdm_vehicle" USING "btree" ("vehicle_type_profile_id") WHERE ("vehicle_type_profile_id" IS NOT NULL);


--

--

-- Name: mdm_work_center_activity_plan_formula_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_work_center_activity_plan_formula_idx" ON "public"."mdm_work_center_activity" USING "btree" ("tenant_id", "plan_formula_id");


--

--

-- Name: mdm_work_center_activity_report_formula_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_work_center_activity_report_formula_idx" ON "public"."mdm_work_center_activity" USING "btree" ("tenant_id", "report_formula_id");


--

--

-- Name: mdm_work_center_activity_tenant_center_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "mdm_work_center_activity_tenant_center_idx" ON "public"."mdm_work_center_activity" USING "btree" ("tenant_id", "work_center_id", "sort");


--

--

-- Name: tms_driver_creator_tenant_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "tms_driver_creator_tenant_idx" ON "public"."mdm_driver" USING "btree" ("created_by_user_id", "tenant_id");


--

--

-- Name: tms_driver_employee_tenant_unique; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX IF NOT EXISTS "tms_driver_employee_tenant_unique" ON "public"."mdm_driver" USING "btree" ("employee_id", "tenant_id") WHERE ("employee_id" IS NOT NULL);


--

--

-- Name: tms_driver_tenant_creator_time_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "tms_driver_tenant_creator_time_idx" ON "public"."mdm_driver" USING "btree" ("tenant_id", "created_by_user_id", "create_time" DESC);


--

--

-- Name: uq_vehicle_parts_tenant_part_code; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX IF NOT EXISTS "uq_vehicle_parts_tenant_part_code" ON "public"."mdm_part" USING "btree" ("tenant_id", "part_code");


--

--

-- Name: vehicle_archive_created_by_user_tenant_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "vehicle_archive_created_by_user_tenant_idx" ON "public"."mdm_vehicle" USING "btree" ("created_by_user_id", "tenant_id");


--

--

-- Name: vehicle_archive_tenant_primary_driver_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "vehicle_archive_tenant_primary_driver_idx" ON "public"."mdm_vehicle" USING "btree" ("tenant_id", "primary_driver_id") WHERE ("primary_driver_id" IS NOT NULL);


--

--

-- Name: vehicle_archive_tenant_secondary_driver_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX IF NOT EXISTS "vehicle_archive_tenant_secondary_driver_idx" ON "public"."mdm_vehicle" USING "btree" ("tenant_id", "secondary_driver_id") WHERE ("secondary_driver_id" IS NOT NULL);


--

--

-- Name: mdm_production_calendar_day_setting calendar_day_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "calendar_day_create_audit" BEFORE INSERT ON "public"."mdm_production_calendar_day_setting" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_production_calendar_day_setting calendar_day_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "calendar_day_update_audit" BEFORE UPDATE ON "public"."mdm_production_calendar_day_setting" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_cargo document_number_cargo_code; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "document_number_cargo_code" BEFORE INSERT ON "public"."mdm_cargo" FOR EACH ROW WHEN (("new"."material_id" IS NULL)) EXECUTE FUNCTION "app_private"."trg_assign_configurable_number"('master.cargo', 'cargo_code');


--

--

-- Name: mdm_part_category document_number_category_code; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "document_number_category_code" BEFORE INSERT ON "public"."mdm_part_category" FOR EACH ROW EXECUTE FUNCTION "app_private"."trg_assign_configurable_number"('vehicle.part_category', 'category_code');


--

--

-- Name: mdm_part document_number_part_code; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "document_number_part_code" BEFORE INSERT ON "public"."mdm_part" FOR EACH ROW EXECUTE FUNCTION "app_private"."trg_assign_configurable_number"('vehicle.part', 'part_code');


--

--

-- Name: mdm_vehicle document_number_self_no; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "document_number_self_no" BEFORE INSERT ON "public"."mdm_vehicle" FOR EACH ROW EXECUTE FUNCTION "app_private"."trg_assign_configurable_number"('vehicle.archive_self', 'self_no');


--

--

-- Name: mdm_station document_number_station_code; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "document_number_station_code" BEFORE INSERT ON "public"."mdm_station" FOR EACH ROW EXECUTE FUNCTION "app_private"."trg_assign_configurable_number"('master.station', 'station_code');


--

--

-- Name: mdm_business_partner mdm_business_partner_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_business_partner_create_audit" BEFORE INSERT ON "public"."mdm_business_partner" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_business_partner_role mdm_business_partner_role_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_business_partner_role_create_audit" BEFORE INSERT ON "public"."mdm_business_partner_role" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_business_partner_role mdm_business_partner_role_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_business_partner_role_update_audit" BEFORE UPDATE ON "public"."mdm_business_partner_role" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_business_partner mdm_business_partner_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_business_partner_update_audit" BEFORE UPDATE ON "public"."mdm_business_partner" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_change_request mdm_change_request_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_change_request_create_audit" BEFORE INSERT ON "public"."mdm_change_request" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_change_request_event mdm_change_request_event_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_change_request_event_create_audit" BEFORE INSERT ON "public"."mdm_change_request_event" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_change_request_event mdm_change_request_event_immutable; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_change_request_event_immutable" BEFORE DELETE OR UPDATE ON "public"."mdm_change_request_event" FOR EACH ROW EXECUTE FUNCTION "app_private"."mdm_prevent_immutable_event_mutation"();


--

--

-- Name: mdm_change_request_event mdm_change_request_event_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_change_request_event_update_audit" BEFORE UPDATE ON "public"."mdm_change_request_event" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_change_request mdm_change_request_state_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_change_request_state_audit" AFTER INSERT OR UPDATE OF "state" ON "public"."mdm_change_request" FOR EACH ROW EXECUTE FUNCTION "app_private"."mdm_change_request_state_audit"();


--

--

-- Name: mdm_change_request mdm_change_request_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_change_request_update_audit" BEFORE UPDATE ON "public"."mdm_change_request" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_data_steward mdm_data_steward_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_data_steward_create_audit" BEFORE INSERT ON "public"."mdm_data_steward" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_data_steward mdm_data_steward_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_data_steward_update_audit" BEFORE UPDATE ON "public"."mdm_data_steward" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_golden_record mdm_golden_record_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_golden_record_create_audit" BEFORE INSERT ON "public"."mdm_golden_record" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_golden_record mdm_golden_record_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_golden_record_update_audit" BEFORE UPDATE ON "public"."mdm_golden_record" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_insurance_company mdm_insurance_company_sync_business_partner; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_insurance_company_sync_business_partner" AFTER INSERT OR DELETE OR UPDATE ON "public"."mdm_insurance_company" FOR EACH ROW EXECUTE FUNCTION "app_private"."sync_mdm_business_partner_role"();


--

--

-- Name: mdm_match_candidate mdm_match_candidate_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_match_candidate_create_audit" BEFORE INSERT ON "public"."mdm_match_candidate" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_match_candidate mdm_match_candidate_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_match_candidate_update_audit" BEFORE UPDATE ON "public"."mdm_match_candidate" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_merge_event mdm_merge_event_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_merge_event_create_audit" BEFORE INSERT ON "public"."mdm_merge_event" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_merge_event mdm_merge_event_immutable; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_merge_event_immutable" BEFORE DELETE OR UPDATE ON "public"."mdm_merge_event" FOR EACH ROW EXECUTE FUNCTION "app_private"."mdm_prevent_immutable_event_mutation"();


--

--

-- Name: mdm_merge_event mdm_merge_event_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_merge_event_update_audit" BEFORE UPDATE ON "public"."mdm_merge_event" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_outbound_rule_sort mdm_outbound_rule_sort_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_outbound_rule_sort_create_audit" BEFORE INSERT ON "public"."mdm_outbound_rule_sort" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_outbound_rule_sort mdm_outbound_rule_sort_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_outbound_rule_sort_update_audit" BEFORE UPDATE ON "public"."mdm_outbound_rule_sort" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_outbox_consumer mdm_outbox_consumer_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_outbox_consumer_create_audit" BEFORE INSERT ON "public"."mdm_outbox_consumer" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_outbox_consumer mdm_outbox_consumer_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_outbox_consumer_update_audit" BEFORE UPDATE ON "public"."mdm_outbox_consumer" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_outbox_delivery mdm_outbox_delivery_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_outbox_delivery_create_audit" BEFORE INSERT ON "public"."mdm_outbox_delivery" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_outbox_delivery mdm_outbox_delivery_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_outbox_delivery_update_audit" BEFORE UPDATE ON "public"."mdm_outbox_delivery" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_outbox_event mdm_outbox_event_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_outbox_event_create_audit" BEFORE INSERT ON "public"."mdm_outbox_event" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_outbox_event mdm_outbox_event_immutable; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_outbox_event_immutable" BEFORE DELETE OR UPDATE ON "public"."mdm_outbox_event" FOR EACH ROW EXECUTE FUNCTION "app_private"."mdm_prevent_immutable_event_mutation"();


--

--

-- Name: mdm_outbox_event mdm_outbox_event_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_outbox_event_update_audit" BEFORE UPDATE ON "public"."mdm_outbox_event" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_personnel_common_work_center mdm_personnel_common_work_center_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_personnel_common_work_center_create_audit" BEFORE INSERT ON "public"."mdm_personnel_common_work_center" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_personnel_common_work_center mdm_personnel_common_work_center_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_personnel_common_work_center_update_audit" BEFORE UPDATE ON "public"."mdm_personnel_common_work_center" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_quality_issue mdm_quality_issue_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_quality_issue_create_audit" BEFORE INSERT ON "public"."mdm_quality_issue" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_quality_issue_event mdm_quality_issue_event_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_quality_issue_event_create_audit" BEFORE INSERT ON "public"."mdm_quality_issue_event" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_quality_issue_event mdm_quality_issue_event_immutable; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_quality_issue_event_immutable" BEFORE DELETE OR UPDATE ON "public"."mdm_quality_issue_event" FOR EACH ROW EXECUTE FUNCTION "app_private"."mdm_prevent_immutable_event_mutation"();


--

--

-- Name: mdm_quality_issue_event mdm_quality_issue_event_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_quality_issue_event_update_audit" BEFORE UPDATE ON "public"."mdm_quality_issue_event" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_quality_issue mdm_quality_issue_state_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_quality_issue_state_audit" AFTER INSERT OR UPDATE OF "state" ON "public"."mdm_quality_issue" FOR EACH ROW EXECUTE FUNCTION "app_private"."mdm_quality_issue_state_audit"();


--

--

-- Name: mdm_quality_issue mdm_quality_issue_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_quality_issue_update_audit" BEFORE UPDATE ON "public"."mdm_quality_issue" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_quality_rule mdm_quality_rule_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_quality_rule_create_audit" BEFORE INSERT ON "public"."mdm_quality_rule" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_quality_rule mdm_quality_rule_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_quality_rule_update_audit" BEFORE UPDATE ON "public"."mdm_quality_rule" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_shift_schedule mdm_shift_schedule_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_shift_schedule_create_audit" BEFORE INSERT ON "public"."mdm_shift_schedule" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_shift_schedule_member mdm_shift_schedule_member_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_shift_schedule_member_create_audit" BEFORE INSERT ON "public"."mdm_shift_schedule_member" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_shift_schedule_member mdm_shift_schedule_member_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_shift_schedule_member_update_audit" BEFORE UPDATE ON "public"."mdm_shift_schedule_member" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_shift_schedule_member mdm_shift_schedule_member_validate; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_shift_schedule_member_validate" BEFORE INSERT OR DELETE OR UPDATE ON "public"."mdm_shift_schedule_member" FOR EACH ROW EXECUTE FUNCTION "app_private"."validate_mdm_shift_schedule_member"();


--

--

-- Name: mdm_shift_schedule mdm_shift_schedule_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_shift_schedule_update_audit" BEFORE UPDATE ON "public"."mdm_shift_schedule" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_shift_schedule mdm_shift_schedule_validate; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_shift_schedule_validate" BEFORE INSERT OR UPDATE ON "public"."mdm_shift_schedule" FOR EACH ROW EXECUTE FUNCTION "app_private"."validate_mdm_shift_schedule"();


--

--

-- Name: mdm_source_crosswalk mdm_source_crosswalk_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_source_crosswalk_create_audit" BEFORE INSERT ON "public"."mdm_source_crosswalk" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_source_crosswalk mdm_source_crosswalk_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_source_crosswalk_update_audit" BEFORE UPDATE ON "public"."mdm_source_crosswalk" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_stock_movement_type mdm_stock_movement_type_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_stock_movement_type_create_audit" BEFORE INSERT ON "public"."mdm_stock_movement_type" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_stock_movement_type mdm_stock_movement_type_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_stock_movement_type_update_audit" BEFORE UPDATE ON "public"."mdm_stock_movement_type" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_supply_chain_code_segment mdm_supply_chain_code_segment_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_supply_chain_code_segment_create_audit" BEFORE INSERT ON "public"."mdm_supply_chain_code_segment" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_supply_chain_code_segment mdm_supply_chain_code_segment_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_supply_chain_code_segment_update_audit" BEFORE UPDATE ON "public"."mdm_supply_chain_code_segment" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_vehicle mdm_vehicle_apply_type_profile; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_vehicle_apply_type_profile" BEFORE INSERT OR UPDATE ON "public"."mdm_vehicle" FOR EACH ROW EXECUTE FUNCTION "app_private"."apply_vehicle_type_profile"();


--

--

-- Name: mdm_work_center_activity mdm_work_center_activity_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_work_center_activity_create_audit" BEFORE INSERT ON "public"."mdm_work_center_activity" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_work_center_activity mdm_work_center_activity_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "mdm_work_center_activity_update_audit" BEFORE UPDATE ON "public"."mdm_work_center_activity" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_supplier_bank supplier_bank_tenant; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "supplier_bank_tenant" BEFORE INSERT OR UPDATE ON "public"."mdm_supplier_bank" FOR EACH ROW EXECUTE FUNCTION "app_private"."set_supplier_child_tenant"();


--

--

-- Name: mdm_supplier_contact supplier_contact_tenant; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "supplier_contact_tenant" BEFORE INSERT OR UPDATE ON "public"."mdm_supplier_contact" FOR EACH ROW EXECUTE FUNCTION "app_private"."set_supplier_child_tenant"();


--

--

-- Name: mdm_cargo tms_cargo_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "tms_cargo_create_audit" BEFORE INSERT ON "public"."mdm_cargo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_cargo tms_cargo_material_before_write; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "tms_cargo_material_before_write" BEFORE INSERT OR UPDATE ON "public"."mdm_cargo" FOR EACH ROW EXECUTE FUNCTION "app_private"."tms_cargo_apply_material"();


--

--

-- Name: mdm_cargo tms_cargo_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "tms_cargo_update_audit" BEFORE UPDATE ON "public"."mdm_cargo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_driver tms_driver_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "tms_driver_create_audit" BEFORE INSERT ON "public"."mdm_driver" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_driver tms_driver_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "tms_driver_update_audit" BEFORE UPDATE ON "public"."mdm_driver" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_station tms_station_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "tms_station_create_audit" BEFORE INSERT ON "public"."mdm_station" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_station tms_station_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "tms_station_update_audit" BEFORE UPDATE ON "public"."mdm_station" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_insurance_company trg_apply_current_tenant_id; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "trg_apply_current_tenant_id" BEFORE INSERT ON "public"."mdm_insurance_company" FOR EACH ROW EXECUTE FUNCTION "app_private"."trg_apply_current_tenant_id"();


--

--

-- Name: mdm_part_category trg_apply_current_tenant_id; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "trg_apply_current_tenant_id" BEFORE INSERT ON "public"."mdm_part_category" FOR EACH ROW EXECUTE FUNCTION "app_private"."trg_apply_current_tenant_id"();


--

--

-- Name: mdm_insurance_company trg_set_create_vehicle_insurance_company_time_and_by; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "trg_set_create_vehicle_insurance_company_time_and_by" BEFORE INSERT ON "public"."mdm_insurance_company" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_insurance_company trg_set_update_vehicle_insurance_company_time_and_by; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "trg_set_update_vehicle_insurance_company_time_and_by" BEFORE UPDATE ON "public"."mdm_insurance_company" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_part_category trg_vehicle_parts_category_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "trg_vehicle_parts_category_create_audit" BEFORE INSERT ON "public"."mdm_part_category" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_part_category trg_vehicle_parts_category_level; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "trg_vehicle_parts_category_level" BEFORE INSERT OR UPDATE OF "parent_id" ON "public"."mdm_part_category" FOR EACH ROW EXECUTE FUNCTION "public"."set_vehicle_parts_category_level"();


--

--

-- Name: mdm_part_category trg_vehicle_parts_category_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "trg_vehicle_parts_category_update_audit" BEFORE UPDATE ON "public"."mdm_part_category" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_vehicle vehicle_archive_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "vehicle_archive_create_audit" BEFORE INSERT ON "public"."mdm_vehicle" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_vehicle vehicle_archive_creator_identity; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "vehicle_archive_creator_identity" BEFORE INSERT OR UPDATE ON "public"."mdm_vehicle" FOR EACH ROW EXECUTE FUNCTION "app_private"."set_vehicle_archive_creator_identity"();


--

--

-- Name: mdm_vehicle vehicle_archive_require_workflow_review; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "vehicle_archive_require_workflow_review" BEFORE UPDATE OF "audit_status", "audit_by", "audit_time", "audit_remark" ON "public"."mdm_vehicle" FOR EACH ROW EXECUTE FUNCTION "app_private"."trg_require_workflow_for_vehicle_review"();


--

--

-- Name: mdm_vehicle vehicle_archive_sync_notification_subject; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "vehicle_archive_sync_notification_subject" AFTER INSERT OR DELETE OR UPDATE OF "plate_no", "service_end_time", "operation_status" ON "public"."mdm_vehicle" FOR EACH ROW EXECUTE FUNCTION "app_private"."sync_notification_subject_from_source"();


--

--

-- Name: mdm_vehicle vehicle_archive_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "vehicle_archive_update_audit" BEFORE UPDATE ON "public"."mdm_vehicle" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_vehicle vehicle_archive_workflow_initial_state; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "vehicle_archive_workflow_initial_state" BEFORE INSERT ON "public"."mdm_vehicle" FOR EACH ROW EXECUTE FUNCTION "app_private"."trg_require_workflow_initial_review_state"();


--

--

-- Name: mdm_part vehicle_parts_create_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "vehicle_parts_create_audit" BEFORE INSERT ON "public"."mdm_part" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_create_time_and_by"('true', 'true');


--

--

-- Name: mdm_part vehicle_parts_update_audit; Type: TRIGGER; Schema: public
--

--

CREATE OR REPLACE TRIGGER "vehicle_parts_update_audit" BEFORE UPDATE ON "public"."mdm_part" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_update_time_and_by"();


--

--

-- Name: mdm_business_partner_role mdm_business_partner_role_partner_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_business_partner_role_partner_fkey'
       AND c.conrelid = 'public.mdm_business_partner_role'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_business_partner_role"
    ADD CONSTRAINT "mdm_business_partner_role_partner_fkey" FOREIGN KEY ("partner_id", "tenant_id") REFERENCES "public"."mdm_business_partner"("id", "tenant_id") ON DELETE CASCADE;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_cargo mdm_cargo_material_group_tenant_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_cargo_material_group_tenant_fkey'
       AND c.conrelid = 'public.mdm_cargo'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_cargo"
    ADD CONSTRAINT "mdm_cargo_material_group_tenant_fkey" FOREIGN KEY ("material_group_id", "tenant_id") REFERENCES "public"."mdm_master_group"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_cargo mdm_cargo_material_tenant_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_cargo_material_tenant_fkey'
       AND c.conrelid = 'public.mdm_cargo'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_cargo"
    ADD CONSTRAINT "mdm_cargo_material_tenant_fkey" FOREIGN KEY ("material_id", "tenant_id") REFERENCES "public"."mdm_material"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_change_request_event mdm_change_request_event_actor_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_change_request_event_actor_fk'
       AND c.conrelid = 'public.mdm_change_request_event'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_change_request_event"
    ADD CONSTRAINT "mdm_change_request_event_actor_fk" FOREIGN KEY ("actor_user_id", "tenant_id") REFERENCES "public"."sys_user"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_change_request_event mdm_change_request_event_request_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_change_request_event_request_fk'
       AND c.conrelid = 'public.mdm_change_request_event'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_change_request_event"
    ADD CONSTRAINT "mdm_change_request_event_request_fk" FOREIGN KEY ("request_id", "tenant_id") REFERENCES "public"."mdm_change_request"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_change_request mdm_change_request_publisher_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_change_request_publisher_fk'
       AND c.conrelid = 'public.mdm_change_request'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_change_request"
    ADD CONSTRAINT "mdm_change_request_publisher_fk" FOREIGN KEY ("publisher_user_id", "tenant_id") REFERENCES "public"."sys_user"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_change_request mdm_change_request_requester_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_change_request_requester_fk'
       AND c.conrelid = 'public.mdm_change_request'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_change_request"
    ADD CONSTRAINT "mdm_change_request_requester_fk" FOREIGN KEY ("requester_user_id", "tenant_id") REFERENCES "public"."sys_user"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_change_request mdm_change_request_reviewer_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_change_request_reviewer_fk'
       AND c.conrelid = 'public.mdm_change_request'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_change_request"
    ADD CONSTRAINT "mdm_change_request_reviewer_fk" FOREIGN KEY ("reviewer_user_id", "tenant_id") REFERENCES "public"."sys_user"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_change_request mdm_change_request_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_change_request_tenant_id_fkey'
       AND c.conrelid = 'public.mdm_change_request'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_change_request"
    ADD CONSTRAINT "mdm_change_request_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."sys_tenant"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_data_steward mdm_data_steward_escalation_user_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_data_steward_escalation_user_fk'
       AND c.conrelid = 'public.mdm_data_steward'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_data_steward"
    ADD CONSTRAINT "mdm_data_steward_escalation_user_fk" FOREIGN KEY ("escalation_user_id", "tenant_id") REFERENCES "public"."sys_user"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_data_steward mdm_data_steward_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_data_steward_tenant_id_fkey'
       AND c.conrelid = 'public.mdm_data_steward'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_data_steward"
    ADD CONSTRAINT "mdm_data_steward_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."sys_tenant"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_data_steward mdm_data_steward_user_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_data_steward_user_fk'
       AND c.conrelid = 'public.mdm_data_steward'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_data_steward"
    ADD CONSTRAINT "mdm_data_steward_user_fk" FOREIGN KEY ("steward_user_id", "tenant_id") REFERENCES "public"."sys_user"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_golden_record mdm_golden_record_merge_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_golden_record_merge_fk'
       AND c.conrelid = 'public.mdm_golden_record'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_golden_record"
    ADD CONSTRAINT "mdm_golden_record_merge_fk" FOREIGN KEY ("merged_into_id", "tenant_id") REFERENCES "public"."mdm_golden_record"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_golden_record mdm_golden_record_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_golden_record_tenant_id_fkey'
       AND c.conrelid = 'public.mdm_golden_record'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_golden_record"
    ADD CONSTRAINT "mdm_golden_record_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."sys_tenant"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_match_candidate mdm_match_candidate_reviewer_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_match_candidate_reviewer_fk'
       AND c.conrelid = 'public.mdm_match_candidate'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_match_candidate"
    ADD CONSTRAINT "mdm_match_candidate_reviewer_fk" FOREIGN KEY ("reviewed_by", "tenant_id") REFERENCES "public"."sys_user"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_match_candidate mdm_match_candidate_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_match_candidate_tenant_id_fkey'
       AND c.conrelid = 'public.mdm_match_candidate'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_match_candidate"
    ADD CONSTRAINT "mdm_match_candidate_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."sys_tenant"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_merge_event mdm_merge_event_actor_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_merge_event_actor_fk'
       AND c.conrelid = 'public.mdm_merge_event'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_merge_event"
    ADD CONSTRAINT "mdm_merge_event_actor_fk" FOREIGN KEY ("actor_user_id", "tenant_id") REFERENCES "public"."sys_user"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_merge_event mdm_merge_event_candidate_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_merge_event_candidate_fk'
       AND c.conrelid = 'public.mdm_merge_event'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_merge_event"
    ADD CONSTRAINT "mdm_merge_event_candidate_fk" FOREIGN KEY ("candidate_id", "tenant_id") REFERENCES "public"."mdm_match_candidate"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_merge_event mdm_merge_event_golden_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_merge_event_golden_fk'
       AND c.conrelid = 'public.mdm_merge_event'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_merge_event"
    ADD CONSTRAINT "mdm_merge_event_golden_fk" FOREIGN KEY ("golden_record_id", "tenant_id") REFERENCES "public"."mdm_golden_record"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_outbound_rule_sort mdm_outbound_rule_sort_field_code_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_outbound_rule_sort_field_code_fkey'
       AND c.conrelid = 'public.mdm_outbound_rule_sort'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_outbound_rule_sort"
    ADD CONSTRAINT "mdm_outbound_rule_sort_field_code_fkey" FOREIGN KEY ("field_code") REFERENCES "public"."mdm_outbound_sort_field"("field_code");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_outbound_rule_sort mdm_outbound_rule_sort_rule_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_outbound_rule_sort_rule_fk'
       AND c.conrelid = 'public.mdm_outbound_rule_sort'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_outbound_rule_sort"
    ADD CONSTRAINT "mdm_outbound_rule_sort_rule_fk" FOREIGN KEY ("rule_id", "tenant_id") REFERENCES "public"."mdm_outbound_rule"("id", "tenant_id") ON DELETE CASCADE;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_outbox_consumer mdm_outbox_consumer_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_outbox_consumer_tenant_id_fkey'
       AND c.conrelid = 'public.mdm_outbox_consumer'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_outbox_consumer"
    ADD CONSTRAINT "mdm_outbox_consumer_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."sys_tenant"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_outbox_delivery mdm_outbox_delivery_consumer_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_outbox_delivery_consumer_fk'
       AND c.conrelid = 'public.mdm_outbox_delivery'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_outbox_delivery"
    ADD CONSTRAINT "mdm_outbox_delivery_consumer_fk" FOREIGN KEY ("consumer_id", "tenant_id") REFERENCES "public"."mdm_outbox_consumer"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_outbox_delivery mdm_outbox_delivery_event_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_outbox_delivery_event_fk'
       AND c.conrelid = 'public.mdm_outbox_delivery'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_outbox_delivery"
    ADD CONSTRAINT "mdm_outbox_delivery_event_fk" FOREIGN KEY ("event_id", "tenant_id") REFERENCES "public"."mdm_outbox_event"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_outbox_event mdm_outbox_event_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_outbox_event_tenant_id_fkey'
       AND c.conrelid = 'public.mdm_outbox_event'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_outbox_event"
    ADD CONSTRAINT "mdm_outbox_event_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."sys_tenant"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_personnel_common_work_center mdm_personnel_common_work_center_center_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_personnel_common_work_center_center_fk'
       AND c.conrelid = 'public.mdm_personnel_common_work_center'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_personnel_common_work_center"
    ADD CONSTRAINT "mdm_personnel_common_work_center_center_fk" FOREIGN KEY ("tenant_id", "work_center_id") REFERENCES "public"."mdm_work_center"("tenant_id", "id") ON DELETE CASCADE;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_personnel_common_work_center mdm_personnel_common_work_center_personnel_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_personnel_common_work_center_personnel_fk'
       AND c.conrelid = 'public.mdm_personnel_common_work_center'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_personnel_common_work_center"
    ADD CONSTRAINT "mdm_personnel_common_work_center_personnel_fk" FOREIGN KEY ("tenant_id", "personnel_id") REFERENCES "public"."mdm_production_personnel"("tenant_id", "id") ON DELETE CASCADE;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_production_calendar_day_setting mdm_production_calendar_day_settin_tenant_id_department_id_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_production_calendar_day_settin_tenant_id_department_id_fkey'
       AND c.conrelid = 'public.mdm_production_calendar_day_setting'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_production_calendar_day_setting"
    ADD CONSTRAINT "mdm_production_calendar_day_settin_tenant_id_department_id_fkey" FOREIGN KEY ("tenant_id", "department_id") REFERENCES "public"."mdm_production_department"("tenant_id", "id") ON DELETE CASCADE;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_production_calendar_day_setting mdm_production_calendar_day_setting_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_production_calendar_day_setting_tenant_id_fkey'
       AND c.conrelid = 'public.mdm_production_calendar_day_setting'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_production_calendar_day_setting"
    ADD CONSTRAINT "mdm_production_calendar_day_setting_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."sys_tenant"("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_quality_issue_event mdm_quality_issue_event_actor_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_quality_issue_event_actor_fk'
       AND c.conrelid = 'public.mdm_quality_issue_event'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_quality_issue_event"
    ADD CONSTRAINT "mdm_quality_issue_event_actor_fk" FOREIGN KEY ("actor_user_id", "tenant_id") REFERENCES "public"."sys_user"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_quality_issue_event mdm_quality_issue_event_issue_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_quality_issue_event_issue_fk'
       AND c.conrelid = 'public.mdm_quality_issue_event'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_quality_issue_event"
    ADD CONSTRAINT "mdm_quality_issue_event_issue_fk" FOREIGN KEY ("issue_id", "tenant_id") REFERENCES "public"."mdm_quality_issue"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_quality_issue mdm_quality_issue_resolution_user_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_quality_issue_resolution_user_fk'
       AND c.conrelid = 'public.mdm_quality_issue'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_quality_issue"
    ADD CONSTRAINT "mdm_quality_issue_resolution_user_fk" FOREIGN KEY ("resolution_by", "tenant_id") REFERENCES "public"."sys_user"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_quality_issue mdm_quality_issue_rule_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_quality_issue_rule_fk'
       AND c.conrelid = 'public.mdm_quality_issue'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_quality_issue"
    ADD CONSTRAINT "mdm_quality_issue_rule_fk" FOREIGN KEY ("rule_id", "tenant_id") REFERENCES "public"."mdm_quality_rule"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_quality_issue mdm_quality_issue_steward_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_quality_issue_steward_fk'
       AND c.conrelid = 'public.mdm_quality_issue'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_quality_issue"
    ADD CONSTRAINT "mdm_quality_issue_steward_fk" FOREIGN KEY ("assigned_steward_id", "tenant_id") REFERENCES "public"."mdm_data_steward"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE SET NULL;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_quality_issue mdm_quality_issue_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_quality_issue_tenant_id_fkey'
       AND c.conrelid = 'public.mdm_quality_issue'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_quality_issue"
    ADD CONSTRAINT "mdm_quality_issue_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."sys_tenant"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_quality_issue mdm_quality_issue_verified_user_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_quality_issue_verified_user_fk'
       AND c.conrelid = 'public.mdm_quality_issue'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_quality_issue"
    ADD CONSTRAINT "mdm_quality_issue_verified_user_fk" FOREIGN KEY ("verified_by", "tenant_id") REFERENCES "public"."sys_user"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_quality_rule mdm_quality_rule_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_quality_rule_tenant_id_fkey'
       AND c.conrelid = 'public.mdm_quality_rule'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_quality_rule"
    ADD CONSTRAINT "mdm_quality_rule_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."sys_tenant"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_shift_schedule mdm_shift_schedule_department_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_shift_schedule_department_fk'
       AND c.conrelid = 'public.mdm_shift_schedule'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_shift_schedule"
    ADD CONSTRAINT "mdm_shift_schedule_department_fk" FOREIGN KEY ("tenant_id", "department_id") REFERENCES "public"."mdm_production_department"("tenant_id", "id") ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_shift_schedule_member mdm_shift_schedule_member_personnel_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_shift_schedule_member_personnel_fk'
       AND c.conrelid = 'public.mdm_shift_schedule_member'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_shift_schedule_member"
    ADD CONSTRAINT "mdm_shift_schedule_member_personnel_fk" FOREIGN KEY ("tenant_id", "personnel_id") REFERENCES "public"."mdm_production_personnel"("tenant_id", "id") ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_shift_schedule_member mdm_shift_schedule_member_schedule_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_shift_schedule_member_schedule_fk'
       AND c.conrelid = 'public.mdm_shift_schedule_member'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_shift_schedule_member"
    ADD CONSTRAINT "mdm_shift_schedule_member_schedule_fk" FOREIGN KEY ("tenant_id", "schedule_id") REFERENCES "public"."mdm_shift_schedule"("tenant_id", "id") ON DELETE CASCADE;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_shift_schedule mdm_shift_schedule_pattern_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_shift_schedule_pattern_fk'
       AND c.conrelid = 'public.mdm_shift_schedule'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_shift_schedule"
    ADD CONSTRAINT "mdm_shift_schedule_pattern_fk" FOREIGN KEY ("tenant_id", "department_id", "pattern_id") REFERENCES "public"."mdm_production_shift_pattern"("tenant_id", "department_id", "id") ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_source_crosswalk mdm_source_crosswalk_golden_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_source_crosswalk_golden_fk'
       AND c.conrelid = 'public.mdm_source_crosswalk'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_source_crosswalk"
    ADD CONSTRAINT "mdm_source_crosswalk_golden_fk" FOREIGN KEY ("golden_record_id", "tenant_id") REFERENCES "public"."mdm_golden_record"("id", "tenant_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_source_crosswalk mdm_source_crosswalk_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_source_crosswalk_tenant_id_fkey'
       AND c.conrelid = 'public.mdm_source_crosswalk'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_source_crosswalk"
    ADD CONSTRAINT "mdm_source_crosswalk_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."sys_tenant"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_stock_movement_type mdm_stock_movement_type_reverse_type_id_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_stock_movement_type_reverse_type_id_fkey'
       AND c.conrelid = 'public.mdm_stock_movement_type'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_stock_movement_type"
    ADD CONSTRAINT "mdm_stock_movement_type_reverse_type_id_fkey" FOREIGN KEY ("tenant_id", "reverse_type_id") REFERENCES "public"."mdm_stock_movement_type"("tenant_id", "id") ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_stock_movement_type mdm_stock_movement_type_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_stock_movement_type_tenant_id_fkey'
       AND c.conrelid = 'public.mdm_stock_movement_type'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_stock_movement_type"
    ADD CONSTRAINT "mdm_stock_movement_type_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."sys_tenant"("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_supplier_bank mdm_supplier_bank_supplier_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_supplier_bank_supplier_fk'
       AND c.conrelid = 'public.mdm_supplier_bank'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_supplier_bank"
    ADD CONSTRAINT "mdm_supplier_bank_supplier_fk" FOREIGN KEY ("supplier_id", "tenant_id") REFERENCES "public"."mdm_supplier"("id", "tenant_id") ON DELETE CASCADE;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_supplier_bank mdm_supplier_bank_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_supplier_bank_tenant_id_fkey'
       AND c.conrelid = 'public.mdm_supplier_bank'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_supplier_bank"
    ADD CONSTRAINT "mdm_supplier_bank_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."sys_tenant"("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_supplier_contact mdm_supplier_contact_supplier_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_supplier_contact_supplier_fk'
       AND c.conrelid = 'public.mdm_supplier_contact'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_supplier_contact"
    ADD CONSTRAINT "mdm_supplier_contact_supplier_fk" FOREIGN KEY ("supplier_id", "tenant_id") REFERENCES "public"."mdm_supplier"("id", "tenant_id") ON DELETE CASCADE;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_supplier_contact mdm_supplier_contact_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_supplier_contact_tenant_id_fkey'
       AND c.conrelid = 'public.mdm_supplier_contact'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_supplier_contact"
    ADD CONSTRAINT "mdm_supplier_contact_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."sys_tenant"("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_supply_chain_code_segment mdm_supply_chain_code_segment_attribute_code_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_supply_chain_code_segment_attribute_code_fkey'
       AND c.conrelid = 'public.mdm_supply_chain_code_segment'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_supply_chain_code_segment"
    ADD CONSTRAINT "mdm_supply_chain_code_segment_attribute_code_fkey" FOREIGN KEY ("attribute_code") REFERENCES "public"."mdm_supply_chain_code_attribute"("attribute_code");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_supply_chain_code_segment mdm_supply_chain_code_segment_rule_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_supply_chain_code_segment_rule_fk'
       AND c.conrelid = 'public.mdm_supply_chain_code_segment'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_supply_chain_code_segment"
    ADD CONSTRAINT "mdm_supply_chain_code_segment_rule_fk" FOREIGN KEY ("rule_id", "tenant_id") REFERENCES "public"."mdm_supply_chain_code_rule"("id", "tenant_id") ON DELETE CASCADE;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_work_center_activity mdm_work_center_activity_center_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_work_center_activity_center_fk'
       AND c.conrelid = 'public.mdm_work_center_activity'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_work_center_activity"
    ADD CONSTRAINT "mdm_work_center_activity_center_fk" FOREIGN KEY ("tenant_id", "work_center_id") REFERENCES "public"."mdm_work_center"("tenant_id", "id") ON DELETE CASCADE;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_work_center_activity mdm_work_center_activity_plan_formula_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_work_center_activity_plan_formula_fk'
       AND c.conrelid = 'public.mdm_work_center_activity'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_work_center_activity"
    ADD CONSTRAINT "mdm_work_center_activity_plan_formula_fk" FOREIGN KEY ("plan_formula_id", "tenant_id") REFERENCES "public"."mdm_activity_formula"("id", "tenant_id") ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_work_center_activity mdm_work_center_activity_report_formula_fk; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'mdm_work_center_activity_report_formula_fk'
       AND c.conrelid = 'public.mdm_work_center_activity'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_work_center_activity"
    ADD CONSTRAINT "mdm_work_center_activity_report_formula_fk" FOREIGN KEY ("report_formula_id", "tenant_id") REFERENCES "public"."mdm_activity_formula"("id", "tenant_id") ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_driver tms_driver_carrier_tenant_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'tms_driver_carrier_tenant_fkey'
       AND c.conrelid = 'public.mdm_driver'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_driver"
    ADD CONSTRAINT "tms_driver_carrier_tenant_fkey" FOREIGN KEY ("tenant_id", "carrier_id") REFERENCES "public"."mdm_carrier"("tenant_id", "id") ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_driver tms_driver_created_by_user_tenant_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'tms_driver_created_by_user_tenant_fkey'
       AND c.conrelid = 'public.mdm_driver'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_driver"
    ADD CONSTRAINT "tms_driver_created_by_user_tenant_fkey" FOREIGN KEY ("created_by_user_id", "tenant_id") REFERENCES "public"."sys_user"("id", "tenant_id") ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_driver tms_driver_employee_tenant_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'tms_driver_employee_tenant_fkey'
       AND c.conrelid = 'public.mdm_driver'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_driver"
    ADD CONSTRAINT "tms_driver_employee_tenant_fkey" FOREIGN KEY ("employee_id", "tenant_id") REFERENCES "public"."mdm_employee"("id", "tenant_id") ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_vehicle vehicle_archive_carrier_tenant_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'vehicle_archive_carrier_tenant_fkey'
       AND c.conrelid = 'public.mdm_vehicle'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_vehicle"
    ADD CONSTRAINT "vehicle_archive_carrier_tenant_fkey" FOREIGN KEY ("tenant_id", "carrier_id") REFERENCES "public"."mdm_carrier"("tenant_id", "id") ON DELETE SET NULL;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_vehicle vehicle_archive_created_by_user_tenant_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'vehicle_archive_created_by_user_tenant_fkey'
       AND c.conrelid = 'public.mdm_vehicle'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_vehicle"
    ADD CONSTRAINT "vehicle_archive_created_by_user_tenant_fkey" FOREIGN KEY ("created_by_user_id", "tenant_id") REFERENCES "public"."sys_user"("id", "tenant_id") ON DELETE RESTRICT;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_vehicle vehicle_archive_primary_driver_tenant_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'vehicle_archive_primary_driver_tenant_fkey'
       AND c.conrelid = 'public.mdm_vehicle'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_vehicle"
    ADD CONSTRAINT "vehicle_archive_primary_driver_tenant_fkey" FOREIGN KEY ("tenant_id", "primary_driver_id") REFERENCES "public"."mdm_driver"("tenant_id", "id") ON DELETE SET NULL;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_vehicle vehicle_archive_secondary_driver_tenant_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'vehicle_archive_secondary_driver_tenant_fkey'
       AND c.conrelid = 'public.mdm_vehicle'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_vehicle"
    ADD CONSTRAINT "vehicle_archive_secondary_driver_tenant_fkey" FOREIGN KEY ("tenant_id", "secondary_driver_id") REFERENCES "public"."mdm_driver"("tenant_id", "id") ON DELETE SET NULL;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_insurance_company vehicle_insurance_company_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'vehicle_insurance_company_tenant_id_fkey'
       AND c.conrelid = 'public.mdm_insurance_company'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_insurance_company"
    ADD CONSTRAINT "vehicle_insurance_company_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."sys_tenant"("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_part_category vehicle_parts_category_parent_tenant_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'vehicle_parts_category_parent_tenant_fkey'
       AND c.conrelid = 'public.mdm_part_category'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_part_category"
    ADD CONSTRAINT "vehicle_parts_category_parent_tenant_fkey" FOREIGN KEY ("tenant_id", "parent_id") REFERENCES "public"."mdm_part_category"("tenant_id", "id") ON DELETE CASCADE;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_part vehicle_parts_category_tenant_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'vehicle_parts_category_tenant_fkey'
       AND c.conrelid = 'public.mdm_part'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_part"
    ADD CONSTRAINT "vehicle_parts_category_tenant_fkey" FOREIGN KEY ("tenant_id", "category_id") REFERENCES "public"."mdm_part_category"("tenant_id", "id") ON DELETE SET NULL;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_part_category vehicle_parts_category_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'vehicle_parts_category_tenant_id_fkey'
       AND c.conrelid = 'public.mdm_part_category'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_part_category"
    ADD CONSTRAINT "vehicle_parts_category_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."sys_tenant"("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_part vehicle_parts_supplier_tenant_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'vehicle_parts_supplier_tenant_fkey'
       AND c.conrelid = 'public.mdm_part'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_part"
    ADD CONSTRAINT "vehicle_parts_supplier_tenant_fkey" FOREIGN KEY ("tenant_id", "supplier_id") REFERENCES "public"."mdm_supplier"("tenant_id", "id") ON DELETE SET NULL;


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_part vehicle_parts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public
--

DO $already_exists$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'vehicle_parts_tenant_id_fkey'
       AND c.conrelid = 'public.mdm_part'::regclass
  ) THEN
--

ALTER TABLE ONLY "public"."mdm_part"
    ADD CONSTRAINT "vehicle_parts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."sys_tenant"("id");


--
  END IF;
END
$already_exists$;

--

-- Name: mdm_production_calendar_day_setting calendar_day_read; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "calendar_day_read" ON "public"."mdm_production_calendar_day_setting";
--

CREATE POLICY "calendar_day_read" ON "public"."mdm_production_calendar_day_setting" FOR SELECT TO "authenticated" USING ("app_private"."has_permission"('MdmFactoryCalendar:View'::"text"));


--

--

-- Name: mdm_outbound_rule_sort canonical_platform_super_delete; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_delete" ON "public"."mdm_outbound_rule_sort";
--

CREATE POLICY "canonical_platform_super_delete" ON "public"."mdm_outbound_rule_sort" FOR DELETE TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_stock_movement_type canonical_platform_super_delete; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_delete" ON "public"."mdm_stock_movement_type";
--

CREATE POLICY "canonical_platform_super_delete" ON "public"."mdm_stock_movement_type" FOR DELETE TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_supply_chain_code_segment canonical_platform_super_delete; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_delete" ON "public"."mdm_supply_chain_code_segment";
--

CREATE POLICY "canonical_platform_super_delete" ON "public"."mdm_supply_chain_code_segment" FOR DELETE TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_outbound_rule_sort canonical_platform_super_insert; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_insert" ON "public"."mdm_outbound_rule_sort";
--

CREATE POLICY "canonical_platform_super_insert" ON "public"."mdm_outbound_rule_sort" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_supply_chain_code_segment canonical_platform_super_insert; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_insert" ON "public"."mdm_supply_chain_code_segment";
--

CREATE POLICY "canonical_platform_super_insert" ON "public"."mdm_supply_chain_code_segment" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_outbound_rule_sort canonical_platform_super_update; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_update" ON "public"."mdm_outbound_rule_sort";
--

CREATE POLICY "canonical_platform_super_update" ON "public"."mdm_outbound_rule_sort" FOR UPDATE TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_stock_movement_type canonical_platform_super_update; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_update" ON "public"."mdm_stock_movement_type";
--

CREATE POLICY "canonical_platform_super_update" ON "public"."mdm_stock_movement_type" FOR UPDATE TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_supply_chain_code_segment canonical_platform_super_update; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_update" ON "public"."mdm_supply_chain_code_segment";
--

CREATE POLICY "canonical_platform_super_update" ON "public"."mdm_supply_chain_code_segment" FOR UPDATE TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_business_partner canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_business_partner";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_business_partner" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_business_partner_role canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_business_partner_role";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_business_partner_role" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_cargo canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_cargo";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_cargo" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_change_request canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_change_request";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_change_request" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_change_request_event canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_change_request_event";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_change_request_event" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_data_steward canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_data_steward";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_data_steward" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_driver canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_driver";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_driver" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_golden_record canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_golden_record";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_golden_record" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_insurance_company canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_insurance_company";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_insurance_company" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_match_candidate canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_match_candidate";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_match_candidate" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_merge_event canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_merge_event";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_merge_event" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_outbox_consumer canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_outbox_consumer";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_outbox_consumer" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_outbox_delivery canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_outbox_delivery";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_outbox_delivery" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_outbox_event canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_outbox_event";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_outbox_event" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_part canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_part";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_part" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_part_category canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_part_category";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_part_category" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_personnel_common_work_center canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_personnel_common_work_center";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_personnel_common_work_center" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_production_calendar_day_setting canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_production_calendar_day_setting";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_production_calendar_day_setting" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_quality_issue canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_quality_issue";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_quality_issue" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_quality_issue_event canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_quality_issue_event";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_quality_issue_event" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_quality_rule canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_quality_rule";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_quality_rule" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_shift_schedule canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_shift_schedule";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_shift_schedule" TO "authenticated" USING ("app_private"."is_platform_super"()) WITH CHECK ("app_private"."is_platform_super"());


--

--

-- Name: mdm_shift_schedule_member canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_shift_schedule_member";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_shift_schedule_member" TO "authenticated" USING ("app_private"."is_platform_super"()) WITH CHECK ("app_private"."is_platform_super"());


--

--

-- Name: mdm_source_crosswalk canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_source_crosswalk";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_source_crosswalk" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_station canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_station";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_station" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_stock_movement_type canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_stock_movement_type";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_stock_movement_type" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_vehicle canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_vehicle";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_vehicle" TO "authenticated" USING (( SELECT "app_private"."is_platform_super"() AS "is_platform_super")) WITH CHECK (( SELECT "app_private"."is_platform_super"() AS "is_platform_super"));


--

--

-- Name: mdm_work_center_activity canonical_platform_super_write; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_platform_super_write" ON "public"."mdm_work_center_activity";
--

CREATE POLICY "canonical_platform_super_write" ON "public"."mdm_work_center_activity" TO "authenticated" USING ("app_private"."is_platform_super"()) WITH CHECK ("app_private"."is_platform_super"());


--

--

-- Name: mdm_business_partner canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_business_partner";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_business_partner" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_business_partner"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_business_partner_role canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_business_partner_role";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_business_partner_role" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_business_partner_role"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_cargo canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_cargo";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_cargo" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_cargo"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_change_request canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_change_request";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_change_request" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_change_request"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_change_request_event canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_change_request_event";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_change_request_event" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_change_request_event"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_data_steward canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_data_steward";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_data_steward" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_data_steward"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_driver canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_driver";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_driver" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_driver"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_golden_record canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_golden_record";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_golden_record" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_golden_record"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_insurance_company canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_insurance_company";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_insurance_company" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_insurance_company"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_match_candidate canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_match_candidate";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_match_candidate" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_match_candidate"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_merge_event canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_merge_event";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_merge_event" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_merge_event"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_outbox_consumer canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_outbox_consumer";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_outbox_consumer" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_outbox_consumer"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_outbox_delivery canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_outbox_delivery";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_outbox_delivery" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_outbox_delivery"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_outbox_event canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_outbox_event";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_outbox_event" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_outbox_event"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_part canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_part";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_part" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_part"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_part_category canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_part_category";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_part_category" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_part_category"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_personnel_common_work_center canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_personnel_common_work_center";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_personnel_common_work_center" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_personnel_common_work_center"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_production_calendar_day_setting canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_production_calendar_day_setting";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_production_calendar_day_setting" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ("app_private"."tenant_in_current_read_scope"("tenant_id"));


--

--

-- Name: mdm_quality_issue canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_quality_issue";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_quality_issue" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_quality_issue"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_quality_issue_event canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_quality_issue_event";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_quality_issue_event" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_quality_issue_event"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_quality_rule canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_quality_rule";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_quality_rule" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_quality_rule"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_shift_schedule canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_shift_schedule";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_shift_schedule" FOR SELECT TO "authenticated" USING (("app_private"."tenant_in_current_read_scope"("tenant_id") AND "app_private"."has_permission"('MdmShiftScheduling:View'::"text")));


--

--

-- Name: mdm_shift_schedule_member canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_shift_schedule_member";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_shift_schedule_member" FOR SELECT TO "authenticated" USING (("app_private"."tenant_in_current_read_scope"("tenant_id") AND "app_private"."has_permission"('MdmShiftScheduling:View'::"text")));


--

--

-- Name: mdm_source_crosswalk canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_source_crosswalk";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_source_crosswalk" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_source_crosswalk"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_station canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_station";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_station" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_station"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_stock_movement_type canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_stock_movement_type";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_stock_movement_type" FOR SELECT TO "authenticated" USING ((( SELECT "app_private"."tenant_in_current_read_scope"("mdm_stock_movement_type"."tenant_id") AS "tenant_in_current_read_scope") AND ( SELECT "app_private"."has_permission"('MdmStockMovementType:View'::"text") AS "has_permission")));


--

--

-- Name: mdm_vehicle canonical_tenant_read_scope; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "canonical_tenant_read_scope" ON "public"."mdm_vehicle";
--

CREATE POLICY "canonical_tenant_read_scope" ON "public"."mdm_vehicle" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "app_private"."tenant_in_current_read_scope"("mdm_vehicle"."tenant_id") AS "tenant_in_current_read_scope"));


--

--

-- Name: mdm_business_partner; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_business_partner" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_business_partner_role; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_business_partner_role" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_business_partner_role mdm_business_partner_role_tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "mdm_business_partner_role_tenant_select" ON "public"."mdm_business_partner_role";
--

CREATE POLICY "mdm_business_partner_role_tenant_select" ON "public"."mdm_business_partner_role" FOR SELECT TO "authenticated" USING ((( SELECT "app_private"."is_platform_super"() AS "is_platform_super") OR ("tenant_id" = ( SELECT "app_private"."current_user_tenant_id"() AS "current_user_tenant_id"))));


--

--

-- Name: mdm_business_partner mdm_business_partner_tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "mdm_business_partner_tenant_select" ON "public"."mdm_business_partner";
--

CREATE POLICY "mdm_business_partner_tenant_select" ON "public"."mdm_business_partner" FOR SELECT TO "authenticated" USING ((( SELECT "app_private"."is_platform_super"() AS "is_platform_super") OR ("tenant_id" = ( SELECT "app_private"."current_user_tenant_id"() AS "current_user_tenant_id"))));


--

--

-- Name: mdm_cargo; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_cargo" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_change_request; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_change_request" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_change_request_event; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_change_request_event" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_data_steward; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_data_steward" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_driver; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_driver" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_golden_record; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_golden_record" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_change_request mdm_governance_tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "mdm_governance_tenant_select" ON "public"."mdm_change_request";
--

CREATE POLICY "mdm_governance_tenant_select" ON "public"."mdm_change_request" FOR SELECT TO "authenticated" USING (( SELECT "app_private"."has_permission"('MdmGovernance:View'::"text") AS "has_permission"));


--

--

-- Name: mdm_change_request_event mdm_governance_tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "mdm_governance_tenant_select" ON "public"."mdm_change_request_event";
--

CREATE POLICY "mdm_governance_tenant_select" ON "public"."mdm_change_request_event" FOR SELECT TO "authenticated" USING (( SELECT "app_private"."has_permission"('MdmGovernance:View'::"text") AS "has_permission"));


--

--

-- Name: mdm_data_steward mdm_governance_tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "mdm_governance_tenant_select" ON "public"."mdm_data_steward";
--

CREATE POLICY "mdm_governance_tenant_select" ON "public"."mdm_data_steward" FOR SELECT TO "authenticated" USING (( SELECT "app_private"."has_permission"('MdmGovernance:View'::"text") AS "has_permission"));


--

--

-- Name: mdm_golden_record mdm_governance_tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "mdm_governance_tenant_select" ON "public"."mdm_golden_record";
--

CREATE POLICY "mdm_governance_tenant_select" ON "public"."mdm_golden_record" FOR SELECT TO "authenticated" USING (( SELECT "app_private"."has_permission"('MdmGovernance:View'::"text") AS "has_permission"));


--

--

-- Name: mdm_match_candidate mdm_governance_tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "mdm_governance_tenant_select" ON "public"."mdm_match_candidate";
--

CREATE POLICY "mdm_governance_tenant_select" ON "public"."mdm_match_candidate" FOR SELECT TO "authenticated" USING (( SELECT "app_private"."has_permission"('MdmGovernance:View'::"text") AS "has_permission"));


--

--

-- Name: mdm_merge_event mdm_governance_tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "mdm_governance_tenant_select" ON "public"."mdm_merge_event";
--

CREATE POLICY "mdm_governance_tenant_select" ON "public"."mdm_merge_event" FOR SELECT TO "authenticated" USING (( SELECT "app_private"."has_permission"('MdmGovernance:View'::"text") AS "has_permission"));


--

--

-- Name: mdm_outbox_consumer mdm_governance_tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "mdm_governance_tenant_select" ON "public"."mdm_outbox_consumer";
--

CREATE POLICY "mdm_governance_tenant_select" ON "public"."mdm_outbox_consumer" FOR SELECT TO "authenticated" USING (( SELECT "app_private"."has_permission"('MdmGovernance:View'::"text") AS "has_permission"));


--

--

-- Name: mdm_outbox_delivery mdm_governance_tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "mdm_governance_tenant_select" ON "public"."mdm_outbox_delivery";
--

CREATE POLICY "mdm_governance_tenant_select" ON "public"."mdm_outbox_delivery" FOR SELECT TO "authenticated" USING (( SELECT "app_private"."has_permission"('MdmGovernance:View'::"text") AS "has_permission"));


--

--

-- Name: mdm_outbox_event mdm_governance_tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "mdm_governance_tenant_select" ON "public"."mdm_outbox_event";
--

CREATE POLICY "mdm_governance_tenant_select" ON "public"."mdm_outbox_event" FOR SELECT TO "authenticated" USING (( SELECT "app_private"."has_permission"('MdmGovernance:View'::"text") AS "has_permission"));


--

--

-- Name: mdm_quality_issue mdm_governance_tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "mdm_governance_tenant_select" ON "public"."mdm_quality_issue";
--

CREATE POLICY "mdm_governance_tenant_select" ON "public"."mdm_quality_issue" FOR SELECT TO "authenticated" USING (( SELECT "app_private"."has_permission"('MdmGovernance:View'::"text") AS "has_permission"));


--

--

-- Name: mdm_quality_issue_event mdm_governance_tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "mdm_governance_tenant_select" ON "public"."mdm_quality_issue_event";
--

CREATE POLICY "mdm_governance_tenant_select" ON "public"."mdm_quality_issue_event" FOR SELECT TO "authenticated" USING (( SELECT "app_private"."has_permission"('MdmGovernance:View'::"text") AS "has_permission"));


--

--

-- Name: mdm_quality_rule mdm_governance_tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "mdm_governance_tenant_select" ON "public"."mdm_quality_rule";
--

CREATE POLICY "mdm_governance_tenant_select" ON "public"."mdm_quality_rule" FOR SELECT TO "authenticated" USING (( SELECT "app_private"."has_permission"('MdmGovernance:View'::"text") AS "has_permission"));


--

--

-- Name: mdm_source_crosswalk mdm_governance_tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "mdm_governance_tenant_select" ON "public"."mdm_source_crosswalk";
--

CREATE POLICY "mdm_governance_tenant_select" ON "public"."mdm_source_crosswalk" FOR SELECT TO "authenticated" USING (( SELECT "app_private"."has_permission"('MdmGovernance:View'::"text") AS "has_permission"));


--

--

-- Name: mdm_insurance_company; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_insurance_company" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_match_candidate; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_match_candidate" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_merge_event; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_merge_event" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_outbound_rule_sort; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_outbound_rule_sort" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_outbound_rule_sort mdm_outbound_rule_sort_tenant_read; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "mdm_outbound_rule_sort_tenant_read" ON "public"."mdm_outbound_rule_sort";
--

CREATE POLICY "mdm_outbound_rule_sort_tenant_read" ON "public"."mdm_outbound_rule_sort" FOR SELECT TO "authenticated" USING ((( SELECT "app_private"."tenant_in_current_read_scope"("mdm_outbound_rule_sort"."tenant_id") AS "tenant_in_current_read_scope") AND ( SELECT "app_private"."has_permission"('MdmOutboundRule:View'::"text") AS "has_permission")));


--

--

-- Name: mdm_outbound_sort_field; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_outbound_sort_field" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_outbound_sort_field mdm_outbound_sort_field_authenticated_read; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "mdm_outbound_sort_field_authenticated_read" ON "public"."mdm_outbound_sort_field";
--

CREATE POLICY "mdm_outbound_sort_field_authenticated_read" ON "public"."mdm_outbound_sort_field" FOR SELECT TO "authenticated" USING (true);


--

--

-- Name: mdm_outbox_consumer; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_outbox_consumer" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_outbox_delivery; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_outbox_delivery" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_outbox_event; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_outbox_event" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_part; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_part" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_part_category; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_part_category" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_personnel_common_work_center; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_personnel_common_work_center" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_production_calendar_day_setting; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_production_calendar_day_setting" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_quality_issue; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_quality_issue" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_quality_issue_event; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_quality_issue_event" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_quality_rule; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_quality_rule" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_shift_schedule; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_shift_schedule" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_shift_schedule_member; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_shift_schedule_member" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_source_crosswalk; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_source_crosswalk" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_station; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_station" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_stock_movement_type; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_stock_movement_type" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_supplier_bank; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_supplier_bank" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_supplier_contact; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_supplier_contact" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_supply_chain_code_attribute; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_supply_chain_code_attribute" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_supply_chain_code_attribute mdm_supply_chain_code_attribute_authenticated_read; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "mdm_supply_chain_code_attribute_authenticated_read" ON "public"."mdm_supply_chain_code_attribute";
--

CREATE POLICY "mdm_supply_chain_code_attribute_authenticated_read" ON "public"."mdm_supply_chain_code_attribute" FOR SELECT TO "authenticated" USING (true);


--

--

-- Name: mdm_supply_chain_code_segment; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_supply_chain_code_segment" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_supply_chain_code_segment mdm_supply_chain_code_segment_tenant_read; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "mdm_supply_chain_code_segment_tenant_read" ON "public"."mdm_supply_chain_code_segment";
--

CREATE POLICY "mdm_supply_chain_code_segment_tenant_read" ON "public"."mdm_supply_chain_code_segment" FOR SELECT TO "authenticated" USING ((( SELECT "app_private"."tenant_in_current_read_scope"("mdm_supply_chain_code_segment"."tenant_id") AS "tenant_in_current_read_scope") AND ( SELECT "app_private"."has_permission"('MdmSupplyChainCodeRule:View'::"text") AS "has_permission")));


--

--

-- Name: mdm_vehicle; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_vehicle" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_work_center_activity; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE "public"."mdm_work_center_activity" ENABLE ROW LEVEL SECURITY;

--

--

-- Name: mdm_supplier_bank supplier_bank_delete; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "supplier_bank_delete" ON "public"."mdm_supplier_bank";
--

CREATE POLICY "supplier_bank_delete" ON "public"."mdm_supplier_bank" FOR DELETE TO "authenticated" USING (("app_private"."tenant_in_current_read_scope"("tenant_id") AND ("app_private"."is_platform_super"() OR (("tenant_id" = "app_private"."auth_user_tenant_id"()) AND "app_private"."has_permission"('MdmPurchaseSupplier:ManageBank'::"text")))));


--

--

-- Name: mdm_supplier_bank supplier_bank_insert; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "supplier_bank_insert" ON "public"."mdm_supplier_bank";
--

CREATE POLICY "supplier_bank_insert" ON "public"."mdm_supplier_bank" FOR INSERT TO "authenticated" WITH CHECK (("app_private"."tenant_in_current_read_scope"("tenant_id") AND ("app_private"."is_platform_super"() OR (("tenant_id" = "app_private"."auth_user_tenant_id"()) AND "app_private"."has_permission"('MdmPurchaseSupplier:ManageBank'::"text")))));


--

--

-- Name: mdm_supplier_bank supplier_bank_read; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "supplier_bank_read" ON "public"."mdm_supplier_bank";
--

CREATE POLICY "supplier_bank_read" ON "public"."mdm_supplier_bank" FOR SELECT TO "authenticated" USING (("app_private"."tenant_in_current_read_scope"("tenant_id") AND ("app_private"."is_platform_super"() OR "app_private"."has_permission"('MdmPurchaseSupplier:View'::"text"))));


--

--

-- Name: mdm_supplier_bank supplier_bank_update; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "supplier_bank_update" ON "public"."mdm_supplier_bank";
--

CREATE POLICY "supplier_bank_update" ON "public"."mdm_supplier_bank" FOR UPDATE TO "authenticated" USING (("app_private"."tenant_in_current_read_scope"("tenant_id") AND ("app_private"."is_platform_super"() OR (("tenant_id" = "app_private"."auth_user_tenant_id"()) AND "app_private"."has_permission"('MdmPurchaseSupplier:ManageBank'::"text"))))) WITH CHECK (("app_private"."tenant_in_current_read_scope"("tenant_id") AND ("app_private"."is_platform_super"() OR (("tenant_id" = "app_private"."auth_user_tenant_id"()) AND "app_private"."has_permission"('MdmPurchaseSupplier:ManageBank'::"text")))));


--

--

-- Name: mdm_supplier_contact supplier_contact_delete; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "supplier_contact_delete" ON "public"."mdm_supplier_contact";
--

CREATE POLICY "supplier_contact_delete" ON "public"."mdm_supplier_contact" FOR DELETE TO "authenticated" USING (("app_private"."tenant_in_current_read_scope"("tenant_id") AND ("app_private"."is_platform_super"() OR (("tenant_id" = "app_private"."auth_user_tenant_id"()) AND "app_private"."has_permission"('MdmPurchaseSupplier:ManageContact'::"text")))));


--

--

-- Name: mdm_supplier_contact supplier_contact_insert; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "supplier_contact_insert" ON "public"."mdm_supplier_contact";
--

CREATE POLICY "supplier_contact_insert" ON "public"."mdm_supplier_contact" FOR INSERT TO "authenticated" WITH CHECK (("app_private"."tenant_in_current_read_scope"("tenant_id") AND ("app_private"."is_platform_super"() OR (("tenant_id" = "app_private"."auth_user_tenant_id"()) AND "app_private"."has_permission"('MdmPurchaseSupplier:ManageContact'::"text")))));


--

--

-- Name: mdm_supplier_contact supplier_contact_read; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "supplier_contact_read" ON "public"."mdm_supplier_contact";
--

CREATE POLICY "supplier_contact_read" ON "public"."mdm_supplier_contact" FOR SELECT TO "authenticated" USING (("app_private"."tenant_in_current_read_scope"("tenant_id") AND ("app_private"."is_platform_super"() OR "app_private"."has_permission"('MdmPurchaseSupplier:View'::"text"))));


--

--

-- Name: mdm_supplier_contact supplier_contact_update; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "supplier_contact_update" ON "public"."mdm_supplier_contact";
--

CREATE POLICY "supplier_contact_update" ON "public"."mdm_supplier_contact" FOR UPDATE TO "authenticated" USING (("app_private"."tenant_in_current_read_scope"("tenant_id") AND ("app_private"."is_platform_super"() OR (("tenant_id" = "app_private"."auth_user_tenant_id"()) AND "app_private"."has_permission"('MdmPurchaseSupplier:ManageContact'::"text"))))) WITH CHECK (("app_private"."tenant_in_current_read_scope"("tenant_id") AND ("app_private"."is_platform_super"() OR (("tenant_id" = "app_private"."auth_user_tenant_id"()) AND "app_private"."has_permission"('MdmPurchaseSupplier:ManageContact'::"text")))));


--

--

-- Name: mdm_cargo tenant_delete; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_delete" ON "public"."mdm_cargo";
--

CREATE POLICY "tenant_delete" ON "public"."mdm_cargo" FOR DELETE TO "authenticated" USING (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_insurance_company tenant_delete; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_delete" ON "public"."mdm_insurance_company";
--

CREATE POLICY "tenant_delete" ON "public"."mdm_insurance_company" FOR DELETE TO "authenticated" USING (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_part tenant_delete; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_delete" ON "public"."mdm_part";
--

CREATE POLICY "tenant_delete" ON "public"."mdm_part" FOR DELETE TO "authenticated" USING (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_part_category tenant_delete; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_delete" ON "public"."mdm_part_category";
--

CREATE POLICY "tenant_delete" ON "public"."mdm_part_category" FOR DELETE TO "authenticated" USING (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_shift_schedule tenant_delete; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_delete" ON "public"."mdm_shift_schedule";
--

CREATE POLICY "tenant_delete" ON "public"."mdm_shift_schedule" FOR DELETE TO "authenticated" USING ((("tenant_id" = "app_private"."current_user_tenant_id"()) AND "app_private"."has_permission"('MdmShiftScheduling:Delete'::"text")));


--

--

-- Name: mdm_shift_schedule_member tenant_delete; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_delete" ON "public"."mdm_shift_schedule_member";
--

CREATE POLICY "tenant_delete" ON "public"."mdm_shift_schedule_member" FOR DELETE TO "authenticated" USING ((("tenant_id" = "app_private"."current_user_tenant_id"()) AND "app_private"."has_permission"('MdmShiftScheduling:Edit'::"text")));


--

--

-- Name: mdm_station tenant_delete; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_delete" ON "public"."mdm_station";
--

CREATE POLICY "tenant_delete" ON "public"."mdm_station" FOR DELETE USING (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_work_center_activity tenant_delete; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_delete" ON "public"."mdm_work_center_activity";
--

CREATE POLICY "tenant_delete" ON "public"."mdm_work_center_activity" FOR DELETE TO "authenticated" USING ((("tenant_id" = "app_private"."current_user_tenant_id"()) AND ("app_private"."has_permission"('MdmWorkCenter:Edit'::"text") OR "app_private"."has_permission"('MdmWorkCenter:Delete'::"text"))));


--

--

-- Name: mdm_cargo tenant_insert; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_insert" ON "public"."mdm_cargo";
--

CREATE POLICY "tenant_insert" ON "public"."mdm_cargo" FOR INSERT TO "authenticated" WITH CHECK (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_insurance_company tenant_insert; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_insert" ON "public"."mdm_insurance_company";
--

CREATE POLICY "tenant_insert" ON "public"."mdm_insurance_company" FOR INSERT TO "authenticated" WITH CHECK (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_part tenant_insert; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_insert" ON "public"."mdm_part";
--

CREATE POLICY "tenant_insert" ON "public"."mdm_part" FOR INSERT TO "authenticated" WITH CHECK (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_part_category tenant_insert; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_insert" ON "public"."mdm_part_category";
--

CREATE POLICY "tenant_insert" ON "public"."mdm_part_category" FOR INSERT TO "authenticated" WITH CHECK (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_shift_schedule tenant_insert; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_insert" ON "public"."mdm_shift_schedule";
--

CREATE POLICY "tenant_insert" ON "public"."mdm_shift_schedule" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = "app_private"."current_user_tenant_id"()) AND "app_private"."has_permission"('MdmShiftScheduling:Add'::"text")));


--

--

-- Name: mdm_shift_schedule_member tenant_insert; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_insert" ON "public"."mdm_shift_schedule_member";
--

CREATE POLICY "tenant_insert" ON "public"."mdm_shift_schedule_member" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = "app_private"."current_user_tenant_id"()) AND ("app_private"."has_permission"('MdmShiftScheduling:Add'::"text") OR "app_private"."has_permission"('MdmShiftScheduling:Edit'::"text"))));


--

--

-- Name: mdm_station tenant_insert; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_insert" ON "public"."mdm_station";
--

CREATE POLICY "tenant_insert" ON "public"."mdm_station" FOR INSERT WITH CHECK (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_work_center_activity tenant_insert; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_insert" ON "public"."mdm_work_center_activity";
--

CREATE POLICY "tenant_insert" ON "public"."mdm_work_center_activity" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = "app_private"."current_user_tenant_id"()) AND ("app_private"."has_permission"('MdmWorkCenter:Add'::"text") OR "app_private"."has_permission"('MdmWorkCenter:Edit'::"text") OR "app_private"."has_permission"('MdmWorkCenter:Copy'::"text"))));


--

--

-- Name: mdm_cargo tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_select" ON "public"."mdm_cargo";
--

CREATE POLICY "tenant_select" ON "public"."mdm_cargo" FOR SELECT TO "authenticated" USING ("app_private"."tenant_in_current_read_scope"("tenant_id"));


--

--

-- Name: mdm_insurance_company tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_select" ON "public"."mdm_insurance_company";
--

CREATE POLICY "tenant_select" ON "public"."mdm_insurance_company" FOR SELECT TO "authenticated" USING (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_part tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_select" ON "public"."mdm_part";
--

CREATE POLICY "tenant_select" ON "public"."mdm_part" FOR SELECT TO "authenticated" USING (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_part_category tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_select" ON "public"."mdm_part_category";
--

CREATE POLICY "tenant_select" ON "public"."mdm_part_category" FOR SELECT TO "authenticated" USING (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_personnel_common_work_center tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_select" ON "public"."mdm_personnel_common_work_center";
--

CREATE POLICY "tenant_select" ON "public"."mdm_personnel_common_work_center" FOR SELECT TO "authenticated" USING (("app_private"."tenant_in_current_read_scope"("tenant_id") AND ( SELECT "app_private"."has_permission"('MdmPersonnelWorkCenter:View'::"text") AS "has_permission")));


--

--

-- Name: mdm_station tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_select" ON "public"."mdm_station";
--

CREATE POLICY "tenant_select" ON "public"."mdm_station" FOR SELECT USING (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_work_center_activity tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_select" ON "public"."mdm_work_center_activity";
--

CREATE POLICY "tenant_select" ON "public"."mdm_work_center_activity" FOR SELECT TO "authenticated" USING (("app_private"."tenant_in_current_read_scope"("tenant_id") AND "app_private"."has_permission"('MdmWorkCenter:View'::"text")));


--

--

-- Name: mdm_cargo tenant_update; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_update" ON "public"."mdm_cargo";
--

CREATE POLICY "tenant_update" ON "public"."mdm_cargo" FOR UPDATE TO "authenticated" USING (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"()))) WITH CHECK (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_insurance_company tenant_update; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_update" ON "public"."mdm_insurance_company";
--

CREATE POLICY "tenant_update" ON "public"."mdm_insurance_company" FOR UPDATE TO "authenticated" USING (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"()))) WITH CHECK (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_part tenant_update; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_update" ON "public"."mdm_part";
--

CREATE POLICY "tenant_update" ON "public"."mdm_part" FOR UPDATE TO "authenticated" USING (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"()))) WITH CHECK (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_part_category tenant_update; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_update" ON "public"."mdm_part_category";
--

CREATE POLICY "tenant_update" ON "public"."mdm_part_category" FOR UPDATE TO "authenticated" USING (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"()))) WITH CHECK (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_shift_schedule tenant_update; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_update" ON "public"."mdm_shift_schedule";
--

CREATE POLICY "tenant_update" ON "public"."mdm_shift_schedule" FOR UPDATE TO "authenticated" USING ((("tenant_id" = "app_private"."current_user_tenant_id"()) AND "app_private"."has_permission"('MdmShiftScheduling:Edit'::"text"))) WITH CHECK ((("tenant_id" = "app_private"."current_user_tenant_id"()) AND "app_private"."has_permission"('MdmShiftScheduling:Edit'::"text")));


--

--

-- Name: mdm_shift_schedule_member tenant_update; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_update" ON "public"."mdm_shift_schedule_member";
--

CREATE POLICY "tenant_update" ON "public"."mdm_shift_schedule_member" FOR UPDATE TO "authenticated" USING ((("tenant_id" = "app_private"."current_user_tenant_id"()) AND "app_private"."has_permission"('MdmShiftScheduling:Edit'::"text"))) WITH CHECK ((("tenant_id" = "app_private"."current_user_tenant_id"()) AND "app_private"."has_permission"('MdmShiftScheduling:Edit'::"text")));


--

--

-- Name: mdm_station tenant_update; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_update" ON "public"."mdm_station";
--

CREATE POLICY "tenant_update" ON "public"."mdm_station" FOR UPDATE USING (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"()))) WITH CHECK (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_work_center_activity tenant_update; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tenant_update" ON "public"."mdm_work_center_activity";
--

CREATE POLICY "tenant_update" ON "public"."mdm_work_center_activity" FOR UPDATE TO "authenticated" USING ((("tenant_id" = "app_private"."current_user_tenant_id"()) AND "app_private"."has_permission"('MdmWorkCenter:Edit'::"text"))) WITH CHECK ((("tenant_id" = "app_private"."current_user_tenant_id"()) AND "app_private"."has_permission"('MdmWorkCenter:Edit'::"text")));


--

--

-- Name: mdm_driver tms_driver_tenant_delete; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tms_driver_tenant_delete" ON "public"."mdm_driver";
--

CREATE POLICY "tms_driver_tenant_delete" ON "public"."mdm_driver" FOR DELETE TO "authenticated" USING (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_driver tms_driver_tenant_insert; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tms_driver_tenant_insert" ON "public"."mdm_driver";
--

CREATE POLICY "tms_driver_tenant_insert" ON "public"."mdm_driver" FOR INSERT TO "authenticated" WITH CHECK (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_driver tms_driver_tenant_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tms_driver_tenant_select" ON "public"."mdm_driver";
--

CREATE POLICY "tms_driver_tenant_select" ON "public"."mdm_driver" FOR SELECT TO "authenticated" USING (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_driver tms_driver_tenant_update; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "tms_driver_tenant_update" ON "public"."mdm_driver";
--

CREATE POLICY "tms_driver_tenant_update" ON "public"."mdm_driver" FOR UPDATE TO "authenticated" USING (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"()))) WITH CHECK (("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())));


--

--

-- Name: mdm_vehicle vehicle_archive_safe_select; Type: POLICY; Schema: public
--

DROP POLICY IF EXISTS "vehicle_archive_safe_select" ON "public"."mdm_vehicle";
--

CREATE POLICY "vehicle_archive_safe_select" ON "public"."mdm_vehicle" FOR SELECT TO "authenticated" USING ((("app_private"."is_platform_super"() OR ("tenant_id" = "app_private"."current_user_tenant_id"())) AND "app_private"."can_access_vms_vehicle_reference_data"()));


--

--

-- Name: FUNCTION "apply_vehicle_type_profile"(); Type: ACL; Schema: app_private
--

--

REVOKE ALL ON FUNCTION "app_private"."apply_vehicle_type_profile"() FROM PUBLIC;


--

--

-- Name: FUNCTION "can_access_vms_vehicle_reference_data"(); Type: ACL; Schema: app_private
--

--

REVOKE ALL ON FUNCTION "app_private"."can_access_vms_vehicle_reference_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app_private"."can_access_vms_vehicle_reference_data"() TO "authenticated";
GRANT ALL ON FUNCTION "app_private"."can_access_vms_vehicle_reference_data"() TO "service_role";


--

--

-- Name: FUNCTION "mdm_change_request_state_audit"(); Type: ACL; Schema: app_private
--

--

REVOKE ALL ON FUNCTION "app_private"."mdm_change_request_state_audit"() FROM PUBLIC;


--

--

-- Name: FUNCTION "mdm_current_actor_email"(); Type: ACL; Schema: app_private
--

--

REVOKE ALL ON FUNCTION "app_private"."mdm_current_actor_email"() FROM PUBLIC;


--

--

-- Name: FUNCTION "mdm_emit_outbox_event"("p_tenant_id" "uuid", "p_aggregate_type" "text", "p_aggregate_id" "uuid", "p_event_type" "text", "p_payload" "jsonb", "p_correlation_id" "uuid", "p_causation_id" "uuid"); Type: ACL; Schema: app_private
--

--

REVOKE ALL ON FUNCTION "app_private"."mdm_emit_outbox_event"("p_tenant_id" "uuid", "p_aggregate_type" "text", "p_aggregate_id" "uuid", "p_event_type" "text", "p_payload" "jsonb", "p_correlation_id" "uuid", "p_causation_id" "uuid") FROM PUBLIC;


--

--

-- Name: FUNCTION "mdm_prevent_immutable_event_mutation"(); Type: ACL; Schema: app_private
--

--

REVOKE ALL ON FUNCTION "app_private"."mdm_prevent_immutable_event_mutation"() FROM PUBLIC;


--

--

-- Name: FUNCTION "mdm_quality_issue_state_audit"(); Type: ACL; Schema: app_private
--

--

REVOKE ALL ON FUNCTION "app_private"."mdm_quality_issue_state_audit"() FROM PUBLIC;


--

--

-- Name: FUNCTION "mdm_shift_schedule_occurrence_overlap"("p_left_start" "date", "p_left_end" "date", "p_left_weekdays" smallint[], "p_right_start" "date", "p_right_end" "date", "p_right_weekdays" smallint[]); Type: ACL; Schema: app_private
--

--

REVOKE ALL ON FUNCTION "app_private"."mdm_shift_schedule_occurrence_overlap"("p_left_start" "date", "p_left_end" "date", "p_left_weekdays" smallint[], "p_right_start" "date", "p_right_end" "date", "p_right_weekdays" smallint[]) FROM PUBLIC;


--

--

-- Name: FUNCTION "set_supplier_child_tenant"(); Type: ACL; Schema: app_private
--

--

REVOKE ALL ON FUNCTION "app_private"."set_supplier_child_tenant"() FROM PUBLIC;


--

--

-- Name: FUNCTION "set_vehicle_archive_creator_identity"(); Type: ACL; Schema: app_private
--

--

REVOKE ALL ON FUNCTION "app_private"."set_vehicle_archive_creator_identity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app_private"."set_vehicle_archive_creator_identity"() TO "service_role";


--

--

-- Name: FUNCTION "sync_mdm_business_partner_role"(); Type: ACL; Schema: app_private
--

--

REVOKE ALL ON FUNCTION "app_private"."sync_mdm_business_partner_role"() FROM PUBLIC;


--

--

-- Name: FUNCTION "tms_cargo_apply_material"(); Type: ACL; Schema: app_private
--

--

REVOKE ALL ON FUNCTION "app_private"."tms_cargo_apply_material"() FROM PUBLIC;


--

--

-- Name: TABLE "mdm_driver"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_driver" TO "anon";
GRANT ALL ON TABLE "public"."mdm_driver" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_driver" TO "service_role";


--

--

-- Name: FUNCTION "trg_require_workflow_for_vehicle_review"(); Type: ACL; Schema: app_private
--

--

REVOKE ALL ON FUNCTION "app_private"."trg_require_workflow_for_vehicle_review"() FROM PUBLIC;


--

--

-- Name: TABLE "mdm_vehicle"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_vehicle" TO "anon";
GRANT ALL ON TABLE "public"."mdm_vehicle" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_vehicle" TO "service_role";


--

--

-- Name: TABLE "mdm_station"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_station" TO "anon";
GRANT ALL ON TABLE "public"."mdm_station" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_station" TO "service_role";


--

--

-- Name: FUNCTION "set_vehicle_parts_category_level"(); Type: ACL; Schema: public
--

--

GRANT ALL ON FUNCTION "public"."set_vehicle_parts_category_level"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_vehicle_parts_category_level"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_vehicle_parts_category_level"() TO "service_role";


--

--

-- Name: TABLE "mdm_business_partner"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_business_partner" TO "anon";
GRANT ALL ON TABLE "public"."mdm_business_partner" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_business_partner" TO "service_role";


--

--

-- Name: TABLE "mdm_cargo"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_cargo" TO "anon";
GRANT ALL ON TABLE "public"."mdm_cargo" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_cargo" TO "service_role";


--

--

-- Name: TABLE "mdm_insurance_company"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_insurance_company" TO "anon";
GRANT ALL ON TABLE "public"."mdm_insurance_company" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_insurance_company" TO "service_role";


--

--

-- Name: TABLE "mdm_part"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_part" TO "anon";
GRANT ALL ON TABLE "public"."mdm_part" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_part" TO "service_role";


--

--

-- Name: TABLE "mdm_part_category"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_part_category" TO "anon";
GRANT ALL ON TABLE "public"."mdm_part_category" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_part_category" TO "service_role";


--

--

-- Name: TABLE "mdm_business_partner_role"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_business_partner_role" TO "anon";
GRANT ALL ON TABLE "public"."mdm_business_partner_role" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_business_partner_role" TO "service_role";


--

--

-- Name: TABLE "mdm_change_request"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_change_request" TO "anon";
GRANT ALL ON TABLE "public"."mdm_change_request" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_change_request" TO "service_role";


--

--

-- Name: TABLE "mdm_change_request_event"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_change_request_event" TO "anon";
GRANT ALL ON TABLE "public"."mdm_change_request_event" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_change_request_event" TO "service_role";


--

--

-- Name: TABLE "mdm_data_steward"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_data_steward" TO "anon";
GRANT ALL ON TABLE "public"."mdm_data_steward" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_data_steward" TO "service_role";


--

--

-- Name: TABLE "mdm_golden_record"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_golden_record" TO "anon";
GRANT ALL ON TABLE "public"."mdm_golden_record" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_golden_record" TO "service_role";


--

--

-- Name: TABLE "mdm_match_candidate"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_match_candidate" TO "anon";
GRANT ALL ON TABLE "public"."mdm_match_candidate" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_match_candidate" TO "service_role";


--

--

-- Name: TABLE "mdm_merge_event"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_merge_event" TO "anon";
GRANT ALL ON TABLE "public"."mdm_merge_event" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_merge_event" TO "service_role";


--

--

-- Name: TABLE "mdm_outbound_rule_sort"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_outbound_rule_sort" TO "anon";
GRANT ALL ON TABLE "public"."mdm_outbound_rule_sort" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_outbound_rule_sort" TO "service_role";


--

--

-- Name: TABLE "mdm_outbound_sort_field"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_outbound_sort_field" TO "anon";
GRANT ALL ON TABLE "public"."mdm_outbound_sort_field" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_outbound_sort_field" TO "service_role";


--

--

-- Name: TABLE "mdm_outbox_consumer"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_outbox_consumer" TO "anon";
GRANT ALL ON TABLE "public"."mdm_outbox_consumer" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_outbox_consumer" TO "service_role";


--

--

-- Name: TABLE "mdm_outbox_delivery"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_outbox_delivery" TO "anon";
GRANT ALL ON TABLE "public"."mdm_outbox_delivery" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_outbox_delivery" TO "service_role";


--

--

-- Name: TABLE "mdm_outbox_event"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_outbox_event" TO "anon";
GRANT ALL ON TABLE "public"."mdm_outbox_event" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_outbox_event" TO "service_role";


--

--

-- Name: TABLE "mdm_personnel_common_work_center"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_personnel_common_work_center" TO "anon";
GRANT ALL ON TABLE "public"."mdm_personnel_common_work_center" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_personnel_common_work_center" TO "service_role";


--

--

-- Name: TABLE "mdm_production_calendar_day_setting"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_production_calendar_day_setting" TO "anon";
GRANT ALL ON TABLE "public"."mdm_production_calendar_day_setting" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_production_calendar_day_setting" TO "service_role";


--

--

-- Name: TABLE "mdm_quality_issue"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_quality_issue" TO "anon";
GRANT ALL ON TABLE "public"."mdm_quality_issue" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_quality_issue" TO "service_role";


--

--

-- Name: TABLE "mdm_quality_issue_event"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_quality_issue_event" TO "anon";
GRANT ALL ON TABLE "public"."mdm_quality_issue_event" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_quality_issue_event" TO "service_role";


--

--

-- Name: TABLE "mdm_quality_rule"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_quality_rule" TO "anon";
GRANT ALL ON TABLE "public"."mdm_quality_rule" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_quality_rule" TO "service_role";


--

--

-- Name: TABLE "mdm_shift_schedule"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_shift_schedule" TO "anon";
GRANT ALL ON TABLE "public"."mdm_shift_schedule" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_shift_schedule" TO "service_role";


--

--

-- Name: TABLE "mdm_shift_schedule_member"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_shift_schedule_member" TO "anon";
GRANT ALL ON TABLE "public"."mdm_shift_schedule_member" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_shift_schedule_member" TO "service_role";


--

--

-- Name: TABLE "mdm_source_crosswalk"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_source_crosswalk" TO "anon";
GRANT ALL ON TABLE "public"."mdm_source_crosswalk" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_source_crosswalk" TO "service_role";


--

--

-- Name: TABLE "mdm_stock_movement_type"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_stock_movement_type" TO "anon";
GRANT ALL ON TABLE "public"."mdm_stock_movement_type" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_stock_movement_type" TO "service_role";


--

--

-- Name: TABLE "mdm_supplier_bank"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_supplier_bank" TO "anon";
GRANT ALL ON TABLE "public"."mdm_supplier_bank" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_supplier_bank" TO "service_role";


--

--

-- Name: TABLE "mdm_supplier_contact"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_supplier_contact" TO "anon";
GRANT ALL ON TABLE "public"."mdm_supplier_contact" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_supplier_contact" TO "service_role";


--

--

-- Name: TABLE "mdm_supply_chain_code_attribute"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_supply_chain_code_attribute" TO "anon";
GRANT ALL ON TABLE "public"."mdm_supply_chain_code_attribute" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_supply_chain_code_attribute" TO "service_role";


--

--

-- Name: TABLE "mdm_supply_chain_code_segment"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_supply_chain_code_segment" TO "anon";
GRANT ALL ON TABLE "public"."mdm_supply_chain_code_segment" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_supply_chain_code_segment" TO "service_role";


--

--

-- Name: TABLE "mdm_work_center_activity"; Type: ACL; Schema: public
--

--

GRANT ALL ON TABLE "public"."mdm_work_center_activity" TO "anon";
GRANT ALL ON TABLE "public"."mdm_work_center_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."mdm_work_center_activity" TO "service_role";


--

--

-- 以下约束引用未并入主平台的对象，已跳过（不影响四组功能）：
--   mdm_vehicle mdm_vehicle_vehicle_type_profile_id_fkey（引用未并入的 vehicle_type_profile，已跳过）
--   tms_order tms_order_destination_station_id_fkey（所属表 tms_order 不在本补丁范围，已跳过）
--   tms_order tms_order_dispatch_driver_id_fkey（所属表 tms_order 不在本补丁范围，已跳过）
--   tms_order tms_order_dispatch_vehicle_id_fkey（所属表 tms_order 不在本补丁范围，已跳过）
--   tms_order tms_order_origin_station_id_fkey（所属表 tms_order 不在本补丁范围，已跳过）
--   tms_order tms_order_transfer_station_id_fkey（所属表 tms_order 不在本补丁范围，已跳过）
--   tms_waybill tms_waybill_cargo_id_fkey（所属表 tms_waybill 不在本补丁范围，已跳过）
--   tms_waybill_cost tms_waybill_cost_driver_id_fkey（所属表 tms_waybill_cost 不在本补丁范围，已跳过）
--   tms_waybill tms_waybill_driver_id_fkey（所属表 tms_waybill 不在本补丁范围，已跳过）
--   tms_waybill tms_waybill_vehicle_id_fkey（所属表 tms_waybill 不在本补丁范围，已跳过）
--   mdm_vehicle mdm_vehicle_vehicle_type_profile_id_fkey（引用未并入的 vehicle_type_profile，已跳过）
--   tms_order tms_order_destination_station_id_fkey（所属表 tms_order 不在本补丁范围，已跳过）
--   tms_order tms_order_dispatch_driver_id_fkey（所属表 tms_order 不在本补丁范围，已跳过）
--   tms_order tms_order_dispatch_vehicle_id_fkey（所属表 tms_order 不在本补丁范围，已跳过）
--   tms_order tms_order_origin_station_id_fkey（所属表 tms_order 不在本补丁范围，已跳过）
--   tms_order tms_order_transfer_station_id_fkey（所属表 tms_order 不在本补丁范围，已跳过）
--   tms_waybill tms_waybill_cargo_id_fkey（所属表 tms_waybill 不在本补丁范围，已跳过）
--   tms_waybill_cost tms_waybill_cost_driver_id_fkey（所属表 tms_waybill_cost 不在本补丁范围，已跳过）
--   tms_waybill tms_waybill_driver_id_fkey（所属表 tms_waybill 不在本补丁范围，已跳过）
--   tms_waybill tms_waybill_vehicle_id_fkey（所属表 tms_waybill 不在本补丁范围，已跳过）
--   mdm_vehicle mdm_vehicle_vehicle_type_profile_id_fkey（引用未并入的 vehicle_type_profile，已跳过）
--   tms_order tms_order_destination_station_id_fkey（所属表 tms_order 不在本补丁范围，已跳过）
--   tms_order tms_order_dispatch_driver_id_fkey（所属表 tms_order 不在本补丁范围，已跳过）
--   tms_order tms_order_dispatch_vehicle_id_fkey（所属表 tms_order 不在本补丁范围，已跳过）
--   tms_order tms_order_origin_station_id_fkey（所属表 tms_order 不在本补丁范围，已跳过）
--   tms_order tms_order_transfer_station_id_fkey（所属表 tms_order 不在本补丁范围，已跳过）
--   tms_waybill tms_waybill_cargo_id_fkey（所属表 tms_waybill 不在本补丁范围，已跳过）
--   tms_waybill_cost tms_waybill_cost_driver_id_fkey（所属表 tms_waybill_cost 不在本补丁范围，已跳过）
--   tms_waybill tms_waybill_driver_id_fkey（所属表 tms_waybill 不在本补丁范围，已跳过）
--   tms_waybill tms_waybill_vehicle_id_fkey（所属表 tms_waybill 不在本补丁范围，已跳过）


commit;
