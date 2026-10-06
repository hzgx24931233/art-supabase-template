import assert from 'node:assert/strict'
import test from 'node:test'
import { filterBomStructureNodes } from '@/views/mdm/bom/structure/modules/structure-search'

interface TestNode {
  depth: number
  materialCode: string
  materialName: string
  specificationModel?: string | null
  drawingNo?: string | null
}

const nodes: TestNode[] = [
  {
    depth: 0,
    materialCode: 'C00-0007',
    materialName: '100MN多向模锻液压机',
    specificationModel: 'THP13-10000 5000X2',
    drawingNo: 'ROOT-001'
  },
  {
    depth: 1,
    materialCode: 'B00-0008',
    materialName: '机械板块',
    specificationModel: 'THP13-10000',
    drawingNo: 'JX-100'
  },
  {
    depth: 2,
    materialCode: 'R00-0013',
    materialName: '内六角螺钉',
    specificationModel: 'M10X30',
    drawingNo: null
  }
]

test('空查询保留全部 BOM 节点', () => {
  assert.deepEqual(filterBomStructureNodes(nodes, '   '), nodes)
})

test('综合查询覆盖层级、编码、名称、规格型号和图号', () => {
  assert.deepEqual(filterBomStructureNodes(nodes, '根级'), [nodes[0]])
  assert.deepEqual(filterBomStructureNodes(nodes, '第 1 层'), [nodes[1]])
  assert.deepEqual(filterBomStructureNodes(nodes, 'R00-0013'), [nodes[2]])
  assert.deepEqual(filterBomStructureNodes(nodes, '机械板块'), [nodes[1]])
  assert.deepEqual(filterBomStructureNodes(nodes, 'm10x30'), [nodes[2]])
  assert.deepEqual(filterBomStructureNodes(nodes, 'jx-100'), [nodes[1]])
})

test('多个关键词可以跨字段组合匹配', () => {
  assert.deepEqual(filterBomStructureNodes(nodes, '第1层 B00 JX'), [nodes[1]])
  assert.deepEqual(filterBomStructureNodes(nodes, '第1层 R00'), [])
})
