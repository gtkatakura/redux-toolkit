import {
  createAsyncThunk,
  miniSerializeError,
  unwrapResult,
} from './createAsyncThunk'
import { configureStore } from './configureStore'
import { AnyAction } from 'redux'

import {
  mockConsole,
  createConsole,
  getLog,
} from 'console-testing-library/pure'

declare global {
  interface Window {
    AbortController: AbortController
  }
}

describe('createAsyncThunk', () => {
  it('creates the action types', () => {
    const thunkActionCreator = createAsyncThunk('testType', async () => 42)

    expect(thunkActionCreator.fulfilled.type).toBe('testType/fulfilled')
    expect(thunkActionCreator.pending.type).toBe('testType/pending')
    expect(thunkActionCreator.rejected.type).toBe('testType/rejected')
  })

  it('exposes the typePrefix it was created with', () => {
    const thunkActionCreator = createAsyncThunk('testType', async () => 42)

    expect(thunkActionCreator.typePrefix).toBe('testType')
  })

  it('works without passing arguments to the payload creator', async () => {
    const thunkActionCreator = createAsyncThunk('testType', async () => 42)

    let timesReducerCalled = 0

    const reducer = () => {
      timesReducerCalled++
    }

    const store = configureStore({
      reducer,
    })

    // reset from however many times the store called it
    timesReducerCalled = 0

    await store.dispatch(thunkActionCreator())

    expect(timesReducerCalled).toBe(2)
  })

  it('accepts arguments and dispatches the actions on resolve', async () => {
    const dispatch = jest.fn()

    let passedArg: any

    const result = 42
    const args = 123
    let generatedRequestId = ''

    const thunkActionCreator = createAsyncThunk(
      'testType',
      async (arg: number, { requestId }) => {
        passedArg = arg
        generatedRequestId = requestId
        return result
      }
    )

    const thunkFunction = thunkActionCreator(args)

    const thunkPromise = thunkFunction(dispatch, () => {}, undefined)

    expect(thunkPromise.requestId).toBe(generatedRequestId)
    expect(thunkPromise.arg).toBe(args)

    await thunkPromise

    expect(passedArg).toBe(args)

    expect(dispatch).toHaveBeenNthCalledWith(
      1,
      thunkActionCreator.pending(generatedRequestId, args)
    )

    expect(dispatch).toHaveBeenNthCalledWith(
      2,
      thunkActionCreator.fulfilled(result, generatedRequestId, args)
    )
  })

  it('accepts arguments and dispatches the actions on reject', async () => {
    const dispatch = jest.fn()

    const args = 123
    let generatedRequestId = ''

    const error = new Error('Panic!')

    const thunkActionCreator = createAsyncThunk(
      'testType',
      async (args: number, { requestId }) => {
        generatedRequestId = requestId
        throw error
      }
    )

    const thunkFunction = thunkActionCreator(args)

    try {
      await thunkFunction(dispatch, () => {}, undefined)
    } catch (e) {}

    expect(dispatch).toHaveBeenNthCalledWith(
      1,
      thunkActionCreator.pending(generatedRequestId, args)
    )

    expect(dispatch).toHaveBeenCalledTimes(2)

    // Have to check the bits of the action separately since the error was processed
    const errorAction = dispatch.mock.calls[1][0]
    expect(errorAction.error).toEqual(miniSerializeError(error))
    expect(errorAction.meta.requestId).toBe(generatedRequestId)
    expect(errorAction.meta.arg).toBe(args)
  })

  it('dispatches an empty error when throwing a random object without serializedError properties', async () => {
    const dispatch = jest.fn()

    const args = 123
    let generatedRequestId = ''

    const errorObject = { wny: 'dothis' }

    const thunkActionCreator = createAsyncThunk(
      'testType',
      async (args: number, { requestId }) => {
        generatedRequestId = requestId
        throw errorObject
      }
    )

    const thunkFunction = thunkActionCreator(args)

    try {
      await thunkFunction(dispatch, () => {}, undefined)
    } catch (e) {}

    expect(dispatch).toHaveBeenNthCalledWith(
      1,
      thunkActionCreator.pending(generatedRequestId, args)
    )

    expect(dispatch).toHaveBeenCalledTimes(2)

    const errorAction = dispatch.mock.calls[1][0]
    expect(errorAction.error).toEqual({})
    expect(errorAction.meta.requestId).toBe(generatedRequestId)
    expect(errorAction.meta.arg).toBe(args)
  })

  it('dispatches an action with a formatted error when throwing an object with known error keys', async () => {
    const dispatch = jest.fn()

    const args = 123
    let generatedRequestId = ''

    const errorObject = {
      name: 'Custom thrown error',
      message: 'This is not necessary',
      code: '400',
    }

    const thunkActionCreator = createAsyncThunk(
      'testType',
      async (args: number, { requestId }) => {
        generatedRequestId = requestId
        throw errorObject
      }
    )

    const thunkFunction = thunkActionCreator(args)

    try {
      await thunkFunction(dispatch, () => {}, undefined)
    } catch (e) {}

    expect(dispatch).toHaveBeenNthCalledWith(
      1,
      thunkActionCreator.pending(generatedRequestId, args)
    )

    expect(dispatch).toHaveBeenCalledTimes(2)

    // Have to check the bits of the action separately since the error was processed
    const errorAction = dispatch.mock.calls[1][0]
    expect(errorAction.error).toEqual(miniSerializeError(errorObject))
    expect(Object.keys(errorAction.error)).not.toContain('stack')
    expect(errorAction.meta.requestId).toBe(generatedRequestId)
    expect(errorAction.meta.arg).toBe(args)
  })

  it('dispatches a rejected action with a customized payload when a user returns rejectWithValue()', async () => {
    const dispatch = jest.fn()

    const args = 123
    let generatedRequestId = ''

    const errorPayload = {
      errorMessage:
        'I am a fake server-provided 400 payload with validation details',
      errors: [
        { field_one: 'Must be a string' },
        { field_two: 'Must be a number' },
      ],
    }

    const thunkActionCreator = createAsyncThunk(
      'testType',
      async (args: number, { requestId, rejectWithValue }) => {
        generatedRequestId = requestId

        return rejectWithValue(errorPayload)
      }
    )

    const thunkFunction = thunkActionCreator(args)

    try {
      await thunkFunction(dispatch, () => {}, undefined)
    } catch (e) {}

    expect(dispatch).toHaveBeenNthCalledWith(
      1,
      thunkActionCreator.pending(generatedRequestId, args)
    )

    expect(dispatch).toHaveBeenCalledTimes(2)

    // Have to check the bits of the action separately since the error was processed
    const errorAction = dispatch.mock.calls[1][0]

    expect(errorAction.error.message).toEqual('Rejected')
    expect(errorAction.payload).toBe(errorPayload)
    expect(errorAction.meta.arg).toBe(args)
  })

  it('dispatches a rejected action with a miniSerializeError when rejectWithValue conditions are not satisfied', async () => {
    const dispatch = jest.fn()

    const args = 123
    let generatedRequestId = ''

    const error = new Error('Panic!')

    const errorPayload = {
      errorMessage:
        'I am a fake server-provided 400 payload with validation details',
      errors: [
        { field_one: 'Must be a string' },
        { field_two: 'Must be a number' },
      ],
    }

    const thunkActionCreator = createAsyncThunk(
      'testType',
      async (args: number, { requestId, rejectWithValue }) => {
        generatedRequestId = requestId

        try {
          throw error
        } catch (err) {
          if (!err.response) {
            throw err
          }
          return rejectWithValue(errorPayload)
        }
      }
    )

    const thunkFunction = thunkActionCreator(args)

    try {
      await thunkFunction(dispatch, () => {}, undefined)
    } catch (e) {}

    expect(dispatch).toHaveBeenNthCalledWith(
      1,
      thunkActionCreator.pending(generatedRequestId, args)
    )

    expect(dispatch).toHaveBeenCalledTimes(2)

    // Have to check the bits of the action separately since the error was processed
    const errorAction = dispatch.mock.calls[1][0]
    expect(errorAction.error).toEqual(miniSerializeError(error))
    expect(errorAction.payload).toEqual(undefined)
    expect(errorAction.meta.requestId).toBe(generatedRequestId)
    expect(errorAction.meta.arg).toBe(args)
  })
})

