import{r as e}from"./rolldown-runtime-C0FnF6B9.js";import{$ as t,H as n,at as r,et as i}from"./sys-C02HO1Sw.js";import{t as a}from"./pagination-DVzefm8X.js";import{n as o}from"./tree-B88_vRp9.js";var s=e({addDict:()=>D,addDictType:()=>v,deleteDict:()=>T,deleteDictBatch:()=>E,deleteDictType:()=>_,deleteResource:()=>j,editDict:()=>O,editDictType:()=>y,executeSql:()=>F,fetchDatabaseMetadata:()=>M,fetchDictTypeIdByDictionaryId:()=>S,fetchGetDictDirectoryTree:()=>g,fetchGetDictList:()=>C,fetchGetDictListByTypeCode:()=>w,fetchGetDictListByTypeId:()=>x,fetchGetDictTypeList:()=>m,fetchGetDictionaryTypeOptions:()=>h,fetchGetResourceList:()=>k,generateSqlByAi:()=>I,renameResource:()=>A,saveDictTypeTreeOrder:()=>b}),{supabase:c,keysToSnakeDeep:l,responseHandle:u}=i(),d=500,f=new o({idKey:`id`,parentKey:`parentId`,childrenKey:`children`});function p(e){let t=Array.isArray(e)?e[0]:e;return t&&typeof t==`object`?t:null}async function m(e={}){let{name:t}=e,n=[{col:`name`,op:`ilike`,val:t?`%${t}%`:void 0}],i=c.from(`sys_dict_type`).select(`*, cascade_parent_type:dict_type_cascade_parent(id, name, code)`).order(`sort`,{ascending:!0}).order(`name`,{ascending:!0});return i=r(i,n,{skipEmpty:!0,camelToSnake:!1}),await u(()=>i,{})}async function h(e={}){let t=c.from(`sys_dict_type`).select(`id, name, code, cascade_parent_type_id`).eq(`node_type`,`dictionary`).eq(`status`,`1`).order(`name`,{ascending:!0});return e.excludeId&&(t=t.neq(`id`,e.excludeId)),await u(()=>t,{showErrorMessage:!0})}async function g(e={}){let t=await u(()=>c.from(`sys_dict_type`).select(`id, parent_id, node_type, name, code, status, sort`).eq(`node_type`,`directory`).order(`sort`,{ascending:!0}).order(`name`,{ascending:!0}),{showErrorMessage:!0}),n=f.listToTree(t.data??[],(e,t)=>Number(e.sort??0)-Number(t.sort??0)||e.name.localeCompare(t.name,`zh-CN`)),r=e.excludeId?f.removeNodesByCondition(n,t=>t.id===e.excludeId).tree:n;return{...t,data:r}}async function _(e){let{id:n}=e;return await u(()=>c.from(`sys_dict_type`).delete({count:`exact`}).eq(`id`,n),{showMessage:!0,requireAffected:!0,noAffectedMessage:t})}async function v(e){return await u(()=>c.from(`sys_dict_type`).insert(l(e)),{showMessage:!0,breakReturn:!0})}async function y(e){let{id:n,...r}=e;return await u(()=>c.from(`sys_dict_type`).update(l(r),{count:`exact`}).eq(`id`,n),{showMessage:!0,breakReturn:!0,requireAffected:!0,noAffectedMessage:t})}async function b(e){return await u(()=>c.rpc(`save_dict_type_tree_order`,{p_updates:e}),{breakReturn:!0,showMessage:!1})}async function x(e){let{typeId:t,label:n=``,code:i,i18nScope:a,status:o,recordId:s}=e,l=[{col:`id`,op:`eq`,val:s},{col:`typeId`,op:`eq`,val:t},{col:`label`,op:`ilike`,val:`%${n}%`},{col:`code`,op:`eq`,val:i},{col:`i18nScope`,op:`eq`,val:a},{col:`status`,op:`eq`,val:o}],d=c.from(`sys_dictionary`).select(`*`,{count:`exact`}).order(`sort`,{ascending:!0}).order(`label`,{ascending:!0});return d=r(d,l,{skipEmpty:!0,camelToSnake:!0}),await u(()=>d,{})}async function S(e){let{data:t}=await u(()=>c.from(`sys_dictionary`).select(`type_id`).eq(`id`,e).maybeSingle(),{});return t?.typeId}async function C(){return await a(({from:e,to:t})=>{let n=c.from(`sys_dictionary`).select(`
          id,
          type_id,
          code,
          label,
          value,
          status,
          sort,
          color,
          tag_type,
          remark,
          parent_id,
          cascade_parent_id,
          dict_type_table:sys_dict_type!inner(
            code,
            name
          )
        `).eq(`status`,`1`).eq(`dict_type_table.status`,`1`).order(`sort`,{ascending:!0}).order(`id`,{ascending:!0}).range(e,t);return u(()=>n,{})},{pageSize:d})}async function w(e){return await u(()=>c.from(`sys_dictionary`).select(`
          id,
          type_id,
          code,
          label,
          value,
          status,
          sort,
          color,
          tag_type,
          remark,
          parent_id,
          cascade_parent_id,
          dict_type_table:sys_dict_type!inner(
            code,
            name
          )
        `).eq(`status`,`1`).eq(`dict_type_table.status`,`1`).eq(`dict_type_table.code`,e).order(`sort`,{ascending:!0}).order(`id`,{ascending:!0}),{})}async function T(e){let{id:n}=e;return await u(()=>c.from(`sys_dictionary`).delete({count:`exact`}).eq(`id`,n),{showMessage:!0,requireAffected:!0,noAffectedMessage:t})}async function E(e){return await u(()=>c.from(`sys_dictionary`).delete({count:`exact`}).in(`id`,e),{showMessage:!0,requireAffected:!0,noAffectedMessage:t})}async function D(e){return await u(()=>c.from(`sys_dictionary`).insert(l(e)),{showMessage:!0,breakReturn:!0})}async function O(e){let{id:n,...r}=e;return await u(()=>c.from(`sys_dictionary`).update(l(r),{count:`exact`}).eq(`id`,n),{showMessage:!0,breakReturn:!0,requireAffected:!0,noAffectedMessage:t})}async function k(e){let{originName:t=``,suffix:n=``,from:i=0,to:a=9}=e,o=[{col:`originName`,op:`ilike`,val:`%${t}%`}];if(n){let e=n.split(`,`).map(e=>e.trim()).filter(e=>e.length>0);e.length>0&&o.push({col:`suffix`,op:`in`,val:e})}let s=c.from(`sys_attachment`).select(`*`,{count:`exact`}).order(`create_time`,{ascending:!1}).range(i,a);return s=r(s,o,{skipEmpty:!0,camelToSnake:!0}),await u(()=>s,{showErrorMessage:!0})}async function A(e){let{id:n,originName:r}=e;return await u(()=>c.from(`sys_attachment`).update({origin_name:r},{count:`exact`}).eq(`id`,n),{breakReturn:!0,requireAffected:!0,noAffectedMessage:t,errorMessage:`附件重命名失败，请稍后重试`})}async function j(e){let{id:n}=e,{data:r}=await u(()=>c.from(`sys_attachment`).select().eq(`id`,n).single(),{});if(!r)throw Error(`未找到待删除的附件`);let{storagePath:i,objectName:a}=r;if(await u(()=>c.from(`sys_attachment`).delete({count:`exact`}).eq(`id`,n),{breakReturn:!0,requireAffected:!0,noAffectedMessage:t,errorMessage:`附件删除失败，请稍后重试`}),!i||!a)return{storageCleanupFailed:!1};let o=`${i}/${a}`,{error:s}=await c.storage.from(`attachments`).remove([o]);return s?(console.warn(`[AttachmentCleanup] 附件记录已删除，但存储对象清理失败:`,s),{storageCleanupFailed:!0}):{storageCleanupFailed:!1}}async function M(){try{let[{data:e,error:t},r]=await Promise.all([n(`execute-sql-with-columns`,{body:{action:`metadata`}}),P()]);if(t||!e)return{...await N(),foreignKeys:r};let i=p(e),a=i?.schemas??[],o=(i?.columns??[]).map(e=>({tableSchema:e.tableSchema||``,tableName:e.tableName||``,columnName:e.columnName||``,dataType:e.dataType||``,isNullable:e.isNullable||`YES`,ordinalPosition:e.ordinalPosition||0})),s=new Map;return o.forEach(e=>{let t=`${e.tableSchema}.${e.tableName}`;s.has(t)||s.set(t,{tableSchema:e.tableSchema,tableName:e.tableName,columns:[]}),s.get(t).columns.push({name:e.columnName,dataType:e.dataType,isNullable:e.isNullable===`YES`})}),{schemas:a,columns:o,tables:Array.from(s.values()),functions:(i?.functions??[]).map(e=>({routineSchema:e.routineSchema||``,routineName:e.routineName||``,returnType:e.returnType||``})),foreignKeys:r}}catch(e){return console.error(`Failed to fetch database metadata:`,e),{schemas:[`public`],columns:[],tables:[],functions:[],foreignKeys:[]}}}async function N(){return{schemas:[`public`],columns:[],tables:[],functions:[],foreignKeys:[]}}async function P(){let{data:e,error:t}=await F({query:`
    SELECT
      source_schema.nspname AS source_schema,
      source_table.relname AS source_table,
      source_column.attname AS source_column,
      target_schema.nspname AS target_schema,
      target_table.relname AS target_table,
      target_column.attname AS target_column,
      con.conname AS constraint_name
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class source_table
      ON source_table.oid = con.conrelid
    JOIN pg_catalog.pg_namespace source_schema
      ON source_schema.oid = source_table.relnamespace
    JOIN pg_catalog.pg_class target_table
      ON target_table.oid = con.confrelid
    JOIN pg_catalog.pg_namespace target_schema
      ON target_schema.oid = target_table.relnamespace
    CROSS JOIN LATERAL unnest(con.conkey, con.confkey)
      WITH ORDINALITY AS key_pair(source_attnum, target_attnum, ordinal_position)
    JOIN pg_catalog.pg_attribute source_column
      ON source_column.attrelid = source_table.oid
      AND source_column.attnum = key_pair.source_attnum
    JOIN pg_catalog.pg_attribute target_column
      ON target_column.attrelid = target_table.oid
      AND target_column.attnum = key_pair.target_attnum
    WHERE con.contype = 'f'
      AND source_schema.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    ORDER BY source_schema.nspname, source_table.relname, con.conname, key_pair.ordinal_position
  `}),n=e?.rows;return t||!n?[]:n.map(e=>({sourceSchema:e.sourceSchema||e.source_schema||``,sourceTable:e.sourceTable||e.source_table||``,sourceColumn:e.sourceColumn||e.source_column||``,targetSchema:e.targetSchema||e.target_schema||``,targetTable:e.targetTable||e.target_table||``,targetColumn:e.targetColumn||e.target_column||``,constraintName:e.constraintName||e.constraint_name||``}))}async function F(e){return await u(()=>n(`execute-sql-with-columns`,{body:e}),{convertToCamelShadow:!0,returnRawError:!0})}async function I(e){return await u(()=>n(`ai-sql-assistant`,{body:e}),{convertToCamelShadow:!0,returnRawError:!0})}export{k as _,E as a,b,O as c,M as d,S as f,h as g,m as h,T as i,y as l,x as m,v as n,_ as o,g as p,s as r,j as s,D as t,F as u,I as v,A as y};