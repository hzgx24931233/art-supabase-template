import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMaterialDescription,
  getMaterialDescriptionParts
} from '@/views/mdm/material/archive/modules/material-description'

const category = {
  compositionColumns: [
    'material_name',
    'drawing_no',
    'material_composition',
    'place_of_origin',
    'attribute_group'
  ],
  compositionSeparator: ' / '
}
const attributeGroup = {
  attributes: [
    { key: 'thickness', name: '厚度', values: ['0.5'], required: true, enabled: true },
    { key: 'color', name: '颜色', values: ['雪白'], required: false, enabled: true },
    { key: 'disabled', name: '停用项', values: ['忽略'], required: false, enabled: false }
  ]
}
const source = {
  materialName: '彩涂卷',
  drawingNo: 'T-100',
  materialComposition: 'G300',
  placeOfOrigin: '山东',
  attributeValues: { thickness: '0.5', color: '雪白', disabled: '忽略' }
}

test('material description follows configured field and attribute value order', () => {
  assert.deepEqual(getMaterialDescriptionParts(category, source, attributeGroup), [
    '彩涂卷',
    'T-100',
    'G300',
    '山东',
    '0.5',
    '雪白'
  ])
  assert.equal(
    buildMaterialDescription(category, source, attributeGroup),
    '彩涂卷 / T-100 / G300 / 山东 / 0.5 / 雪白'
  )
})

test('blank and unavailable fields are omitted without redundant separators', () => {
  assert.equal(
    buildMaterialDescription(
      { compositionColumns: ['material_name', 'drawing_no'], compositionSeparator: '-' },
      { materialName: '螺栓', drawingNo: ' ', attributeValues: {} }
    ),
    '螺栓'
  )
})
