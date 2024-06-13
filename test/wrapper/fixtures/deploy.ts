import hre from 'hardhat'
import { labelhash, namehash, zeroAddress, zeroHash } from 'viem'

export async function deployNameWrapperFixture() {
  const accounts = await hre.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))
  const publicClient = await hre.viem.getPublicClient()
  const testClient = await hre.viem.getTestClient()
  const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])
  const baseRegistrar = await hre.viem.deployContract(
    'BaseRegistrarImplementation',
    [ensRegistry.address, namehash('eth')],
  )

  await baseRegistrar.write.addController([accounts[0].address])
  await baseRegistrar.write.addController([accounts[1].address])

  const metadataService = await hre.viem.deployContract(
    'StaticMetadataService',
    ['https://ens.domains'],
  )

  // setup reverse registrar
  const reverseRegistrar = await hre.viem.deployContract('ReverseRegistrar', [
    ensRegistry.address,
  ])

  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('reverse'),
    accounts[0].address,
  ])
  await ensRegistry.write.setSubnodeOwner([
    namehash('reverse'),
    labelhash('addr'),
    reverseRegistrar.address,
  ])

  const publicResolver = await hre.viem.deployContract('PublicResolver', [
    ensRegistry.address,
    zeroAddress,
    zeroAddress,
    reverseRegistrar.address,
  ])

  await reverseRegistrar.write.setDefaultResolver([publicResolver.address])

  const nameWrapper = await hre.viem.deployContract('NameWrapper', [
    ensRegistry.address,
    baseRegistrar.address,
    metadataService.address,
  ])

  const nameWrapperUpgraded = await hre.viem.deployContract(
    'UpgradedNameWrapperMock',
    [ensRegistry.address, baseRegistrar.address],
  )

  // setup .eth
  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('eth'),
    baseRegistrar.address,
  ])

  // setup .xyz
  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('xyz'),
    accounts[0].address,
  ])

  return {
    ensRegistry,
    baseRegistrar,
    metadataService,
    reverseRegistrar,
    publicResolver,
    nameWrapper,
    nameWrapperUpgraded,
    accounts,
    publicClient,
    testClient,
  }
}

export type DeployNameWrapperFixtureResult = Awaited<
  ReturnType<typeof deployNameWrapperFixture>
>
