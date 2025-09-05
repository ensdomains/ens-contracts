import { createAnvil } from '@viem/anvil'
import { executeDeployScripts, resolveConfig } from 'rocketh'
import { createWalletClient, http } from 'viem'

const t0 = Date.now()

const anvil = createAnvil()
await anvil.start()

const hostPort = `http://${anvil.host}:${anvil.port}`

const pollingInterval = 1

const client = createWalletClient({
  transport: http(hostPort),
  pollingInterval,
})

const [deployer, owner] = await client.requestAddresses()
const accounts = { deployer, owner }

process.env.BATCH_GATEWAY_URLS = '["x-batch-gateway:true"]'

const env = await executeDeployScripts(
  resolveConfig({
    network: {
      name: 'local',
      tags: ['test', 'legacy', 'use_root', 'allow_unsafe'],
      nodeUrl: hostPort,
      fork: false,
      pollingInterval: Math.max(1, pollingInterval) / 1000, // can't be 0
    },
    accounts,
    askBeforeProceeding: false,
    saveDeployments: false,
    logLevel: 1,
  }),
)

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
