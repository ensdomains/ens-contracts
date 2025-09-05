import hre from 'hardhat'
import {
  getAddress,
  hexToBigInt,
  labelhash,
  namehash,
  stringToHex,
  zeroAddress,
  zeroHash,
} from 'viem'

const connection = await hre.network.connect()
const publicClient = await connection.viem.getPublicClient()
const [ownerClient, registrantClient, otherClient] =
  await connection.viem.getWalletClients()
const ownerAccount = ownerClient.account
const registrantAccount = registrantClient.account
const otherAccount = otherClient.account

async function fixture() {
  const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])
  const baseRegistrar = await connection.viem.deployContract(
    'BaseRegistrarImplementation',
    [ensRegistry.address, namehash('eth')],
  )
  const reverseRegistrar = await connection.viem.deployContract(
    'ReverseRegistrar',
    [ensRegistry.address],
  )

  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('reverse'),
    ownerAccount.address,
  ])
  await ensRegistry.write.setSubnodeOwner([
    namehash('reverse'),
    labelhash('addr'),
    reverseRegistrar.address,
  ])

  const nameWrapper = await connection.viem.deployContract('NameWrapper', [
    ensRegistry.address,
    baseRegistrar.address,
    ownerAccount.address,
  ])

  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('eth'),
    baseRegistrar.address,
  ])

  await baseRegistrar.write.addController([nameWrapper.address])
  await baseRegistrar.write.addController([ownerAccount.address])
  await nameWrapper.write.setController([ownerAccount.address, true])

  const migrationHelper = await connection.viem.deployContract(
    'MigrationHelper',
    [baseRegistrar.address, nameWrapper.address],
  )
  await migrationHelper.write.setController([ownerAccount.address, true])

  return {
    ensRegistry,
    baseRegistrar,
    reverseRegistrar,
    nameWrapper,
    migrationHelper,
  }
}
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

