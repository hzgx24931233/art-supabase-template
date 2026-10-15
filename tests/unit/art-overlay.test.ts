import assert from 'node:assert/strict'
import test from 'node:test'
import {
  useArtOverlay,
  type ArtOverlayDirtySource,
  type ArtOverlayOptions,
  type ArtUnsavedPromptRequest
} from '../../src/hooks/core/useArtOverlay'

interface TestData {
  id?: string
}

type TestOptions = ArtOverlayOptions<TestData, { setLoading: (value: boolean) => void }>

const createOverlay = (
  emitError: (error: unknown) => void = () => undefined,
  onConfirmRejected?: () => void,
  confirmUnsaved?: (request: ArtUnsavedPromptRequest) => Promise<'save' | 'discard' | 'cancel'>
) => {
  let setLoading: (value: boolean) => void = () => undefined
  const overlay = useArtOverlay<TestData, { setLoading: (value: boolean) => void }, TestOptions>({
    getDefaultOptions: () => ({ autoClose: true, resetOnClose: true }),
    mergeOptions: (base, override) => ({ ...base, ...override }),
    getApi: () => ({ setLoading }),
    emitConfirm: () => undefined,
    emitReset: () => undefined,
    emitError,
    onConfirmRejected,
    confirmUnsaved
  })
  setLoading = overlay.setLoading
  return overlay
}

const createDirtySource = (initial = true) => {
  let dirty = initial
  let pristineCalls = 0
  const source: ArtOverlayDirtySource = {
    isDirty: () => dirty,
    markPristine: () => {
      pristineCalls += 1
      dirty = false
    },
    getDirtyFieldLabels: () => (dirty ? ['业务编号'] : [])
  }
  return {
    source,
    setDirty: (value: boolean) => {
      dirty = value
    },
    get pristineCalls() {
      return pristineCalls
    }
  }
}

test('closing an overlay invalidates a pending open callback and suppresses its stale error', async () => {
  const errors: unknown[] = []
  const overlay = createOverlay((error) => errors.push(error))
  let rejectOpen: ((error: Error) => void) | undefined

  const opening = overlay.handleOpen(
    { id: 'first' },
    {
      onOpen: () =>
        new Promise<void>((_resolve, reject) => {
          rejectOpen = reject
        })
    }
  )
  await Promise.resolve()
  await overlay.handleClose(true)
  rejectOpen?.(new Error('stale load failed'))
  await opening

  assert.equal(overlay.visible.value, false)
  assert.deepEqual(errors, [])
})

test('confirm locking prevents duplicate side effects while a submit is pending', async () => {
  const overlay = createOverlay()
  let submitCount = 0
  let finishSubmit: (() => void) | undefined

  await overlay.handleOpen(
    { id: 'submit' },
    {
      onConfirm: () =>
        new Promise<void>((resolve) => {
          submitCount += 1
          finishSubmit = resolve
        })
    }
  )
  const first = overlay.handleConfirm()
  const second = await overlay.handleConfirm()
  finishSubmit?.()

  assert.equal(second, false)
  assert.equal(await first, true)
  assert.equal(submitCount, 1)
})

test('confirm overlay appears only after the delayed threshold and clears after success', async () => {
  const overlay = createOverlay()
  let finishSubmit: (() => void) | undefined

  await overlay.handleOpen(
    {},
    {
      onConfirm: () =>
        new Promise<void>((resolve) => {
          finishSubmit = resolve
        })
    }
  )

  const pending = overlay.handleConfirm()
  assert.equal(overlay.confirmLoading.value, true)
  assert.equal(overlay.confirmOverlayLoading.value, false)

  await new Promise((resolve) => setTimeout(resolve, 240))
  assert.equal(overlay.confirmOverlayLoading.value, true)

  finishSubmit?.()
  assert.equal(await pending, true)
  assert.equal(overlay.confirmLoading.value, false)
  assert.equal(overlay.confirmOverlayLoading.value, false)
})

test('fast confirmation never leaves a stale confirm overlay', async () => {
  const overlay = createOverlay()
  await overlay.handleOpen({}, { onConfirm: async () => undefined })

  assert.equal(await overlay.handleConfirm(), true)
  await new Promise((resolve) => setTimeout(resolve, 240))
  assert.equal(overlay.confirmOverlayLoading.value, false)
})

