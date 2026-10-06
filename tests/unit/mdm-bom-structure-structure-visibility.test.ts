import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterSingleLayerBomNodes,
  SINGLE_LAYER_FETCH_DEPTH
} from '@/views/mdm/bom/structure/modules/structure-visibility'

interface TestNode {
  nodeId: string
  parentNodeId?: string | null
  depth: number
  isVirtual: boolean
}

const node = (
  nodeId: string,
  depth: number,
  isVirtual = false,
  parentNodeId?: string
): TestNode => ({ nodeId, parentNodeId, depth, isVirtual })

test('单层模式保留根节点和全部一级子件', () => {
  const nodes = [node('root', 0), node('ordinary', 1, false, 'root')]

  assert.deepEqual(filterSingleLayerBomNodes(nodes), nodes)
})

test('单层模式仅展开一级虚拟件的二级子件', () => {
  const nodes = [
    node('root', 0),
    node('ordinary', 1, false, 'root'),
    node('ordinary-child', 2, false, 'ordinary'),
    node('virtual', 1, true, 'root'),
    node('virtual-child', 2, false, 'virtual')
  ]

  assert.deepEqual(
    filterSingleLayerBomNodes(nodes).map(({ nodeId }) => nodeId),
    ['root', 'ordinary', 'virtual', 'virtual-child']
  )
})

test('单层模式不继续展示第三级结构', () => {
  const nodes = [
    node('root', 0),
    node('virtual', 1, true, 'root'),
    node('nested-virtual', 2, true, 'virtual'),
    node('third-level', 3, false, 'nested-virtual')
  ]

  assert.equal(SINGLE_LAYER_FETCH_DEPTH, 2)
  assert.deepEqual(
    filterSingleLayerBomNodes(nodes).map(({ nodeId }) => nodeId),
    ['root', 'virtual', 'nested-virtual']
  )
})
