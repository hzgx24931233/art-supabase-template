type Configuration = Api.SystemManage.FieldPermissionConfiguration

/**
 * 服务端只保证返回 defaultAccess 与 explicitAccess；inheritedAccess 缺失时以平台默认等级兜底，
 * 否则授权矩阵会用 undefined 去查权限等级说明并中断整页渲染。
 * 人员例外的真实继承等级需要服务端合并该用户全部角色后返回。
 */
export function normalizeFieldPermissionConfiguration(configuration: Configuration): Configuration {
  return {
    ...configuration,
    fields: configuration.fields.map((field) => ({
      ...field,
      inheritedAccess: field.inheritedAccess ?? field.defaultAccess
    }))
  }
}