describe('createAsyncThunk with abortController', () => {
  const asyncThunk = createAsyncThunk(
    'test',
    function abortablePayloadCreator(_: any, { signal }) {
      return new Promise((resolve, reject) => {
        if (signal.aborted) {
          reject(
            new DOMException(
              'This should never be reached as it should already be handled.',
              'AbortError'
            )
          )
        }
        signal.addEventListener('abort', () => {
          reject(new DOMException('Was aborted while running', 'AbortError'))
        })
        setTimeout(resolve, 100)
      })
    }
  )

  let store = configureStore({
    reducer(store: AnyAction[] = []) {
      return store
    },
  })

  beforeEach(() => {
    store = configureStore({
      reducer(store: AnyAction[] = [], action) {
        return [...store, action]
      },
    })
  })

  test('normal usage', async () => {
    await store.dispatch(asyncThunk({}))
    expect(store.getState()).toEqual([
      expect.any(Object),
      expect.objectContaining({ type: 'test/pending' }),
      expect.objectContaining({ type: 'test/fulfilled' }),
    ])
  })

  test('abort after dispatch', async () => {
    const promise = store.dispatch(asyncThunk({}))
    promise.abort('AbortReason')
    const result = await promise
    const expectedAbortedAction = {
      type: 'test/rejected',
      error: {
        message: 'AbortReason',
        name: 'AbortError',
      },
      meta: { aborted: true, requestId: promise.requestId },
    }

    // abortedAction with reason is dispatched after test/pending is dispatched
    expect(store.getState()).toMatchObject([
      {},
      { type: 'test/pending' },
      expectedAbortedAction,
    ])

    // same abortedAction is returned, but with the AbortError from the abortablePayloadCreator
    expect(result).toMatchObject(expectedAbortedAction)

    // calling unwrapResult on the returned object re-throws the error from the abortablePayloadCreator
    expect(() => unwrapResult(result)).toThrowError(
      expect.objectContaining(expectedAbortedAction.error)
    )
  })

  test('even when the payloadCreator does not directly support the signal, no further actions are dispatched', async () => {
    const unawareAsyncThunk = createAsyncThunk('unaware', async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))
      return 'finished'
    })

    const promise = store.dispatch(unawareAsyncThunk())
    promise.abort('AbortReason')
    const result = await promise

    const expectedAbortedAction = {
      type: 'unaware/rejected',
      error: {
        message: 'AbortReason',
        name: 'AbortError',
      },
    }

    // abortedAction with reason is dispatched after test/pending is dispatched
    expect(store.getState()).toEqual([
      expect.any(Object),
      expect.objectContaining({ type: 'unaware/pending' }),
      expect.objectContaining(expectedAbortedAction),
    ])

    // same abortedAction is returned, but with the AbortError from the abortablePayloadCreator
    expect(result).toMatchObject(expectedAbortedAction)

    // calling unwrapResult on the returned object re-throws the error from the abortablePayloadCreator
    expect(() => unwrapResult(result)).toThrowError(
      expect.objectContaining(expectedAbortedAction.error)
    )
  })

  test('dispatch(asyncThunk) returns on abort and does not wait for the promiseProvider to finish', async () => {
    let running = false
    const longRunningAsyncThunk = createAsyncThunk('longRunning', async () => {
      running = true
      await new Promise((resolve) => setTimeout(resolve, 30000))
      running = false
    })

    const promise = store.dispatch(longRunningAsyncThunk())
    expect(running).toBeTruthy()
    promise.abort()
    const result = await promise
    expect(running).toBeTruthy()
    expect(result).toMatchObject({
      type: 'longRunning/rejected',
      error: { message: 'Aborted', name: 'AbortError' },
      meta: { aborted: true },
    })
  })

  describe('behaviour with missing AbortController', () => {
    let keepAbortController: typeof window['AbortController']
    let freshlyLoadedModule: typeof import('./createAsyncThunk')
    let restore: () => void
    let nodeEnv: string

    beforeEach(() => {
      keepAbortController = window.AbortController
      delete (window as any).AbortController
      jest.resetModules()
      freshlyLoadedModule = require('./createAsyncThunk')
      restore = mockConsole(createConsole())
      nodeEnv = process.env.NODE_ENV!
      process.env.NODE_ENV = 'development'
    })

    afterEach(() => {
      process.env.NODE_ENV = nodeEnv
      restore()
      window.AbortController = keepAbortController
      jest.resetModules()
    })

    test('calling `abort` on an asyncThunk works with a FallbackAbortController if no global abortController is not available', async () => {
      const longRunningAsyncThunk = freshlyLoadedModule.createAsyncThunk(
        'longRunning',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 30000))
        }
      )

      store.dispatch(longRunningAsyncThunk()).abort()
      // should only log once, even if called twice
      store.dispatch(longRunningAsyncThunk()).abort()

      expect(getLog().log).toMatchInlineSnapshot(`
        "This platform does not implement AbortController. 
        If you want to use the AbortController to react to \`abort\` events, please consider importing a polyfill like 'abortcontroller-polyfill/dist/abortcontroller-polyfill-only'."
      `)
    })
  })
})

