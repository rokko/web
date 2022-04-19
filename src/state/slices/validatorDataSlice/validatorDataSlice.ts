import { createSlice } from '@reduxjs/toolkit'
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { chainAdapters } from '@shapeshiftoss/types'
import { getChainAdapters } from 'context/PluginProvider/PluginProvider'

import { cosmosChainId } from '../portfolioSlice/utils'

export type PubKey = string

type SingleValidatorDataArgs = { validatorAddress: PubKey }

export type Status = 'idle' | 'loading' | 'loaded'

export type Validators = {
  validators: chainAdapters.cosmos.Validator[]
}

export type ValidatorData = {
  validatorStatus: Status
  byValidator: ValidatorDataByPubKey
  validatorIds: string[]
}

export type ValidatorDataByPubKey = {
  [k: PubKey]: chainAdapters.cosmos.Validator
}

const initialState: ValidatorData = {
  byValidator: {},
  validatorIds: [],
  validatorStatus: 'idle',
}

const updateOrInsertValidatorData = (
  validatorDataState: ValidatorData,
  validators: chainAdapters.cosmos.Validator[],
) => {
  validators.forEach(validator => {
    validatorDataState.validatorIds.push(validator.address)
    validatorDataState.byValidator[validator.address] = validator
  })
}

type StatusPayload = { payload: Status }

export const validatorData = createSlice({
  name: 'validatorData',
  initialState,
  reducers: {
    clear: () => initialState,
    setValidatorStatus: (state, { payload }: StatusPayload) => {
      state.validatorStatus = payload
    },
    upsertValidatorData: (
      validatorDataState,
      { payload }: { payload: { validators: chainAdapters.cosmos.Validator[] } },
    ) => {
      // TODO(gomes): Improve the structure of this when we have cosmos websocket, for now this just inserts
      updateOrInsertValidatorData(validatorDataState, payload.validators)
    },
  },
})

export const validatorDataApi = createApi({
  reducerPath: 'validatorDataApi',
  // not actually used, only used to satisfy createApi, we use a custom queryFn
  baseQuery: fetchBaseQuery({ baseUrl: '/' }),
  // 5 minutes caching against overfetching. The only thing that can change on new Tx is effectively TVL and APR
  // The first won't noticeably change given the Million fiat precision we use, and the former effectively won't noticeably change either in such timeframe
  keepUnusedDataFor: 300,
  // refetch if network connection is dropped, useful for mobile
  refetchOnReconnect: true,
  endpoints: build => ({
    getValidatorData: build.query<chainAdapters.cosmos.Validator, SingleValidatorDataArgs>({
      queryFn: async ({ validatorAddress }, { dispatch }) => {
        const chainAdapters = getChainAdapters()
        const adapter = await chainAdapters.byChainId(cosmosChainId)
        dispatch(validatorData.actions.setValidatorStatus('loading'))
        try {
          const data = await adapter.getValidator(validatorAddress)
          dispatch(
            validatorData.actions.upsertValidatorData({
              validators: [data],
            }),
          )
          return {
            data: data,
          }
        } catch (e) {
          console.error('Error fetching single validator data', e)
          return {
            error: {
              data: `Error fetching validator data`,
              status: 500,
            },
          }
        } finally {
          dispatch(validatorData.actions.setValidatorStatus('loaded'))
        }
      },
    }),
  }),
})
