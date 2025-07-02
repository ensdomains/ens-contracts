import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import {
  hexToBigInt,
  labelhash,
  namehash,
  stringToHex,
  zeroAddress,
  zeroHash,
} from 'viem'

const getAccounts = async () => {
  const [ownerClient, registrantClient, otherClient] =
    await hre.viem.getWalletClients()
  return {
    ownerAccount: ownerClient.account,
    ownerClient,
    registrantAccount: registrantClient.account,
    registrantClient,
    otherAccount: otherClient.account,
    otherClient,
  }
}

async function fixture() {
  const accounts = await getAccounts()
  const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])
  const baseRegistrar = await hre.viem.deployContract(
    'BaseRegistrarImplementation',
    [ensRegistry.address, namehash('eth')],
  )
  const reverseRegistrar = await hre.viem.deployContract('ReverseRegistrar', [
    ensRegistry.address,
  ])

  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('reverse'),
    accounts.ownerAccount.address,
  ])
  await ensRegistry.write.setSubnodeOwner([
    namehash('reverse'),
    labelhash('addr'),
    reverseRegistrar.address,
  ])

  const nameWrapper = await hre.viem.deployContract('NameWrapper', [
    ensRegistry.address,
    baseRegistrar.address,
    accounts.ownerAccount.address,
  ])

  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('eth'),
    baseRegistrar.address,
  ])

  await baseRegistrar.write.addController([nameWrapper.address])
  await baseRegistrar.write.addController([accounts.ownerAccount.address])
  await nameWrapper.write.setController([accounts.ownerAccount.address, true])

  const migrationHelper = await hre.viem.deployContract('MigrationHelper', [
    baseRegistrar.address,
    nameWrapper.address,
  ])
  await migrationHelper.write.setController([
    accounts.ownerAccount.address,
    true,
  ])

  return {
    ensRegistry,
    baseRegistrar,
    reverseRegistrar,
    nameWrapper,
    migrationHelper,
    ...accounts,
  }
}

describe('MigrationHelper', () => {
  it('should allow the owner to set a migration target', async () => {
    const { migrationHelper, ownerAccount } = await loadFixture(fixture)

    await expect(migrationHelper)
      .write('setMigrationTarget', [ownerAccount.address])
      .toEmitEvent('MigrationTargetUpdated')
      .withArgs(ownerAccount.address)
    expect(await migrationHelper.read.migrationTarget()).toEqualAddress(
      ownerAccount.address,
    )
  })

  it('should not allow non-owners to set migration targets', async () => {
    const { migrationHelper, ownerAccount, registrantAccount } =
      await loadFixture(fixture)
    await expect(migrationHelper)
      .write('setMigrationTarget', [ownerAccount.address], {
        account: registrantAccount,
      })
      .toBeRevertedWithString('Ownable: caller is not the owner')
  })

  it('should refuse to migrate unwrapped names to the zero address', async () => {
    const { baseRegistrar, migrationHelper, registrantAccount } =
      await loadFixture(fixture)
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
    await expect(migrationHelper)
      .write('migrateNames', [
        registrantAccount.address,
        ids,
        stringToHex('test'),
      ])
      .toBeRevertedWithCustomError('MigrationTargetNotSet')
  })

  it('should migrate unwrapped names', async () => {
    const { baseRegistrar, migrationHelper, ownerAccount, registrantAccount } =
      await loadFixture(fixture)
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
    const tx = await migrationHelper.write.migrateNames([
      registrantAccount.address,
      ids,
      stringToHex('test'),
    ])
    await expect(migrationHelper)
      .transaction(tx)
      .toEmitEventFrom(baseRegistrar, 'Transfer')
      .withArgs(registrantAccount.address, ownerAccount.address, ids[0])
    await expect(migrationHelper)
      .transaction(tx)
      .toEmitEventFrom(baseRegistrar, 'Transfer')
      .withArgs(registrantAccount.address, ownerAccount.address, ids[1])
  })

  it('should only allow controllers to migrate unwrapped names', async () => {
    const { baseRegistrar, migrationHelper, ownerAccount, registrantAccount } =
      await loadFixture(fixture)
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
    await expect(migrationHelper)
      .write(
        'migrateNames',
        [registrantAccount.address, ids, stringToHex('test')],
        { account: registrantAccount },
      )
      .toBeRevertedWithString('Controllable: Caller is not a controller')
  })

  it('should migrate wrapped names', async () => {
    const { nameWrapper, migrationHelper, ownerAccount, registrantAccount } =
      await loadFixture(fixture)
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
    await expect(migrationHelper)
      .write('migrateWrappedNames', [
        registrantAccount.address,
        ids,
        stringToHex('test'),
      ])
      .toEmitEventFrom(nameWrapper, 'TransferBatch')
      .withArgs(
        migrationHelper.address,
        registrantAccount.address,
        ownerAccount.address,
        ids,
        ids.map(() => 1n),
      )
  })

  it('should refuse to migrate wrapped names to the zero address', async () => {
    const { nameWrapper, migrationHelper, registrantAccount } =
      await loadFixture(fixture)
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
    await expect(migrationHelper)
      .write('migrateWrappedNames', [
        registrantAccount.address,
        ids,
        stringToHex('test'),
      ])
      .toBeRevertedWithCustomError('MigrationTargetNotSet')
  })

  it('should only allow controllers to migrate wrapped names', async () => {
    const { nameWrapper, migrationHelper, ownerAccount, registrantAccount } =
      await loadFixture(fixture)
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
    await expect(migrationHelper)
      .write(
        'migrateWrappedNames',
        [registrantAccount.address, ids, stringToHex('test')],
        { account: registrantAccount },
      )
      .toBeRevertedWithString('Controllable: Caller is not a controller')
  })
})
