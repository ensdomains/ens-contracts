import type { NetworkConnection } from 'hardhat/types/network'
import { labelhash, namehash, zeroAddress, zeroHash } from 'viem'

import { getAccounts } from '../../fixtures/utils.js'

export async function deployNameWrapperFixture(connection: NetworkConnection) {
  const accounts = await getAccounts(connection)
  const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])
  const baseRegistrar = await connection.viem.deployContract(
    'BaseRegistrarImplementation',
    [ensRegistry.address, namehash('eth')],
  )

  await baseRegistrar.write.addController([accounts[0].address])
  await baseRegistrar.write.addController([accounts[1].address])

  const metadataService = await connection.viem.deployContract(
    'StaticMetadataService',
    ['https://ens.domains'],
  )

  // setup reverse registrar
  const reverseRegistrar = await connection.viem.deployContract(
    'ReverseRegistrar',
    [ensRegistry.address],
  )

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

  const publicResolver = await connection.viem.deployContract(
    'PublicResolver',
    [ensRegistry.address, zeroAddress, zeroAddress, reverseRegistrar.address],
  )

  await reverseRegistrar.write.setDefaultResolver([publicResolver.address])

  const nameWrapper = await connection.viem.deployContract('NameWrapper', [
    ensRegistry.address,
    baseRegistrar.address,
    metadataService.address,
  ])

  const nameWrapperUpgraded = await connection.viem.deployContract(
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
  }
}

export type DeployNameWrapperFixtureResult = Awaited<
  ReturnType<typeof deployNameWrapperFixture>
>
