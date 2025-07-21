import hre from 'hardhat'
import { getAddress, labelhash, namehash } from 'viem'

export async function deployRegistryFixture() {
  const [wallet] = await hre.viem.getWalletClients()
  const owner = getAddress(wallet.account.address)
  const ensRegistry = await hre.viem.deployContract('ENSRegistry')
  return { owner, ensRegistry, takeControl }
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
}
