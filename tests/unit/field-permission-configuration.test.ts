import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeFieldPermissionConfiguration } from '../../src/views/system/field-permission/modules/field-permission-configuration'

/**
 * 服务端 get_field_permission_configuration 的实际 payload：字段里没有 inheritedAccess，
 * 只有平台默认等级和可选的显式授权，用于还原运行时形状。
 */
type ServerFieldPayload = Omit<Api.SystemManage.FieldPermissionField, 'inheritedAccess'> & {
  inheritedAccess?: Api.Common.FieldAccessLevel | null
}

const buildConfiguration = (
  fields: ServerFieldPayload[]
): Api.SystemManage.FieldPermissionConfiguration =>
  // 运行时的服务端 payload 不满足前端声明的字段形状，这里刻意按上报形状构造再断言归一化结果。
  ({
    resourceId: 'resource-1',
    resourceKey: 'mdm-employee',
    resourceLabel: '员工档案',
    subjectType: 'role',
    subjectId: 'role-1',
    fields
  }) as Api.SystemManage.FieldPermissionConfiguration

test('missing inheritedAccess falls back to the platform default level', () => {
  const payload = buildConfiguration([
    {
      id: 'field-phone',
      fieldKey: 'contactPhone',
      fieldLabel: '联系电话',
      defaultAccess: 'hidden',
      ownerOverrideEnabled: true,
      explicitAccess: 'masked'
    },
    {
      id: 'field-amount',
      fieldKey: 'contractAmount',
      fieldLabel: '合同金额',
      defaultAccess: 'read',
      ownerOverrideEnabled: false
    }
  ])

  const normalized = normalizeFieldPermissionConfiguration(payload)

  assert.deepEqual(
    normalized.fields.map((field) => field.inheritedAccess),
    ['hidden', 'read']
  )
  assert.equal(normalized.fields[0]?.explicitAccess, 'masked')
  assert.equal(normalized.resourceLabel, '员工档案')
  assert.equal(
    'inheritedAccess' in payload.fields[0]!,
    false,
    'the received payload must stay untouched'
  )
})

test('server-provided inheritedAccess wins over the platform default level', () => {
  const normalized = normalizeFieldPermissionConfiguration(
    buildConfiguration([
      {
        id: 'field-phone',
        fieldKey: 'contactPhone',
        fieldLabel: '联系电话',
        defaultAccess: 'hidden',
        inheritedAccess: 'read',
        ownerOverrideEnabled: true
      }
    ])
  )

  assert.equal(normalized.fields[0]?.inheritedAccess, 'read')
})

test('null inheritedAccess falls back to the platform default level', () => {
  const normalized = normalizeFieldPermissionConfiguration(
    buildConfiguration([
      {
        id: 'field-phone',
        fieldKey: 'contactPhone',
        fieldLabel: '联系电话',
        defaultAccess: 'edit',
        inheritedAccess: null,
        ownerOverrideEnabled: true
      }
    ])
  )

  assert.equal(normalized.fields[0]?.inheritedAccess, 'edit')
})
