import { createAnvil } from '@viem/anvil'
import type { UnresolvedNetworkSpecificData, UnresolvedUnknownNamedAccounts, UserConfig } from 'rocketh/types'
import { createWalletClient, http } from 'viem'
import { loadAndExecuteDeploymentsFromFilesWithConfig } from '../rocketh/environment.js'

const t0 = Date.now()

const anvil = createAnvil()
await anvil.start()

const hostPort = `http://${anvil.host}:${anvil.port}`

const client = createWalletClient({
  transport: http(hostPort),
  pollingInterval: 0,
})

const [deployer, owner] = await client.requestAddresses()
const accounts = { deployer, owner }

process.env.BATCH_GATEWAY_URLS = '["x-batch-gateway:true"]'

const env = await loadAndExecuteDeploymentsFromFilesWithConfig({
  askBeforeProceeding: false,
  saveDeployments: false,
  defaultPollingInterval: 0.000001,
  environment: 'localhost',
}, {
  accounts: accounts as never,
  chains: {
    [31337]: {
      rpcUrl: hostPort,
      pollingInterval: 0.00000001,
      tags: ['test', 'legacy', 'use_root', 'allow_unsafe'],
    }
  },
  environments: {
    localhost: {
      chain: 31337,
    },
  },
} satisfies UserConfig<UnresolvedUnknownNamedAccounts, UnresolvedNetworkSpecificData>)

console.table(
  Object.entries(env.deployments).map(([name, { address }]) => ({
    name,
    address,
  })),
)

console.log(`\nReady <${Date.now() - t0}ms>`)

// the execa logic is completely broken and makes no sense
// await anvil.stop();

// anyway, this was launched as a child process
// so we can just exit
process.exit()

// TODO: maybe this should be `bun run devnet`?
