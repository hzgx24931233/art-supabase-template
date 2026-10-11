import{Ot as e,ft as t}from"./icon-XA0lSCKJ.js";import{Mt as n,U as r,W as i,kn as a,kt as o}from"./framework-Bwlbiqw9.js";var s={prefix:Math.floor(Math.random()*1e4),current:0},c=Symbol(`elIdInjection`),l=()=>o()?n(c,s):s,u=n=>{let o=l();!i&&o===s&&e(`IdInjection`,`Looks like you are using server rendering, you must provide a id provider to ensure the hydration process to be succeed
usage: app.provide(ID_INJECTION_KEY, {
  prefix: number,
  current: number,
})`);let c=t();return r(()=>a(n)||`${c.value}-id-${o.prefix}-${o.current++}`)};export{l as n,u as t};