test('pristine edit confirmation skips the submit callback and closes', async () => {
  const overlay = createOverlay()
  const form = createDirtySource(false)
  overlay.registerDirtySource(form.source)
  let submitCount = 0

  await overlay.handleOpen(
    { id: 'existing-document' },
    {
      skipConfirmWhenPristine: true,
      onConfirm: () => {
        submitCount += 1
      }
    }
  )

  assert.equal(await overlay.handleConfirm(), true)
  assert.equal(submitCount, 0)
  assert.equal(overlay.visible.value, false)
})

test('changed edit confirmation still submits when pristine skipping is enabled', async () => {
  const overlay = createOverlay()
  const form = createDirtySource(false)
  overlay.registerDirtySource(form.source)
  let submitCount = 0

  await overlay.handleOpen(
    { id: 'existing-document' },
    {
      skipConfirmWhenPristine: true,
      onConfirm: () => {
        submitCount += 1
      }
    }
  )
  form.setDirty(true)

  assert.equal(await overlay.handleConfirm(), true)
  assert.equal(submitCount, 1)
  assert.equal(overlay.visible.value, false)
})

test('pristine skipping is opt-in and respects autoClose false', async () => {
  const overlay = createOverlay()
  const form = createDirtySource(false)
  overlay.registerDirtySource(form.source)
  let submitCount = 0

  await overlay.handleOpen(
    { id: 'existing-document' },
    {
      autoClose: false,
      skipConfirmWhenPristine: true,
      onConfirm: () => {
        submitCount += 1
      }
    }
  )

  assert.equal(await overlay.handleConfirm(), true)
  assert.equal(submitCount, 0)
  assert.equal(overlay.visible.value, true)

  await overlay.handleOpen(
    { id: 'existing-document' },
    {
      onConfirm: () => {
        submitCount += 1
      }
    }
  )
  assert.equal(await overlay.handleConfirm(), true)
  assert.equal(submitCount, 1)
})

test('invalid confirmation requests field focus and leaves the overlay available for correction', async () => {
  let focusRequests = 0
  const overlay = createOverlay(undefined, () => {
    focusRequests += 1
  })
  await overlay.handleOpen({}, { onConfirm: () => false })

  assert.equal(await overlay.handleConfirm(), false)
  assert.equal(focusRequests, 1)
  assert.equal(overlay.visible.value, true)
  assert.equal(overlay.confirmLoading.value, false)
})

test('rejected validation requests focus unless the overlay closes on error', async () => {
  let focusRequests = 0
  const errors: unknown[] = []
  const overlay = createOverlay(
    (error) => errors.push(error),
    () => {
      focusRequests += 1
    }
  )
  const failure = new Error('invalid form')
  const onConfirm = () => {
    throw failure
  }
  await overlay.handleOpen({}, { onConfirm })
  assert.equal(await overlay.handleConfirm(), false)
  assert.equal(focusRequests, 1)
  assert.equal(overlay.visible.value, true)

  overlay.setOptions({ closeOnConfirmError: true })
  assert.equal(await overlay.handleConfirm(), false)
  assert.equal(focusRequests, 1)
  assert.equal(overlay.visible.value, false)
  assert.equal(overlay.confirmLoading.value, false)
  assert.deepEqual(errors, [failure, failure])
})

test('registered dirty sources drive isDirty and markPristine', async () => {
  const overlay = createOverlay()
  const form = createDirtySource(false)
  const unregister = overlay.registerDirtySource(form.source)

  assert.equal(overlay.isDirty(), false)
  form.setDirty(true)
  assert.equal(overlay.isDirty(), true)
  assert.deepEqual(overlay.getDirtyFieldLabels(), ['业务编号'])

  overlay.markPristine()
  assert.equal(form.pristineCalls, 1)
  assert.equal(overlay.isDirty(), false)

  unregister()
  form.setDirty(true)
  assert.equal(overlay.isDirty(), false)
})

test('closing with unsaved changes asks before closing and saves on request', async () => {
  const requests: ArtUnsavedPromptRequest[] = []
  const overlay = createOverlay(undefined, undefined, async (request) => {
    requests.push(request)
    return 'save'
  })
  const form = createDirtySource(false)
  overlay.registerDirtySource(form.source)

  let submitCount = 0
  await overlay.handleOpen(
    { id: 'document' },
    {
      confirmOnClose: true,
      onConfirm: () => {
        submitCount += 1
      }
    }
  )
  form.setDirty(true)

  assert.equal(await overlay.handleClose(), true)
  assert.equal(submitCount, 1)
  assert.equal(form.pristineCalls, 1)
  assert.equal(overlay.visible.value, false)
  assert.deepEqual(requests, [{ message: '表单内容已修改，是否保存后关闭？', allowCancel: true }])
})

