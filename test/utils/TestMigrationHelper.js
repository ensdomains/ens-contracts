const {
  evm,
  reverse: { getReverseNode },
  contracts: { deploy },
  ens: { FUSES },
} = require('../test-utils')

const { CANNOT_UNWRAP, PARENT_CANNOT_CONTROL, IS_DOT_ETH } = FUSES

const { expect } = require('chai')

const { ethers } = require('hardhat')
const provider = ethers.provider
const { namehash } = require('../test-utils/ens')
const sha3 = require('web3-utils').sha3
const {
  EMPTY_BYTES32: EMPTY_BYTES,
  EMPTY_ADDRESS: ZERO_ADDRESS,
} = require('../test-utils/constants')

const DAY = 24 * 60 * 60
const REGISTRATION_TIME = 28 * DAY
const BUFFERED_REGISTRATION_COST = REGISTRATION_TIME + 3 * DAY
const GRACE_PERIOD = 90 * DAY
const NULL_ADDRESS = ZERO_ADDRESS
contract('MigrationHelper', function () {
  let ens
  let baseRegistrar
  let baseRegistrar2
  let reverseRegistrar
  let nameWrapper
  let nameWrapper2
  let migrationHelper
  let migrationHelper2 // migration helper signed by accounts[1]

  const secret =
    '0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF'
  let ownerAccount // Account that owns the registrar
  let registrantAccount // Account that owns test names
  let accounts = []

  before(async () => {
    signers = await ethers.getSigners()
    ownerAccount = await signers[0].getAddress()
    registrantAccount = await signers[1].getAddress()
    accounts = [ownerAccount, registrantAccount, signers[2].getAddress()]

    ens = await deploy('ENSRegistry')

    baseRegistrar = await deploy(
      'BaseRegistrarImplementation',
      ens.address,
      namehash('eth'),
    )
    baseRegistrar2 = baseRegistrar.connect(signers[1])

    // Required because NameWrapper implements ReverseClaimer
    reverseRegistrar = await deploy('ReverseRegistrar', ens.address)

    await ens.setSubnodeOwner(EMPTY_BYTES, sha3('reverse'), accounts[0])
    await ens.setSubnodeOwner(
      namehash('reverse'),
      sha3('addr'),
      reverseRegistrar.address,
    )

    nameWrapper = await deploy(
      'NameWrapper',
      ens.address,
      baseRegistrar.address,
      ownerAccount,
    )
    nameWrapper2 = nameWrapper.connect(signers[1])

    await ens.setSubnodeOwner(EMPTY_BYTES, sha3('eth'), baseRegistrar.address)

    await baseRegistrar.addController(nameWrapper.address)
    await nameWrapper.setController(ownerAccount, true)
    await baseRegistrar.addController(ownerAccount)

    migrationHelper = await deploy(
      'MigrationHelper',
      baseRegistrar.address,
      nameWrapper.address,
    )
    await migrationHelper.setController(ownerAccount, true)
    migrationHelper2 = await migrationHelper.connect(signers[1])
  })

  beforeEach(async () => {
    result = await ethers.provider.send('evm_snapshot')
  })
  afterEach(async () => {
    await ethers.provider.send('evm_revert', [result])
  })

  it('should allow the owner to set a migration target', async () => {
    await expect(migrationHelper.setMigrationTarget(ownerAccount))
      .to.emit(migrationHelper, 'MigrationTargetUpdated')
      .withArgs(ownerAccount)
    expect(await migrationHelper.migrationTarget()).to.equal(ownerAccount)
  })

  it('should not allow non-owners to set migration targets', async () => {
    await expect(
      migrationHelper2.setMigrationTarget(ownerAccount),
    ).to.be.revertedWith('Ownable: caller is not the owner')
  })

  it('should refuse to migrate unwrapped names to the zero address', async () => {
    const ids = [sha3('test'), sha3('test2')]
    for (let id of ids) {
      await baseRegistrar.register(id, registrantAccount, 86400)
    }
    await baseRegistrar2.setApprovalForAll(migrationHelper.address, true)
    await expect(
      migrationHelper.migrateNames(
        registrantAccount,
        ids,
        ethers.utils.toUtf8Bytes('test'),
      ),
    ).to.be.revertedWith('MigrationTargetNotSet()')
  })

  it('should migrate unwrapped names', async () => {
    const ids = [sha3('test'), sha3('test2')]
    for (let id of ids) {
      await baseRegistrar.register(id, registrantAccount, 86400)
    }
    await migrationHelper.setMigrationTarget(ownerAccount)
    await baseRegistrar2.setApprovalForAll(migrationHelper.address, true)
    await expect(
      migrationHelper.migrateNames(
        registrantAccount,
        ids,
        ethers.utils.toUtf8Bytes('test'),
      ),
    )
      .to.emit(baseRegistrar, 'Transfer')
      .withArgs(registrantAccount, ownerAccount, ids[0])
      .to.emit(baseRegistrar, 'Transfer')
      .withArgs(registrantAccount, ownerAccount, ids[1])
  })

  it('should only allow controllers to migrate unwrapped names', async () => {
    const ids = [sha3('test'), sha3('test2')]
    for (let id of ids) {
      await baseRegistrar.register(id, registrantAccount, 86400)
    }
    await migrationHelper.setMigrationTarget(ownerAccount)
    await baseRegistrar.setApprovalForAll(migrationHelper.address, true)
    await expect(
      migrationHelper2.migrateNames(
        registrantAccount,
        ids,
        ethers.utils.toUtf8Bytes('test'),
      ),
    ).to.be.revertedWith('Controllable: Caller is not a controller')
  })

  it('should migrate wrapped names', async () => {
    const labels = ['test', 'test2']
    const ids = labels.map((label) => namehash(label + '.eth'))
    for (let label of labels) {
      await nameWrapper.registerAndWrapETH2LD(
        label,
        registrantAccount,
        86400,
        ZERO_ADDRESS,
        0,
      )
    }
    await migrationHelper.setMigrationTarget(ownerAccount)
    await nameWrapper2.setApprovalForAll(migrationHelper.address, true)
    await expect(
      migrationHelper.migrateWrappedNames(
        registrantAccount,
        ids,
        ethers.utils.toUtf8Bytes('test'),
      ),
    )
      .to.emit(nameWrapper2, 'TransferBatch')
      .withArgs(
        migrationHelper.address,
        registrantAccount,
        ownerAccount,
        ids,
        ids.map(() => 1),
      )
  })

  it('should refuse to migrate wrapped names to the zero address', async () => {
    const labels = ['test', 'test2']
    const ids = labels.map((label) => namehash(label + '.eth'))
    for (let label of labels) {
      await nameWrapper.registerAndWrapETH2LD(
        label,
        registrantAccount,
        86400,
        ZERO_ADDRESS,
        0,
      )
    }
    await nameWrapper2.setApprovalForAll(migrationHelper.address, true)
    await expect(
      migrationHelper.migrateWrappedNames(
        registrantAccount,
        ids,
        ethers.utils.toUtf8Bytes('test'),
      ),
    ).to.be.revertedWith('MigrationTargetNotSet()')
  })

  it('should only allow controllers to migrate wrapped names', async () => {
    const labels = ['test', 'test2']
    const ids = labels.map(sha3)
    for (let label of labels) {
      await nameWrapper.registerAndWrapETH2LD(
        label,
        registrantAccount,
        86400,
        ZERO_ADDRESS,
        0,
      )
    }
    await nameWrapper.setApprovalForAll(migrationHelper.address, true)
    await expect(
      migrationHelper2.migrateWrappedNames(
        registrantAccount,
        ids,
        ethers.utils.toUtf8Bytes('test'),
      ),
    ).to.be.revertedWith('Controllable: Caller is not a controller')
  })
})
