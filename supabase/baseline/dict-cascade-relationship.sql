-- ===========================================================================
-- 数据字典：补 PostgREST 计算关联函数 dict_type_cascade_parent
--
-- 现象：字典页打开即报「字典目录加载失败」，网络里 POSTgREST 400：
--   GET /rest/v1/sys_dict_type?select=*,cascade_parent_type:dict_type_cascade_parent(id,name,code)
--   {"code":"PGRST200","message":"Could not find a relationship between 'sys_dict_type' and 'dict_type_cascade_parent'"}
--
-- 原因：字典类型的级联父级不是外键关系，而是「以 sys_dict_type 行类型为参数、返回该表集合」的
--       PostgREST 计算关联函数。迁移基线时只保留了 .rpc() 调用的函数，漏掉了它，
--       导致前端嵌入查询无法解析，整页加载失败。
--
-- 处理：基线生成器已补充该规则（随已保留表的行类型函数一起保留），本文件是把缺失对象补进现有项目。
-- 幂等：CREATE OR REPLACE + 注释/授权可重复执行。
-- ===========================================================================

SET check_function_bodies = false;

begin;

-- Name: validate_dict_type_cascade_parent(); Type: FUNCTION; Schema: app_private
--

--

CREATE OR REPLACE FUNCTION "app_private"."validate_dict_type_cascade_parent"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  parent_row public.sys_dict_type%rowtype;
begin
  if new.cascade_parent_type_id is not null then
    if new.node_type <> 'dictionary' then
      raise exception using errcode = '23514', message = '只有字典类型可以配置级联上级类型';
    end if;

    select * into parent_row
    from public.sys_dict_type
    where id = new.cascade_parent_type_id;

    if not found or parent_row.node_type <> 'dictionary' then
      raise exception using errcode = '23514', message = '级联上级必须是有效的字典类型';
    end if;

    if parent_row.tenant_id <> new.tenant_id then
      raise exception using errcode = '23514', message = '级联上下级字典类型必须属于同一租户';
    end if;

    if exists (
      with recursive ancestors as (
        select parent.id, parent.cascade_parent_type_id, array[parent.id] as visited
        from public.sys_dict_type parent
        where parent.id = new.cascade_parent_type_id
        union all
        select parent.id, parent.cascade_parent_type_id, ancestors.visited || parent.id
        from public.sys_dict_type parent
        join ancestors on parent.id = ancestors.cascade_parent_type_id
        where not parent.id = any(ancestors.visited)
      )
      select 1 from ancestors where id = new.id
    ) then
      raise exception using errcode = '23514', message = '字典类型级联关系不能形成循环';
    end if;
  end if;

  if exists (
    select 1
    from public.sys_dictionary child_entry
    join public.sys_dictionary parent_entry on parent_entry.id = child_entry.cascade_parent_id
    where child_entry.type_id = new.id
      and child_entry.cascade_parent_id is not null
      and (
        new.cascade_parent_type_id is null
        or parent_entry.type_id <> new.cascade_parent_type_id
        or parent_entry.tenant_id <> child_entry.tenant_id
      )
  ) then
    raise exception using errcode = '23514', message = '已有字典项的级联归属与新配置不一致，请先调整字典项';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "app_private"."validate_dict_type_cascade_parent"() OWNER TO "postgres";

--

--

-- Name: dict_type_cascade_parent("public"."sys_dict_type"); Type: FUNCTION; Schema: public
--

--

CREATE OR REPLACE FUNCTION "public"."dict_type_cascade_parent"("public"."sys_dict_type") RETURNS SETOF "public"."sys_dict_type"
    LANGUAGE "sql" STABLE ROWS 1
    SET "search_path" TO ''
    AS $_$
  select parent.*
  from public.sys_dict_type as parent
  where parent.id = ($1).cascade_parent_type_id
$_$;


ALTER FUNCTION "public"."dict_type_cascade_parent"("public"."sys_dict_type") OWNER TO "postgres";

--

--

-- Name: FUNCTION "validate_dict_type_cascade_parent"(); Type: ACL; Schema: app_private
--

--

REVOKE ALL ON FUNCTION "app_private"."validate_dict_type_cascade_parent"() FROM PUBLIC;


--

--

-- Name: FUNCTION "dict_type_cascade_parent"("public"."sys_dict_type"); Type: ACL; Schema: public
--

--

REVOKE ALL ON FUNCTION "public"."dict_type_cascade_parent"("public"."sys_dict_type") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dict_type_cascade_parent"("public"."sys_dict_type") TO "anon";
GRANT ALL ON FUNCTION "public"."dict_type_cascade_parent"("public"."sys_dict_type") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dict_type_cascade_parent"("public"."sys_dict_type") TO "service_role";


--

--

commit;
