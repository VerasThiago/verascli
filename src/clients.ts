import {Registry, Apps, Workspaces, Router} from '@vtex/api'

import endpoint from './endpoint'
import envTimeout from './timeout'
import {version} from '../package.json'
import {getRegistryAccount, saveRegistryAccount, getAccount, getWorkspace, getToken} from './conf'

const DEFAULT_TIMEOUT = 15000
const options = {
  authToken: 'abc123',
  account: getAccount(),
  region: 'aws-us-east-1',
  userAgent: `Toolbelt/${version}`,
  workspace: getWorkspace() || 'master',
  timeout: envTimeout || DEFAULT_TIMEOUT,
}

saveRegistryAccount('smartcheckout')

const interceptor = (client) => new Proxy({}, {
  get: (_, name) => () => {
    throw new Error(`Error trying to call ${client}.${name} before login.`)
  },
})

const [apps, router, registry, workspaces] = getToken()
  ? [
    Apps({...options, endpoint: endpoint('apps')}),
    Router({...options, endpoint: endpoint('router')}),
    Registry({...options, account: getRegistryAccount(), endpoint: endpoint('registry')}),
    Workspaces({...options, endpoint: endpoint('workspaces')}),
  ]
  : [
    interceptor('apps'),
    interceptor('router') ,
    interceptor('registry'),
    interceptor('workspaces'),
  ]

export {
  apps,
  router,
  registry,
  workspaces
}
