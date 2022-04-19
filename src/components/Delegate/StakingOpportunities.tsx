import { ArrowForwardIcon } from '@chakra-ui/icons'
import {
  Box,
  Button,
  Flex,
  HStack,
  Skeleton,
  SkeletonCircle,
  Tag,
  TagLabel,
} from '@chakra-ui/react'
import { CAIP19 } from '@shapeshiftoss/caip'
import { AprTag } from 'plugins/cosmos/components/AprTag/AprTag'
import { MouseEvent, useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import { Column, Row } from 'react-table'
import { Amount } from 'components/Amount/Amount'
import { AssetIcon } from 'components/AssetIcon'
import { Card } from 'components/Card/Card'
import { ReactTable } from 'components/ReactTable/ReactTable'
import { RawText, Text } from 'components/Text'
import { useModal } from 'hooks/useModal/useModal'
import { bnOrZero } from 'lib/bignumber/bignumber'
import {
  ActiveStakingOpportunity,
  selectAllStakingDataByValidator,
  selectStakingOpportunitiesDataFull,
  selectValidatorIds,
} from 'state/slices/portfolioSlice/selectors'
import {
  selectAccountSpecifier,
  selectAssetByCAIP19,
  selectMarketDataById,
} from 'state/slices/selectors'
import { selectAllValidatorsData } from 'state/slices/validatorDataSlice/selectors'
import { useAppSelector } from 'state/store'

type StakingOpportunitiesProps = {
  assetId: CAIP19
}

type ValidatorNameProps = {
  moniker: string
  isStaking: boolean
  validatorAddress: string
}

export const ValidatorName = ({ moniker, isStaking, validatorAddress }: ValidatorNameProps) => {
  const isLoaded = true
  const assetIcon = isStaking
    ? `https://raw.githubusercontent.com/cosmostation/cosmostation_token_resource/master/moniker/cosmoshub/${validatorAddress}.png`
    : 'https://assets.coincap.io/assets/icons/256/atom.png'

  return (
    <Box cursor='pointer'>
      <Flex alignItems='center' maxWidth='180px' mr={'-20px'}>
        <SkeletonCircle boxSize='8' isLoaded={isLoaded} mr={4}>
          <AssetIcon src={assetIcon} boxSize='8' />
        </SkeletonCircle>
        <Skeleton isLoaded={isLoaded} cursor='pointer'>
          {isStaking && (
            <Tag colorScheme='blue'>
              <TagLabel>{moniker}</TagLabel>
            </Tag>
          )}
          {!isStaking && <RawText fontWeight='bold'>{`${moniker}`}</RawText>}
        </Skeleton>
      </Flex>
    </Box>
  )
}

export const StakingOpportunities = ({ assetId }: StakingOpportunitiesProps) => {
  const asset = useAppSelector(state => selectAssetByCAIP19(state, assetId))
  const marketData = useAppSelector(state => selectMarketDataById(state, assetId))

  const accountSpecifiers = useAppSelector(state => selectAccountSpecifier(state, asset?.caip2))
  const accountSpecifier = accountSpecifiers?.[0]

  const stakingOpportunitiesData = useAppSelector(state =>
    selectStakingOpportunitiesDataFull(state, accountSpecifier, '', assetId),
  )
  const rows = stakingOpportunitiesData

  const { cosmosGetStarted, cosmosStaking } = useModal()

  const handleGetStartedClick = (e: MouseEvent<HTMLButtonElement>) => {
    cosmosGetStarted.open({ assetId })
    e.stopPropagation()
  }

  const handleStakedClick = (values: Row<ActiveStakingOpportunity>) => {
    cosmosStaking.open({
      assetId,
      validatorAddress: values.original.address,
    })
  }

  const columns: Column<{ validatorId: string; accountSpecifier: string }>[] = useMemo(
    () => [
      {
        Header: <Text translation='defi.validator' />,
        id: 'moniker',
        display: { base: 'table-cell' },
        Cell: ({ row }: { row: { original: any } }) => {
          const validator = row.original

          return (
            <Skeleton isLoaded={Boolean(Object.keys(validator).length)}>
              <ValidatorName
                validatorAddress={validator?.address || ''}
                moniker={validator?.moniker || ''}
                isStaking={true}
              />
            </Skeleton>
          )
        },
        disableSortBy: true,
      },
      {
        Header: <Text translation='defi.apr' />,
        id: 'apr',
        display: { base: 'table-cell' },
        Cell: ({ row }: { row: { original: any } }) => {
          const validator = row.original

          return (
            <Skeleton isLoaded={Boolean(Object.keys(validator).length)}>
              <AprTag percentage={validator?.apr} showAprSuffix />
            </Skeleton>
          )
        },
        disableSortBy: true,
      },
      {
        Header: <Text translation='defi.stakedAmount' />,
        id: 'cryptoAmount',
        isNumeric: true,
        display: { base: 'table-cell' },
        Cell: ({ row }: { row: { original: any } }) => {
          const { totalDelegations } = row.original

          // TODO: Proper loading state
          return Boolean(true) ? (
            <Amount.Crypto
              value={bnOrZero(totalDelegations)
                .div(`1e+${asset.precision}`)
                .decimalPlaces(asset.precision)
                .toString()}
              symbol={asset.symbol}
              color='white'
              fontWeight={'normal'}
            />
          ) : (
            <Box minWidth={{ base: '0px', md: '200px' }} />
          )
        },
        disableSortBy: true,
      },
      {
        Header: <Text translation='defi.rewards' />,
        accessor: 'rewards',
        display: { base: 'table-cell' },
        Cell: ({ row }: { row: { original: any } }) => {
          const validatorRewards = row.original?.rewards
          const rewards = validatorRewards?.amount ?? '0'
          if (!Object.keys(validatorRewards).length) return null

          return Boolean(Object.keys(validatorRewards)) ? (
            <HStack fontWeight={'normal'}>
              <Amount.Crypto
                value={bnOrZero(rewards)
                  .div(`1e+${asset.precision}`)
                  .decimalPlaces(asset.precision)
                  .toString()}
                symbol={asset.symbol}
              />
              <Amount.Fiat
                value={bnOrZero(rewards)
                  .div(`1e+${asset.precision}`)
                  .times(bnOrZero(marketData.price))
                  .toPrecision()}
                color='green.500'
                prefix='≈'
              />
            </HStack>
          ) : (
            <Box width='100%' textAlign={'right'}>
              <Button
                onClick={handleGetStartedClick}
                as='span'
                colorScheme='blue'
                variant='ghost-filled'
                size='sm'
                cursor='pointer'
              >
                <Text translation='common.getStarted' />
              </Button>
            </Box>
          )
        },
        disableSortBy: true,
      },
    ],
    // React-tables requires the use of a useMemo
    // but we do not want it to recompute the values onClick
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountSpecifier],
  )
  return (
    <Card>
      <Card.Header flexDir='row' display='flex'>
        <HStack justify='space-between' flex={1}>
          <Card.Heading>
            <Text translation='staking.staking' />
          </Card.Heading>

          <Button size='sm' variant='link' colorScheme='blue' as={NavLink} to='/defi/earn'>
            <Text translation='common.seeAll' /> <ArrowForwardIcon />
          </Button>
        </HStack>
      </Card.Header>
      <Card.Body pt={0} px={2}>
        <ReactTable
          // We just pass normalized validator IDs here. Everything we need can be gotten from selectors
          data={rows}
          columns={columns}
          displayHeaders={true}
          onRowClick={handleStakedClick}
        />
      </Card.Body>
    </Card>
  )
}
