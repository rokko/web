import { createSelector } from '@reduxjs/toolkit'
import { CAIP10, CAIP19 } from '@shapeshiftoss/caip'
import { chainAdapters } from '@shapeshiftoss/types'
import { Asset } from '@shapeshiftoss/types'
import { ValidatorReward } from '@shapeshiftoss/types/dist/chain-adapters/cosmos'
import BigNumber from 'bignumber.js'
import reduce from 'lodash/reduce'
import toLower from 'lodash/toLower'
import { bn, bnOrZero } from 'lib/bignumber/bignumber'
import { fromBaseUnit } from 'lib/math'
import { ReduxState } from 'state/reducer'
import { createDeepEqualOutputSelector } from 'state/selector-utils'
import { selectAssets } from 'state/slices/assetsSlice/selectors'
import { selectMarketData } from 'state/slices/marketDataSlice/selectors'
import { accountIdToFeeAssetId } from 'state/slices/portfolioSlice/utils'
import { selectBalanceThreshold } from 'state/slices/preferencesSlice/selectors'
import { selectValidatorAddress } from 'state/slices/validatorDataSlice/selectors'

import { AccountSpecifier } from '../accountSpecifiersSlice/accountSpecifiersSlice'
import { PubKey } from './portfolioSliceCommon'
import {
  PortfolioAccountBalances,
  PortfolioAccountSpecifiers,
  PortfolioAssetBalances,
  PortfolioAssets,
  PortfolioBalancesById,
} from './portfolioSliceCommon'
import {
  findAccountsByAssetId,
  makeBalancesByChainBucketsFlattened,
  makeSortedAccountBalances,
} from './utils'

// We should prob change this once we add more chains
const FEE_ASSET_IDS = [
  'eip155:1/slip44:60',
  'bip122:000000000019d6689c085ae165831e93/slip44:0',
  'cosmos:cosmoshub-4/slip44:118',
  'cosmos:osmosis-1/slip44:118',
]

const selectAssetIdParamFromFilterOptional = (
  _state: ReduxState,
  paramFilter: OptionalParamFilter,
) => paramFilter.assetId
const selectAccountIdParamFromFilterOptional = (
  _state: ReduxState,
  paramFilter: OptionalParamFilter,
) => paramFilter.accountId
// TODO: fixme
const selectAssetIdParamArityFour = (
  _state: ReduxState,
  _accountSpecifier: CAIP10,
  _validatorAddress: PubKey,
  assetId: CAIP19,
) => assetId

export const selectPortfolioAccounts = (state: ReduxState) => state.portfolio.accounts.byId

export const selectPortfolioAssetIds = createDeepEqualOutputSelector(
  (state: ReduxState): PortfolioAssetBalances['ids'] => state.portfolio.assetBalances.ids,
  ids => ids,
)
export const selectPortfolioAssetBalances = (state: ReduxState): PortfolioAssetBalances['byId'] =>
  state.portfolio.assetBalances.byId
export const selectAccountIds = (state: ReduxState): PortfolioAccountSpecifiers['byId'] =>
  state.portfolio.accountSpecifiers.byId
export const selectPortfolioAccountBalances = (
  state: ReduxState,
): PortfolioAccountBalances['byId'] => state.portfolio.accountBalances.byId

export const selectPortfolioFiatBalances = createSelector(
  selectAssets,
  selectMarketData,
  selectPortfolioAssetBalances,
  selectBalanceThreshold,
  (assetsById, marketData, balances, balanceThreshold) =>
    Object.entries(balances).reduce<PortfolioAssetBalances['byId']>(
      (acc, [assetId, baseUnitBalance]) => {
        const precision = assetsById[assetId]?.precision
        const price = marketData[assetId]?.price
        const cryptoValue = fromBaseUnit(baseUnitBalance, precision)
        const assetFiatBalance = bnOrZero(cryptoValue).times(bnOrZero(price))
        if (assetFiatBalance.lt(bnOrZero(balanceThreshold))) return acc
        acc[assetId] = assetFiatBalance.toFixed(2)
        return acc
      },
      {},
    ),
)

