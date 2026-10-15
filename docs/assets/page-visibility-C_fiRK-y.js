import"./rolldown-runtime-C0FnF6B9.js";import{$ as e,F as t,et as n,j as r,t as i}from"./icon-XA0lSCKJ.js";import{Et as a,Gn as o,Ot as s,Tt as c,_t as l,kn as u,qt as d,un as f,vt as p,xt as m}from"./framework-Bwlbiqw9.js";import{E as h,r as g}from"./sys-C02HO1Sw.js";import{t as _}from"./tag-DFBwfWjO.js";import{t as v}from"./card-CBJutozQ.js";import{n as y,t as b}from"./col-Gz6VHIMj.js";import{n as x,t as S}from"./timeline-1LRCJY7W.js";/* empty css                            */var C={class:`w-full py-2`},w={class:`mb-6`},T={class:`m-0 mb-2 text-xl font-medium`},E={class:`mb-6`},D={class:`flex-c gap-5`},O={class:`my-1 text-sm text-g-700`},k={class:`font-semibold`},A={class:`my-1 text-sm text-g-700`},j={class:`mb-6 last:mb-0`},M={class:`p-4 mt-3 mb-0 font-mono text-xs leading-[1.5] bg-g-200 border-full-d rounded-md whitespace-pre-wrap break-all`},N={class:``},P={class:`best-practices`},F={class:`practices-content`},I={class:`flex-c`},L={class:`size-10 bg-g-200 flex-cc rounded mr-2`},R={class:`flex-c`},z={class:`size-10 bg-g-200 flex-cc rounded mr-2`},B={class:`flex-c`},V={class:`size-10 bg-g-200 flex-cc rounded mr-2`},H={class:`flex-c`},U={class:`size-10 bg-g-200 flex-cc rounded mr-2`},W=s({name:`PermissionPageVisibility`,__name:`index`,setup(s){let W=g(),G=h.SUPER_ROLE_CODE,K=l(()=>W.info),q=e=>({[G]:`超级管理员`,R_ADMIN:`管理员`,R_USER:`普通用户`})[e]||`未知角色`;return(s,l)=>{let h=_,g=v,W=x,J=S,Y=i,X=b,Z=y;return d(),m(`div`,C,[p(`div`,w,[p(`h2`,T,o(s.$t(`menus.examples.permission.pageVisibility`)),1),l[0]||(l[0]=p(`p`,{class:`m-0 text-sm leading-[1.6] text-g-700`},[c(` 此页面仅对`),p(`strong`,{class:`font-semibold text-warning`},`超级管理员`),c(`用户可见，演示页面级别的权限控制。 如果您能看到此页面，说明您拥有相应的访问权限。 `)],-1))]),p(`div`,E,[a(g,{class:`art-card-xs`},{header:f(()=>[...l[1]||(l[1]=[p(`div`,{class:`flex-c gap-2 font-semibold`},[p(`span`,null,`权限验证成功`)],-1)])]),default:f(()=>[p(`div`,null,[p(`div`,D,[p(`div`,null,[l[4]||(l[4]=p(`h3`,{class:`m-0 mb-2 text-lg font-semibold`},`您拥有访问此页面的权限`,-1)),p(`p`,O,[l[2]||(l[2]=c(` 当前用户：`,-1)),p(`strong`,k,o(K.value.userName),1)]),p(`p`,A,[l[3]||(l[3]=c(` 用户角色： `,-1)),a(h,{type:`warning`},{default:f(()=>[c(o(q(K.value.userRoles?.[0]||``)),1)]),_:1})])])])])]),_:1})]),p(`div`,j,[a(g,{class:`art-card-xs`},{header:f(()=>[...l[5]||(l[5]=[p(`div`,{class:`flex-c font-semibold`},[p(`span`,null,`页面级权限控制说明`)],-1)])]),default:f(()=>[p(`div`,null,[a(J,null,{default:f(()=>[a(W,{timestamp:`前端控制模式`,type:`primary`,size:`large`},{default:f(()=>[a(g,null,{default:f(()=>[l[6]||(l[6]=p(`h4`,{class:`m-0 mb-2 text-base font-semibold`},`基于角色的权限控制`,-1)),l[7]||(l[7]=p(`p`,{class:`m-0 mb-2 leading-[1.6] text-g-700`},[c(` 在前端控制模式下，页面访问权限由路由配置文件中的 `),p(`code`,{class:`px-1.5 py-0.5 font-mono text-xs text-theme bg-theme/12 rounded`},`meta.roles`),c(` 字段定义，前端会根据用户接口所拥有的角色对路由和菜单进行过滤与控制 `)],-1)),p(`pre`,M,[p(`code`,N,`{
  path: 'page-visibility',
  name: 'PermissionPageVisibility',
  component: '/examples/permission/page-visibility',
  meta: {
    title: 'menus.permission.pageVisibility',
    roles: ['`+o(u(G))+`'], // 仅超级管理员可访问
    keepAlive: true
  }
}`,1)]),l[8]||(l[8]=p(`p`,{class:`m-0 mb-2 leading-[1.6] text-g-700`},[p(`strong`,null,`权限验证流程：`)],-1)),l[9]||(l[9]=p(`ul`,{class:`pl-5 my-2`},[p(`li`,{class:`my-1 leading-[1.5] text-g-700`},`用户登录后，接口返回用户角色信息`),p(`li`,{class:`my-1 leading-[1.5] text-g-700`},[c(` 在 `),p(`code`,{class:`px-1.5 py-0.5 font-mono text-xs text-theme bg-theme/12 rounded`},`beforeEach`),c(` 路由守卫中检查目标路由的 `),p(`code`,{class:`px-1.5 py-0.5 font-mono text-xs text-theme bg-theme/12 rounded`},`roles`),c(` 配置 `)]),p(`li`,{class:`my-1 leading-[1.5] text-g-700`},`比较用户角色是否包含在允许访问的角色列表中`),p(`li`,{class:`my-1 leading-[1.5] text-g-700`},`权限不足时跳转到 403 页面`)],-1))]),_:1})]),_:1}),a(W,{timestamp:`后端控制模式`,type:`warning`,size:`large`},{default:f(()=>[a(g,null,{default:f(()=>[...l[10]||(l[10]=[p(`h4`,{class:`m-0 mb-2 text-base font-semibold`},`基于菜单接口的权限控制`,-1),p(`p`,{class:`m-0 mb-2 leading-[1.6] text-g-700`},`在后端控制模式下，页面访问权限由后端统一管理，前端通过解析后端接口返回的菜单列表来生成可访问的路由，从而实现权限控制`,-1),p(`p`,{class:`m-0 mb-2 leading-[1.6] text-g-700`},`接口地址：src/api/menuApi.ts getMenuList`,-1),p(`pre`,{class:`p-4 mt-3 mb-0 font-mono text-xs leading-[1.5] bg-g-200 border-full-d rounded-md whitespace-pre-wrap break-all`},[p(`code`,{class:``},`
{
  "code": 200,
  "data": [
    {
      "id": 1,
      "path": "/permission",
      "name": "Permission",
      "component": "Layout",
      "meta": {
        "title": "menus.permission.title",
        "icon": ""
      },
      "children": [
        {
          "id": 11,
          "path": "page-visibility",
          "name": "PermissionPageVisibility",
          "component": "permission/page-visibility/index",
          "meta": {
            "title": "menus.permission.pageVisibility",
            "keepAlive": true
          }
        }
      ]
    }
  ]
}`)],-1),p(`p`,null,[p(`strong`,null,`权限验证流程：`)],-1),p(`ul`,null,[p(`li`,null,`用户登录成功后获取 Token`),p(`li`,null,`前端调用菜单接口获取用户可访问的菜单列表`),p(`li`,null,`前端根据菜单列表动态注册路由`),p(`li`,null,`菜单中存在的页面用户可以正常访问，不存在的页面会跳转到 404`)],-1)])]),_:1})]),_:1}),a(W,{timestamp:`菜单显示控制`,type:`success`,size:`large`},{default:f(()=>[a(g,null,{default:f(()=>[...l[11]||(l[11]=[p(`h4`,null,`侧边栏菜单可见性`,-1),p(`p`,null,[p(`strong`,null,`前端控制模式：`)],-1),p(`ul`,null,[p(`li`,null,`有权限的用户：菜单项正常显示，可以点击访问`),p(`li`,null,`无权限的用户：菜单项不显示，无法通过菜单导航到页面`),p(`li`,null,`即使通过直接输入URL尝试访问，也会被路由守卫拦截`)],-1),p(`p`,null,[p(`strong`,null,`后端控制模式：`)],-1),p(`ul`,null,[p(`li`,null,`侧边栏菜单根据后端返回的菜单列表进行渲染`),p(`li`,null,`后端应该根据用户权限过滤，只返回用户有权限访问的菜单项`),p(`li`,null,`前端只显示后端返回的菜单，确保用户只能看到和访问有权限的页面`)],-1)])]),_:1})]),_:1})]),_:1})])]),_:1})]),p(`div`,P,[a(g,{class:`art-card-xs`},{header:f(()=>[...l[12]||(l[12]=[p(`div`,{class:`card-header`},[p(`span`,null,`权限控制最佳实践`)],-1)])]),default:f(()=>[p(`div`,F,[a(Z,{gutter:24},{default:f(()=>[a(X,{span:12,class:`!mb-5`},{default:f(()=>[p(`div`,I,[p(`div`,L,[a(Y,{size:`20`,color:`#409EFF`},{default:f(()=>[a(u(t))]),_:1})]),l[13]||(l[13]=p(`div`,null,[p(`h4`,null,`多层权限验证`),p(`p`,{class:`text-g-700 text-sm`},`在前端路由、后端接口、UI组件等多个层面实施权限控制，确保安全性。`)],-1))])]),_:1}),a(X,{span:12},{default:f(()=>[p(`div`,R,[p(`div`,z,[a(Y,{size:`20`,color:`#67C23A`},{default:f(()=>[a(u(e))]),_:1})]),l[14]||(l[14]=p(`div`,null,[p(`h4`,null,`基于角色的访问控制`),p(`p`,{class:`text-g-700 text-sm`},`采用RBAC模型，通过角色分配权限，简化权限管理复杂度。`)],-1))])]),_:1}),a(X,{span:12},{default:f(()=>[p(`div`,B,[p(`div`,V,[a(Y,{size:`20`,color:`#E6A23C`},{default:f(()=>[a(u(r))]),_:1})]),l[15]||(l[15]=p(`div`,null,[p(`h4`,null,`细粒度权限控制`),p(`p`,{class:`text-g-700 text-sm`},`支持页面级、按钮级、数据级等多种粒度的权限控制。`)],-1))])]),_:1}),a(X,{span:12},{default:f(()=>[p(`div`,H,[p(`div`,U,[a(Y,{size:`20`,color:`#F56C6C`},{default:f(()=>[a(u(n))]),_:1})]),l[16]||(l[16]=p(`div`,null,[p(`h4`,null,`安全性优先原则`),p(`p`,{class:`text-g-700 text-sm`},`始终遵循最小权限原则，确保用户只能访问必要的功能和数据。`)],-1))])]),_:1})]),_:1})])]),_:1})])])}}});export{W as default};