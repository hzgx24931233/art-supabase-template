-- 增量补丁：用户管理页的「启用用户」按钮权限（System:User:Enable）
--
-- 用途：已经建好的项目补这一项。全新项目执行 platform-seed.sql 时已包含同样的行，无需再跑本文件。
-- 幂等：重复执行不会创建重复按钮，也不会重复授权。
--
-- 说明：用户管理页原本只有 System:User:Delete（禁止用户 / 彻底删除记录），
-- 账号状态为禁用（status = '2'）时的「启用用户」是独立动作，因此单独建码，
-- 并在页面管理边界（sync-user Edge Function）做同样的权限校验。
-- 授权策略：只给**当前已拥有该页面菜单**的角色补授一次，后续角色请在角色管理里显式分配；
-- 不会授予缺少该页面菜单的角色。

insert into public.sys_menu (name, path, component, meta, sort, create_by, create_time, update_by, update_time, id, parent_id, type, app_code)
select 'System:User:Enable', '', '', '{"title":"启用用户","is_enable":true,"is_auth_button":true}'::jsonb, 6,
       'codex-system-permission-migration', '2026-10-14T06:00:00+00:00', 'codex-system-permission-migration', '2026-10-14T06:00:00+00:00',
       'a1f5e0d4-6c2b-4f77-9f0e-0c9d3b1a2f01', 'fffab24e-4434-4812-b2dd-284411d6408e', 'button', 'platform'
where not exists (select 1 from public.sys_menu where name = 'System:User:Enable');

insert into public.sys_role_menu (role_id, menu_id, create_by, update_by)
select distinct rm.role_id, btn.id, 'codex-system-permission-migration', 'codex-system-permission-migration'
from public.sys_role_menu rm
join public.sys_menu btn on btn.name = 'System:User:Enable'
where rm.menu_id = 'fffab24e-4434-4812-b2dd-284411d6408e'
  and not exists (
    select 1 from public.sys_role_menu existing
    where existing.role_id = rm.role_id and existing.menu_id = btn.id
  );

-- 回滚（仅在需要撤销本项变更时执行；撤销后页面上的「启用用户」入口会因缺少权限而消失）：
-- delete from public.sys_role_menu where menu_id in (select id from public.sys_menu where name = 'System:User:Enable');
-- delete from public.sys_menu where name = 'System:User:Enable';
