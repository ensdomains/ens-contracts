import {
  decodeFunctionResult,
  encodeFunctionData,
  parseAbi,
  zeroAddress,
} from 'viem'
import {
  fetchBatchedGateway,
  serveBatchedGateway,
} from '../fixtures/batchedGateway.js'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { expect } from 'chai'

describe('TestLocalBatchedGateway', () => {
  it('OffchainDNSOracle', async () => {
    const { shutdown, batchedGatewayURL } = await serveBatchedGateway()
    after(shutdown)
    const abi = parseAbi([
      'function resolve(bytes memory name, uint16 qtype) view returns (RRSetWithSignature[] memory rrs)',
      'struct RRSetWithSignature { bytes rrset; bytes sig; }',
    ])
    const domains = ['brantly.rocks', 'raffy.xyz']
    const [failures, responses] = await fetchBatchedGateway(
      batchedGatewayURL,
      domains.map((x) => ({
        sender: zeroAddress,
        urls: ['https://dnssec-oracle.ens.domains/'],
        data: encodeFunctionData({
          abi,
          args: [dnsEncodeName(x), 16],
        }),
      })),
    )
    // none should fail
    expect(failures.some((x) => x)).toStrictEqual(false)
    // they all should decode
    responses.forEach((data) => decodeFunctionResult({ abi, data }))
  })
})