// accountId is optional, but we should always pass an assetId when using these params
type OptionalParamFilter = {
  assetId: CAIP19
  accountId?: AccountSpecifier
}

type ParamFilter = {
  assetId: CAIP19
  accountId: AccountSpecifier
}

const selectAssetIdParam = (_state: ReduxState, id: CAIP19) => id
const selectAssetIdParamFromFilter = (_state: ReduxState, paramFilter: ParamFilter) =>
  paramFilter.assetId
const selectAccountIdParamFromFilter = (_state: ReduxState, paramFilter: ParamFilter) =>
  paramFilter.accountId

const selectAccountAddressParam = (_state: ReduxState, id: CAIP10) => id
const selectAccountIdParam = (_state: ReduxState, id: AccountSpecifier) => id

export const selectPortfolioFiatAccountBalances = createSelector(
  selectAssets,
  selectPortfolioAccountBalances,
  selectMarketData,
  (assetsById, accounts, marketData) => {
    return Object.entries(accounts).reduce(
      (acc, [accountId, balanceObj]) => {
        acc[accountId] = Object.entries(balanceObj).reduce(
          (acc, [caip19, cryptoBalance]) => {
            const precision = assetsById[caip19]?.precision
            const price = marketData[caip19]?.price
            const cryptoValue = fromBaseUnit(cryptoBalance, precision)
            const fiatbalance = bnOrZero(bn(cryptoValue).times(price)).toFixed(2)
            acc[caip19] = fiatbalance

            return acc
          },
          { ...balanceObj },
        )

        return acc
      },
      { ...accounts },
    )
  },
)

export const selectPortfolioTotalFiatBalance = createSelector(
  selectPortfolioFiatBalances,
  (portfolioFiatBalances): string =>
    Object.values(portfolioFiatBalances)
      .reduce((acc, assetFiatBalance) => acc.plus(bnOrZero(assetFiatBalance)), bn(0))
      .toFixed(2),
)

export const selectAllStakingDelegationCrypto = createSelector(
  selectPortfolioAccounts,
  portfolioAccounts => {
    // TODO: Implement this better
    const allStakingData = Object.entries(portfolioAccounts)
    const allStakingDelegationCrypto = reduce(
      allStakingData,
      (acc, [accountSpecifier, portfolioData]) => {
        if (!portfolioData.stakingData) return acc
        const delegations = portfolioData.stakingData.delegations
        const delegationSum = reduce(
          delegations,
          (acc, delegation) => acc.plus(bnOrZero(delegation.amount)),
          bn(0),
        )
        return { ...acc, [accountSpecifier]: delegationSum }
      },
      {},
    )

    return allStakingDelegationCrypto
  },
)
export const selectTotalStakingDelegationFiat = createSelector(
  selectAllStakingDelegationCrypto,
  selectMarketData,
  (state: ReduxState) => state.assets.byId,
  (allStaked: { [k: string]: string }, marketData, assetsById) => {
    const allStakingData = Object.entries(allStaked)

    const totalStakingDelegationFiat = reduce(
      allStakingData,
      (acc, [accountSpecifier, baseUnitAmount]) => {
        const assetId = accountIdToFeeAssetId(accountSpecifier)
        const price = marketData[assetId]?.price
        const amount = fromBaseUnit(baseUnitAmount, assetsById[assetId].precision ?? 0)
        return bnOrZero(amount).times(price).plus(acc)
      },
      bn(0),
    )

    return totalStakingDelegationFiat
  },
)
export const selectPortfolioTotalFiatBalanceWithDelegations = createSelector(
  selectPortfolioTotalFiatBalance,
  selectTotalStakingDelegationFiat,
  (portfolioFiatBalance, delegationFiatBalance): string => {
    return bnOrZero(portfolioFiatBalance).plus(delegationFiatBalance).toString()
  },
)

export const selectPortfolioFiatBalanceByAssetId = createSelector(
  selectPortfolioFiatBalances,
  selectAssetIdParam,
  (portfolioFiatBalances, assetId) => {
    return portfolioFiatBalances[assetId]
  },
)

