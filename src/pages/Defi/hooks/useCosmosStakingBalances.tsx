import { CAIP19 } from '@shapeshiftoss/caip'
import { chainAdapters, ChainTypes } from '@shapeshiftoss/types'
import { useEffect, useMemo } from 'react'
import { BigNumber, bnOrZero } from 'lib/bignumber/bignumber'
import {
  ActiveStakingOpportunity,
  selectAccountSpecifier,
  selectAllStakingDataByValidator,
  selectAssetByCAIP19,
  selectMarketDataById,
  selectValidatorIds,
} from 'state/slices/selectors'
import {
  selectAllValidatorsData,
  selectSingleValidator,
} from 'state/slices/validatorDataSlice/selectors'
import { useAppDispatch, useAppSelector } from 'state/store'

const SHAPESHIFT_VALIDATOR_ADDRESS = 'cosmosvaloper199mlc7fr6ll5t54w7tts7f4s0cvnqgc59nmuxf'

type UseCosmosStakingBalancesProps = {
  assetId: CAIP19
}

export type UseCosmosStakingBalancesReturn = {
  stakingOpportunities: MergedStakingOpportunity[]
  totalBalance: string
  isLoaded: boolean
}

export type MergedActiveStakingOpportunity = ActiveStakingOpportunity & {
  fiatAmount?: string
  tokenAddress: string
  assetId: CAIP19
  chain: ChainTypes
  tvl: string
}

export type MergedStakingOpportunity = chainAdapters.cosmos.Validator & {
  tokenAddress: string
  assetId: CAIP19
  chain: ChainTypes
  tvl: string
}

export function useCosmosStakingBalances({
  assetId,
}: UseCosmosStakingBalancesProps): UseCosmosStakingBalancesReturn {
  const marketData = useAppSelector(state => selectMarketDataById(state, assetId))
  const asset = useAppSelector(state => selectAssetByCAIP19(state, assetId))
  const dispatch = useAppDispatch()

  const accountSpecifiers = useAppSelector(state => selectAccountSpecifier(state, asset?.caip2))
  const accountSpecifier = accountSpecifiers?.[0] // TODO: maybe remove me, or maybe not
  const validatorIds = useAppSelector(state => selectValidatorIds(state, accountSpecifier))
  const stakingDataByValidator = useAppSelector(state =>
    selectAllStakingDataByValidator(state, accountSpecifier),
  )
  const validatorsData = useAppSelector(state => selectAllValidatorsData(state))

  const stakingOpportunities = useMemo(
    () =>
      validatorIds.map(validatorId => {
        const delegatedAmount = bnOrZero(
          stakingDataByValidator?.[validatorId]?.[assetId]?.delegations?.[0]?.amount,
        ).toString()
        const undelegatedEntries =
          stakingDataByValidator?.[validatorId]?.[assetId]?.undelegations ?? []
        const totalDelegations = bnOrZero(delegatedAmount)
          .plus(
            undelegatedEntries.reduce((acc, current) => {
              return acc.plus(bnOrZero(current.amount))
            }, bnOrZero(0)),
          )
          .toString()
        return {
          ...validatorsData[validatorId],
          // Delegated/Redelegated + Undelegation
          // TODO: Optimize this. This can't be a selector since we're iterating and selectors can't be used conditionally.
          // This isn't optimal, but way better than using a selector in a react-table cell, which makes them not pure and rerenders all over the place
          cryptoAmount: totalDelegations,
          // Rewards at 0 index: since we normalize staking data, we are guaranteed to have only one entry for the validatorId + assetId combination
          rewards: stakingDataByValidator?.[validatorId]?.[assetId]?.rewards[0],
        }
      }),
    [assetId, stakingDataByValidator, validatorIds, validatorsData],
  )

  const chainId = asset.caip2

  const mergedActiveStakingOpportunities = useMemo(() => {
    return Object.values(stakingOpportunities).map(opportunity => {
      const fiatAmount = bnOrZero(opportunity.cryptoAmount)
        .div(`1e+${asset.precision}`)
        .times(bnOrZero(marketData.price))
        .toFixed(2)

      const tvl = bnOrZero(opportunity.tokens)
        .div(`1e+${asset.precision}`)
        .times(bnOrZero(marketData?.price))
        .toString()

      const data = {
        ...opportunity,
        cryptoAmount: bnOrZero(opportunity.cryptoAmount)
          .div(`1e+${asset?.precision}`)
          .decimalPlaces(asset.precision)
          .toString(),
        tvl,
        fiatAmount,
        chain: asset.chain,
        assetId,
        tokenAddress: asset.slip44.toString(),
      }
      return data
    })
  }, [stakingOpportunities, assetId, asset, marketData])

  const totalBalance = useMemo(
    () =>
      Object.values(mergedActiveStakingOpportunities).reduce(
        (acc: BigNumber, opportunity: MergedActiveStakingOpportunity) => {
          return acc.plus(bnOrZero(opportunity.fiatAmount))
        },
        bnOrZero(0),
      ),
    [mergedActiveStakingOpportunities],
  )

  console.log({ mergedActiveStakingOpportunities })

  useEffect(() => {
    ;(async () => {
      // if (!isValidatorDataLoaded) return // TODO: Used to be like this, this probably goes away: use select() or similar to detect loaded/ing state
    })()
  }, [dispatch, chainId])

  return {
    stakingOpportunities: mergedActiveStakingOpportunities,
    isLoaded: true,
    totalBalance: totalBalance.toString(),
  }
}