test('non-serializable arguments are ignored by serializableStateInvariantMiddleware', async () => {
  const restore = mockConsole(createConsole())
  const nonSerializableValue = new Map()
  const asyncThunk = createAsyncThunk('test', (arg: Map<any, any>) => {})

  configureStore({
    reducer: () => 0,
  }).dispatch(asyncThunk(nonSerializableValue))

  expect(getLog().log).toMatchInlineSnapshot(`""`)
  restore()
})

describe('conditional skipping of asyncThunks', () => {
  const arg = {}
  const getState = jest.fn(() => ({}))
  const dispatch = jest.fn((x: any) => x)
  const payloadCreator = jest.fn((x: typeof arg) => 10)
  const condition = jest.fn(() => false)
  const extra = {}

  beforeEach(() => {
    getState.mockClear()
    dispatch.mockClear()
    payloadCreator.mockClear()
    condition.mockClear()
  })

  test('returning false from condition skips payloadCreator and returns a rejected action', async () => {
    const asyncThunk = createAsyncThunk('test', payloadCreator, { condition })
    const result = await asyncThunk(arg)(dispatch, getState, extra)

    expect(condition).toHaveBeenCalled()
    expect(payloadCreator).not.toHaveBeenCalled()
    expect(asyncThunk.rejected.match(result)).toBe(true)
    expect((result as any).meta.condition).toBe(true)
  })

  test('return falsy from condition does not skip payload creator', async () => {
    // Override TS's expectation that this is a boolean
    condition.mockReturnValueOnce((undefined as unknown) as boolean)
    const asyncThunk = createAsyncThunk('test', payloadCreator, { condition })
    const result = await asyncThunk(arg)(dispatch, getState, extra)

    expect(condition).toHaveBeenCalled()
    expect(payloadCreator).toHaveBeenCalled()
    expect(asyncThunk.fulfilled.match(result)).toBe(true)
    expect(result.payload).toBe(10)
  })

  test('returning true from condition executes payloadCreator', async () => {
    condition.mockReturnValueOnce(true)
    const asyncThunk = createAsyncThunk('test', payloadCreator, { condition })
    const result = await asyncThunk(arg)(dispatch, getState, extra)

    expect(condition).toHaveBeenCalled()
    expect(payloadCreator).toHaveBeenCalled()
    expect(asyncThunk.fulfilled.match(result)).toBe(true)
    expect(result.payload).toBe(10)
  })

  test('condition is called with arg, getState and extra', async () => {
    const asyncThunk = createAsyncThunk('test', payloadCreator, { condition })
    await asyncThunk(arg)(dispatch, getState, extra)

    expect(condition).toHaveBeenCalledTimes(1)
    expect(condition).toHaveBeenLastCalledWith(
      arg,
      expect.objectContaining({ getState, extra })
    )
  })

  test('rejected action is not dispatched by default', async () => {
    const asyncThunk = createAsyncThunk('test', payloadCreator, { condition })
    await asyncThunk(arg)(dispatch, getState, extra)

    expect(dispatch).toHaveBeenCalledTimes(0)
  })

  test('does not fail when attempting to abort a canceled promise', async () => {
    const asyncPayloadCreator = jest.fn(async (x: typeof arg) => {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      return 10
    })

    const asyncThunk = createAsyncThunk('test', asyncPayloadCreator, {
      condition,
    })
    const promise = asyncThunk(arg)(dispatch, getState, extra)
    promise.abort(
      `If the promise was 1. somehow canceled, 2. in a 'started' state and 3. we attempted to abort, this would crash the tests`
    )
  })

  test('rejected action can be dispatched via option', async () => {
    const asyncThunk = createAsyncThunk('test', payloadCreator, {
      condition,
      dispatchConditionRejection: true,
    })
    await asyncThunk(arg)(dispatch, getState, extra)

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        error: {
          message: 'Aborted due to condition callback returning false.',
          name: 'ConditionError',
        },
        meta: {
          aborted: false,
          arg: arg,
          rejectedWithValue: false,
          condition: true,
          requestId: expect.stringContaining(''),
          requestStatus: 'rejected',
        },
        payload: undefined,
        type: 'test/rejected',
      })
    )
  })

  test('serializeError implementation', async () => {
    function serializeError() {
      return 'serialized!'
    }
    const errorObject = 'something else!'

    const store = configureStore({
      reducer: (state = [], action) => [...state, action],
    })

    const asyncThunk = createAsyncThunk<
      unknown,
      void,
      { serializedErrorType: string }
    >('test', () => Promise.reject(errorObject), { serializeError })
    const rejected = await store.dispatch(asyncThunk())
    if (!asyncThunk.rejected.match(rejected)) {
      throw new Error()
    }

    const expectation = {
      type: 'test/rejected',
      payload: undefined,
      error: 'serialized!',
      meta: expect.any(Object),
    }
    expect(rejected).toEqual(expectation)
    expect(store.getState()[2]).toEqual(expectation)
    expect(rejected.error).not.toEqual(miniSerializeError(errorObject))
  })
})
describe('unwrapResult', () => {
  const getState = jest.fn(() => ({}))
  const dispatch = jest.fn((x: any) => x)
  const extra = {}
  test('fulfilled case', async () => {
    const asyncThunk = createAsyncThunk('test', () => {
      return 'fulfilled!' as const
    })

    const unwrapPromise = asyncThunk()(dispatch, getState, extra).then(
      unwrapResult
    )

    await expect(unwrapPromise).resolves.toBe('fulfilled!')

    const unwrapPromise2 = asyncThunk()(dispatch, getState, extra)
    const res = await unwrapPromise2.unwrap()
    expect(res).toBe('fulfilled!')
  })
  test('error case', async () => {
    const error = new Error('Panic!')
    const asyncThunk = createAsyncThunk('test', () => {
      throw error
    })

    const unwrapPromise = asyncThunk()(dispatch, getState, extra).then(
      unwrapResult
    )

    await expect(unwrapPromise).rejects.toEqual(miniSerializeError(error))

    const unwrapPromise2 = asyncThunk()(dispatch, getState, extra)
    await expect(unwrapPromise2.unwrap()).rejects.toEqual(
      miniSerializeError(error)
    )
  })
  test('rejectWithValue case', async () => {
    const asyncThunk = createAsyncThunk('test', (_, { rejectWithValue }) => {
      return rejectWithValue('rejectWithValue!')
    })

    const unwrapPromise = asyncThunk()(dispatch, getState, extra).then(
      unwrapResult
    )

    await expect(unwrapPromise).rejects.toBe('rejectWithValue!')

    const unwrapPromise2 = asyncThunk()(dispatch, getState, extra)
    await expect(unwrapPromise2.unwrap()).rejects.toBe('rejectWithValue!')
  })
})