export const selectPortfolioFiatBalanceByFilter = createSelector(
  selectPortfolioFiatBalances,
  selectPortfolioFiatAccountBalances,
  selectAssetIdParamFromFilterOptional,
  selectAccountIdParamFromFilterOptional,
  (portfolioAssetFiatBalances, portfolioAccountFiatbalances, assetId, accountId): string => {
    if (assetId && !accountId) return portfolioAssetFiatBalances?.[assetId] ?? '0'
    if (assetId && accountId) return portfolioAccountFiatbalances?.[accountId]?.[assetId] ?? '0'
    if (!assetId && accountId) {
      const accountBalances = portfolioAccountFiatbalances[accountId]
      const totalAccountBalances = Object.values(accountBalances).reduce(
        (totalBalance: string, fiatBalance: string) => {
          return bnOrZero(totalBalance).plus(fiatBalance).toFixed(2)
        },
        '0',
      )
      return totalAccountBalances
    }
    return '0'
  },
)

export const selectPortfolioCryptoBalanceByAssetId = createSelector(
  selectPortfolioAssetBalances,
  selectAssetIdParam,
  (byId, assetId): string => byId[assetId],
)

export const selectPortfolioCryptoHumanBalanceByFilter = createSelector(
  selectAssets,
  selectPortfolioAccountBalances,
  selectPortfolioAssetBalances,
  selectAccountIdParamFromFilterOptional,
  selectAssetIdParamFromFilterOptional,
  (assets, accountBalances, assetBalances, accountId, assetId): string => {
    if (accountId && assetId) {
      return fromBaseUnit(
        bnOrZero(accountBalances?.[accountId]?.[assetId]),
        assets[assetId]?.precision ?? 0,
      )
    }

    return fromBaseUnit(bnOrZero(assetBalances[assetId]), assets[assetId].precision ?? 0)
  },
)

export const selectStakingDataByFilter = createSelector(
  state => state, // TODO: unbreak me
  selectAssetIdParamFromFilterOptional,
  selectAccountIdParamFromFilterOptional,
  (stakingData, _, accountId) => {
    if (!accountId) return null
    return stakingData.byAccountSpecifier[accountId] || null
  },
)

export const selectTotalStakingDelegationCryptoByFilter = createSelector(
  selectStakingDataByFilter,
  selectAssetIdParamFromFilterOptional,
  selectAccountIdParamFromFilterOptional,
  (state: ReduxState) => state.assets.byId,
  // We make the assumption that all delegation rewards come from a single denom (asset)
  // In the future there may be chains that support rewards in multiple denoms and this will need to be parsed differently
  (stakingData, assetId, _, assets) => {
    const amount = reduce(
      stakingData?.delegations,
      (acc, delegation) => acc.plus(bnOrZero(delegation.amount)),
      bn(0),
    )

    return fromBaseUnit(amount, assets[assetId].precision ?? 0).toString()
  },
)

export const selectTotalFiatBalanceWithDelegations = createSelector(
  selectPortfolioCryptoHumanBalanceByFilter,
  selectTotalStakingDelegationCryptoByFilter,
  selectMarketData,
  selectAssetIdParamFromFilterOptional,
  (cryptoBalance, delegationCryptoBalance, marketData, assetId): string => {
    const price = marketData[assetId]?.price
    const cryptoBalanceWithDelegations = bnOrZero(cryptoBalance)
      .plus(delegationCryptoBalance)
      .toString()

    return bnOrZero(cryptoBalanceWithDelegations).times(price).toString()
  },
)

export const selectTotalCryptoBalanceWithDelegations = createSelector(
  selectPortfolioCryptoHumanBalanceByFilter,
  selectTotalStakingDelegationCryptoByFilter,
  (cryptoBalance, delegationCryptoBalance): string => {
    const cryptoBalanceWithDelegations = bnOrZero(cryptoBalance)
      .plus(delegationCryptoBalance)
      .toString()

    return bnOrZero(cryptoBalanceWithDelegations).toString()
  },
)

