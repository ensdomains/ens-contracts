import hre from 'hardhat'
import { labelhash, namehash, zeroAddress, zeroHash } from 'viem'

import { getInterfaceId } from '../fixtures/createInterfaceId.js'
import { getAccounts, toLabelId } from '../fixtures/utils.js'

const connection = await hre.network.connect()
const accounts = await getAccounts(connection)

async function fixture() {
  // Create a registry
  const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])
  // Create a base registrar
  const baseRegistrar = await connection.viem.deployContract(
    'BaseRegistrarImplementation',
    [ensRegistry.address, namehash('eth')],
  )

  // Setup reverse registrar
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

  // Create a name wrapper
  const nameWrapper = await connection.viem.deployContract('NameWrapper', [
    ensRegistry.address,
    baseRegistrar.address,
    accounts[0].address,
  ])
  // Create a public resolver
  const publicResolver = await connection.viem.deployContract(
    'PublicResolver',
    [ensRegistry.address, nameWrapper.address, zeroAddress, zeroAddress],
  )

  // Set up a dummy price oracle and a controller
  const dummyOracle = await connection.viem.deployContract('DummyOracle', [
    100000000n,
  ])
  const priceOracle = await connection.viem.deployContract(
    'StablePriceOracle',
    [dummyOracle.address, [0n, 0n, 4n, 2n, 1n]],
  )
  const controller = await connection.viem.deployContract(
    'ETHRegistrarController',
    [
      baseRegistrar.address,
      priceOracle.address,
      600n,
      86400n,
      zeroAddress,
      nameWrapper.address,
      ensRegistry.address,
    ],
  )

  await baseRegistrar.write.addController([controller.address])
  await baseRegistrar.write.addController([accounts[0].address])

  // Create the bulk renewal contract
  const bulkRenewal = await connection.viem.deployContract('BulkRenewal', [
    ensRegistry.address,
  ])

  // Configure a resolver for .eth and register the controller interface
  // then transfer the .eth node to the base registrar.
  await ensRegistry.write.setSubnodeRecord([
    zeroHash,
    labelhash('eth'),
    accounts[0].address,
    publicResolver.address,
    0n,
  ])
  const interfaceId = await getInterfaceId('IETHRegistrarController')
  await publicResolver.write.setInterface([
    namehash('eth'),
    interfaceId,
    controller.address,
  ])
  await ensRegistry.write.setOwner([namehash('eth'), baseRegistrar.address])

  // Register some names
  for (const name of ['test1', 'test2', 'test3']) {
    await baseRegistrar.write.register([
      toLabelId(name),
      accounts[1].address,
      31536000n,
    ])
  }

  return { ensRegistry, baseRegistrar, bulkRenewal, dummyOracle }
}
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

describe('BulkRenewal', () => {
  it('should return the cost of a bulk renewal', async () => {
    const { bulkRenewal } = await loadFixture()

    await expect(
      bulkRenewal.read.rentPrice([['test1', 'test2'], 86400n]),
    ).resolves.toEqual(86400n * 2n)
  })

  it('should raise an error trying to renew a nonexistent name', async () => {
    const { bulkRenewal } = await loadFixture()

    await expect(
      bulkRenewal.write.renewAll([['foobar'], 86400n, zeroHash]),
    ).toBeRevertedWithoutReason()
  })

  it('should permit bulk renewal of names', async () => {
    const { baseRegistrar, bulkRenewal } = await loadFixture()
    const publicClient = await connection.viem.getPublicClient()

    const oldExpiry = await baseRegistrar.read.nameExpires([toLabelId('test2')])

    await bulkRenewal.write.renewAll([['test1', 'test2'], 86400n, zeroHash], {
      value: 86400n * 2n,
    })

    const newExpiry = await baseRegistrar.read.nameExpires([toLabelId('test2')])

    expect(newExpiry - oldExpiry).toBe(86400n)

    // Check any excess funds are returned
    await expect(
      publicClient.getBalance({ address: bulkRenewal.address }),
    ).resolves.toEqual(0n)
  })

  it('should revert rather than silently wrap when the total overflows uint256', async () => {
    const { bulkRenewal, dummyOracle } = await loadFixture()

    // The price is sourced from the registrar's oracle, which is not fully
    // under the contract's control. If it reports an inflated ETH price, a
    // large duration makes each name's rent price exceed 2**255 wei, so the
    // sum of just two names overflows uint256. rentPrice must revert with an
    // arithmetic-overflow panic (0x11) instead of silently wrapping.
    //
    // With ethPrice = 1 wei and price5Letter = 1, StablePriceOracle returns
    // base = price5Letter * duration * 1e8 / 1 = duration * 1e8 for a 5+
    // char name. duration just above 2**255 / 1e8 yields base > 2**255.
    await dummyOracle.write.set([1n])

    const duration = (2n ** 255n) / 100000000n + 1n
    await expect(
      bulkRenewal.read.rentPrice([['test1', 'test2'], duration]),
    ).toBeRevertedWithPanic(0x11n)
  })
})
