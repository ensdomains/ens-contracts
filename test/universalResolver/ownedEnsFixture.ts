import hre from 'hardhat'
import { labelhash, namehash, zeroAddress } from 'viem'
import { serveBatchedGateway } from '../fixtures/batchedGateway.js'

export async function ownedEnsFixture() {
  const wallets = await hre.viem.getWalletClients()
  const owner = wallets[0].account.address

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

  const bg = await serveBatchedGateway()
  after(bg.shutdown)

  const ForwardResolution = await hre.viem.deployContract('ForwardResolution', [
    ENSRegistry.address,
    [bg.batchedGatewayURL],
  ])

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

  return {
    owner,
    ForwardResolution,
    ENSRegistry,
    PublicResolver,
    ReverseRegistrar,
    takeControl,
  }
}
