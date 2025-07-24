import hre from 'hardhat'
import { labelhash, namehash } from 'viem'
import { createInterfaceId } from './createInterfaceId.js'
export const ZERO_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000'
const setRootNodeOwner = async ({ ensRegistry, root }) => {
  await ensRegistry.write.setOwner([ZERO_HASH, root.address])
}
const setRootSubnodeOwner = async (
  connection,
  { root, label, owner: subnodeOwner },
) => {
  const [, owner] = await connection.viem.getWalletClients()
  return await root.write.setSubnodeOwner(
    [labelhash(label), subnodeOwner.address],
    {
      account: owner.account,
    },
  )
}
const setAddrReverseNodeOwner = async (
  connection,
  { ensRegistry, reverseRegistrar },
) => {
  const [, owner] = await connection.viem.getWalletClients()
  return await ensRegistry.write.setSubnodeOwner(
    [namehash('reverse'), labelhash('addr'), reverseRegistrar.address],
    {
      account: owner.account,
    },
  )
}
const setBaseRegistrarResolver = async (
  connection,
  { baseRegistrarImplementation, ethOwnedResolver },
) => {
  const [, owner] = await connection.viem.getWalletClients()
  return await baseRegistrarImplementation.write.setResolver(
    [ethOwnedResolver.address],
    {
      account: owner.account,
    },
  )
}
const addBaseRegistrarController = async (
  connection,
  { baseRegistrarImplementation, controller },
) => {
  const [, owner] = await connection.viem.getWalletClients()
  return await baseRegistrarImplementation.write.addController(
    [controller.address],
    {
      account: owner.account,
    },
  )
}
const setEthResolverInterface = async (
  connection,
  { ethOwnedResolver, interfaceName, contract },
) => {
  const [, owner] = await connection.viem.getWalletClients()
  const contractInterface = await hre.artifacts.readArtifact(interfaceName)
  const interfaceId = createInterfaceId(contractInterface.abi)
  return await ethOwnedResolver.write.setInterface(
    [namehash('eth'), interfaceId, contract.address],
    {
      account: owner.account,
    },
  )
}
const setReverseDefaultResolver = async (
  connection,
  { reverseRegistrar, contract },
) => {
  const [, owner] = await connection.viem.getWalletClients()
  return await reverseRegistrar.write.setDefaultResolver([contract.address], {
    account: owner.account,
  })
}
export async function deployEnsStack(connection) {
  const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])
  const root = await connection.viem.deployContract('Root', [
    ensRegistry.address,
  ])
  const walletClients = await connection.viem.getWalletClients()
  await setRootNodeOwner({ ensRegistry, root })
  await root.write.setController([walletClients[1].account.address, true])
  await root.write.transferOwnership([walletClients[1].account.address])
  const reverseRegistrar = await connection.viem.deployContract(
    'ReverseRegistrar',
    [ensRegistry.address],
  )
  await reverseRegistrar.write.transferOwnership([
    walletClients[1].account.address,
  ])
  await setRootSubnodeOwner(connection, {
    root,
    label: 'reverse',
    owner: walletClients[1].account,
  })
  await setAddrReverseNodeOwner(connection, { ensRegistry, reverseRegistrar })
  const baseRegistrarImplementation = await connection.viem.deployContract(
    'BaseRegistrarImplementation',
    [ensRegistry.address, namehash('eth')],
  )
  await baseRegistrarImplementation.write.transferOwnership([
    walletClients[1].account.address,
  ])
  await setRootSubnodeOwner(connection, {
    root,
    label: 'eth',
    owner: baseRegistrarImplementation,
  })
  const ethOwnedResolver = await connection.viem.deployContract(
    'OwnedResolver',
    [],
  )
  await ethOwnedResolver.write.transferOwnership([
    walletClients[1].account.address,
  ])
  await setBaseRegistrarResolver(connection, {
    baseRegistrarImplementation,
    ethOwnedResolver,
  })
  const dummyOracle = await connection.viem.deployContract('DummyOracle', [
    160000000000n,
  ])
  const exponentialPremiumPriceOracle = await connection.viem.deployContract(
    'ExponentialPremiumPriceOracle',
    [
      dummyOracle.address,
      [0n, 0n, 20294266869609n, 5073566717402n, 158548959919n],
      100000000000000000000000000n,
      21n,
    ],
  )
  const staticMetadataService = await connection.viem.deployContract(
    'StaticMetadataService',
    ['http://localhost:8080/name/0x{id}'],
  )
  const nameWrapper = await connection.viem.deployContract('NameWrapper', [
    ensRegistry.address,
    baseRegistrarImplementation.address,
    staticMetadataService.address,
  ])
  await nameWrapper.write.transferOwnership([walletClients[1].account.address])
  await addBaseRegistrarController(connection, {
    baseRegistrarImplementation,
    controller: nameWrapper,
  })
  await setEthResolverInterface(connection, {
    ethOwnedResolver,
    interfaceName: 'INameWrapper',
    contract: nameWrapper,
  })
  const ethRegistrarController = await connection.viem.deployContract(
    'ETHRegistrarController',
    [
      baseRegistrarImplementation.address,
      exponentialPremiumPriceOracle.address,
      60n,
      86400n,
      reverseRegistrar.address,
      nameWrapper.address,
      ensRegistry.address,
    ],
  )
  await ethRegistrarController.write.transferOwnership([
    walletClients[1].account.address,
  ])
  await nameWrapper.write.setController(
    [ethRegistrarController.address, true],
    {
      account: walletClients[1].account,
    },
  )
  await reverseRegistrar.write.setController(
    [ethRegistrarController.address, true],
    {
      account: walletClients[1].account,
    },
  )
  await setEthResolverInterface(connection, {
    ethOwnedResolver,
    interfaceName: 'IETHRegistrarController',
    contract: ethRegistrarController,
  })
  const staticBulkRenewal = await connection.viem.deployContract(
    'StaticBulkRenewal',
    [ethRegistrarController.address],
  )
  await setEthResolverInterface(connection, {
    ethOwnedResolver,
    interfaceName: 'IBulkRenewal',
    contract: staticBulkRenewal,
  })
  const publicResolver = await connection.viem.deployContract(
    'PublicResolver',
    [
      ensRegistry.address,
      nameWrapper.address,
      ethRegistrarController.address,
      reverseRegistrar.address,
    ],
  )
  await setReverseDefaultResolver(connection, {
    reverseRegistrar,
    contract: publicResolver,
  })
  const universalResolver = await connection.viem.deployContract(
    'UniversalResolver',
    [ensRegistry.address, ['http://universal-offchain-resolver.local/']],
  )
  return {
    ensRegistry,
    root,
    reverseRegistrar,
    baseRegistrarImplementation,
    ethOwnedResolver,
    dummyOracle,
    exponentialPremiumPriceOracle,
    staticMetadataService,
    nameWrapper,
    ethRegistrarController,
    staticBulkRenewal,
    publicResolver,
    universalResolver,
  }
}
