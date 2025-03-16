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
  'function query(Query[] queries) external view returns (bool[] memory failures, bytes[] memory responses)',
  'struct Query { address sender; string[] urls; bytes data; }',
  'error HttpError(uint16 status, string message)',
  'error Error(string message)',
])

type Query = {
  sender: Address
  urls: string[]
  data: Hex
}

export async function fetchBatchGateway(
  batchedGatewayURL: string,
  queries: Query[],
  sender = zeroAddress,
) {
  const res = await fetch(batchedGatewayURL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sender,
      data: encodeFunctionData({
        abi,
        functionName: 'query',
        args: [queries],
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

export async function serveBatchGateway() {
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
        args: [queries],
      } = decodeFunctionData({ abi, data })
      const failures: boolean[] = []
      const responses: Hex[] = []
      await Promise.all(
        queries.map(async (x, i) => {
          try {
            responses[i] = await ccipRequest({
              ...x,
              // workaround for https://github.com/wevm/viem/pull/3449
              sender: x.sender.toLowerCase() as Address,
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

// import { serve } from 'bun'
// export async function serveBatchedGateway2(): Promise<{
//   shutdown: () => Promise<void>
//   batchedGatewayURL: string
// }> {
//   const server = serve({
//     routes: {
//       '/': {
//         POST: async (req) => {
//           const { data } = (await req.json()) as { data: Hex }
//           const {
//             args: [queries],
//           } = decodeFunctionData({ abi, data })
//           const failures: boolean[] = []
//           const responses: Hex[] = []
//           await Promise.all(
//             queries.map(async (x, i) => {
//               try {
//                 responses[i] = await ccipRequest(x)
//               } catch (err) {
//                 failures[i] = true
//                 responses[i] = encodeErrorResult({
//                   abi,
//                   errorName: 'HttpError',
//                   args: [
//                     (err instanceof HttpRequestError && err.status) || 500,
//                     String(err),
//                   ],
//                 })
//               }
//             }),
//           )
//           return Response.json({
//             data: encodeFunctionResult({
//               abi,
//               functionName: 'query',
//               result: [failures, responses],
//             }),
//           })
//         },
//       },
//     },
//   })
//   return {
//     shutdown: server.stop.bind(true),
//     batchedGatewayURL: `http://localhost:${server.port}/`,
//   }
// }
