import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { BATCHED_GATEWAY_MAINNET } from '../fixtures/gateways.js'
import {
  ENS_REGISTRY,
  KNOWN_PRIMARIES,
  KNOWN_RESOLUTIONS,
} from './mainnetTests.js'
import { bundleCalls, makeResolutionCalls } from './testUtils.js'
import { shortCoin } from '../fixtures/ensip19.js'
import { isForkedMainnet } from '../fixtures/forked.js'

async function fixture() {
  const ForwardResolution = await hre.viem.deployContract('ForwardResolution', [
    ENS_REGISTRY,
    [BATCHED_GATEWAY_MAINNET],
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
    for (const kr of KNOWN_RESOLUTIONS) {
      it(`resolve: ${kr.style}: ${kr.name}`, async () => {
        const calls = makeResolutionCalls(kr)
        const { unbundle, call } = bundleCalls(calls)
        const { UniversalResolver } = await loadFixture(fixture)
        const promise = UniversalResolver.read.resolve([
          dnsEncodeName(kr.name),
          call,
        ])
        if (kr.expectUnreachable) {
          await expect(promise).rejects.toThrow()
        } else {
          const [bundledAnswer] = await promise
          const answers = unbundle(bundledAnswer)
          for (let i = 0; i < answers.length; i++) {
            calls[i].expect(answers[i])
          }
        }
      })
    }
    for (const kp of KNOWN_PRIMARIES) {
      it(`reverse: ${shortCoin(kp.coinType)} ${
        kp.encodedAddress
      }`, async () => {
        const { UniversalResolver } = await loadFixture(fixture)
        const promise = UniversalResolver.read.reverse([
          kp.encodedAddress,
          kp.coinType,
        ])
        if (kp.expectError) {
          await expect(promise).rejects.toThrow()
        } else {
          await expect(promise).resolves.toBeDefined()
        }
      })
    }
  },
)
