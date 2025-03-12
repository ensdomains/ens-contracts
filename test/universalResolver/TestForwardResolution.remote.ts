import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { serveBatchedGateway } from '../fixtures/batchedGateway.js'
import { isForkedMainnet } from '../fixtures/forked.js'
import { ENS_REGISTRY, KNOWN_RESOLUTIONS } from './mainnetTests.js'
import { makeCalls, RESPONSE_BITS } from './testUtils.js'
import { zeroAddress } from 'viem'

async function fixture() {
  const bg = await serveBatchedGateway()
  after(bg.shutdown)
  const ForwardResolution = await hre.viem.deployContract('ForwardResolution', [
    ENS_REGISTRY,
    [bg.batchedGatewayURL],
  ])
  return { ForwardResolution }
}

;(isForkedMainnet() ? describe.only : describe.skip)(
  'ForwardResolution @ mainnet',
  () => {
    for (const x of KNOWN_RESOLUTIONS) {
      it(`resolve: ${x.style}: ${x.name}`, async () => {
        const calls = makeCalls(x)
        const { ForwardResolution } = await loadFixture(fixture)
        const [lookup, results] = await ForwardResolution.read.resolve([
          dnsEncodeName(x.name),
          calls.map((x) => x.call),
          [],
        ])
        expect(lookup.resolver, 'resolver').not.toEqualAddress(zeroAddress)
        expect(results.length, 'length').toStrictEqual(calls.length)
        expect(!!lookup.offset, 'wildcard').toStrictEqual(!!x.wildcard)
        for (let i = 0; i < results.length; i++) {
          let expectedBits = RESPONSE_BITS.RESOLVED
          if (calls[i].origin != 'on') expectedBits |= RESPONSE_BITS.OFFCHAIN
          if (calls[i].origin == 'batched')
            expectedBits |= RESPONSE_BITS.BATCHED
          expect(results[i].bits, `${calls[i].desc}: bits`).toStrictEqual(
            expectedBits,
          )
          calls[i].expect(results[i].data)
        }
      })
    }
  },
)