describe('MigrationHelper', () => {
  it('should allow the owner to set a migration target', async () => {
    const { migrationHelper } = await loadFixture()

    await expect(
      migrationHelper.write.setMigrationTarget([ownerAccount.address]),
    )
      .toEmitEvent('MigrationTargetUpdated')
      .withArgs({ target: getAddress(ownerAccount.address) })
    expect(await migrationHelper.read.migrationTarget()).toEqualAddress(
      ownerAccount.address,
    )
  })

  it('should not allow non-owners to set migration targets', async () => {
    const { migrationHelper } = await loadFixture()
    await expect(
      migrationHelper.write.setMigrationTarget([ownerAccount.address], {
        account: registrantAccount,
      }),
    ).toBeRevertedWithString('Ownable: caller is not the owner')
  })

  it('should refuse to migrate unwrapped names to the zero address', async () => {
    const { baseRegistrar, migrationHelper } = await loadFixture()
    const ids = [labelhash('test'), labelhash('test2')].map((v) =>
      hexToBigInt(v),
    )
    for (let id of ids) {
      await baseRegistrar.write.register([
        id,
        registrantAccount.address,
        86400n,
      ])
    }
    await baseRegistrar.write.setApprovalForAll(
      [migrationHelper.address, true],
      { account: registrantAccount },
    )
    await expect(
      migrationHelper.write.migrateNames([
        registrantAccount.address,
        ids,
        stringToHex('test'),
      ]),
    ).toBeRevertedWithCustomError('MigrationTargetNotSet')
  })

  it('should migrate unwrapped names', async () => {
    const { baseRegistrar, migrationHelper } = await loadFixture()
    const ids = [labelhash('test'), labelhash('test2')].map((v) =>
      hexToBigInt(v),
    )
    for (let id of ids) {
      await baseRegistrar.write.register([
        id,
        registrantAccount.address,
        86400n,
      ])
    }
    await baseRegistrar.write.setApprovalForAll(
      [migrationHelper.address, true],
      { account: registrantAccount },
    )
    await migrationHelper.write.setMigrationTarget([ownerAccount.address])
    const tx = migrationHelper.write.migrateNames([
      registrantAccount.address,
      ids,
      stringToHex('test'),
    ])
    await expect(tx)
      .toEmitEventFrom(baseRegistrar, 'Transfer')
      .withArgs({
        from: getAddress(registrantAccount.address),
        to: getAddress(ownerAccount.address),
        tokenId: ids[0],
      })
    await expect(tx)
      .toEmitEventFrom(baseRegistrar, 'Transfer')
      .withArgs({
        from: getAddress(registrantAccount.address),
        to: getAddress(ownerAccount.address),
        tokenId: ids[1],
      })
  })

  it('should only allow controllers to migrate unwrapped names', async () => {
    const { baseRegistrar, migrationHelper } = await loadFixture()
    const ids = [labelhash('test'), labelhash('test2')].map((v) =>
      hexToBigInt(v),
    )
    for (let id of ids) {
      await baseRegistrar.write.register([
        id,
        registrantAccount.address,
        86400n,
      ])
    }
    await migrationHelper.write.setMigrationTarget([ownerAccount.address])
    await baseRegistrar.write.setApprovalForAll(
      [migrationHelper.address, true],
      { account: registrantAccount },
    )
    await expect(
      migrationHelper.write.migrateNames(
        [registrantAccount.address, ids, stringToHex('test')],
        { account: registrantAccount },
      ),
    ).toBeRevertedWithString('Controllable: Caller is not a controller')
  })

  it('should migrate wrapped names', async () => {
    const { nameWrapper, migrationHelper } = await loadFixture()
    const labels = ['test', 'test2']
    const ids = labels.map((label) => hexToBigInt(namehash(label + '.eth')))
    for (let label of labels) {
      await nameWrapper.write.registerAndWrapETH2LD([
        label,
        registrantAccount.address,
        86400n,
        zeroAddress,
        0,
      ])
    }
    await migrationHelper.write.setMigrationTarget([ownerAccount.address])
    await nameWrapper.write.setApprovalForAll([migrationHelper.address, true], {
      account: registrantAccount,
    })
    await expect(
      migrationHelper.write.migrateWrappedNames([
        registrantAccount.address,
        ids,
        stringToHex('test'),
      ]),
    )
      .toEmitEventFrom(nameWrapper, 'TransferBatch')
      .withArgs({
        operator: getAddress(migrationHelper.address),
        from: getAddress(registrantAccount.address),
        to: getAddress(ownerAccount.address),
        ids,
        values: ids.map(() => 1n),
      })
  })

  it('should refuse to migrate wrapped names to the zero address', async () => {
    const { nameWrapper, migrationHelper } = await loadFixture()
    const labels = ['test', 'test2']
    const ids = labels.map((label) => hexToBigInt(namehash(label + '.eth')))
    for (let label of labels) {
      await nameWrapper.write.registerAndWrapETH2LD([
        label,
        registrantAccount.address,
        86400n,
        zeroAddress,
        0,
      ])
    }
    await nameWrapper.write.setApprovalForAll([migrationHelper.address, true], {
      account: registrantAccount,
    })
    await expect(
      migrationHelper.write.migrateWrappedNames([
        registrantAccount.address,
        ids,
        stringToHex('test'),
      ]),
    ).toBeRevertedWithCustomError('MigrationTargetNotSet')
  })

  it('should only allow controllers to migrate wrapped names', async () => {
    const { nameWrapper, migrationHelper } = await loadFixture()
    const labels = ['test', 'test2']
    const ids = labels.map((label) => hexToBigInt(namehash(label + '.eth')))
    for (let label of labels) {
      await nameWrapper.write.registerAndWrapETH2LD([
        label,
        registrantAccount.address,
        86400n,
        zeroAddress,
        0,
      ])
    }
    await migrationHelper.write.setMigrationTarget([ownerAccount.address])
    await nameWrapper.write.setApprovalForAll([migrationHelper.address, true], {
      account: registrantAccount,
    })
    await expect(
      migrationHelper.write.migrateWrappedNames(
        [registrantAccount.address, ids, stringToHex('test')],
        { account: registrantAccount },
      ),
    ).toBeRevertedWithString('Controllable: Caller is not a controller')
  })
})
