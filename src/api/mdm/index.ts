/**
 * 主数据（MDM）数据访问层
 *
 * 归属主平台的「物料 / 工程 / 销售 / 生产」四块主数据，页面位于 `src/views/mdm/**`。
 * 仅导出这四块实际使用的领域模块；库存、治理、统一目录、供应商等未并入的应用模块不在此处。
 */
export * from './production'
export * from './shift-scheduling'
export * from './workspaces'
export * from './material'
export * from './bom'
export * from './component-type'
export * from './esop'
export * from './equipment'
export * from './operational-master'
export * from './document-type'
export * from './business-type'
export * from './accessory-processing'