export const selectPortfolioCryptoBalancesByAccountIdAboveThreshold = createDeepEqualOutputSelector(
  selectAssets,
  selectPortfolioAccountBalances,
  selectPortfolioAssetBalances,
  selectMarketData,
  selectBalanceThreshold,
  (_state: ReduxState, accountId?: string) => accountId,
  (
    assetsById,
    accountBalances,
    assetBalances,
    marketData,
    balanceThreshold,
    accountId,
  ): PortfolioBalancesById => {
    const balances = (accountId ? accountBalances[accountId] : assetBalances) ?? {}
    const aboveThresholdBalances = Object.entries(balances).reduce<PortfolioAssetBalances['byId']>(
      (acc, [assetId, baseUnitBalance]) => {
        const precision = assetsById[assetId]?.precision
        const price = marketData[assetId]?.price
        const cryptoValue = fromBaseUnit(baseUnitBalance, precision)
        const assetFiatBalance = bnOrZero(cryptoValue).times(bnOrZero(price))
        if (assetFiatBalance.lt(bnOrZero(balanceThreshold))) return acc
        // if it's above the threshold set the original object key and value to result
        acc[assetId] = baseUnitBalance
        return acc
      },
      {},
    )
    return aboveThresholdBalances
  },
)

export const selectPortfolioCryptoBalanceByFilter = createSelector(
  selectPortfolioAccountBalances,
  selectPortfolioAssetBalances,
  selectAccountIdParamFromFilterOptional,
  selectAssetIdParamFromFilterOptional,
  (accountBalances, assetBalances, accountId, assetId): string => {
    if (accountId && assetId) {
      return accountBalances?.[accountId]?.[assetId] ?? '0'
    }
    return assetBalances[assetId] ?? '0'
  },
)

export const selectPortfolioCryptoHumanBalanceByAssetId = createSelector(
  selectAssets,
  selectPortfolioAssetBalances,
  selectAssetIdParam,
  (assets, balances, assetId): string =>
    fromBaseUnit(bnOrZero(balances[assetId]), assets[assetId]?.precision ?? 0),
)

export const selectPortfolioMixedHumanBalancesBySymbol = createSelector(
  selectAssets,
  selectMarketData,
  selectPortfolioAssetBalances,
  (assets, marketData, balances) =>
    Object.entries(balances).reduce<{ [k: CAIP19]: { crypto: string; fiat: string } }>(
      (acc, [assetId, balance]) => {
        const precision = assets[assetId]?.precision
        const price = marketData[assetId]?.price
        const cryptoValue = fromBaseUnit(balance, precision)
        const assetFiatBalance = bnOrZero(cryptoValue).times(bnOrZero(price)).toFixed(2)
        acc[assets[assetId].caip19] = { crypto: cryptoValue, fiat: assetFiatBalance }
        return acc
      },
      {},
    ),
)

export const selectPortfolioAssets = createSelector(
  selectAssets,
  selectPortfolioAssetIds,
  (assetsById, portfolioAssetIds): { [k: CAIP19]: Asset } =>
    portfolioAssetIds.reduce<PortfolioAssets>((acc, cur) => {
      acc[cur] = assetsById[cur]
      return acc
    }, {}),
)

export const selectPortfolioAccountIds = (state: ReduxState): AccountSpecifier[] =>
  state.portfolio.accounts.ids

// we only set ids when chain adapters responds, so if these are present, the portfolio has loaded
export const selectPortfolioLoading = createSelector(
  selectPortfolioAccountIds,
  (ids): boolean => !Boolean(ids.length),
)

export const selectPortfolioAssetBalancesSortedFiat = createSelector(
  selectPortfolioFiatBalances,
  (portfolioFiatBalances): { [k: CAIP19]: string } =>
    Object.entries(portfolioFiatBalances)
      .sort(([_, a], [__, b]) => (bnOrZero(a).gte(bnOrZero(b)) ? -1 : 1))
      .reduce<PortfolioAssetBalances['byId']>((acc, [assetId, assetFiatBalance]) => {
        acc[assetId] = assetFiatBalance
        return acc
      }, {}),
)

