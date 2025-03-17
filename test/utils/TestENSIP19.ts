import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import {
  COIN_TYPE_ETH,
  EVM_BIT,
  getReverseName,
  shortCoin,
} from '../fixtures/ensip19.js'

async function fixture() {
  return hre.viem.deployContract('TestENSIP19', [])
}

describe('ENSIP19', () => {
  describe('reverseName()', () => {
    it('empty', async () => {
      const F = await loadFixture(fixture)
      await expect(F)
        .read('reverseName', ['0x', COIN_TYPE_ETH])
        .toBeRevertedWithCustomError('EmptyAddress')
    })

    for (const addr of [
      '0x81',
      '0x8000000000000000000000000000000000000001',
      '0x8000000000000000000000000000000000000000000000000000000000000001',
    ] as const) {
      it(addr, async () => {
        const F = await loadFixture(fixture)
        for (const coinType of [COIN_TYPE_ETH, EVM_BIT, 0n]) {
          await expect(
            F.read.reverseName([addr, coinType]),
            shortCoin(coinType),
          ).resolves.toStrictEqual(getReverseName(addr, coinType))
        }
      })
    }
  })
})
