import type {
  AnyContract,
  NamedContractReturnType,
} from '@ensdomains/hardhat-chai-matchers-viem'
import hre from 'hardhat'
import type { NetworkConnection } from 'hardhat/types/network'
import { labelhash, namehash, type Address } from 'viem'
import { createInterfaceId } from './createInterfaceId.js'

export const ZERO_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const

export type EnsStack = {
  ensRegistry: NamedContractReturnType<'ENSRegistry'>
  root: NamedContractReturnType<'Root'>
  reverseRegistrar: NamedContractReturnType<'ReverseRegistrar'>
  baseRegistrarImplementation: NamedContractReturnType<'BaseRegistrarImplementation'>
  ethOwnedResolver: NamedContractReturnType<'OwnedResolver'>
  dummyOracle: NamedContractReturnType<'DummyOracle'>
  exponentialPremiumPriceOracle: NamedContractReturnType<'ExponentialPremiumPriceOracle'>
  staticMetadataService: NamedContractReturnType<'StaticMetadataService'>
  nameWrapper: NamedContractReturnType<'NameWrapper'>
  ethRegistrarController: NamedContractReturnType<'ETHRegistrarController'>
  staticBulkRenewal: NamedContractReturnType<'StaticBulkRenewal'>
  publicResolver: NamedContractReturnType<'PublicResolver'>
  universalResolver: NamedContractReturnType<'UniversalResolver'>
}

const setRootNodeOwner = async ({
  ensRegistry,
  root,
}: Pick<EnsStack, 'ensRegistry' | 'root'>) => {
  await ensRegistry.write.setOwner([ZERO_HASH, root.address])
}
const setRootSubnodeOwner = async (
  connection: NetworkConnection,
  {
    root,
    label,
    owner: subnodeOwner,
  }: Pick<EnsStack, 'root'> & { label: string; owner: { address: Address } },
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
  connection: NetworkConnection,
  {
    ensRegistry,
    reverseRegistrar,
  }: Pick<EnsStack, 'ensRegistry' | 'reverseRegistrar'>,
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
  connection: NetworkConnection,
  {
    baseRegistrarImplementation,
    ethOwnedResolver,
  }: Pick<EnsStack, 'baseRegistrarImplementation' | 'ethOwnedResolver'>,
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
  connection: NetworkConnection,
  {
    baseRegistrarImplementation,
    controller,
  }: Pick<EnsStack, 'baseRegistrarImplementation'> & {
    controller: AnyContract
  },
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
  connection: NetworkConnection,
  {
    ethOwnedResolver,
    interfaceName,
    contract,
  }: Pick<EnsStack, 'ethOwnedResolver'> & {
    interfaceName: string
    contract: AnyContract
  },
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
  connection: NetworkConnection,
  {
    reverseRegistrar,
    contract,
  }: Pick<EnsStack, 'reverseRegistrar'> & { contract: AnyContract },
) => {
  const [, owner] = await connection.viem.getWalletClients()
  return await reverseRegistrar.write.setDefaultResolver([contract.address], {
    account: owner.account,
  })
}

export async function deployEnsStack(
  connection: NetworkConnection,
): Promise<EnsStack> {
  const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])
  const root = await connection.viem.deployContract('Root', [
    ensRegistry.address,
  ])
  const walletClients = await connection.viem.getWalletClients()

  const owner = walletClients[1].account
  await setRootNodeOwner({ ensRegistry, root })
  await root.write.setController([owner.address, true])
  await root.write.transferOwnership([owner.address])

  const reverseRegistrar = await connection.viem.deployContract(
    'ReverseRegistrar',
    [ensRegistry.address],
  )

  await reverseRegistrar.write.transferOwnership([owner.address])
  await setRootSubnodeOwner(connection, {
    root,
    label: 'reverse',
    owner,
  })
  await setAddrReverseNodeOwner(connection, { ensRegistry, reverseRegistrar })

  const baseRegistrarImplementation = await connection.viem.deployContract(
    'BaseRegistrarImplementation',
    [ensRegistry.address, namehash('eth')],
  )

  await baseRegistrarImplementation.write.transferOwnership([owner.address])
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

  await nameWrapper.write.transferOwnership([owner.address])
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

  await ethRegistrarController.write.transferOwnership([owner.address])
  await nameWrapper.write.setController(
    [ethRegistrarController.address, true],
    {
      account: owner,
    },
  )
  await reverseRegistrar.write.setController(
    [ethRegistrarController.address, true],
    {
      account: owner,
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

  const batchGatewayProvider = await connection.viem.deployContract(
    'GatewayProvider',
    [owner.address, ['http://universal-offchain-resolver.local/']],
  )

  const universalResolver = await connection.viem.deployContract(
    'UniversalResolver',
    [owner.address, ensRegistry.address, batchGatewayProvider.address],
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
