#!/usr/bin/env bun
import { execSync } from 'child_process'
import { createServer } from 'http'
import {
  http,
  isAddress,
  type Address,
  type EIP1193RequestFn,
  type HttpTransportConfig,
  type PublicRpcSchema,
  type TestRpcSchema,
  type Transport,
} from 'viem'
import * as chains_ from 'viem/chains'
const chains = chains_ as unknown as (typeof chains_)['default']

// parse cli args
const args = process.argv.slice(2)
let rpcUrl = ''
const port = '8546'
const accounts: Address[] = []
let tags: string = ''

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--rpc-url':
      rpcUrl = args[++i]
      break
    case '--accounts':
      while (args[i + 1] && !args[i + 1].startsWith('--')) {
        const account = args[++i]
        if (!isAddress(account)) {
          console.error(`invalid account: ${account}`)
          process.exit(1)
        }
        accounts.push(account)
      }
      break
    case '--tags':
      tags = args[++i]
      break
  }
}

if (!rpcUrl || accounts.length === 0) {
  console.error(
    'usage: --rpc-url <url> --accounts <addr1> [addr2 ...] [--tags <tags>]',
  )
  process.exit(1)
}

type HttpTransport = Transport<
  'http',
  {
    fetchOptions?: HttpTransportConfig['fetchOptions'] | undefined
    url?: string | undefined
  },
  EIP1193RequestFn<[...PublicRpcSchema, ...TestRpcSchema<'anvil'>]>
>

const rpcClient = (
  http(rpcUrl, { batch: false, retryCount: 0 }) as HttpTransport
)({})

const chainId = await rpcClient.request({ method: 'eth_chainId' }).then(Number)
const chain = Object.entries(chains).find(([_, c]) => c.id === chainId)
if (!chain) {
  console.error(`unknown chain id: ${chainId}`)
  process.exit(1)
}
const network = chain[0]

const clientVersion = await rpcClient.request({ method: 'web3_clientVersion' })
if (clientVersion.startsWith('anvil/'))
  for (const account of accounts)
    await rpcClient.request({
      method: 'anvil_impersonateAccount',
      params: [account],
    })

const server = createServer((req, res) => {
  if (req.method !== 'POST') return res.writeHead(405).end()

  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', async () => {
    let reqJson
    try {
      reqJson = JSON.parse(body)
    } catch {
      return res.writeHead(400).end()
    }

    const { id, jsonrpc, method, params } = reqJson

    if (method === 'eth_accounts') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ jsonrpc, id, result: accounts }))
    }

    try {
      const proxyRes = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, jsonrpc, method, params }),
      })
      const text = await proxyRes.text()
      res.writeHead(proxyRes.status, { 'Content-Type': 'application/json' })
      res.end(text)
    } catch (e) {
      console.error('proxy error', e)
      res.writeHead(502).end()
    }
  })
})

server.listen(Number(port), () => {
  console.log(`proxy on :${port} → ${rpcUrl}`)
})

const exitHandler = async (c: number) => {
  if (process.env.CI) process.exit(c)
  else {
    server.close()
    process.exit(c)
  }
}

process.on('exit', exitHandler)
process.on('beforeExit', exitHandler)

execSync(
  `bun run hardhat --network ${network} deploy${tags ? ` --tags ${tags}` : ''}`,
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS:
        '--experimental-loader ts-node/esm/transpile-only --no-warnings',
      IMPERSONATION_PROXY_ENABLED: '1',
    },
  },
)

await exitHandler(0)
