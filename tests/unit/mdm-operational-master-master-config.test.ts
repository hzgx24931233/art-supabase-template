import assert from 'node:assert/strict'
import test from 'node:test'
import { uniq } from 'lodash-es'
import { resolveMasterConfig } from '@/views/mdm/operational-master/modules/master-config'

const masterKinds = [
  'customer',
  'project',
  'activity-formula',
  'operation-control-code',
  'operation',
  'workstation'
]

test('every operational master field belongs to exactly one form section', () => {
  for (const kind of masterKinds) {
    const config = resolveMasterConfig(`/mdm/${kind}`)
    const configuredFieldKeys = config.fields.map((field) => String(field.key)).sort()
    const sectionFieldKeys = config.formSections
      .flatMap((section) => section.fieldKeys)
      .map(String)
      .sort()

    assert.deepEqual(sectionFieldKeys, configuredFieldKeys, `${kind} form sections are incomplete`)
    assert.equal(
      uniq(sectionFieldKeys).length,
      sectionFieldKeys.length,
      `${kind} form sections contain duplicate fields`
    )
    assert.equal(
      uniq(config.formSections.map((section) => section.key)).length,
      config.formSections.length,
      `${kind} form section keys must be unique`
    )
    assert.ok(
      config.formSections.every((section) => section.title.trim() && section.description.trim()),
      `${kind} form sections require useful titles and descriptions`
    )
  }
})
