-- ===========================================================================
-- 编号流水计数器唯一索引补丁
--
-- 症状：任何带自动编号业务表的新增都会失败，网络面板可见
--       ERROR 42P10: there is no unique or exclusion constraint matching
--       the ON CONFLICT specification，上下文指向
--       app_private.next_document_number() 里的
--       insert into sys_document_number_counter ...
--       on conflict (rule_id, rule_version, period_key)。
--       插入前触发器 document_number_* 调用同一函数的表共 10 张：
--       mdm_cargo、mdm_carrier、mdm_customer、mdm_employee、mdm_part、
--       mdm_part_category、mdm_position、mdm_station、mdm_vehicle、tms_invoice。
--       典型入口：岗位管理「新增岗位」、员工档案新增、主数据新增编码。
--
-- 原因：单组织改造去掉了多组织维度（sys_document_number_counter 已无 tenant_id），
--       随该维度一起删除的唯一约束
--       sys_document_number_counter_scope_uk
--         UNIQUE (rule_id, tenant_id, rule_version, period_key)
--       没有用去掉 tenant_id 的等价唯一索引补回来，表上只剩同列的普通索引
--       idx_document_number_counter_rule，于是 next_document_number() 的
--       ON CONFLICT (rule_id, rule_version, period_key) 推断不出唯一索引，
--       语句在规划阶段直接报错（与数据行是否存在无关）。
--       period_key 由 app_private.document_number_period_key() 生成，取值只可能是
--       'YYYY'、'YYYYMM'、'YYYYMMDD' 或空串，不会为 NULL，因此不需要 NULLS NOT DISTINCT。
--
-- 内容：补一条与 ON CONFLICT 目标完全一致的唯一索引（列顺序与推断无关）。
--
-- 幂等：IF NOT EXISTS；重复执行无副作用。若目标库已存在重复计数行，本语句会直接报错
--       而不是静默跳过，需要先人工核对 sys_document_number_counter 的重复分组。
--
-- 应用方式：supabase db query --linked --file supabase/baseline/document-number-counter-patch.sql
-- ===========================================================================

SET statement_timeout = 0;
SET lock_timeout = 0;

begin;

create unique index if not exists sys_document_number_counter_rule_period_uk
  on public.sys_document_number_counter (rule_id, rule_version, period_key);

commit;
