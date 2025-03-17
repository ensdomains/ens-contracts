import { createServer } from 'node:http'
import {
  type Address,
  type Hex,
  BaseError,
  HttpRequestError,
  ccipRequest,
  decodeFunctionData,
  decodeFunctionResult,
  encodeErrorResult,
  encodeFunctionData,
  encodeFunctionResult,
  isHex,
  parseAbi,
  zeroAddress,
} from 'viem'

const abi = parseAbi([
  'function query(Request[]) external view returns (bool[] memory failures, bytes[] memory responses)',
  'struct Request { address sender; string[] urls; bytes data; }',
  'error HttpError(uint16 status, string message)',
  'error Error(string message)',
])

type Request = {
  sender: Address
  urls: string[]
  data: Hex
}

export async function fetchBatchGateway(
  batchedGatewayURL: string,
  requests: Request[],
  sender: Address = zeroAddress,
) {
  const res = await fetch(batchedGatewayURL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sender,
      data: encodeFunctionData({
        abi,
        functionName: 'query',
        args: [requests],
      }),
    }),
  })
  if (!res.ok) {
    throw new HttpRequestError({
      status: res.status,
      url: batchedGatewayURL,
    })
  }
  const { data } = await res.json()
  const [failures, responses] = decodeFunctionResult({
    abi,
    functionName: 'query',
    data,
  })
  return [failures, responses] as const
}

export async function serveBatchGateway(
  ccipRequest_: typeof ccipRequest = ccipRequest,
) {
  return new Promise<{
    shutdown: () => Promise<void>
    localBatchGatewayUrl: string
  }>((ful) => {
    const http = createServer(async (req, res) => {
      let data: any
      switch (req.method) {
        case 'GET': {
          data = new URL(req.url!).searchParams.get('data')
          break
        }
        case 'POST': {
          const body: Buffer[] = []
          for await (const x of req) body.push(x)
          ;({ data } = JSON.parse(Buffer.concat(body).toString()))
          break
        }
        default:
          return res.writeHead(405).end('expect GET or POST')
      }
      if (!isHex(data)) return res.writeHead(400).end('expect Hex')
      const {
        args: [requests],
      } = decodeFunctionData({ abi, data })
      const failures: boolean[] = []
      const responses: Hex[] = []
      await Promise.all(
        requests.map(async (r, i) => {
          try {
            responses[i] = await ccipRequest_({
              ...r,
              // workaround for https://github.com/wevm/viem/pull/3449
              sender: r.sender.toLowerCase() as Address,
            })
            failures[i] = false
          } catch (err) {
            failures[i] = true
            responses[i] = encodeError(err)
          }
        }),
      )
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          data: encodeFunctionResult({
            abi,
            functionName: 'query',
            result: [failures, responses],
          }),
        }),
      )
    })
    let killer: Promise<void> | undefined
    function shutdown() {
      if (!killer) {
        if (!http.listening) return Promise.resolve()
        killer = new Promise((ful) =>
          http.close(() => {
            killer = undefined
            ful()
          }),
        )
      }
      return killer
    }
    http.listen(() => {
      const { port } = http.address() as { port: number }
      ful({
        shutdown,
        localBatchGatewayUrl: `http://localhost:${port}/`,
      })
    })
  })
}

function encodeError(err: unknown): Hex {
  if (err instanceof HttpRequestError && err.status) {
    return encodeErrorResult({
      abi,
      errorName: 'HttpError',
      args: [err.status, err.shortMessage],
    })
  }
  return encodeErrorResult({
    abi,
    errorName: 'Error',
    args: [
      err instanceof Error
        ? err instanceof BaseError
          ? err.shortMessage
          : err.message
        : String(err),
    ],
  })
}
