import hre from 'hardhat'
import { getAddress, labelhash, namehash, zeroAddress } from 'viem'

export async function ownedEnsFixture() {
  const wallets = await hre.viem.getWalletClients()
  const owner = getAddress(wallets[0].account.address)

  const ENSRegistry = await hre.viem.deployContract('ENSRegistry')

  async function takeControl(name: string) {
    if (name) {
      const labels = name.split('.')
      for (let i = labels.length; i > 0; i--) {
        await ENSRegistry.write.setSubnodeOwner([
          namehash(labels.slice(i).join('.')),
          labelhash(labels[i - 1]),
          owner,
        ])
      }
    }
  }

  const ReverseRegistrar = await hre.viem.deployContract('ReverseRegistrar', [
    ENSRegistry.address,
  ])
  await takeControl('addr.reverse')
  await ENSRegistry.write.setOwner([
    namehash('addr.reverse'),
    ReverseRegistrar.address,
  ])

  const PublicResolver = await hre.viem.deployContract('PublicResolver', [
    ENSRegistry.address,
    zeroAddress, // nameWrapper
    zeroAddress, // ethController
    ReverseRegistrar.address,
  ])
  await ReverseRegistrar.write.setDefaultResolver([PublicResolver.address])

  const OldResolver = await hre.viem.deployContract('DummyOldResolver')
  const Shapeshift1 = await hre.viem.deployContract('DummyShapeshiftResolver')
  const Shapeshift2 = await hre.viem.deployContract('DummyShapeshiftResolver')

  return {
    owner,
    ENSRegistry,
    PublicResolver,
    ReverseRegistrar,
    OldResolver,
    Shapeshift1,
    Shapeshift2,
    takeControl,
  }
}