export const selectPortfolioAssetAccountBalancesSortedFiat = createSelector(
  selectPortfolioFiatAccountBalances,
  selectBalanceThreshold,
  (
    portfolioFiatAccountBalances,
    balanceThreshold,
  ): { [k: AccountSpecifier]: { [k: CAIP19]: string } } => {
    return Object.entries(portfolioFiatAccountBalances).reduce<{
      [k: AccountSpecifier]: { [k: CAIP19]: string }
    }>((acc, [accountId, assetBalanceObj]) => {
      const sortedAssetsByFiatBalances = Object.entries(assetBalanceObj)
        .sort(([_, a], [__, b]) => (bnOrZero(a).gte(bnOrZero(b)) ? -1 : 1))
        .reduce<{ [k: CAIP19]: string }>((acc, [assetId, assetFiatBalance]) => {
          if (bnOrZero(assetFiatBalance).lt(bnOrZero(balanceThreshold))) return acc
          acc[assetId] = assetFiatBalance
          return acc
        }, {})

      acc[accountId] = sortedAssetsByFiatBalances
      return acc
    }, {})
  },
)

export const selectPortfolioAssetIdsSortedFiat = createSelector(
  selectPortfolioAssetBalancesSortedFiat,
  (sortedBalances): CAIP19[] => Object.keys(sortedBalances),
)

export const selectPortfolioAllocationPercent = createSelector(
  selectPortfolioTotalFiatBalance,
  selectPortfolioFiatBalances,
  (totalBalance, fiatBalances): { [k: CAIP19]: number } =>
    Object.entries(fiatBalances).reduce<{ [k: CAIP19]: number }>((acc, [assetId, fiatBalance]) => {
      acc[assetId] = bnOrZero(fiatBalance).div(bnOrZero(totalBalance)).times(100).toNumber()
      return acc
    }, {}),
)

export const selectPortfolioTotalFiatBalanceByAccount = createSelector(
  selectPortfolioFiatAccountBalances,
  selectBalanceThreshold,
  (accountBalances, balanceThreshold) => {
    return Object.entries(accountBalances).reduce<{ [k: AccountSpecifier]: string }>(
      (acc, [accountId, balanceObj]) => {
        const totalAccountFiatBalance = Object.values(balanceObj).reduce(
          (totalBalance, currentBalance) => {
            return bnOrZero(bn(totalBalance).plus(bn(currentBalance)))
          },
          bnOrZero('0'),
        )
        if (totalAccountFiatBalance.lt(bnOrZero(balanceThreshold))) return acc
        acc[accountId] = totalAccountFiatBalance.toFixed(2)
        return acc
      },
      {},
    )
  },
)

export const selectPortfolioAllocationPercentByFilter = createSelector(
  selectPortfolioFiatBalances,
  selectPortfolioFiatAccountBalances,
  selectAccountIdParamFromFilter,
  selectAssetIdParamFromFilter,
  (assetFiatBalances, assetFiatBalancesByAccount, accountId, assetId) => {
    const totalAssetFiatBalance = assetFiatBalances[assetId]
    const balanceAllocationById = Object.entries(assetFiatBalancesByAccount).reduce<{
      [k: AccountSpecifier]: number
    }>((acc, [currentAccountId, assetAccountFiatBalance]) => {
      const allocation = bnOrZero(
        bn(assetAccountFiatBalance[assetId]).div(totalAssetFiatBalance).times(100),
      ).toNumber()

      acc[currentAccountId] = allocation
      return acc
    }, {})

    return balanceAllocationById[accountId]
  },
)

export const selectPortfolioAccountIdsSortedFiat = createDeepEqualOutputSelector(
  selectPortfolioTotalFiatBalanceByAccount,
  selectAssets,
  (totalAccountBalances, assets) => {
    const sortedAccountBalances = makeSortedAccountBalances(totalAccountBalances)
    const sortedAccountBalancesByChainBuckets = makeBalancesByChainBucketsFlattened(
      sortedAccountBalances,
      assets,
    )
    return sortedAccountBalancesByChainBuckets
  },
)

