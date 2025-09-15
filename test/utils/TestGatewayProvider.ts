import hre from 'hardhat'
import { describe, it, expect } from 'vitest'

const connection = await hre.network.connect()

const URLS = ['a', 'ab', 'abc']

async function fixture() {
  const [walletClient] = await connection.viem.getWalletClients()
  const gatewayProvider = await connection.viem.deployContract(
    'GatewayProvider',
    [walletClient.account.address, URLS],
  )
  const shuffledGatewayProvider = await connection.viem.deployContract(
    'ShuffledGatewayProvider',
    [gatewayProvider.address],
  )
  return { gatewayProvider, shuffledGatewayProvider }
}

describe('GatewayProvider', () => {
  describe('GatewayProvider', () => {
    it('gateways()', async () => {
      const F = await connection.networkHelpers.loadFixture(fixture)
      const urls = await F.gatewayProvider.read.gateways()
      expect(urls).toStrictEqual(URLS)
    })
    it('setGateways()', async () => {
      const F = await connection.networkHelpers.loadFixture(fixture)
      const urls = ['x', 'y']
      await F.gatewayProvider.write.setGateways([urls])
      expect(F.gatewayProvider.read.gateways()).resolves.toStrictEqual(urls)
    })
  })

  describe('ShuffledGatewayProvider', () => {
    it('gateways()', async () => {
      const F = await connection.networkHelpers.loadFixture(fixture)
      const set = new Set<string>()
      for (let i = 0; i < 100; i++) {
        await connection.networkHelpers.mine(1)
        set.add(String(await F.shuffledGatewayProvider.read.gateways()))
      }
      let n = 1
      for (let i = URLS.length; i; i--) n *= i
      expect(set.size).toStrictEqual(n)
    })
  })
})
