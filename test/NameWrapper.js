const fs = require('fs')
const chalk = require('chalk')
const { ethers } = require('hardhat')
const { utils, BigNumber: BN } = ethers
const { use, expect } = require('chai')
const { solidity } = require('ethereum-waffle')
const n = require('eth-ens-namehash')
const namehash = n.hash
const { shouldBehaveLikeERC1155 } = require('./ERC1155.behaviour')
const { shouldSupportInterfaces } = require('./SupportsInterface.behaviour')

use(solidity)

const labelhash = (label) => utils.keccak256(utils.toUtf8Bytes(label))
const ROOT_NODE =
  '0x0000000000000000000000000000000000000000000000000000000000000000'
const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000'

async function deploy(name, _args) {
  const args = _args || []

  console.log(`📄 ${name}`)
  const contractArtifacts = await ethers.getContractFactory(name)
  const contract = await contractArtifacts.deploy(...args)
  console.log(chalk.cyan(name), 'deployed to:', chalk.magenta(contract.address))
  fs.writeFileSync(`artifacts/${name}.address`, contract.address)
  console.log('\n')
  contract.name = name
  return contract
}

function increaseTime(delay) {
  return ethers.provider.send('evm_increaseTime', [delay])
}

function mine() {
  return ethers.provider.send('evm_mine')
}

const CANNOT_UNWRAP = 1
const CANNOT_BURN_FUSES = 2
const CANNOT_TRANSFER = 4
const CANNOT_SET_RESOLVER = 8
const CANNOT_SET_TTL = 16
const CANNOT_CREATE_SUBDOMAIN = 32
const CANNOT_REPLACE_SUBDOMAIN = 64
const CAN_DO_EVERYTHING = 0
const MINIMUM_PARENT_FUSES = CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN

