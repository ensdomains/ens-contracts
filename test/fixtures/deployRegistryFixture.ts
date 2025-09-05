import type { NetworkConnection } from 'hardhat/types/network'
import { getAddress, labelhash, namehash } from 'viem'

export async function deployRegistryFixture(connection: NetworkConnection) {
  const [walletClient] = await connection.viem.getWalletClients()
  const owner = getAddress(walletClient.account.address)
  const ensRegistry = await connection.viem.deployContract('ENSRegistry')

  async function takeControl(name: string) {
    if (name) {
      const labels = name.split('.')
      for (let i = labels.length; i > 0; i--) {
        await ensRegistry.write.setSubnodeOwner([
          namehash(labels.slice(i).join('.')),
          labelhash(labels[i - 1]),
          owner,
        ])
      }
    }
  }

  return { owner, walletClient, ensRegistry, takeControl }
}
