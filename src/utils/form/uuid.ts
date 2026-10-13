/**
 * UUID 标识验证模块
 *
 * 路由参数、查询参数等外部输入会在 PostgREST 绑定 uuid 参数时被数据库校验，
 * 非法值直接返回 400（22P02），因此进入业务逻辑前先做一次显式校验。
 *
 * @module utils/form/uuid
 */

/**
 * 验证字符串是否为数据库可接受的 UUID
 * @param value 待验证的值
 * @returns 返回验证结果，true 表示可作为 uuid 参数传入数据库
 * @description 数据库只要求 8-4-4-4-12 十六进制分组，不要收窄为 RFC 版本号与变体位，
 * 否则合法主键会被误判为无效值，导致对应记录无法打开。
 */
export function validateUuid(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
}
