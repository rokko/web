import { Stack, StackProps } from '@chakra-ui/react'
// import { useCallback } from 'react'
import { useTranslate } from 'react-polyglot'
import { Link as ReactRouterLink } from 'react-router-dom'
import { routes } from 'Routes/RoutesCommon'
import { useWallet } from 'hooks/useWallet/useWallet'

import { MainNavLink } from './MainNavLink'

type NavBarProps = {
  isCompact?: boolean
} & StackProps

export const NavBar = ({ isCompact, ...rest }: NavBarProps) => {
  const translate = useTranslate()
  const {
    state: { isDemoWallet },
  } = useWallet()

  return (
    <Stack width='full' flex='1 1 0%' {...rest}>
      {routes
        .filter(
          route => !route.disable && !route.hide && !(isDemoWallet && route.path === '/accounts'),
        )
        .map((item, idx) => {
          return (
            <MainNavLink
              isCompact={isCompact}
              as={ReactRouterLink}
              key={idx}
              leftIcon={item.icon}
              href={item.path}
              to={item.path}
              label={translate(item.label)}
              aria-label={translate(item.label)}
              data-test={`navbar-${item.label.split('.')[1]}-button`}
            />
          )
        })}
    </Stack>
  )
}