describe('Name Wrapper', () => {
  let ENSRegistry
  let ENSRegistry2
  let BaseRegistrar
  let BaseRegistrar2
  let NameWrapper
  let NameWrapper2
  let MetaDataservice
  let signers
  let accounts
  let account
  let account2
  let result

  /* Utility funcs */

  async function registerSetupAndWrapName(label, account, fuses) {
    const tokenId = labelhash(label)

    await BaseRegistrar.register(tokenId, account, 84600)

    await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

    await NameWrapper.wrapETH2LD(label, account, fuses)
  }

  before(async () => {
    signers = await ethers.getSigners()
    account = await signers[0].getAddress()
    account2 = await signers[1].getAddress()

    EnsRegistry = await deploy('ENSRegistry')
    EnsRegistry2 = EnsRegistry.connect(signers[1])

    BaseRegistrar = await deploy('BaseRegistrarImplementation', [
      EnsRegistry.address,
      namehash('eth'),
    ])

    BaseRegistrar2 = BaseRegistrar.connect(signers[1])

    await BaseRegistrar.addController(account)
    await BaseRegistrar.addController(account2)

    MetaDataservice = await deploy('StaticMetadataService', [
      'https://ens.domains',
    ])

    NameWrapper = await deploy('NameWrapper', [
      EnsRegistry.address,
      BaseRegistrar.address,
      MetaDataservice.address,
    ])
    NameWrapper2 = NameWrapper.connect(signers[1])

    // setup .eth
    await EnsRegistry.setSubnodeOwner(
      ROOT_NODE,
      utils.keccak256(utils.toUtf8Bytes('eth')),
      BaseRegistrar.address
    )

    // setup .xyz
    await EnsRegistry.setSubnodeOwner(
      ROOT_NODE,
      utils.keccak256(utils.toUtf8Bytes('xyz')),
      account
    )

    //make sure base registrar is owner of eth TLD
    expect(await EnsRegistry.owner(namehash('eth'))).to.equal(
      BaseRegistrar.address
    )
  })

  beforeEach(async () => {
    result = await ethers.provider.send('evm_snapshot')
  })
  afterEach(async () => {
    await ethers.provider.send('evm_revert', [result])
  })

  shouldBehaveLikeERC1155(
    () => [NameWrapper, signers],
    [
      namehash('test1.eth'),
      namehash('test2.eth'),
      namehash('doesnotexist.eth'),
    ],
    async (firstAddress, secondAddress) => {
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await BaseRegistrar.register(labelhash('test1'), account, 84600)
      await NameWrapper.wrapETH2LD('test1', firstAddress, CAN_DO_EVERYTHING)

      await BaseRegistrar.register(labelhash('test2'), account, 86400)
      await NameWrapper.wrapETH2LD('test2', secondAddress, CAN_DO_EVERYTHING)
    }
  )

  shouldSupportInterfaces(() => NameWrapper, ['INameWrapper'])

  describe('wrap()', () => {
    it('Wraps a name if you are the owner', async () => {
      const fuses = MINIMUM_PARENT_FUSES
      expect(await NameWrapper.ownerOf(namehash('xyz'))).to.equal(EMPTY_ADDRESS)

      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      const tx = await NameWrapper.wrap(ROOT_NODE, 'xyz', account, fuses)
      console.log((await tx.wait()).gasUsed.toNumber())
      expect(await NameWrapper.ownerOf(namehash('xyz'))).to.equal(account)
    })

    it('emits event for Wrap', async () => {
      const fuses = MINIMUM_PARENT_FUSES

      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)

      const tx = NameWrapper.wrap(ROOT_NODE, 'xyz', account, fuses)
      await expect(tx)
        .to.emit(NameWrapper, 'NameWrapped')
        .withArgs(ROOT_NODE, 'xyz', account, fuses)
    })

    it('emits event for TransferSingle', async () => {
      const fuses = MINIMUM_PARENT_FUSES

      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)

      const tx = NameWrapper.wrap(ROOT_NODE, 'xyz', account, fuses)
      await expect(tx)
        .to.emit(NameWrapper, 'TransferSingle')
        .withArgs(account, EMPTY_ADDRESS, account, namehash('xyz'), 1)
    })

    it('Cannot wrap a name if the owner has not authorised the wrapper with the ENS registry.', async () => {
      await expect(NameWrapper.wrap(ROOT_NODE, 'xyz', account, 0)).to.be
        .reverted
    })

    it('Will not allow wrapping with a target address of 0x0 or the wrapper contract address.', async () => {
      await expect(
        NameWrapper.wrap(ROOT_NODE, 'xyz', EMPTY_ADDRESS, 0)
      ).to.be.revertedWith('revert ERC1155: mint to the zero address')
    })

    it('Will not allow wrapping with a target address of the wrapper contract address.', async () => {
      await expect(
        NameWrapper.wrap(ROOT_NODE, 'xyz', NameWrapper.address, 0)
      ).to.be.revertedWith(
        'revert ERC1155: newOwner cannot be the NameWrapper contract'
      )
    })

    it('Allows an account approved by the owner on the ENS registry to wrap a name.', async () => {
      const labelHash = labelhash('abc')

      // setup .abc with account2 as owner
      await EnsRegistry.setSubnodeOwner(ROOT_NODE, labelHash, account2)
      // allow account to deal with all account2's names
      await EnsRegistry2.setApprovalForAll(account, true)
      await EnsRegistry2.setApprovalForAll(NameWrapper.address, true)

      //confirm abc is owner by account2 not account 1
      expect(await EnsRegistry.owner(namehash('abc'))).to.equal(account2)
      // wrap using account
      await NameWrapper.wrap(ROOT_NODE, 'abc', account2, 0)
      const ownerOfWrappedXYZ = await NameWrapper.ownerOf(namehash('abc'))
      expect(ownerOfWrappedXYZ).to.equal(account2)
    })

    it('Does not allow anyone else to wrap a name even if the owner has authorised the wrapper with the ENS registry.', async () => {
      const labelHash = labelhash('abc')

      // setup .abc with account2 as owner
      await EnsRegistry.setSubnodeOwner(ROOT_NODE, labelHash, account2)
      await EnsRegistry2.setApprovalForAll(NameWrapper.address, true)

      //confirm abc is owner by account2 not account 1
      expect(await EnsRegistry.owner(namehash('abc'))).to.equal(account2)
      // wrap using account
      await expect(
        NameWrapper.wrap(ROOT_NODE, 'abc', account2, 0)
      ).to.be.revertedWith(
        'revert NameWrapper: Domain is not owned by the sender'
      )
    })

    it('Does not allow wrapping .eth 2LDs.', async () => {
      const label = 'wrapped'
      const labelHash = labelhash(label)
      await BaseRegistrar.register(labelHash, account, 84600)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await expect(
        NameWrapper.wrap(namehash('eth'), 'blah', account2, 0)
      ).to.be.revertedWith(
        'revert NameWrapper: .eth domains need to use wrapETH2LD()'
      )
    })

    it('Fuses cannot be burned if CANNOT_REPLACE_SUBDOMAIN has not burned', async () => {
      // register sub.xyz before we wrap xyz
      await EnsRegistry.setSubnodeOwner(
        namehash('xyz'),
        labelhash('sub'),
        account
      )

      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrap(ROOT_NODE, 'xyz', account, CANNOT_UNWRAP)

      //attempt to burn fuse
      await expect(
        NameWrapper.wrap(
          namehash('xyz'),
          'sub',
          account,
          CANNOT_REPLACE_SUBDOMAIN
        )
      ).to.be.revertedWith(
        'revert NameWrapper: Cannot burn fuses: parent name can replace subdomain'
      )
    })

    it('Only allows fuses to be burned if CANNOT_UNWRAP is burned.', async () => {
      // register sub.xyz before we wrap xyz
      await EnsRegistry.setSubnodeOwner(
        namehash('xyz'),
        labelhash('sub'),
        account
      )

      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)

      //attempt to burn fuse
      await expect(
        NameWrapper.wrap(ROOT_NODE, 'xyz', account, CANNOT_REPLACE_SUBDOMAIN)
      ).to.be.revertedWith(
        'revert NameWrapper: Cannot burn fuses: domain can be unwrapped'
      )
    })
  })

  describe('unwrap()', () => {
    it('Allows owner to unwrap name', async () => {
      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrap(ROOT_NODE, 'xyz', account, MINIMUM_PARENT_FUSES)
      await NameWrapper.setSubnodeOwner(
        namehash('xyz'),
        labelhash('unwrapped'),
        account
      )
      await NameWrapper.wrap(namehash('xyz'), 'unwrapped', account, 0)
      const ownerOfWrappedXYZ = await NameWrapper.ownerOf(
        namehash('unwrapped.xyz')
      )
      expect(ownerOfWrappedXYZ).to.equal(account)
      await NameWrapper.unwrap(namehash('xyz'), labelhash('unwrapped'), account)

      //Transfers ownership in the ENS registry to the target address.
      expect(await EnsRegistry.owner(namehash('unwrapped.xyz'))).to.equal(
        account
      )
    })

    it('emits Unwrap event', async () => {
      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrap(ROOT_NODE, 'xyz', account, 0)
      const tx = await NameWrapper.unwrap(ROOT_NODE, labelhash('xyz'), account)

      await expect(tx)
        .to.emit(NameWrapper, 'NameUnwrapped')
        .withArgs(namehash('xyz'), account)
    })

    it('emits TransferSingle event', async () => {
      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrap(ROOT_NODE, 'xyz', account, 0)
      const tx = await NameWrapper.unwrap(ROOT_NODE, labelhash('xyz'), account)

      await expect(tx)
        .to.emit(NameWrapper, 'TransferSingle')
        .withArgs(account, account, EMPTY_ADDRESS, namehash('xyz'), 1)
    })

    it('Allows an account authorised by the owner on the NFT Wrapper to unwrap a name', async () => {
      const labelHash = labelhash('abc')

      // setup .abc with account2 as owner
      await EnsRegistry.setSubnodeOwner(ROOT_NODE, labelHash, account)

      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)

      // wrap using account
      await NameWrapper.wrap(ROOT_NODE, 'abc', account, 0)
      await NameWrapper.setApprovalForAll(account2, true)
      const ownerOfWrapperAbc = await NameWrapper.ownerOf(namehash('abc'))
      expect(ownerOfWrapperAbc).to.equal(account)

      //unwrap using account
      await NameWrapper2.unwrap(ROOT_NODE, labelhash('abc'), account2)
      expect(await EnsRegistry.owner(namehash('abc'))).to.equal(account2)
      expect(await NameWrapper.ownerOf(namehash('abc'))).to.equal(EMPTY_ADDRESS)
    })

    it('Does not allow an account authorised by the owner on the ENS registry to unwrap a name', async () => {
      const labelHash = labelhash('abc')

      // setup .abc with account2 as owner
      await EnsRegistry.setSubnodeOwner(ROOT_NODE, labelHash, account2)
      // allow account to deal with all account2's names
      await EnsRegistry2.setApprovalForAll(account, true)
      await EnsRegistry2.setApprovalForAll(NameWrapper.address, true)

      //confirm abc is owner by account2 not account 1
      expect(await EnsRegistry.owner(namehash('abc'))).to.equal(account2)
      // wrap using account
      await NameWrapper.wrap(ROOT_NODE, 'abc', account2, 0)
      const ownerOfWrapperAbc = await NameWrapper.ownerOf(namehash('abc'))
      expect(ownerOfWrapperAbc).to.equal(account2)

      //unwrap using account
      await expect(NameWrapper.unwrap(ROOT_NODE, labelHash, account2)).to.be
        .reverted
    })

    it('Does not allow anyone else to unwrap a name', async () => {
      const labelHash = labelhash('abc')

      await EnsRegistry.setSubnodeOwner(ROOT_NODE, labelHash, account)
      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrap(ROOT_NODE, 'abc', account, 0)
      const ownerOfWrapperAbc = await NameWrapper.ownerOf(namehash('abc'))
      expect(ownerOfWrapperAbc).to.equal(account)
      //unwrap using account
      await expect(NameWrapper2.unwrap(ROOT_NODE, labelHash, account2)).to.be
        .reverted
    })

    it('Will not unwrap .eth 2LDs.', async () => {
      const label = 'unwrapped'
      const labelHash = labelhash(label)

      await BaseRegistrar.register(labelHash, account, 84600)

      //allow the restricted name wrappper to transfer the name to itself and reclaim it
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, 0)
      const ownerOfWrappedETH = await NameWrapper.ownerOf(
        namehash('unwrapped.eth')
      )
      expect(ownerOfWrappedETH).to.equal(account)
      await expect(
        NameWrapper.unwrap(namehash('eth'), labelhash('unwrapped'), account)
      ).to.be.revertedWith(
        'revert NameWrapper: .eth names must be unwrapped with unwrapETH2LD()'
      )
    })

    it('Will not allow a target address of 0x0 or the wrapper contract address.', async () => {
      const labelHash = labelhash('abc')

      await EnsRegistry.setSubnodeOwner(ROOT_NODE, labelHash, account)
      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrap(ROOT_NODE, 'abc', account, 0)
      await expect(
        NameWrapper.unwrap(ROOT_NODE, labelHash, EMPTY_ADDRESS)
      ).to.be.revertedWith('revert NameWrapper: Target owner cannot be 0x0')

      await expect(
        NameWrapper.unwrap(ROOT_NODE, labelHash, NameWrapper.address)
      ).to.be.revertedWith(
        'revert NameWrapper: Target owner cannot be the NameWrapper contract'
      )
    })

    it('Will not allow to unwrap a name with the CANNOT_UNWRAP fuse burned', async () => {
      const labelHash = labelhash('abc')

      await EnsRegistry.setSubnodeOwner(ROOT_NODE, labelHash, account)
      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrap(ROOT_NODE, 'abc', account, CANNOT_UNWRAP)
      await expect(
        NameWrapper.unwrap(ROOT_NODE, labelHash, account)
      ).to.be.revertedWith('revert NameWrapper: Domain is not unwrappable')
    })
  })

  describe('wrapETH2LD()', () => {
    const label = 'wrapped2'
    const labelHash = labelhash(label)
    const nameHash = namehash(label + '.eth')
    it('wraps a name if sender is owner', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)

      //allow the restricted name wrappper to transfer the name to itself and reclaim it
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      expect(await NameWrapper.ownerOf(nameHash)).to.equal(EMPTY_ADDRESS)

      await NameWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)

      //make sure reclaim claimed ownership for the wrapper in registry

      expect(await EnsRegistry.owner(nameHash)).to.equal(NameWrapper.address)

      //make sure owner in the wrapper is the user

      expect(await NameWrapper.ownerOf(nameHash)).to.equal(account)

      // make sure registrar ERC721 is owned by Wrapper

      expect(await BaseRegistrar.ownerOf(labelHash)).to.equal(
        NameWrapper.address
      )
    })

    it('Cannot wrap a name if the owner has not authorised the wrapper with the .eth registrar.', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await expect(NameWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)).to
        .be.reverted
    })

    it('Can re-wrap a name that was wrapped has already expired', async () => {
      const DAY = 60 * 60 * 24
      const GRACE_PERIOD = 90
      await BaseRegistrar.register(labelHash, account, DAY)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)
      await increaseTime(DAY * GRACE_PERIOD + DAY + 1)
      await mine()

      expect(await BaseRegistrar.available(labelHash)).to.equal(true)

      await BaseRegistrar2.register(labelHash, account2, DAY)
      expect(await BaseRegistrar.ownerOf(labelHash)).to.equal(account2)
      await BaseRegistrar2.setApprovalForAll(NameWrapper.address, true)
      const tx = await NameWrapper2.wrapETH2LD(
        label,
        account2,
        CAN_DO_EVERYTHING
      )

      // Check the 4 events
      // UnwrapETH2LD of the original owner
      // TransferSingle burn of the original token
      // WrapETH2LD to the new owner with fuses
      // TransferSingle to mint the new token

      await expect(tx)
        .to.emit(NameWrapper, 'NameUnwrapped')
        .withArgs(namehash('wrapped2.eth'), EMPTY_ADDRESS)
      await expect(tx)
        .to.emit(NameWrapper, 'TransferSingle')
        .withArgs(account2, account, EMPTY_ADDRESS, nameHash, 1)
      await expect(tx)
        .to.emit(NameWrapper, 'NameWrapped')
        .withArgs(namehash('eth'), labelHash, account2, CAN_DO_EVERYTHING)
      await expect(tx)
        .to.emit(NameWrapper, 'TransferSingle')
        .withArgs(account2, EMPTY_ADDRESS, account2, nameHash, 1)

      expect(await NameWrapper2.ownerOf(nameHash)).to.equal(account2)
      expect(await BaseRegistrar.ownerOf(labelHash)).to.equal(
        NameWrapper.address
      )
    })

    it('Can re-wrap a name that was wrapped has already expired even if CANNOT_TRANSFER was burned', async () => {
      const DAY = 60 * 60 * 24
      const GRACE_PERIOD = 90
      await BaseRegistrar.register(labelHash, account, DAY)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD(
        label,
        account,
        CANNOT_UNWRAP | CANNOT_TRANSFER
      )
      await increaseTime(DAY * GRACE_PERIOD + DAY + 1)
      await mine()

      expect(await BaseRegistrar.available(labelHash)).to.equal(true)

      await BaseRegistrar2.register(labelHash, account2, DAY)
      expect(await BaseRegistrar.ownerOf(labelHash)).to.equal(account2)
      await BaseRegistrar2.setApprovalForAll(NameWrapper.address, true)
      const tx = await NameWrapper2.wrapETH2LD(
        label,
        account2,
        CAN_DO_EVERYTHING
      )

      await expect(tx)
        .to.emit(NameWrapper, 'NameUnwrapped')
        .withArgs(namehash('wrapped2.eth'), EMPTY_ADDRESS)
      await expect(tx)
        .to.emit(NameWrapper, 'TransferSingle')
        .withArgs(account2, account, EMPTY_ADDRESS, nameHash, 1)
      await expect(tx)
        .to.emit(NameWrapper, 'NameWrapped')
        .withArgs(namehash('eth'), labelHash, account2, CAN_DO_EVERYTHING)
      await expect(tx)
        .to.emit(NameWrapper, 'TransferSingle')
        .withArgs(account2, EMPTY_ADDRESS, account2, nameHash, 1)

      expect(await NameWrapper2.ownerOf(nameHash)).to.equal(account2)
      expect(await BaseRegistrar.ownerOf(labelHash)).to.equal(
        NameWrapper.address
      )
    })

    it('emits Wrap event', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      const tx = await NameWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)
      await expect(tx)
        .to.emit(NameWrapper, 'NameWrapped')
        .withArgs(namehash('eth'), labelHash, account, CAN_DO_EVERYTHING)
    })

    it('emits TransferSingle event', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      const tx = await NameWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)
      await expect(tx)
        .to.emit(NameWrapper, 'TransferSingle')
        .withArgs(account, EMPTY_ADDRESS, account, nameHash, 1)
    })

    it('Transfers the wrapped token to the target address.', async () => {
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await BaseRegistrar.register(labelHash, account, 84600)
      await NameWrapper.wrapETH2LD(label, account2, CAN_DO_EVERYTHING)
      expect(await NameWrapper.ownerOf(nameHash)).to.equal(account2)
    })

    it('Does not allow wrapping with a target address of 0x0', async () => {
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await BaseRegistrar.register(labelHash, account, 84600)
      await expect(
        NameWrapper.wrapETH2LD(label, EMPTY_ADDRESS, CAN_DO_EVERYTHING)
      ).to.be.revertedWith('revert ERC1155: mint to the zero address')
    })

    it('Does not allow wrapping with a target address of the wrapper contract address.', async () => {
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await BaseRegistrar.register(labelHash, account, 84600)

      await expect(
        NameWrapper.wrapETH2LD(label, NameWrapper.address, CAN_DO_EVERYTHING)
      ).to.be.revertedWith(
        'revert ERC1155: newOwner cannot be the NameWrapper contract'
      )
    })

    it('Allows an account approved by the owner on the .eth registrar to wrap a name.', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await BaseRegistrar.setApprovalForAll(account2, true)

      await NameWrapper2.wrapETH2LD(label, account, 0)

      expect(await NameWrapper.ownerOf(nameHash)).to.equal(account)
    })

    it('Does not allow anyone else to wrap a name even if the owner has authorised the wrapper with the ENS registry.', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)

      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await expect(
        NameWrapper2.wrapETH2LD(label, account, 0)
      ).to.be.revertedWith(
        'revert NameWrapper: Sender is not owner or authorised by the owner or authorised on the .eth registrar'
      )
    })

    it('Can wrap a name even if the controller address is different to the registrant address.', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await EnsRegistry.setOwner(nameHash, account2)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, 0)

      expect(await NameWrapper.ownerOf(nameHash)).to.equal(account)
    })

    it('Does not allow the controller of a name to wrap it if they are not also the registrant.', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await EnsRegistry.setOwner(nameHash, account2)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await expect(NameWrapper2.wrapETH2LD(label, account2, 0)).to.be.reverted
    })

    it('Does not allows fuse to be burned if CANNOT_UNWRAP has not been burned.', async () => {
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await BaseRegistrar.register(labelHash, account, 84600)
      await expect(
        NameWrapper.wrapETH2LD(label, account, CANNOT_SET_RESOLVER)
      ).to.be.revertedWith(
        'revert NameWrapper: Cannot burn fuses: domain can be unwrapped'
      )
    })

    it('Allows fuse to be burned if CANNOT_UNWRAP has been burned.', async () => {
      const initialFuses = CANNOT_UNWRAP | CANNOT_SET_RESOLVER
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await BaseRegistrar.register(labelHash, account, 84600)
      await NameWrapper.wrapETH2LD(label, account, initialFuses)
      expect(await NameWrapper.getFuses(nameHash)).to.equal(initialFuses)
    })
  })

  describe('unwrapETH2LD()', () => {
    const label = 'unwrapped'
    const labelHash = labelhash(label)
    const nameHash = namehash(label + '.eth')
    it('Allows the owner to unwrap a name.', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)

      //allow the restricted name wrappper to transfer the name to itself and reclaim it
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)
      expect(await NameWrapper.ownerOf(namehash('unwrapped.eth'))).to.equal(
        account
      )
      await NameWrapper.unwrapETH2LD(labelHash, account, account)
      // transfers the controller on the .eth registrar to the target address.
      expect(await EnsRegistry.owner(namehash('unwrapped.eth'))).to.equal(
        account
      )
      //Transfers the registrant on the .eth registrar to the target address
      expect(await BaseRegistrar.ownerOf(labelHash)).to.equal(account)
    })

    it('emits Unwrap event', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)
      const tx = await NameWrapper.unwrapETH2LD(labelHash, account, account)
      await expect(tx)
        .to.emit(NameWrapper, 'NameUnwrapped')
        .withArgs(namehash('unwrapped.eth'), account)
    })

    it('emits TransferSingle event', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)
      const tx = await NameWrapper.unwrapETH2LD(labelHash, account, account)
      await expect(tx)
        .to.emit(NameWrapper, 'TransferSingle')
        .withArgs(account, account, EMPTY_ADDRESS, nameHash, 1)
    })
    it('Does not allows an account authorised by the owner on the ENS registrar to unwrap a name', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await BaseRegistrar.setApprovalForAll(account2, true)
      await NameWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)
      await expect(
        NameWrapper2.unwrapETH2LD(labelHash, account2, account2)
      ).to.be.revertedWith(
        'revert NameWrapper: msg.sender is not the owner or approved'
      )
    })

    it('Does not allow anyone else to unwrap a name even if the owner has authorised the wrapper with the ENS registry.', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await EnsRegistry.setApprovalForAll(account2, true)
      await NameWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)
      await expect(
        NameWrapper2.unwrapETH2LD(labelHash, account2, account2)
      ).to.be.revertedWith(
        'revert NameWrapper: msg.sender is not the owner or approved'
      )
    })

    it('Does not allow a name to be unwrapped if CANNOT_UNWRAP fuse has been burned', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD(label, account, CANNOT_UNWRAP)
      await expect(
        NameWrapper.unwrapETH2LD(labelHash, account, account)
      ).to.be.revertedWith('revert NameWrapper: Domain is not unwrappable')
    })
  })

  describe('ownerOf()', () => {
    it('Returns the owner', async () => {
      const label = 'subdomain'
      const tokenId = labelhash(label)
      const wrappedTokenId = namehash(label + '.eth')
      const CAN_DO_EVERYTHING = 0

      await BaseRegistrar.register(tokenId, account, 84600)

      const ownerInBaseRegistrar = await BaseRegistrar.ownerOf(tokenId)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)

      const owner = await NameWrapper.ownerOf(wrappedTokenId)

      expect(owner).to.equal(account)
    })
  })

  describe('burnFuses()', () => {
    const label = 'fuses'
    const tokenId = labelhash('fuses')
    const wrappedTokenId = namehash('fuses.eth')
    it('Will not allow burning fuses unless the parent domain has CANNOT_REPLACE_SUBDOMAIN burned.', async () => {
      await EnsRegistry.setSubnodeOwner(ROOT_NODE, labelhash('abc'), account)

      await EnsRegistry.setSubnodeOwner(
        namehash('abc'),
        labelhash('sub'),
        account
      )

      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrap(ROOT_NODE, 'abc', account, CAN_DO_EVERYTHING)

      await NameWrapper.wrap(namehash('abc'), 'sub', account, 0)

      await expect(
        NameWrapper.burnFuses(
          namehash('abc'),
          labelhash('sub'),
          CANNOT_TRANSFER
        )
      ).to.be.revertedWith(
        'revert NameWrapper: Parent has not burned CAN_REPLACE_SUBDOMAIN fuse'
      )
    })
    it('Will not allow burning fuses unless CANNOT_UNWRAP is also burned.', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)

      await expect(
        NameWrapper.burnFuses(namehash('eth'), tokenId, CANNOT_TRANSFER)
      ).to.be.revertedWith(
        'revert NameWrapper: Domain has not burned unwrap fuse'
      )
    })

    it('Can be called by the owner.', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, CANNOT_UNWRAP)

      expect(await NameWrapper.getFuses(wrappedTokenId)).to.equal(CANNOT_UNWRAP)

      await NameWrapper.burnFuses(namehash('eth'), tokenId, CANNOT_TRANSFER)

      expect(await NameWrapper.getFuses(wrappedTokenId)).to.equal(
        CANNOT_UNWRAP | CANNOT_TRANSFER
      )
    })

    it('Emits BurnFusesEvent', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, CANNOT_UNWRAP)

      const tx = await NameWrapper.burnFuses(
        namehash('eth'),
        tokenId,
        CANNOT_TRANSFER
      )

      await expect(tx)
        .to.emit(NameWrapper, 'FusesBurned')
        .withArgs(wrappedTokenId, CANNOT_UNWRAP | CANNOT_TRANSFER)

      expect(await NameWrapper.getFuses(wrappedTokenId)).to.equal(
        CANNOT_UNWRAP | CANNOT_TRANSFER
      )
    })

    it('Can be called by an account authorised by the owner', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)

      await NameWrapper.setApprovalForAll(account2, true)

      await NameWrapper2.burnFuses(
        namehash('eth'),
        tokenId,
        CAN_DO_EVERYTHING | CANNOT_UNWRAP
      )

      expect(await NameWrapper.getFuses(wrappedTokenId)).to.equal(1)
    })
    it('Cannot be called by an unauthorised account', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)

      await expect(
        NameWrapper2.burnFuses(
          namehash('eth'),
          tokenId,
          CAN_DO_EVERYTHING | CANNOT_UNWRAP
        )
      ).to.be.reverted
    })

    it('Allows burning unknown fuses', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, CANNOT_UNWRAP)

      // Each fuse is represented by the next bit, 64 is the next undefined fuse

      await NameWrapper.burnFuses(namehash('eth'), tokenId, 128)

      expect(await NameWrapper.getFuses(wrappedTokenId)).to.equal(
        CANNOT_UNWRAP | 128
      )
    })

    it('Logically ORs passed in fuses with already-burned fuses.', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(
        label,
        account,
        CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN
      )

      await NameWrapper.burnFuses(namehash('eth'), tokenId, 128)

      expect(await NameWrapper.getFuses(wrappedTokenId)).to.equal(
        CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN | 128
      )
    })

    it('can set fuses and then burn ability to burn fuses', async () => {
      const label = 'burnabilitytoburn'
      const tokenId = labelhash(label)
      const wrappedTokenId = namehash(label + '.eth')
      const CAN_DO_EVERYTHING = 0

      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, CANNOT_UNWRAP)

      await NameWrapper.burnFuses(namehash('eth'), tokenId, CANNOT_BURN_FUSES)

      const ownerInWrapper = await NameWrapper.ownerOf(wrappedTokenId)

      expect(ownerInWrapper).to.equal(account)

      // check flag in the wrapper

      expect(await NameWrapper.canBurnFuses(wrappedTokenId)).to.equal(false)

      //try to set the resolver and ttl
      await expect(
        NameWrapper.burnFuses(
          namehash('eth'),
          tokenId,
          CANNOT_REPLACE_SUBDOMAIN
        )
      ).to.be.revertedWith(
        'revert NameWrapper: Fuse has been burned for burning fuses'
      )
    })

    it('can set fuses and burn transfer', async () => {
      const [signer2] = await ethers.getSigners()
      const account2 = await signer2.getAddress()
      const label = 'fuses3'
      const tokenId = labelhash('fuses3')
      const wrappedTokenId = namehash('fuses3.eth')

      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, CANNOT_UNWRAP)

      await NameWrapper.burnFuses(namehash('eth'), tokenId, CANNOT_TRANSFER)

      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)

      // check flag in the wrapper

      expect(await NameWrapper.canTransfer(wrappedTokenId)).to.equal(false)

      //try to set the resolver and ttl
      await expect(
        NameWrapper.safeTransferFrom(account, account2, wrappedTokenId, 1, '0x')
      ).to.be.revertedWith(
        'revert NameWrapper: Fuse already burned for transferring owner'
      )
    })

    it('can set fuses and burn canSetResolver and canSetTTL', async () => {
      const label = 'fuses1'
      const tokenId = labelhash(label)
      const wrappedTokenId = namehash(label + '.eth')
      const CAN_DO_EVERYTHING = 0

      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, CANNOT_UNWRAP)

      await NameWrapper.burnFuses(
        namehash('eth'),
        tokenId,
        CANNOT_SET_RESOLVER | CANNOT_SET_TTL
      )

      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)

      // check flag in the wrapper
      expect(await NameWrapper.canSetResolver(wrappedTokenId)).to.equal(false)
      expect(await NameWrapper.canSetTTL(wrappedTokenId)).to.equal(false)

      //try to set the resolver and ttl
      await expect(
        NameWrapper.setResolver(wrappedTokenId, account)
      ).to.be.revertedWith(
        'revert NameWrapper: Fuse already burned for setting resolver'
      )

      await expect(NameWrapper.setTTL(wrappedTokenId, 1000)).to.be.revertedWith(
        'revert NameWrapper: Fuse already burned for setting TTL'
      )
    })

    it('can set fuses and burn canCreateSubdomains', async () => {
      const label = 'fuses2'
      const tokenId = labelhash(label)
      const wrappedTokenId = namehash(label + '.eth')

      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, CANNOT_UNWRAP)

      const canCreateSubdomain1 = await NameWrapper.canCreateSubdomain(
        wrappedTokenId
      )

      expect(canCreateSubdomain1).to.equal(true)

      // can create before burn

      //revert not approved and isn't sender because subdomain isnt owned by contract?
      await NameWrapper.setSubnodeOwnerAndWrap(
        wrappedTokenId,
        'creatable',
        account,
        CAN_DO_EVERYTHING
      )

      expect(
        await EnsRegistry.owner(namehash('creatable.fuses2.eth'))
      ).to.equal(NameWrapper.address)

      expect(
        await NameWrapper.ownerOf(namehash('creatable.fuses2.eth'))
      ).to.equal(account)

      await NameWrapper.burnFuses(
        namehash('eth'),
        tokenId,
        CAN_DO_EVERYTHING | CANNOT_CREATE_SUBDOMAIN
      )

      const ownerInWrapper = await NameWrapper.ownerOf(wrappedTokenId)

      expect(ownerInWrapper).to.equal(account)

      const canCreateSubdomain = await NameWrapper.canCreateSubdomain(
        wrappedTokenId
      )

      expect(canCreateSubdomain).to.equal(false)

      //try to create a subdomain

      await expect(
        NameWrapper.setSubnodeOwner(
          namehash('fuses2.eth'),
          labelhash('uncreateable'),
          account
        )
      ).to.be.revertedWith(
        'revert NameWrapper: Fuse has been burned for creating or replacing a subdomain'
      )

      //expect replacing subdomain to succeed
    })
  })

  describe('setSubnodeOwnerAndWrap()', async () => {
    const label = 'ownerandwrap'
    const tokenId = labelhash(label)
    const wrappedTokenId = namehash(label + '.eth')

    before(async () => {
      await registerSetupAndWrapName(
        label,
        account,
        CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN
      )
    })

    it('Can be called by the owner of a name and sets this contract as owner on the ENS registry.', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.setSubnodeOwnerAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account,
        CAN_DO_EVERYTHING
      )

      expect(
        await EnsRegistry.owner(namehash(`setsubnodeownerandwrap.${label}.eth`))
      ).to.equal(NameWrapper.address)

      expect(
        await NameWrapper.ownerOf(
          namehash(`setsubnodeownerandwrap.${label}.eth`)
        )
      ).to.equal(account)
    })
    it('Can be called by an account authorised by the owner.', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NameWrapper.setApprovalForAll(account2, true)
      await NameWrapper2.setSubnodeOwnerAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account,
        0
      )

      expect(
        await EnsRegistry.owner(namehash(`setsubnodeownerandwrap.${label}.eth`))
      ).to.equal(NameWrapper.address)

      expect(
        await NameWrapper.ownerOf(
          namehash(`setsubnodeownerandwrap.${label}.eth`)
        )
      ).to.equal(account)
    })
    it('Transfers the wrapped token to the target address.', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NameWrapper.setSubnodeOwnerAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account2,
        CAN_DO_EVERYTHING
      )

      expect(
        await EnsRegistry.owner(namehash(`setsubnodeownerandwrap.${label}.eth`))
      ).to.equal(NameWrapper.address)

      expect(
        await NameWrapper.ownerOf(
          namehash(`setsubnodeownerandwrap.${label}.eth`)
        )
      ).to.equal(account2)
    })
    it('Will not allow wrapping with a target address of 0x0.', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await expect(
        NameWrapper.setSubnodeOwnerAndWrap(
          wrappedTokenId,
          'setsubnodeownerandwrap',
          EMPTY_ADDRESS,
          CAN_DO_EVERYTHING
        )
      ).to.be.revertedWith('revert ERC1155: mint to the zero address')
    })
    it('Will not allow wrapping with a target address of the wrapper contract address', async () => {
      await expect(
        NameWrapper.setSubnodeOwnerAndWrap(
          wrappedTokenId,
          'setsubnodeownerandwrap',
          NameWrapper.address,
          CAN_DO_EVERYTHING
        )
      ).to.be.revertedWith(
        'revert ERC1155: newOwner cannot be the NameWrapper contract'
      )
    })
    it('Does not allow anyone else to wrap a name even if the owner has authorised the wrapper with the ENS registry.', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await EnsRegistry.setApprovalForAll(account2, true)
      await expect(
        NameWrapper2.setSubnodeOwnerAndWrap(
          wrappedTokenId,
          'setsubnodeownerandwrap',
          account,
          CAN_DO_EVERYTHING
        )
      ).to.be.revertedWith(
        'revert NameWrapper: msg.sender is not the owner or approved'
      )
    })
    it('Does not allow fuses to be burned if the parent name does not have CANNOT_REPLACE_SUBDOMAIN burned', async () => {
      const label = 'subdomain2'
      const tokenId = labelhash(label)
      const wrappedTokenId = namehash(label + '.eth')
      await registerSetupAndWrapName(label, account, CAN_DO_EVERYTHING)
      await expect(
        NameWrapper.setSubnodeOwnerAndWrap(
          wrappedTokenId,
          'setsubnodeownerandwrap',
          account,
          CANNOT_UNWRAP
        )
      ).to.be.revertedWith(
        'revert NameWrapper: Cannot burn fuses: parent name can replace subdomain'
      )
    })
    it('Does not allow fuses to be burned if CANNOT_UNWRAP is not burned.', async () => {
      const label = 'subdomain2'
      const tokenId = labelhash(label)
      const wrappedTokenId = namehash(label + '.eth')
      await registerSetupAndWrapName(
        label,
        account,
        CAN_DO_EVERYTHING | CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN
      )
      await expect(
        NameWrapper.setSubnodeOwnerAndWrap(
          wrappedTokenId,
          'setsubnodeownerandwrap',
          account,
          CANNOT_REPLACE_SUBDOMAIN
        )
      ).to.be.revertedWith(
        'revert NameWrapper: Cannot burn fuses: domain can be unwrapped'
      )
    })

    it('Allows fuses to be burned if CANNOT_UNWRAP is burned and parent CANNOT_REPLACE_SUBDOMAIN is burned', async () => {
      const label = 'subdomain2'
      const tokenId = labelhash(label)
      const wrappedTokenId = namehash(label + '.eth')
      await registerSetupAndWrapName(
        label,
        account,
        CAN_DO_EVERYTHING | CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN
      )
      await NameWrapper.setSubnodeOwnerAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account,
        CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN
      )

      expect(
        await NameWrapper.canReplaceSubdomain(
          namehash(`setsubnodeownerandwrap.${label}.eth`)
        )
      ).to.equal(false)
    })
    it('Emits Wrap event', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      const tx = await NameWrapper.setSubnodeOwnerAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account2,
        0
      )
      await expect(tx)
        .to.emit(NameWrapper, 'NameWrapped')
        .withArgs(wrappedTokenId, 'setsubnodeownerandwrap', account2, 0)
    })

    it('Emits TransferSingle event', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      const tx = await NameWrapper.setSubnodeOwnerAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account2,
        0
      )
      await expect(tx)
        .to.emit(NameWrapper, 'TransferSingle')
        .withArgs(
          account,
          EMPTY_ADDRESS,
          account2,
          namehash(`setsubnodeownerandwrap.${label}.eth`),
          1
        )
    })
  })
  describe('setSubnodeRecordAndWrap()', async () => {
    const label = 'subdomain2'
    const tokenId = labelhash(label)
    const wrappedTokenId = namehash(label + '.eth')
    let resolver

    before(async () => {
      resolver = account // dummy address for resolver
      await registerSetupAndWrapName(
        label,
        account,
        CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN
      )
    })

    it('Can be called by the owner of a name', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NameWrapper.setSubnodeRecordAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account,
        resolver,
        0,
        0
      )

      expect(
        await EnsRegistry.owner(namehash(`setsubnodeownerandwrap.${label}.eth`))
      ).to.equal(NameWrapper.address)

      expect(
        await NameWrapper.ownerOf(
          namehash(`setsubnodeownerandwrap.${label}.eth`)
        )
      ).to.equal(account)
    })

    it('Can be called by an account authorised by the owner.', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NameWrapper.setApprovalForAll(account2, true)
      await NameWrapper2.setSubnodeRecordAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account,
        resolver,
        0,
        0
      )

      expect(
        await EnsRegistry.owner(namehash(`setsubnodeownerandwrap.${label}.eth`))
      ).to.equal(NameWrapper.address)

      expect(
        await NameWrapper.ownerOf(
          namehash(`setsubnodeownerandwrap.${label}.eth`)
        )
      ).to.equal(account)
    })

    it('Transfers the wrapped token to the target address.', async () => {
      await NameWrapper.setSubnodeRecordAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account2,
        resolver,
        0,
        0
      )

      expect(
        await NameWrapper.ownerOf(
          namehash(`setsubnodeownerandwrap.${label}.eth`)
        )
      ).to.equal(account2)
    })

    it('Will not allow wrapping with a target address of 0x0', async () => {
      await expect(
        NameWrapper.setSubnodeRecordAndWrap(
          wrappedTokenId,
          'setsubnodeownerandwrap',
          EMPTY_ADDRESS,
          resolver,
          0,
          0
        )
      ).to.be.revertedWith('revert ERC1155: mint to the zero address')
    })

    it('Will not allow wrapping with a target address of the wrapper contract address.', async () => {
      await expect(
        NameWrapper.setSubnodeRecordAndWrap(
          wrappedTokenId,
          'setsubnodeownerandwrap',
          NameWrapper.address,
          resolver,
          0,
          0
        )
      ).to.be.revertedWith(
        'revert ERC1155: newOwner cannot be the NameWrapper contract'
      )
    })

    it('Does not allow anyone else to wrap a name even if the owner has authorised the wrapper with the ENS registry.', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await EnsRegistry.setApprovalForAll(account2, true)
      await expect(
        NameWrapper2.setSubnodeRecordAndWrap(
          wrappedTokenId,
          'setsubnodeownerandwrap',
          account,
          resolver,
          0,
          0
        )
      ).to.be.revertedWith(
        'revert NameWrapper: msg.sender is not the owner or approved'
      )
    })

    it('Does not allow fuses to be burned if the parent name does not have CANNOT_REPLACE_SUBDOMAIN burned.', async () => {
      const label = 'subdomain3'
      const tokenId = labelhash(label)
      const wrappedTokenId = namehash(label + '.eth')
      await registerSetupAndWrapName(label, account, CAN_DO_EVERYTHING)
      await expect(
        NameWrapper.setSubnodeRecordAndWrap(
          wrappedTokenId,
          'setsubnodeownerandwrap',
          account,
          resolver,
          0,
          CANNOT_UNWRAP
        )
      ).to.be.revertedWith(
        'revert NameWrapper: Cannot burn fuses: parent name can replace subdomain'
      )
    })

    it('Does not allow fuses to be burned if CANNOT_UNWRAP is not burned', async () => {
      const label = 'subdomain3'
      const tokenId = labelhash(label)
      const wrappedTokenId = namehash(label + '.eth')
      await registerSetupAndWrapName(
        label,
        account,
        CAN_DO_EVERYTHING | CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN
      )
      await expect(
        NameWrapper.setSubnodeRecordAndWrap(
          wrappedTokenId,
          'setsubnodeownerandwrap',
          account,
          resolver,
          0,
          CANNOT_REPLACE_SUBDOMAIN
        )
      ).to.be.revertedWith(
        'revert NameWrapper: Cannot burn fuses: domain can be unwrapped'
      )
    })

    it('Emits Wrap event', async () => {
      const tx = await NameWrapper.setSubnodeRecordAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account2,
        resolver,
        0,
        0
      )
      await expect(tx)
        .to.emit(NameWrapper, 'NameWrapped')
        .withArgs(wrappedTokenId, 'setsubnodeownerandwrap', account2, 0)
    })

    it('Emits TransferSingle event', async () => {
      const tx = await NameWrapper.setSubnodeRecordAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account2,
        resolver,
        0,
        0
      )
      await expect(tx)
        .to.emit(NameWrapper, 'TransferSingle')
        .withArgs(
          account,
          EMPTY_ADDRESS,
          account2,
          namehash(`setsubnodeownerandwrap.${label}.eth`),
          1
        )
    })

    it('Sets the appropriate values on the ENS registry.', async () => {
      await NameWrapper.setSubnodeRecordAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account2,
        resolver,
        100,
        0
      )

      const node = namehash(`setsubnodeownerandwrap.${label}.eth`)

      expect(await EnsRegistry.owner(node)).to.equal(NameWrapper.address)
      expect(await EnsRegistry.resolver(node)).to.equal(resolver)
      expect(await EnsRegistry.ttl(node)).to.equal(100)
    })
  })

  describe('setRecord', () => {
    const label = 'setrecord'
    const labelHash = labelhash(label)
    const wrappedTokenId = namehash(label + '.eth')

    before(async () => {
      await registerSetupAndWrapName(label, account, CANNOT_UNWRAP)
    })

    it('Can be called by the owner', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NameWrapper.setRecord(wrappedTokenId, account2, account, 50)
    })

    it('Performs the appropriate function on the ENS registry.', async () => {
      await NameWrapper.setRecord(wrappedTokenId, account2, account, 50)

      expect(await EnsRegistry.owner(wrappedTokenId)).to.equal(account2)
      expect(await EnsRegistry.resolver(wrappedTokenId)).to.equal(account)
      expect(await EnsRegistry.ttl(wrappedTokenId)).to.equal(50)
    })

    it('Can be called by an account authorised by the owner.', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NameWrapper.setApprovalForAll(account2, true)
      await NameWrapper2.setRecord(wrappedTokenId, account2, account, 50)
    })

    it('Cannot be called by anyone else.', async () => {
      await expect(
        NameWrapper2.setRecord(wrappedTokenId, account2, account, 50)
      ).to.be.revertedWith(
        'revert NameWrapper: msg.sender is not the owner or approved'
      )
    })

    it('Cannot be called if CANNOT_TRANSFER is burned.', async () => {
      await NameWrapper.burnFuses(namehash('eth'), labelHash, CANNOT_TRANSFER)
      await expect(
        NameWrapper.setRecord(wrappedTokenId, account2, account, 50)
      ).to.be.revertedWith(
        'revert NameWrapper: Fuse is burned for transferring'
      )
    })

    it('Cannot be called if CANNOT_SET_RESOLVER is burned.', async () => {
      await NameWrapper.burnFuses(
        namehash('eth'),
        labelHash,
        CANNOT_SET_RESOLVER
      )

      await expect(
        NameWrapper.setRecord(wrappedTokenId, account2, account, 50)
      ).to.be.revertedWith(
        'revert NameWrapper: Fuse is burned for setting resolver'
      )
    })

    it('Cannot be called if CANNOT_SET_TTL is burned.', async () => {
      await NameWrapper.burnFuses(namehash('eth'), labelHash, CANNOT_SET_TTL)

      await expect(
        NameWrapper.setRecord(wrappedTokenId, account2, account, 50)
      ).to.be.revertedWith('revert NameWrapper: Fuse is burned for setting TTL')
    })
  })

  describe('setSubnodeRecord', () => {
    const label = 'setsubnoderecord'
    const labelHash = labelhash(label)
    const wrappedTokenId = namehash(label + '.eth')
    const subLabel = 'sub'
    const subLabelHash = labelhash(subLabel)
    const subWrappedTokenId = namehash(`${subLabel}.${label}.eth`)

    before(async () => {
      await registerSetupAndWrapName(label, account, CANNOT_UNWRAP)
    })

    it('Can be called by the owner', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NameWrapper.setSubnodeRecord(
        wrappedTokenId,
        subLabelHash,
        account2,
        account,
        50
      )
    })

    it('Performs the appropriate function on the ENS registry.', async () => {
      //Make sure the registry is clear
      expect(await EnsRegistry.owner(subWrappedTokenId)).to.equal(EMPTY_ADDRESS)
      expect(await EnsRegistry.resolver(subWrappedTokenId)).to.equal(
        EMPTY_ADDRESS
      )
      expect(await EnsRegistry.ttl(subWrappedTokenId)).to.equal(EMPTY_ADDRESS)
      await NameWrapper.setSubnodeRecord(
        wrappedTokenId,
        subLabelHash,
        account2,
        account,
        50
      )

      expect(await EnsRegistry.owner(subWrappedTokenId)).to.equal(account2)
      expect(await EnsRegistry.resolver(subWrappedTokenId)).to.equal(account)
      expect(await EnsRegistry.ttl(subWrappedTokenId)).to.equal(50)
    })

    it('Can be called by an account authorised by the owner.', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NameWrapper.setApprovalForAll(account2, true)
      await NameWrapper2.setSubnodeRecord(
        wrappedTokenId,
        subLabelHash,
        account2,
        account,
        50
      )
    })

    it('Cannot be called by anyone else.', async () => {
      await expect(
        NameWrapper2.setSubnodeRecord(
          wrappedTokenId,
          subLabelHash,
          account2,
          account,
          50
        )
      ).to.be.revertedWith(
        'revert NameWrapper: msg.sender is not the owner or approved'
      )
    })

    it('Cannot be called if CREATE_SUBDOMAIN is burned and is a new subdomain', async () => {
      await NameWrapper.burnFuses(
        namehash('eth'),
        labelHash,
        CANNOT_CREATE_SUBDOMAIN
      )

      //Check the subdomain has not been created yet
      expect(await EnsRegistry.owner(subWrappedTokenId)).to.equal(EMPTY_ADDRESS)
      await expect(
        NameWrapper.setSubnodeRecord(
          wrappedTokenId,
          subLabelHash,
          account2,
          account,
          50
        )
      ).to.be.revertedWith(
        'revert NameWrapper: Fuse has been burned for creating or replacing a subdomain'
      )
    })

    it('Cannot be called if REPLACE_SUBDOMAIN is burned and is an existing subdomain', async () => {
      await NameWrapper.burnFuses(
        namehash('eth'),
        labelHash,
        CANNOT_REPLACE_SUBDOMAIN
      )

      //Check the subdomain has not been created yet
      await NameWrapper.setSubnodeRecord(
        wrappedTokenId,
        subLabelHash,
        account2,
        account,
        50
      )
      expect(await EnsRegistry.owner(subWrappedTokenId)).to.equal(account2)
      await expect(
        NameWrapper.setSubnodeRecord(
          wrappedTokenId,
          subLabelHash,
          account,
          account,
          50
        )
      ).to.be.revertedWith(
        'revert NameWrapper: Fuse has been burned for creating or replacing a subdomain'
      )
    })
  })

  describe('setSubnodeOwner', () => {
    const label = 'setsubnodeowner'
    const labelHash = labelhash(label)
    const wrappedTokenId = namehash(label + '.eth')
    const subLabel = 'sub'
    const subLabelHash = labelhash(subLabel)
    const subWrappedTokenId = namehash(`${subLabel}.${label}.eth`)

    before(async () => {
      await registerSetupAndWrapName(label, account, CANNOT_UNWRAP)
    })

    it('Can be called by the owner', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NameWrapper.setSubnodeOwner(wrappedTokenId, subLabelHash, account2)
    })

    it('Performs the appropriate function on the ENS registry.', async () => {
      expect(await EnsRegistry.owner(subWrappedTokenId)).to.equal(EMPTY_ADDRESS)
      await NameWrapper.setSubnodeOwner(wrappedTokenId, subLabelHash, account2)
      expect(await EnsRegistry.owner(subWrappedTokenId)).to.equal(account2)
    })

    it('Can be called by an account authorised by the owner.', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NameWrapper.setApprovalForAll(account2, true)
      await NameWrapper2.setSubnodeOwner(wrappedTokenId, subLabelHash, account2)
    })

    it('Cannot be called by anyone else.', async () => {
      await expect(
        NameWrapper2.setSubnodeOwner(wrappedTokenId, subLabelHash, account2)
      ).to.be.revertedWith(
        'revert NameWrapper: msg.sender is not the owner or approved'
      )
    })

    it('Cannot be called if CREATE_SUBDOMAIN is burned and is a new subdomain', async () => {
      await NameWrapper.burnFuses(
        namehash('eth'),
        labelHash,
        CANNOT_CREATE_SUBDOMAIN
      )

      //Check the subdomain has not been created yet
      expect(await EnsRegistry.owner(subWrappedTokenId)).to.equal(EMPTY_ADDRESS)
      await expect(
        NameWrapper.setSubnodeOwner(wrappedTokenId, subLabelHash, account2)
      ).to.be.revertedWith(
        'revert NameWrapper: Fuse has been burned for creating or replacing a subdomain'
      )
    })

    it('Cannot be called if REPLACE_SUBDOMAIN is burned and is an existing subdomain', async () => {
      await NameWrapper.burnFuses(
        namehash('eth'),
        labelHash,
        CANNOT_REPLACE_SUBDOMAIN
      )

      //Check the subdomain has not been created yet
      await NameWrapper.setSubnodeOwner(wrappedTokenId, subLabelHash, account2)
      expect(await EnsRegistry.owner(subWrappedTokenId)).to.equal(account2)
      await expect(
        NameWrapper.setSubnodeOwner(wrappedTokenId, subLabelHash, account)
      ).to.be.revertedWith(
        'revert NameWrapper: Fuse has been burned for creating or replacing a subdomain'
      )
    })
  })

  describe('setResolver', () => {
    const label = 'setresolver'
    const labelHash = labelhash(label)
    const wrappedTokenId = namehash(label + '.eth')

    before(async () => {
      await registerSetupAndWrapName(label, account, CANNOT_UNWRAP)
    })

    it('Can be called by the owner', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NameWrapper.setResolver(wrappedTokenId, account2)
    })

    it('Performs the appropriate function on the ENS registry.', async () => {
      expect(await EnsRegistry.resolver(wrappedTokenId)).to.equal(EMPTY_ADDRESS)
      await NameWrapper.setResolver(wrappedTokenId, account2)
      expect(await EnsRegistry.resolver(wrappedTokenId)).to.equal(account2)
    })

    it('Can be called by an account authorised by the owner.', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NameWrapper.setApprovalForAll(account2, true)
      await NameWrapper2.setResolver(wrappedTokenId, account2)
    })

    it('Cannot be called by anyone else.', async () => {
      await expect(
        NameWrapper2.setResolver(wrappedTokenId, account2)
      ).to.be.revertedWith(
        'revert NameWrapper: msg.sender is not the owner or approved'
      )
    })

    it('Cannot be called if CANNOT_SET_RESOLVER is burned', async () => {
      await NameWrapper.burnFuses(
        namehash('eth'),
        labelHash,
        CANNOT_SET_RESOLVER
      )

      await expect(
        NameWrapper.setResolver(wrappedTokenId, account2)
      ).to.be.revertedWith(
        'revert NameWrapper: Fuse already burned for setting resolver'
      )
    })
  })

  describe('setTTL', () => {
    const label = 'setttl'
    const labelHash = labelhash(label)
    const wrappedTokenId = namehash(label + '.eth')

    before(async () => {
      await registerSetupAndWrapName(label, account, CANNOT_UNWRAP)
    })

    it('Can be called by the owner', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NameWrapper.setTTL(wrappedTokenId, 100)
    })

    it('Performs the appropriate function on the ENS registry.', async () => {
      expect(await EnsRegistry.ttl(wrappedTokenId)).to.equal(EMPTY_ADDRESS)
      await NameWrapper.setTTL(wrappedTokenId, 100)
      expect(await EnsRegistry.ttl(wrappedTokenId)).to.equal(100)
    })

    it('Can be called by an account authorised by the owner.', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NameWrapper.setApprovalForAll(account2, true)
      await NameWrapper2.setTTL(wrappedTokenId, 100)
    })

    it('Cannot be called by anyone else.', async () => {
      await expect(
        NameWrapper2.setResolver(wrappedTokenId, account2)
      ).to.be.revertedWith(
        'revert NameWrapper: msg.sender is not the owner or approved'
      )
    })

    it('Cannot be called if CANNOT_SET_TTL is burned', async () => {
      await NameWrapper.burnFuses(namehash('eth'), labelHash, CANNOT_SET_TTL)

      await expect(NameWrapper.setTTL(wrappedTokenId, 100)).to.be.revertedWith(
        'revert NameWrapper: Fuse already burned for setting TTL'
      )
    })
  })

  describe('Transfer', () => {
    const label = 'transfer'
    const labelHash = labelhash(label)
    const wrappedTokenId = namehash(label + '.eth')

    before(async () => {
      await registerSetupAndWrapName(label, account, CANNOT_UNWRAP)
    })

    it('safeTransfer cannot be called if CANNOT_TRANSFER is burned', async () => {
      await NameWrapper.burnFuses(namehash('eth'), labelHash, CANNOT_TRANSFER)

      await expect(
        NameWrapper.safeTransferFrom(account, account2, wrappedTokenId, 1, '0x')
      ).to.be.revertedWith(
        'revert NameWrapper: Fuse already burned for transferring owner'
      )
    })

    it('safeBatchTransfer cannot be called if CANNOT_TRANSFER is burned', async () => {
      await NameWrapper.burnFuses(namehash('eth'), labelHash, CANNOT_TRANSFER)

      await expect(
        NameWrapper.safeBatchTransferFrom(
          account,
          account2,
          [wrappedTokenId],
          [1],
          '0x'
        )
      ).to.be.revertedWith(
        'revert NameWrapper: Fuse already burned for transferring owner'
      )
    })
  })

  describe('MetadataService', () => {
    it('uri() returns url', async () => {
      expect(await NameWrapper.uri(123)).to.equal('https://ens.domains')
    })

    it('owner can set a new MetadataService', async () => {
      await NameWrapper.setMetadataService(account2)
      expect(await NameWrapper.metadataService()).to.equal(account2)
    })

    it('non-owner cannot set a new MetadataService', async () => {
      await expect(
        NameWrapper2.setMetadataService(account2)
      ).to.be.revertedWith('revert Ownable: caller is not the owner')
    })
  })
})
