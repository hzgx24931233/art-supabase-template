/** 开发环境下在控制台输出的启动横幅，派生项目可替换成自己的品牌文案。 */
const asciiArt = `
\x1b[32m管理平台已启动
\x1b[0m
\x1b[36m开发模式已启用：接口代理、源码映射与调试工具均已就绪。
\x1b[0m
`

if (import.meta.env.DEV) {
  console.log(asciiArt)
}
