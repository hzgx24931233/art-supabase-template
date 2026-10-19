import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildWbsTree,
  flattenWbsTree,
  hasWbsCycle,
  nextWbsCode
} from '../../modules/art-supabase-pm/src/views/wbs/wbs-model'
import type { WbsNode } from '../../modules/art-supabase-pm/src/types/wbs'

const node = (
  id: string,
  parent_id: string | null,
  sort_order: number,
  wbs_code: string
): WbsNode => ({
  id,
  version_id: 'version',
  parent_id,
  sort_order,
  wbs_code,
  custom_code: null,
  name: id,
  description: null,
  deliverable_summary: null,
  quantity: null,
  unit: null,
  planned_quantity: null,
  budget_cost: null,
  responsible_department: null,
  responsible_person: null,
  quality_standard: null,
  is_milestone: false,
  status: 'active',
  metadata: {}
})

test('builds and flattens a sorted WBS tree', () => {
  const tree = buildWbsTree([
    node('child', 'root', 1, '1.1'),
    node('root', null, 2, '1'),
    node('other', null, 1, '2')
  ])
  assert.deepEqual(
    tree.map((item) => item.id),
    ['other', 'root']
  )
  assert.equal(tree[1].children[0].id, 'child')
  assert.deepEqual(
    flattenWbsTree(tree).map((item) => item.id),
    ['other', 'root', 'child']
  )
})

test('detects moving a node below itself and generates sibling codes', () => {
  const nodes = [node('root', null, 0, '1'), node('child', 'root', 0, '1.1')]
  assert.equal(hasWbsCycle(nodes, 'root', 'child'), true)
  assert.equal(hasWbsCycle(nodes, 'child', null), false)
  assert.equal(nextWbsCode(nodes, 'root'), '1.2')
  assert.equal(nextWbsCode(nodes, null), '2')
})
