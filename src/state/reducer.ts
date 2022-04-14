import { combineReducers } from '@reduxjs/toolkit'
import localforage from 'localforage'
import { persistReducer } from 'redux-persist'

import { accountSpecifiers } from './slices/accountSpecifiersSlice/accountSpecifiersSlice'
import { assetApi, assets } from './slices/assetsSlice/assetsSlice'
import { marketApi, marketData } from './slices/marketDataSlice/marketDataSlice'
import { portfolio, portfolioApi } from './slices/portfolioSlice/portfolioSlice'
import { preferences } from './slices/preferencesSlice/preferencesSlice'
import { validatorData, validatorDataApi } from './slices/stakingDataSlice/stakingDataSlice'
import { txHistory, txHistoryApi } from './slices/txHistorySlice/txHistorySlice'

export const slices = {
  assets,
  marketData,
  txHistory,
  validatorData,
  portfolio,
  preferences,
  accountSpecifiers,
}

const preferencesPersistConfig = {
  key: 'preferences',
  storage: localforage,
  blacklist: ['featureFlags'],
}

export const sliceReducers = {
  assets: assets.reducer,
  marketData: marketData.reducer,
  txHistory: txHistory.reducer,
  validatorData: validatorData.reducer,
  portfolio: portfolio.reducer,
  preferences: persistReducer(preferencesPersistConfig, preferences.reducer),
  accountSpecifiers: accountSpecifiers.reducer,
}

export const apiSlices = {
  assetApi,
  portfolioApi,
  marketApi,
  txHistoryApi,
  validatorDataApi,
}

export const apiReducers = {
  [assetApi.reducerPath]: assetApi.reducer,
  [portfolioApi.reducerPath]: portfolioApi.reducer,
  [marketApi.reducerPath]: marketApi.reducer,
  [txHistoryApi.reducerPath]: txHistoryApi.reducer,
  [validatorDataApi.reducerPath]: validatorDataApi.reducer,
}

export const reducer = combineReducers({ ...sliceReducers, ...apiReducers })
export type ReduxState = ReturnType<typeof reducer>