export const selectPortfolioIsEmpty = createSelector(
  selectPortfolioAssetIds,
  (assetIds): boolean => !assetIds.length,
)

export const selectPortfolioAssetAccounts = createSelector(
  selectPortfolioAccounts,
  (_state: ReduxState, assetId: CAIP19) => assetId,
  (portfolioAccounts, assetId): AccountSpecifier[] =>
    Object.keys(portfolioAccounts).filter(accountSpecifier =>
      portfolioAccounts[accountSpecifier].assetIds.find(
        accountAssetId => accountAssetId === assetId,
      ),
    ),
)

export const selectPortfolioAccountById = createSelector(
  selectPortfolioAccounts,
  (_state: ReduxState, accountId: AccountSpecifier) => accountId,
  (portfolioAccounts, accountId) => portfolioAccounts[accountId].assetIds,
)

export const selectPortfolioAssetIdsByAccountId = createSelector(
  selectPortfolioAccountBalances,
  selectAccountIdParam,
  (accounts, accountId) => Object.keys(accounts[accountId]),
)

// @TODO: remove this assets check once we filter the portfolio on the way in
export const selectPortfolioAssetIdsByAccountIdExcludeFeeAsset = createDeepEqualOutputSelector(
  selectPortfolioAssetAccountBalancesSortedFiat,
  selectAccountIdParam,
  selectAssets,
  selectBalanceThreshold,
  (accountAssets, accountId, assets, balanceThreshold) => {
    const assetsByAccountIds = accountAssets?.[accountId] ?? {}
    return Object.entries(assetsByAccountIds)
      .filter(
        ([assetId, assetFiatBalance]) =>
          !FEE_ASSET_IDS.includes(assetId) &&
          assets[assetId] &&
          bnOrZero(assetFiatBalance).gte(bnOrZero(balanceThreshold)),
      )
      .map(([assetId]) => assetId)
  },
)

export const selectAccountIdByAddress = createSelector(
  selectAccountIds,
  selectAccountAddressParam,
  (portfolioAccounts: { [k: AccountSpecifier]: CAIP10[] }, caip10): string => {
    let accountSpecifier = ''
    for (const accountId in portfolioAccounts) {
      const isAccountSpecifier = !!portfolioAccounts[accountId].find(
        acctCaip10 => toLower(acctCaip10) === toLower(caip10),
      )
      if (isAccountSpecifier) {
        accountSpecifier = accountId
        break
      }
    }
    return accountSpecifier
  },
)

export const selectAccountIdsByAssetId = createSelector(
  selectPortfolioAccounts,
  selectAssetIdParam,
  findAccountsByAssetId,
)

export const selectAccountIdsByAssetIdAboveBalanceThreshold = createDeepEqualOutputSelector(
  selectPortfolioAccounts,
  selectAssetIdParam,
  selectPortfolioFiatAccountBalances,
  selectBalanceThreshold,
  (portfolioAccounts, assetId, accountBalances, balanceThreshold) => {
    const accounts = findAccountsByAssetId(portfolioAccounts, assetId)
    const aboveThreshold = Object.entries(accountBalances).reduce<AccountSpecifier[]>(
      (acc, [accountId, balanceObj]) => {
        if (accounts.includes(accountId)) {
          const totalAccountFiatBalance = Object.values(balanceObj).reduce(
            (totalBalance, currentBalance) => {
              return bnOrZero(bn(totalBalance).plus(bn(currentBalance)))
            },
            bnOrZero('0'),
          )
          if (totalAccountFiatBalance.lt(bnOrZero(balanceThreshold))) return acc
          acc.push(accountId)
        }
        return acc
      },
      [],
    )
    return aboveThreshold
  },
)

export type AccountRowData = {
  name: string
  icon: string
  symbol: string
  fiatAmount: string
  cryptoAmount: string
  assetId: AccountSpecifier
  allocation: number
  price: string
  priceChange: number
}

