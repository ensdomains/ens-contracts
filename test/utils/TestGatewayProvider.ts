import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'

const URLS = ['a', 'ab', 'abc']

async function fixture() {
  const [walletClient] = await hre.viem.getWalletClients()
  const gatewayProvider = await hre.viem.deployContract('GatewayProvider', [
    walletClient.account.address,
    URLS,
  ])
  const shuffledGatewayProvider = await hre.viem.deployContract(
    'ShuffledGatewayProvider',
    [gatewayProvider.address],
  )
  return { gatewayProvider, shuffledGatewayProvider }
}

describe('TestGatewayProvider', () => {
  describe('GatewayProvider', () => {
    it('gateways()', async () => {
      const F = await loadFixture(fixture)
      const urls = await F.gatewayProvider.read.gateways()
      expect(urls).toStrictEqual(URLS)
    })
    it('setGateways()', async () => {
      const F = await loadFixture(fixture)
      const urls = ['x', 'y']
      await F.gatewayProvider.write.setGateways([urls])
      expect(F.gatewayProvider.read.gateways()).resolves.toStrictEqual(urls)
    })
  })

  describe('ShuffledGatewayProvider', () => {
    it('gateways()', async () => {
      const F = await loadFixture(fixture)
      const set = new Set<string>()
      for (let i = 0; i < 50; i++) {
        await hre.network.provider.send('hardhat_mine', ['0x1'])
        set.add(String(await F.shuffledGatewayProvider.read.gateways()))
      }
      let n = 1
      for (let i = URLS.length; i; i--) n *= i
      expect(set.size).toStrictEqual(n)
    })
  })
})
