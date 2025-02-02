import { Middleware, AnyAction } from 'redux'
import thunkMiddleware, { ThunkMiddleware } from 'redux-thunk'
import {
  /* PROD_START_REMOVE_UMD */
  createImmutableStateInvariantMiddleware,
  /* PROD_STOP_REMOVE_UMD */
  ImmutableStateInvariantMiddlewareOptions,
} from './immutableStateInvariantMiddleware'

import {
  createSerializableStateInvariantMiddleware,
  SerializableStateInvariantMiddlewareOptions,
} from './serializableStateInvariantMiddleware'
import { MiddlewareArray } from './utils'

function isBoolean(x: any): x is boolean {
  return typeof x === 'boolean'
}

interface ThunkOptions<E = any> {
  extraArgument: E
}

interface GetDefaultMiddlewareOptions {
  thunk?: boolean | ThunkOptions
  immutableCheck?: boolean | ImmutableStateInvariantMiddlewareOptions
  serializableCheck?: boolean | SerializableStateInvariantMiddlewareOptions
}

export type ThunkMiddlewareFor<
  S,
  O extends GetDefaultMiddlewareOptions = {},
  A extends AnyAction = AnyAction
> = O extends {
  thunk: false
}
  ? never
  : O extends { thunk: { extraArgument: infer E } }
  ? ThunkMiddleware<S, A, E>
  :
      | ThunkMiddleware<S, A, null> //The ThunkMiddleware with a `null` ExtraArgument is here to provide backwards-compatibility.
      | ThunkMiddleware<S, A>

export type CurriedGetDefaultMiddleware<S = any> = <
  O extends Partial<GetDefaultMiddlewareOptions> = {
    thunk: true
    immutableCheck: true
    serializableCheck: true
  }
>(
  options?: O
) => MiddlewareArray<Middleware<{}, S> | ThunkMiddlewareFor<S, O>>

export function curryGetDefaultMiddleware<
  S = any
>(): CurriedGetDefaultMiddleware<S> {
  return function curriedGetDefaultMiddleware(options) {
    return getDefaultMiddleware(options)
  }
}

/**
 * Returns any array containing the default middleware installed by
 * `configureStore()`. Useful if you want to configure your store with a custom
 * `middleware` array but still keep the default set.
 *
 * @return The default middleware used by `configureStore()`.
 *
 * @public
 */
export function getDefaultMiddleware<
  S = any,
  O extends Partial<GetDefaultMiddlewareOptions> = {
    thunk: true
    immutableCheck: true
    serializableCheck: true
  }
>(
  options: O = {} as O
): MiddlewareArray<Middleware<{}, S> | ThunkMiddlewareFor<S, O>> {
  const {
    thunk = true,
    immutableCheck = true,
    serializableCheck = true,
  } = options

  let middlewareArray: Middleware<{}, S>[] = new MiddlewareArray()

  if (thunk) {
    if (isBoolean(thunk)) {
      middlewareArray.push(thunkMiddleware)
    } else {
      middlewareArray.push(
        thunkMiddleware.withExtraArgument(thunk.extraArgument)
      )
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    if (immutableCheck) {
      /* PROD_START_REMOVE_UMD */
      let immutableOptions: ImmutableStateInvariantMiddlewareOptions = {}

      if (!isBoolean(immutableCheck)) {
        immutableOptions = immutableCheck
      }

      middlewareArray.unshift(
        createImmutableStateInvariantMiddleware(immutableOptions)
      )
      /* PROD_STOP_REMOVE_UMD */
    }

    if (serializableCheck) {
      let serializableOptions: SerializableStateInvariantMiddlewareOptions = {}

      if (!isBoolean(serializableCheck)) {
        serializableOptions = serializableCheck
      }

      middlewareArray.push(
        createSerializableStateInvariantMiddleware(serializableOptions)
      )
    }
  }

  return middlewareArray as any
}
