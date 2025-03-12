import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { serveBatchedGateway } from '../fixtures/batchedGateway.js'
import { shortCoin } from '../fixtures/ensip19.js'
import { isForkedMainnet } from '../fixtures/forked.js'
import {
  ENS_REGISTRY,
  KNOWN_PRIMARIES,
  KNOWN_RESOLUTIONS,
} from './mainnetTests.js'
import { bundleCalls, makeCalls } from './testUtils.js'

async function fixture() {
  const bg = await serveBatchedGateway()
  after(bg.shutdown)
  const ForwardResolution = await hre.viem.deployContract('ForwardResolution', [
    ENS_REGISTRY,
    [bg.batchedGatewayURL],
  ])
  const UniversalResolver = await hre.viem.deployContract(
    'UniversalResolver2',
    [ForwardResolution.address],
  )
  return { ForwardResolution, UniversalResolver }
}

;(isForkedMainnet() ? describe : describe.skip)(
  'UniversalResolver2 @ mainnet',
  () => {
    for (const x of KNOWN_RESOLUTIONS) {
      it(`resolve: ${x.style}: ${x.name}`, async () => {
        const calls = makeCalls(x)
        const { unbundle, call } = bundleCalls(calls)
        const { UniversalResolver } = await loadFixture(fixture)
        const [bundledAnswer] = await UniversalResolver.read.resolve([
          dnsEncodeName(x.name),
          call,
        ])
        const answers = unbundle(bundledAnswer)
        expect(answers.length, 'length').toStrictEqual(calls.length)
        answers.forEach((data, i) => calls[i].expect(data))
      })
    }
    for (const x of KNOWN_PRIMARIES) {
      it(`reverse: ${shortCoin(x.coinType)} ${x.encodedAddress}`, async () => {
        const { UniversalResolver } = await loadFixture(fixture)
        const promise = UniversalResolver.read.reverse([
          x.encodedAddress,
          x.coinType,
        ])
        if (x.expectError) {
          await expect(promise).rejects.toThrow()
        } else {
          const [name] = await promise
          if (x.expectPrimary) expect(name).toBeTruthy()
        }
      })
    }
  },
)
