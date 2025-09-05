import type { NetworkConnection } from 'hardhat/types/network'
import { getAddress, labelhash, namehash, zeroAddress } from 'viem'
import { oldResolverArtifact } from '../fixtures/OldResolver.js'

export async function ownedEnsFixture(connection: NetworkConnection) {
  const wallets = await connection.viem.getWalletClients()
  const owner = getAddress(wallets[0].account.address)

  const ENSRegistry = await connection.viem.deployContract('ENSRegistry')

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

  const ReverseRegistrar = await connection.viem.deployContract(
    'ReverseRegistrar',
    [ENSRegistry.address],
  )
  await takeControl('addr.reverse')
  await ENSRegistry.write.setOwner([
    namehash('addr.reverse'),
    ReverseRegistrar.address,
  ])

  const PublicResolver = await connection.viem.deployContract(
    'PublicResolver',
    [
      ENSRegistry.address,
      zeroAddress, // nameWrapper
      zeroAddress, // ethController
      ReverseRegistrar.address,
    ],
  )
  await ReverseRegistrar.write.setDefaultResolver([PublicResolver.address])

  const OldResolver = await connection.viem.deployContract(oldResolverArtifact)
  const Shapeshift1 = await connection.viem.deployContract(
    'DummyShapeshiftResolver',
  )
  const Shapeshift2 = await connection.viem.deployContract(
    'DummyShapeshiftResolver',
  )

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
