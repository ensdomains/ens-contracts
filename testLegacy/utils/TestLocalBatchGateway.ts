import {
  decodeFunctionResult,
  encodeFunctionData,
  parseAbi,
  zeroAddress,
} from 'viem'
import {
  fetchBatchGateway,
  serveBatchGateway,
} from '../fixtures/localBatchGateway.js'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { expect } from 'chai'

describe('TestLocalBatchGateway', () => {
  it('OffchainDNSOracle', async () => {
    const { shutdown, localBatchGatewayUrl } = await serveBatchGateway()
    after(shutdown)
    const abi = parseAbi([
      'function resolve(bytes memory name, uint16 qtype) view returns (RRSetWithSignature[] memory rrs)',
      'struct RRSetWithSignature { bytes rrset; bytes sig; }',
    ])
    const domains = ['brantly.rocks', 'raffy.xyz']
    const [failures, responses] = await fetchBatchGateway(
      localBatchGatewayUrl,
      domains.map((x) => ({
        sender: zeroAddress,
        urls: ['https://dnssec-oracle.ens.domains/'],
        data: encodeFunctionData({
          abi,
          args: [dnsEncodeName(x), 16],
        }),
      })),
    )
    expect(failures.some((x) => x)).toStrictEqual(false) // none should fail
    responses.forEach((data) => decodeFunctionResult({ abi, data })) // all should decode
  })
})