export const selectPortfolioAccountRows = createDeepEqualOutputSelector(
  selectAssets,
  selectMarketData,
  selectPortfolioAssetBalances,
  selectPortfolioTotalFiatBalance,
  selectBalanceThreshold,
  (
    assetsById,
    marketData,
    balances,
    totalPortfolioFiatBalance,
    balanceThreshold,
  ): AccountRowData[] => {
    const assetRows = Object.entries(balances).reduce<AccountRowData[]>(
      (acc, [assetId, baseUnitBalance]) => {
        const name = assetsById[assetId]?.name
        const icon = assetsById[assetId]?.icon
        const symbol = assetsById[assetId]?.symbol
        const precision = assetsById[assetId]?.precision
        const price = marketData[assetId]?.price
        const cryptoAmount = fromBaseUnit(baseUnitBalance, precision)
        const fiatAmount = bnOrZero(cryptoAmount).times(bnOrZero(price))
        /**
         * if fiatAmount is less than the selected threshold,
         * continue to the next asset balance by returning acc
         */
        if (fiatAmount.lt(bnOrZero(balanceThreshold))) return acc
        const allocation = bnOrZero(fiatAmount.toFixed(2))
          .div(bnOrZero(totalPortfolioFiatBalance))
          .times(100)
          .toNumber()
        const priceChange = marketData[assetId]?.changePercent24Hr
        const data = {
          assetId,
          name,
          icon,
          symbol,
          fiatAmount: fiatAmount.toFixed(2),
          cryptoAmount,
          allocation,
          price,
          priceChange,
        }
        acc.push(data)
        return acc
      },
      [],
    )
    return assetRows
  },
)

const selectAccountSpecifierParam = (_state: ReduxState, accountSpecifier: CAIP10) =>
  accountSpecifier

export type ActiveStakingOpportunity = {
  address: PubKey
  moniker: string
  apr: string
  tokens: string
  cryptoAmount?: string
  rewards?: string
}

export type AmountByValidatorAddressType = {
  // This maps from validator pubkey -> staked asset in base precision
  // e.g for 1 ATOM staked on ShapeShift DAO validator:
  // {"cosmosvaloper199mlc7fr6ll5t54w7tts7f4s0cvnqgc59nmuxf": "1000000"}
  [k: PubKey]: string
}

export const selectStakingDataByAccountSpecifier = createSelector(
  selectPortfolioAccounts,
  selectAccountSpecifierParam,
  (portfolioAccounts, accountSpecifier) => {
    return portfolioAccounts?.[accountSpecifier]?.stakingData || null
  },
)

export const selectTotalStakingDelegationCryptoByAccountSpecifier = createSelector(
  selectStakingDataByAccountSpecifier,
  // We make the assumption that all delegation rewards come from a single denom (asset)
  // In the future there may be chains that support rewards in multiple denoms and this will need to be parsed differently
  stakingData => {
    const amount = reduce(
      stakingData?.delegations,
      (acc, delegation) => acc.plus(bnOrZero(delegation.amount)),
      bn(0),
    )

    return amount.toString()
  },
)

export const selectAllDelegationsCryptoAmountByAssetId = createSelector(
  selectStakingDataByAccountSpecifier,
  selectAssetIdParamArityFour,
  (stakingData, selectedAssetId): AmountByValidatorAddressType => {
    if (!stakingData || !stakingData.delegations?.length) return {}

    const delegations = stakingData.delegations.reduce(
      (acc: AmountByValidatorAddressType, { assetId, amount, validator: { address } }) => {
        if (assetId !== selectedAssetId) return acc

        acc[address] = amount
        return acc
      },
      {},
    )
    return delegations
  },
)

export const selectDelegationCryptoAmountByAssetIdAndValidator = createSelector(
  selectAllDelegationsCryptoAmountByAssetId,
  selectValidatorAddress,
  (allDelegations, validatorAddress): string => {
    return allDelegations[validatorAddress] ?? '0'
  },
)

