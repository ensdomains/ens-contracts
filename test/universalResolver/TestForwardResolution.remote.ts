import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { isForkedMainnet } from '../fixtures/forked.js'
import { BATCHED_GATEWAY_MAINNET } from '../fixtures/gateways.js'
import {
  ENS_REGISTRY,
  KNOWN_PRIMARIES,
  KNOWN_RESOLUTIONS,
} from './mainnetTests.js'
import { bundleCalls, makeResolutionCalls } from './testUtils.js'
import { shortCoin } from '../fixtures/ensip19.js'

async function fixture() {
  const ForwardResolution = await hre.viem.deployContract('ForwardResolution', [
    ENS_REGISTRY,
    [BATCHED_GATEWAY_MAINNET],
  ])
  return { ForwardResolution, UniversalResolver }
}

;(isForkedMainnet() ? describe : describe.skip)(
  'UniversalResolver2 @ mainnet',
  () => {
    for (const kr of KNOWN_RESOLUTIONS) {
      it(`resolve: ${kr.style}: ${kr.name}`, async () => {
        const calls = makeResolutionCalls(kr)
        const { ForwardResolution } = await loadFixture(fixture)
        // const promise = ForwardResolution.read.resolve([
        // 	dnsEncodeName(kr.name),
        // 	call,
        // 	[],
        // ])
      })
    }
  },
)
