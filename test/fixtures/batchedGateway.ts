import { createServer } from 'node:http'
import {
  Address,
  ccipRequest,
  decodeFunctionData,
  decodeFunctionResult,
  encodeErrorResult,
  encodeFunctionData,
  encodeFunctionResult,
  Hex,
  HttpRequestError,
  parseAbi,
  zeroAddress,
} from 'viem'

const abi = parseAbi([
  'function query(BatchedGatewayQuery[] queries) external view returns (bool[] memory failures, bytes[] memory responses)',
  'error HttpError(uint16 status, string message)',
  'struct BatchedGatewayQuery { address sender; string[] urls; bytes data; }',
])

type Query = {
  sender: Address
  urls: string[]
  data: Hex
}

export async function fetchBatchedGateway(
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

export async function serveBatchedGateway(): Promise<{
  shutdown: () => Promise<void>
  batchedGatewayURL: string
}> {
  return new Promise((ful) => {
    const http = createServer(async (req, res) => {
      if (req.method !== 'POST') return res.writeHead(405).end()
      const body: Buffer[] = []
      for await (const x of req) body.push(x)
      const { data } = JSON.parse(Buffer.concat(body).toString())
      const {
        args: [queries],
      } = decodeFunctionData({ abi, data })
      const failures: boolean[] = []
      const responses: Hex[] = []
      await Promise.all(
        queries.map(async (x, i) => {
          try {
            responses[i] = await ccipRequest(x)
            failures[i] = false
          } catch (err) {
            failures[i] = true
            responses[i] = encodeErrorResult({
              abi,
              errorName: 'HttpError',
              args: [
                (err instanceof HttpRequestError && err.status) || 500,
                String(err),
              ],
            })
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
        batchedGatewayURL: `http://localhost:${port}/`,
      })
    })
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
