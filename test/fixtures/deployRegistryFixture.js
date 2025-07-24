import hre from 'hardhat'
import { getAddress, labelhash, namehash } from 'viem'
export async function deployRegistryFixture() {
  const connection = await hre.network.connect()
  const [wallet] = await connection.viem.getWalletClients()
  const owner = getAddress(wallet.account.address)
  const ensRegistry = await connection.viem.deployContract('ENSRegistry')
  async function takeControl(name) {
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
  return { owner, ensRegistry, takeControl }
}
