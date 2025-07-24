import { createAnvil } from '@viem/anvil'
import { execSync } from 'child_process'

const server = createAnvil({
  host: '127.0.0.1',
  port: 8545,
})

await server.start()

const exitHandler = async (c: number) => {
  if (process.env.CI) process.exit(c)
  else await server.stop()
}

process.on('exit', exitHandler)

process.on('beforeExit', exitHandler)

execSync('bun rocketh --network localhost --skip-prompts', {
  stdio: 'inherit',
  env: {
    ...process.env,
    BATCH_GATEWAY_URLS: '["https://example.com/"]',
  },
})

await exitHandler(0)
