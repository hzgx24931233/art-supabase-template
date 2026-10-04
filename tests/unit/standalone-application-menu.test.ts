import assert from 'node:assert/strict'
import test from 'node:test'
import type { AppRouteRecord } from '../../src/types/router'
import {
  buildApplicationMenuTree,
  flattenStandaloneApplicationMenu
} from '../../src/router/core/applicationMenu'

const fmsMenu: AppRouteRecord[] = [
  {
    name: 'FmsRoot',
    path: '/fms',
    component: '/index/index',
    meta: { title: 'FMS财务管理' },
    children: [
      {
        name: 'FinanceAccountSet',
        path: '/fms/accounting/account-set',
        component: '/fms/accounting/account-set/index',
        meta: { title: '账套管理' }
      },
      {
        name: 'Settlement',
        path: '/fms/settlement',
        meta: { title: '结算管理' },
        children: [
          {
            name: 'FinanceCashTransaction',
            path: '/fms/settlement/cash-transaction',
            component: '/fms/settlement/cash-transaction/index',
            meta: { title: '收付款流水' }
          }
        ]
      }
    ]
  }
]

test('keeps application directories in the platform panoramic menu', () => {
  assert.deepEqual(flattenStandaloneApplicationMenu(fmsMenu, 'platform'), fmsMenu)
})

test('promotes application children without changing stable route paths in standalone mode', () => {
  const flattened = flattenStandaloneApplicationMenu(fmsMenu, 'fms')

  assert.equal(flattened.length, 2)
  assert.equal(flattened[0]?.meta.title, '账套管理')
  assert.equal(flattened[0]?.path, '/fms/accounting/account-set')
  assert.equal(flattened[1]?.meta.title, '结算管理')
  assert.equal(flattened[1]?.component, '/index/index')
})

test('rebuilds authorized menu trees in sorted order without adding ungranted siblings', () => {
  const flat: AppRouteRecord[] = [
    { id: 'root', parentId: null, name: 'Root', path: '/fms', meta: { title: 'FMS' } },
    { id: 'other', parentId: null, name: 'Other', path: '/other', meta: { title: 'Other' } },
    { id: 'child', parentId: 'root', name: 'Child', path: 'child', meta: { title: 'Child' } },
    { id: 'button', parentId: 'child', name: 'Child:View', path: '', meta: { title: 'View' } },
    {
      id: 'orphan',
      parentId: 'not-granted',
      name: 'Orphan',
      path: 'orphan',
      meta: { title: 'Orphan' }
    }
  ]

  const tree = buildApplicationMenuTree(flat)
  assert.deepEqual(
    tree.map((item) => item.id),
    ['root', 'other', 'orphan']
  )
  assert.deepEqual(
    tree[0]?.children?.map((item) => item.id),
    ['child']
  )
  assert.deepEqual(
    tree[0]?.children?.[0]?.children?.map((item) => item.id),
    ['button']
  )
  assert.deepEqual(tree[1]?.children, [])
  assert.equal('children' in flat[0], false)
})
