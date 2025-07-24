import hre from 'hardhat'
import { getAddress, labelhash, namehash } from 'viem'
import {
  COIN_TYPE_ETH,
  COIN_TYPE_DEFAULT,
  getReverseNamespace,
} from './ensip19.js'
/**
 * Deploy ETHReverseResolver fixture directly without using cached fixtures
 * This avoids the address collision issue by deploying everything fresh
 */
export async function deployDirectETHReverseFixture() {
  const connection = await hre.network.connect()
  const [wallet] = await connection.viem.getWalletClients()
  const owner = getAddress(wallet.account.address)
  // Deploy ENS Registry
  const ensRegistry = await connection.viem.deployContract('ENSRegistry')
  // Deploy addr.reverse registrar
  const addrReverseRegistrar = await connection.viem.deployContract(
    'DefaultReverseRegistrar',
  )
  // Deploy default.reverse registrar
  const defaultReverseRegistrar = await connection.viem.deployContract(
    'DefaultReverseRegistrar',
  )
  // Deploy ETHReverseResolver
  const ethReverseResolver = await connection.viem.deployContract(
    'ETHReverseResolver',
    [
      ensRegistry.address,
      addrReverseRegistrar.address,
      defaultReverseRegistrar.address,
    ],
  )
  // Deploy additional components for testing
  const shapeshift = await connection.viem.deployContract(
    'DummyShapeshiftResolver',
  )
  // Set up the namespaces
  const reverseNamespace = getReverseNamespace(COIN_TYPE_ETH)
  const defaultReverseNamespace = getReverseNamespace(COIN_TYPE_DEFAULT)
  // Function to take control of names
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
  // Set up the resolver for addr.reverse
  await takeControl(reverseNamespace)
  await ensRegistry.write.setResolver([
    namehash(reverseNamespace),
    ethReverseResolver.address,
  ])
  // Set up the default.reverse namespace and resolver
  const defaultReverseResolver = await connection.viem.deployContract(
    'DefaultReverseResolver',
    [defaultReverseRegistrar.address],
  )
  const mountedNamespace = 'reverse'
  await takeControl(mountedNamespace)
  await ensRegistry.write.setResolver([
    namehash(mountedNamespace),
    defaultReverseResolver.address,
  ])
  // Function to claim V1 reverse records
  async function claimV1(ownerAddress, resolver = shapeshift.address) {
    await ensRegistry.write.setSubnodeRecord([
      namehash(reverseNamespace),
      labelhash(ownerAddress.slice(2).toLowerCase()),
      ownerAddress,
      resolver,
      0n,
    ])
  }
  // Verify no address collisions
  const addresses = [
    ensRegistry.address,
    addrReverseRegistrar.address,
    defaultReverseRegistrar.address,
    defaultReverseResolver.address,
    ethReverseResolver.address,
    shapeshift.address,
  ]
  const uniqueAddresses = [...new Set(addresses)]
  const hasCollision = addresses.length !== uniqueAddresses.length
  if (hasCollision) {
    throw new Error('Address collision detected in direct fixture!')
  }
  return {
    owner,
    ensRegistry,
    reverseRegistrar: addrReverseRegistrar,
    defaultReverseRegistrar,
    defaultReverseResolver,
    reverseResolver: ethReverseResolver,
    shapeshift,
    reverseNamespace,
    defaultReverseNamespace,
    takeControl,
    claimV1,
  }
}