test('discarding unsaved changes closes without submitting', async () => {
  const overlay = createOverlay(undefined, undefined, async () => 'discard')
  const form = createDirtySource(true)
  overlay.registerDirtySource(form.source)

  let submitCount = 0
  await overlay.handleOpen(
    { id: 'document' },
    { confirmOnClose: true, onConfirm: () => (submitCount += 1) }
  )

  assert.equal(await overlay.handleClose(), true)
  assert.equal(submitCount, 0)
  assert.equal(overlay.visible.value, false)
})

test('cancelling the unsaved prompt keeps the overlay open', async () => {
  const overlay = createOverlay(undefined, undefined, async () => 'cancel')
  const form = createDirtySource(true)
  overlay.registerDirtySource(form.source)
  let closeCalls = 0

  await overlay.handleOpen(
    { id: 'document' },
    {
      confirmOnClose: true,
      onClose: () => {
        closeCalls += 1
      }
    }
  )

  assert.equal(await overlay.handleClose(), false)
  assert.equal(overlay.visible.value, true)
  assert.equal(closeCalls, 0)
})

test('a failed save keeps the overlay open and preserves the unsaved state', async () => {
  const overlay = createOverlay(undefined, undefined, async () => 'save')
  const form = createDirtySource(true)
  overlay.registerDirtySource(form.source)

  await overlay.handleOpen({ id: 'document' }, { confirmOnClose: true, onConfirm: () => false })
  assert.equal(await overlay.handleClose(), false)
  assert.equal(overlay.visible.value, true)
  assert.equal(overlay.isDirty(), true)
  assert.equal(overlay.confirmLoading.value, false)
})

test('forced closes and pristine documents skip the unsaved prompt', async () => {
  let promptCount = 0
  const overlay = createOverlay(undefined, undefined, async () => {
    promptCount += 1
    return 'cancel'
  })
  const form = createDirtySource(false)
  overlay.registerDirtySource(form.source)

  await overlay.handleOpen({ id: 'document' }, { confirmOnClose: true })
  form.setDirty(true)

  assert.equal(await overlay.handleClose(true), true)
  assert.equal(promptCount, 0)

  await overlay.handleOpen({ id: 'document' }, { confirmOnClose: true })
  form.setDirty(false)
  assert.equal(await overlay.handleClose(), true)
  assert.equal(promptCount, 0)
})

test('content loading and an enabled prompt without unsaved changes never interrupt closing', async () => {
  let promptCount = 0
  const overlay = createOverlay(undefined, undefined, async () => {
    promptCount += 1
    return 'cancel'
  })
  const form = createDirtySource(true)
  overlay.registerDirtySource(form.source)

  await overlay.handleOpen({ id: 'document' }, { confirmOnClose: true, loading: true })
  assert.equal(await overlay.handleClose(), true)
  assert.equal(promptCount, 0)

  await overlay.handleOpen({ id: 'document' }, { confirmOnClose: false })
  assert.equal(await overlay.handleClose(), true)
  assert.equal(promptCount, 0)
})

test('closing during a route change keeps the prompt but does not offer cancel', async () => {
  const requests: ArtUnsavedPromptRequest[] = []
  const overlay = createOverlay(undefined, undefined, async (request) => {
    requests.push(request)
    return 'discard'
  })
  const form = createDirtySource(true)
  overlay.registerDirtySource(form.source)

  await overlay.handleOpen({ id: 'document' }, { confirmOnClose: true })
  assert.equal(await overlay.confirmUnsavedClose(false), true)

  assert.deepEqual(requests, [{ message: '表单内容已修改，是否保存后关闭？', allowCancel: false }])
})

test('a business-provided isDirty predicate participates in the unsaved guard', async () => {
  let customDirty = false
  let promptCount = 0
  const overlay = createOverlay(undefined, undefined, async () => {
    promptCount += 1
    return 'discard'
  })

  await overlay.handleOpen(
    { id: 'document' },
    {
      confirmOnClose: true,
      isDirty: () => customDirty
    }
  )

  assert.equal(await overlay.handleClose(), true)
  assert.equal(promptCount, 0)

  await overlay.handleOpen(
    { id: 'document' },
    {
      confirmOnClose: true,
      isDirty: () => customDirty
    }
  )
  customDirty = true
  assert.equal(overlay.isDirty(), true)
  assert.equal(await overlay.handleClose(), true)
  assert.equal(promptCount, 1)
})
