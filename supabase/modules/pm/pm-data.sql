-- Project organization menu and button permissions. Apply directly after pm-schema.sql.
update public.sys_menu
set path = 'project-organization',
    component = '/pm/project-organization',
    meta = jsonb_build_object('icon','ri:organization-chart','title','项目部组织','is_hide',false,'is_enable',true,'keep_alive',true),
    update_by = 'codex', update_time = now()
where name = 'ProjectPlanningOrganization';

insert into public.sys_menu
  (name, path, component, meta, sort, create_by, create_time, update_by, update_time, id, parent_id, type, app_code)
select v.name, '', '', jsonb_build_object('title', v.title, 'is_hide', true, 'is_enable', true),
       v.sort, 'codex', now(), 'codex', now(), gen_random_uuid(), m.id, 'button', 'pm'
from (values
  ('PmProjectOrg:View','查看项目组织架构',1),
  ('PmProjectOrg:ManageVersion','管理项目组织版本',2),
  ('PmProjectOrg:ManageNode','维护组织节点',3),
  ('PmProjectOrg:ManagePosition','维护项目岗位',4),
  ('PmProjectOrg:ManagePerson','维护项目人员',5),
  ('PmProjectOrg:ManageParticipant','维护参建单位',6),
  ('PmProjectOrg:Submit','提交项目组织审批',7),
  ('PmProjectOrg:Approve','审批项目组织版本',8),
  ('PmProjectOrg:Export','导出项目组织资料',9),
  ('PmProjectOrg:UploadArtifact','上传组织架构附件',10),
  ('PmProjectOrg:LinkBusiness','关联业务责任人',11)
) v(name, title, sort)
cross join public.sys_menu m
where m.name = 'ProjectPlanningOrganization'
on conflict do nothing;

insert into public.sys_role_menu
  (permission, create_by, create_time, role_id, menu_id, id, update_by, update_time)
select '{}'::jsonb, 'codex', now(), r.id, m.id, gen_random_uuid(), 'codex', now()
from public.sys_role r
cross join public.sys_menu m
where r.role_code in ('R_ADMIN','R_SUPER')
  and (m.name = 'ProjectPlanningOrganization' or (m.type = 'button' and m.name like 'PmProjectOrg:%'))
on conflict do nothing;

insert into public.sys_menu
  (name, path, component, meta, sort, create_by, create_time, update_by, update_time, id, parent_id, type, app_code)
select 'ProjectPlanningWbs', 'wbs', '/pm/wbs', jsonb_build_object('icon','ri:node-tree','title','WBS 工作分解','is_hide',false,'is_enable',true,'keep_alive',true), 1, 'codex', now(), 'codex', now(), gen_random_uuid(), m.id, 'menu', 'pm'
from public.sys_menu m where m.name='ProjectPlanning' and not exists (select 1 from public.sys_menu x where x.name='ProjectPlanningWbs');

insert into public.sys_menu
  (name, path, component, meta, sort, create_by, create_time, update_by, update_time, id, parent_id, type, app_code)
select v.name, '', '', jsonb_build_object('title', v.title, 'is_hide', true, 'is_enable', true), v.sort, 'codex', now(), 'codex', now(), gen_random_uuid(), m.id, 'button', 'pm'
from (values
  ('PmWbs:View','查看 WBS',1),('PmWbs:Add','新增节点',2),('PmWbs:Edit','编辑节点',3),('PmWbs:Delete','删除节点',4),('PmWbs:Archive','归档节点',5),('PmWbs:Move','调整节点顺序',6),('PmWbs:ManageVersion','管理 WBS 版本',7),('PmWbs:Submit','提交 WBS 审批',8),('PmWbs:Approve','审批 WBS 基线',9),('PmWbs:Reject','退回 WBS 版本',10),('PmWbs:ManageTemplate','管理 WBS 模板',11),('PmWbs:Import','导入 WBS',12),('PmWbs:Export','导出 WBS',13),('PmWbs:ManageScope','维护范围边界',14),('PmWbs:ManageDeliverable','维护交付物',15),('PmWbs:LinkBusiness','关联业务数据',16),('PmWbs:ViewHistory','查看版本历史',17)
) v(name,title,sort)
cross join public.sys_menu m where m.name='ProjectPlanningWbs'
  and not exists (select 1 from public.sys_menu existing where existing.name=v.name);

insert into public.sys_role_menu(permission,create_by,create_time,role_id,menu_id,id,update_by,update_time)
select '{}'::jsonb,'codex',now(),r.id,m.id,gen_random_uuid(),'codex',now()
from public.sys_role r cross join public.sys_menu m
where r.role_code in ('R_ADMIN','R_SUPER') and (m.name='ProjectPlanningWbs' or (m.type='button' and m.name like 'PmWbs:%'))
  and not exists (select 1 from public.sys_role_menu existing where existing.role_id=r.id and existing.menu_id=m.id);

insert into public.pm_wbs_template(name,category,description,node_count,create_by,update_by)
values
  ('弱电标准 WBS','弱电','适用于综合布线、机房、安防和智能化系统实施范围分解',5,'codex','codex'),
  ('房建标准 WBS','房建','适用于房建项目单位工程、分部工程和分项工程范围分解',5,'codex','codex')
on conflict(name) do update set description=excluded.description,node_count=excluded.node_count,update_by='codex',update_time=now();

insert into public.pm_wbs_template_node(template_id,parent_id,sort_order,wbs_code,name,description,unit,quality_standard,is_milestone)
select t.id,null,1,'1','项目准备','施工准备与开工条件确认',null,'满足开工条件并完成交底',false from public.pm_wbs_template t where t.name='弱电标准 WBS'
and not exists(select 1 from public.pm_wbs_template_node n where n.template_id=t.id and n.wbs_code='1');
insert into public.pm_wbs_template_node(template_id,parent_id,sort_order,wbs_code,name,description,unit,quality_standard,is_milestone)
select t.id,null,2,'2','综合布线','综合布线系统施工与测试',null,'符合设计图纸和验收规范',false from public.pm_wbs_template t where t.name='弱电标准 WBS'
and not exists(select 1 from public.pm_wbs_template_node n where n.template_id=t.id and n.wbs_code='2');
insert into public.pm_wbs_template_node(template_id,parent_id,sort_order,wbs_code,name,description,unit,quality_standard,is_milestone)
select t.id,null,3,'3','机房工程','机房基础、设备和调试',null,'机房专项验收通过',true from public.pm_wbs_template t where t.name='弱电标准 WBS'
and not exists(select 1 from public.pm_wbs_template_node n where n.template_id=t.id and n.wbs_code='3');
insert into public.pm_wbs_template_node(template_id,parent_id,sort_order,wbs_code,name,description,unit,quality_standard,is_milestone)
select t.id,null,1,'1','主体结构','基础、主体和结构验收',null,'结构验收合格',true from public.pm_wbs_template t where t.name='房建标准 WBS'
and not exists(select 1 from public.pm_wbs_template_node n where n.template_id=t.id and n.wbs_code='1');
insert into public.pm_wbs_template_node(template_id,parent_id,sort_order,wbs_code,name,description,unit,quality_standard,is_milestone)
select t.id,null,2,'2','建筑装饰','砌体、抹灰、门窗和装饰',null,'观感质量与实测实量合格',false from public.pm_wbs_template t where t.name='房建标准 WBS'
and not exists(select 1 from public.pm_wbs_template_node n where n.template_id=t.id and n.wbs_code='2');