export const selectUnbondingEntriesByAccountSpecifier = createDeepEqualOutputSelector(
  selectStakingDataByAccountSpecifier,
  selectValidatorAddress,
  (stakingData, validatorAddress): chainAdapters.cosmos.UndelegationEntry[] => {
    if (!stakingData || !stakingData.undelegations) return []

    return (
      stakingData.undelegations.find(({ validator }) => validator.address === validatorAddress)
        ?.entries || []
    )
  },
)

export const selectAllUnbondingsEntriesByAssetId = createDeepEqualOutputSelector(
  selectStakingDataByAccountSpecifier,
  selectAssetIdParamArityFour,
  (stakingData, selectedAssetId): Record<PubKey, chainAdapters.cosmos.UndelegationEntry[]> => {
    if (!stakingData || !stakingData.undelegations) return {}

    const validators = stakingData.undelegations.reduce<
      Record<PubKey, chainAdapters.cosmos.UndelegationEntry[]>
    >((acc, { validator, entries }) => {
      if (!acc[validator.address]) {
        acc[validator.address] = []
      }

      acc[validator.address].push(...entries.filter(x => x.assetId === selectedAssetId))

      return acc
    }, {})

    return validators
  },
)

export const selectAllUnbondingsEntriesByAssetIdAndValidator = createSelector(
  selectAllUnbondingsEntriesByAssetId,
  selectValidatorAddress,
  (unbondingEntries, validatorAddress) => {
    console.log({ validatorAddress, unbondingEntries })
    return unbondingEntries[validatorAddress]
  },
)

export const selectUnbondingCryptoAmountByAssetIdAndValidator = createSelector(
  selectUnbondingEntriesByAccountSpecifier,
  selectAssetIdParam,
  (unbondingEntries, selectedAssetId): string => {
    if (!unbondingEntries.length) return '0'

    return unbondingEntries
      .reduce((acc, current) => {
        if (current.assetId !== selectedAssetId) return acc

        return acc.plus(bnOrZero(current.amount))
      }, bnOrZero(0))
      .toString()
  },
)

export const selectTotalBondingsBalanceByAssetId = createSelector(
  selectUnbondingCryptoAmountByAssetIdAndValidator,
  selectDelegationCryptoAmountByAssetIdAndValidator,
  (unbondingCryptoBalance, delegationCryptoBalance): string =>
    bnOrZero(unbondingCryptoBalance).plus(bnOrZero(delegationCryptoBalance)).toString(),
)

export const selectRewardsByAccountSpecifier = createDeepEqualOutputSelector(
  selectStakingDataByAccountSpecifier,
  selectValidatorAddress,
  (stakingData, validatorAddress): chainAdapters.cosmos.Reward[] => {
    if (!stakingData || !stakingData.rewards) return []

    return stakingData.rewards.reduce(
      (acc: chainAdapters.cosmos.Reward[], current: ValidatorReward) => {
        if (current.validator.address !== validatorAddress) return acc

        acc.push(...current.rewards)

        return acc
      },
      [],
    )
  },
)

export const selectRewardsAmountByAssetId = createSelector(
  selectRewardsByAccountSpecifier,
  selectAssetIdParam,
  (rewardsByAccountSpecifier, selectedAssetId): string => {
    if (!rewardsByAccountSpecifier.length) return ''

    const rewards = rewardsByAccountSpecifier.find(rewards => rewards.assetId === selectedAssetId)

    return rewards?.amount || ''
  },
)

// TODO: This one moves out to the porfolio slice, bye bye stakingData
export const selectRewardsByValidator = createDeepEqualOutputSelector(
  selectPortfolioAccounts,
  selectValidatorAddress,
  selectAccountSpecifierParam,
  (allPortfolioAccounts, validatorAddress, accountSpecifier): BigNumber => {
    // TODO: account specifier here
    const cosmosAccount = allPortfolioAccounts?.[accountSpecifier]

    if (!cosmosAccount?.stakingData?.rewards) return '0'

    const rewards = cosmosAccount.stakingData.rewards?.find(
      rewardEntry => rewardEntry.validator.address === validatorAddress,
    )

    return rewards.rewards
      .reduce((acc, current) => {
        acc = acc.plus(current.amount)

        return acc
      }, bnOrZero(0))
      .toString()
  },
)
