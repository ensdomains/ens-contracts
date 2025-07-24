import hre from 'hardhat'
import { getAddress, labelhash, namehash } from 'viem'
import { COIN_TYPE_DEFAULT, getReverseNamespace } from './ensip19.js'
/**
 * Deploy ChainReverseResolver fixture directly without using cached fixtures
 * This avoids the address collision issue by deploying everything fresh
 */
export async function deployDirectChainReverseFixture() {
  const connection = await hre.network.connect()
  const [wallet] = await connection.viem.getWalletClients()
  const owner = getAddress(wallet.account.address)
  // Deploy ENS Registry
  const ensRegistry = await connection.viem.deployContract('ENSRegistry')
  // Deploy default reverse registrar
  const defaultReverseRegistrar = await connection.viem.deployContract(
    'DefaultReverseRegistrar',
  )
  // Deploy default reverse resolver
  const defaultReverseResolver = await connection.viem.deployContract(
    'DefaultReverseResolver',
    [defaultReverseRegistrar.address],
  )
  // Set up the default reverse namespace
  const defaultReverseNamespace = getReverseNamespace(COIN_TYPE_DEFAULT)
  const mountedNamespace = 'reverse'
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
  // Set up the default reverse namespace
  await takeControl(mountedNamespace)
  await ensRegistry.write.setResolver([
    namehash(mountedNamespace),
    defaultReverseResolver.address,
  ])
  // Verify no address collisions
  const addresses = [
    ensRegistry.address,
    defaultReverseRegistrar.address,
    defaultReverseResolver.address,
  ]
  const uniqueAddresses = [...new Set(addresses)]
  const hasCollision = addresses.length !== uniqueAddresses.length
  if (hasCollision) {
    throw new Error(
      'Address collision detected in direct chain reverse fixture!',
    )
  }
  return {
    owner,
    ensRegistry,
    defaultReverseNamespace,
    defaultReverseRegistrar,
    defaultReverseResolver,
    takeControl,
  }
}
