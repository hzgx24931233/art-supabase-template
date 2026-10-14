import assert from 'node:assert/strict'
import test from 'node:test'
import { describeComponentType } from '../../src/utils/sys/error-handle'

// 渲染期崩溃会被全局 errorHandler 吞掉，日志里的组件身份是唯一定位线索，
// 因此这里锁定身份文案的取值优先级与兜底行为。
test('把组件定义描述为名称加源码文件', () => {
  assert.equal(
    describeComponentType({ __name: 'Role', __file: '/src/views/system/role/index.vue' }),
    'Role (/src/views/system/role/index.vue)'
  )
})

test('缺少 __name 时回退到 name，两者都没有则标注 anonymous', () => {
  assert.equal(describeComponentType({ name: 'ArtPageContent' }), 'ArtPageContent')
  assert.equal(describeComponentType({}), 'anonymous')
})

test('无法识别的组件定义返回 unknown', () => {
  assert.equal(describeComponentType(undefined), 'unknown')
  assert.equal(describeComponentType(null), 'unknown')
  assert.equal(describeComponentType('Backdrop'), 'unknown')
})
