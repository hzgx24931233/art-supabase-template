import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildProjectOrgEdges,
  countExpiringCertificates
} from '../../modules/art-supabase-pm/src/views/project-organization/project-organization-model'
import type {
  ProjectOrgAssignment,
  ProjectOrgNode
} from '../../modules/art-supabase-pm/src/types/project-organization'

const node = (id: string, parent_id: string | null): ProjectOrgNode => ({
  id,
  version_id: 'version',
  parent_id,
  node_type: 'department',
  group_type: 'internal',
  node_code: null,
  node_name: id,
  sort_order: 0,
  layout: {},
  metadata: {}
})

test('buildProjectOrgEdges only creates edges for child nodes', () => {
  assert.deepEqual(buildProjectOrgEdges([node('root', null), node('child', 'root')]), [
    { id: 'root-child', source: 'root', target: 'child' }
  ])
})

test('buildProjectOrgEdges ignores nodes whose parent is not in the selected version', () => {
  assert.deepEqual(buildProjectOrgEdges([node('orphan', 'other-version-root')]), [])
})

test('countExpiringCertificates ignores ended people and certificates outside the window', () => {
  const assignments = [
    { status: 'active', certificate_expires_on: '2026-11-01' },
    { status: 'active', certificate_expires_on: '2027-12-01' },
    { status: 'ended', certificate_expires_on: '2026-10-20' }
  ] as ProjectOrgAssignment[]
  assert.equal(countExpiringCertificates(assignments, Date.parse('2026-10-18')), 1)
})
