const packet = require('dns-packet')
const fs = require('fs')
const { ethers } = require('hardhat')
const { utils, BigNumber: BN } = ethers
const { use, expect } = require('chai')
const { solidity } = require('ethereum-waffle')
const n = require('eth-ens-namehash')
const namehash = n.hash
const { shouldBehaveLikeERC1155 } = require('./ERC1155.behaviour')
const { shouldSupportInterfaces } = require('./SupportsInterface.behaviour')

const abiCoder = new ethers.utils.AbiCoder()

use(solidity)

const labelhash = (label) => utils.keccak256(utils.toUtf8Bytes(label))
const ROOT_NODE =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

const EMPTY_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000'
const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000'

async function deploy(name, _args) {
  const args = _args || []

  const contractArtifacts = await ethers.getContractFactory(name)
  const contract = await contractArtifacts.deploy(...args)
  contract.name = name
  return contract
}

function increaseTime(delay) {
  return ethers.provider.send('evm_increaseTime', [delay])
}

function mine() {
  return ethers.provider.send('evm_mine')
}

function encodeName(name) {
  return '0x' + packet.name.encode(name).toString('hex')
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

//Enum for vulnerabilities
const ParentVulnerability = {
  Safe: 0,
  Registrant: 1,
  Controller: 2,
  Fuses: 3,
  Expired: 4,
}

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
      await NameWrapper.wrap(encodeName('xyz'), account, fuses)
      expect(await NameWrapper.ownerOf(namehash('xyz'))).to.equal(account)
    })

    it('emits event for Wrap', async () => {
      const fuses = MINIMUM_PARENT_FUSES

      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)

      const tx = NameWrapper.wrap(encodeName('xyz'), account, fuses)
      await expect(tx)
        .to.emit(NameWrapper, 'NameWrapped')
        .withArgs(namehash('xyz'), encodeName('xyz'), account, fuses)
    })

    it('emits event for TransferSingle', async () => {
      const fuses = MINIMUM_PARENT_FUSES

      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)

      const tx = NameWrapper.wrap(encodeName('xyz'), account, fuses)
      await expect(tx)
        .to.emit(NameWrapper, 'TransferSingle')
        .withArgs(account, EMPTY_ADDRESS, account, namehash('xyz'), 1)
    })

    it('Cannot wrap a name if the owner has not authorised the wrapper with the ENS registry.', async () => {
      await expect(NameWrapper.wrap(encodeName('xyz'), account, 0)).to.be
        .reverted
    })

    it('Will not allow wrapping with a target address of 0x0 or the wrapper contract address.', async () => {
      await expect(
        NameWrapper.wrap(encodeName('xyz'), EMPTY_ADDRESS, 0)
      ).to.be.revertedWith('revert ERC1155: mint to the zero address')
    })

    it('Will not allow wrapping with a target address of the wrapper contract address.', async () => {
      await expect(
        NameWrapper.wrap(encodeName('xyz'), NameWrapper.address, 0)
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
      await NameWrapper.wrap(encodeName('abc'), account2, 0)
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
        NameWrapper.wrap(encodeName('abc'), account2, 0)
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
        NameWrapper.wrap(encodeName('blah.eth'), account2, 0)
      ).to.be.revertedWith(
        'revert NameWrapper: .eth domains need to use wrapETH2LD()'
      )
    })

    it('Fuses are disabled if CANNOT_REPLACE_SUBDOMAIN has not been burned on the parent domain', async () => {
      // register sub.xyz before we wrap xyz
      await EnsRegistry.setSubnodeOwner(
        namehash('xyz'),
        labelhash('sub'),
        account
      )

      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrap(encodeName('xyz'), account, CANNOT_UNWRAP)

      //attempt to burn fuse
      await NameWrapper.wrap(
        encodeName('sub.xyz'),
        account,
        CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN
      )
      const [fuses, vulnerability, nodeVulnerable] = await NameWrapper.getFuses(
        namehash('sub.xyz')
      )
      expect(fuses).to.equal(CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN)
      expect(vulnerability).to.equal(ParentVulnerability.Fuses)
      expect(nodeVulnerable).to.equal(namehash('xyz'))
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
        NameWrapper.wrap(encodeName('xyz'), account, CANNOT_REPLACE_SUBDOMAIN)
      ).to.be.revertedWith(
        'revert NameWrapper: Cannot burn fuses: domain can be unwrapped'
      )
    })

    it('Can re-wrap a name that was reassigned by a wrapped parent', async () => {
      expect(await NameWrapper.ownerOf(namehash('xyz'))).to.equal(EMPTY_ADDRESS)

      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrap(encodeName('xyz'), account, CAN_DO_EVERYTHING)
      expect(await NameWrapper.ownerOf(namehash('xyz'))).to.equal(account)

      await NameWrapper.setSubnodeOwnerAndWrap(
        namehash('xyz'),
        'sub',
        account,
        CAN_DO_EVERYTHING
      )
      await NameWrapper.setSubnodeOwner(
        namehash('xyz'),
        labelhash('sub'),
        account2
      )

      //confirm the registry has been switched, but the token holder has not
      expect(await EnsRegistry.owner(namehash('sub.xyz'))).to.equal(account2)
      expect(await NameWrapper.ownerOf(namehash('sub.xyz'))).to.equal(account)

      //allow the NameWrapper to make txs on behalf of account2
      await EnsRegistry2.setApprovalForAll(NameWrapper.address, true)
      const tx = await NameWrapper2.wrap(
        encodeName('sub.xyz'),
        account2,
        CAN_DO_EVERYTHING
      )

      // Check the 4 events
      // Unwrap of the original owner
      // TransferSingle burn of the original token
      // Wrap to the new owner with fuses
      // TransferSingle to mint the new token

      const nameHash = namehash('sub.xyz')

      await expect(tx)
        .to.emit(NameWrapper, 'NameUnwrapped')
        .withArgs(nameHash, EMPTY_ADDRESS)
      await expect(tx)
        .to.emit(NameWrapper, 'TransferSingle')
        .withArgs(account2, account, EMPTY_ADDRESS, nameHash, 1)
      await expect(tx)
        .to.emit(NameWrapper, 'NameWrapped')
        .withArgs(nameHash, encodeName('sub.xyz'), account2, CAN_DO_EVERYTHING)
      await expect(tx)
        .to.emit(NameWrapper, 'TransferSingle')
        .withArgs(account2, EMPTY_ADDRESS, account2, nameHash, 1)

      expect(await NameWrapper2.ownerOf(nameHash)).to.equal(account2)
      expect(await EnsRegistry.owner(nameHash)).to.equal(NameWrapper.address)
    })

    it('Can re-wrap a name that was reassigned by an unwrapped parent', async () => {
      expect(await NameWrapper.ownerOf(namehash('xyz'))).to.equal(EMPTY_ADDRESS)

      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      await EnsRegistry.setSubnodeOwner(
        namehash('xyz'),
        labelhash('sub'),
        account
      )
      await NameWrapper.wrap(encodeName('sub.xyz'), account, CAN_DO_EVERYTHING)

      await EnsRegistry.setSubnodeOwner(
        namehash('xyz'),
        labelhash('sub'),
        account2
      )

      expect(await EnsRegistry.owner(namehash('sub.xyz'))).to.equal(account2)
      expect(await NameWrapper.ownerOf(namehash('sub.xyz'))).to.equal(account)

      await EnsRegistry2.setApprovalForAll(NameWrapper.address, true)
      const tx = await NameWrapper2.wrap(
        encodeName('sub.xyz'),
        account2,
        CAN_DO_EVERYTHING
      )

      const nameHash = namehash('sub.xyz')

      await expect(tx)
        .to.emit(NameWrapper, 'NameUnwrapped')
        .withArgs(nameHash, EMPTY_ADDRESS)
      await expect(tx)
        .to.emit(NameWrapper, 'TransferSingle')
        .withArgs(account2, account, EMPTY_ADDRESS, nameHash, 1)
      await expect(tx)
        .to.emit(NameWrapper, 'NameWrapped')
        .withArgs(nameHash, encodeName('sub.xyz'), account2, CAN_DO_EVERYTHING)
      await expect(tx)
        .to.emit(NameWrapper, 'TransferSingle')
        .withArgs(account2, EMPTY_ADDRESS, account2, nameHash, 1)

      expect(await NameWrapper2.ownerOf(nameHash)).to.equal(account2)
      expect(await EnsRegistry.owner(nameHash)).to.equal(NameWrapper.address)
    })
  })

  describe('unwrap()', () => {
    it('Allows owner to unwrap name', async () => {
      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrap(encodeName('xyz'), account, MINIMUM_PARENT_FUSES)
      await NameWrapper.setSubnodeOwner(
        namehash('xyz'),
        labelhash('unwrapped'),
        account
      )
      await NameWrapper.wrap(encodeName('unwrapped.xyz'), account, 0)
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
      await NameWrapper.wrap(encodeName('xyz'), account, 0)
      const tx = await NameWrapper.unwrap(ROOT_NODE, labelhash('xyz'), account)

      await expect(tx)
        .to.emit(NameWrapper, 'NameUnwrapped')
        .withArgs(namehash('xyz'), account)
    })

    it('emits TransferSingle event', async () => {
      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrap(encodeName('xyz'), account, 0)
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
      await NameWrapper.wrap(encodeName('abc'), account, 0)
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
      await NameWrapper.wrap(encodeName('abc'), account2, 0)
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
      await NameWrapper.wrap(encodeName('abc'), account, 0)
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
      await NameWrapper.wrap(encodeName('abc'), account, 0)
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
      await NameWrapper.wrap(encodeName('abc'), account, CANNOT_UNWRAP)
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
        .withArgs(
          namehash('wrapped2.eth'),
          encodeName('wrapped2.eth'),
          account2,
          CAN_DO_EVERYTHING
        )
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
        .withArgs(
          namehash('wrapped2.eth'),
          encodeName('wrapped2.eth'),
          account2,
          CAN_DO_EVERYTHING
        )
      await expect(tx)
        .to.emit(NameWrapper, 'TransferSingle')
        .withArgs(account2, EMPTY_ADDRESS, account2, nameHash, 1)

      expect(await NameWrapper2.ownerOf(nameHash)).to.equal(account2)
      expect(await BaseRegistrar.ownerOf(labelHash)).to.equal(
        NameWrapper.address
      )
    })

    it('correctly reports fuses for a name that has expired and been rewrapped more permissively', async () => {
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      // Register the name
      const DAY = 60 * 60 * 24
      const GRACE_PERIOD = 90
      await BaseRegistrar.register(labelHash, account, DAY)

      // Wrap it
      await NameWrapper.wrapETH2LD(
        label,
        account,
        CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN
      )
      let [fuses, vulnerability, nodeVulnerable] = await NameWrapper.getFuses(
        namehash('wrapped2.eth')
      )
      expect(fuses).to.equal(CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN)
      expect(vulnerability).to.equal(ParentVulnerability.Safe)

      // Create a subdomain that can't be unwrapped
      await NameWrapper.setSubnodeOwnerAndWrap(
        namehash('wrapped2.eth'),
        'sub',
        account,
        CANNOT_UNWRAP
      )
      ;[fuses, vulnerability, nodeVulnerable] = await NameWrapper.getFuses(
        namehash('sub.wrapped2.eth')
      )
      expect(fuses).to.equal(CANNOT_UNWRAP)
      expect(vulnerability).to.equal(ParentVulnerability.Safe)
      expect(nodeVulnerable).to.equal(EMPTY_BYTES32)

      // Fast forward until the 2LD expires
      await increaseTime(DAY * GRACE_PERIOD + DAY + 1)
      await mine()

      // Register from another address
      await BaseRegistrar2.register(labelHash, account2, DAY)
      await BaseRegistrar2.setApprovalForAll(NameWrapper.address, true)
      const tx = await NameWrapper2.wrapETH2LD(
        label,
        account2,
        CAN_DO_EVERYTHING
      )
      ;[fuses, vulnerability] = await NameWrapper.getFuses(
        namehash('wrapped2.eth')
      )
      expect(fuses).to.equal(CAN_DO_EVERYTHING)
      expect(vulnerability).to.equal(ParentVulnerability.Safe)
      expect(nodeVulnerable).to.equal(EMPTY_BYTES32)
      ;[fuses, vulnerability, nodeVulnerable] = await NameWrapper.getFuses(
        namehash('sub.wrapped2.eth')
      )
      expect(fuses).to.equal(CANNOT_UNWRAP)
      expect(vulnerability).to.equal(ParentVulnerability.Fuses)
      expect(nodeVulnerable).to.equal(namehash('wrapped2.eth'))
    })

    it('emits Wrap event', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      const tx = await NameWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)
      await expect(tx)
        .to.emit(NameWrapper, 'NameWrapped')
        .withArgs(
          namehash('wrapped2.eth'),
          encodeName('wrapped2.eth'),
          account,
          CAN_DO_EVERYTHING
        )
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
      const [fuses, vulnerability] = await NameWrapper.getFuses(nameHash)
      expect(fuses).to.equal(initialFuses)
      expect(vulnerability).to.equal(ParentVulnerability.Safe)
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
    it('Burns fuses but shows them as disabled if the parent domain does not have CANNOT_REPLACE_SUBDOMAIN burned.', async () => {
      await EnsRegistry.setSubnodeOwner(ROOT_NODE, labelhash('abc'), account)

      await EnsRegistry.setSubnodeOwner(
        namehash('abc'),
        labelhash('sub'),
        account
      )

      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrap(encodeName('abc'), account, CAN_DO_EVERYTHING)

      await NameWrapper.wrap(encodeName('sub.abc'), account, 0)

      await NameWrapper.burnFuses(
        namehash('sub.abc'),
        CANNOT_UNWRAP | CANNOT_TRANSFER
      )
      const [fuses, vulnerability, nodeVulnerable] = await NameWrapper.getFuses(
        namehash('sub.abc')
      )
      expect(fuses).to.equal(CANNOT_UNWRAP | CANNOT_TRANSFER)
      expect(vulnerability).to.equal(ParentVulnerability.Fuses)
      expect(nodeVulnerable).to.equal(namehash('abc'))
    })
    it('Will not allow burning fuses unless CANNOT_UNWRAP is also burned.', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)

      await expect(
        NameWrapper.burnFuses(wrappedTokenId, CANNOT_TRANSFER)
      ).to.be.revertedWith(
        'revert NameWrapper: Cannot burn fuses: domain can be unwrapped'
      )
    })

    it('Can be called by the owner', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, CANNOT_UNWRAP)

      let [fuses, vulnerability] = await NameWrapper.getFuses(wrappedTokenId)
      expect(fuses).to.equal(CANNOT_UNWRAP)
      expect(vulnerability).to.equal(ParentVulnerability.Safe)

      await NameWrapper.burnFuses(wrappedTokenId, CANNOT_TRANSFER)
      ;[fuses, vulnerability] = await NameWrapper.getFuses(wrappedTokenId)
      expect(fuses).to.equal(CANNOT_UNWRAP | CANNOT_TRANSFER)
      expect(vulnerability).to.equal(ParentVulnerability.Safe)
    })

    it('Emits BurnFusesEvent', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, CANNOT_UNWRAP)

      const tx = await NameWrapper.burnFuses(wrappedTokenId, CANNOT_TRANSFER)

      await expect(tx)
        .to.emit(NameWrapper, 'FusesBurned')
        .withArgs(wrappedTokenId, CANNOT_UNWRAP | CANNOT_TRANSFER)

      const [fuses, vulnerability] = await NameWrapper.getFuses(wrappedTokenId)
      expect(fuses).to.equal(CANNOT_UNWRAP | CANNOT_TRANSFER)
      expect(vulnerability).to.equal(ParentVulnerability.Safe)
    })

    it('Can be called by an account authorised by the owner', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)

      await NameWrapper.setApprovalForAll(account2, true)

      await NameWrapper2.burnFuses(wrappedTokenId, CANNOT_UNWRAP)

      const [fuses, vulnerability] = await NameWrapper.getFuses(wrappedTokenId)
      expect(fuses).to.equal(CANNOT_UNWRAP)
      expect(vulnerability).to.equal(ParentVulnerability.Safe)
    })
    it('Cannot be called by an unauthorised account', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)

      await expect(
        NameWrapper2.burnFuses(
          wrappedTokenId,
          CAN_DO_EVERYTHING | CANNOT_UNWRAP
        )
      ).to.be.reverted
    })

    it('Allows burning unknown fuses', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, CANNOT_UNWRAP)

      // Each fuse is represented by the next bit, 64 is the next undefined fuse

      await NameWrapper.burnFuses(wrappedTokenId, 128)

      const [fuses, vulnerability] = await NameWrapper.getFuses(wrappedTokenId)
      expect(fuses).to.equal(CANNOT_UNWRAP | 128)
      expect(vulnerability).to.equal(ParentVulnerability.Safe)
    })

    it('Logically ORs passed in fuses with already-burned fuses.', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(
        label,
        account,
        CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN
      )

      await NameWrapper.burnFuses(wrappedTokenId, 128)

      const [fuses, vulnerability] = await NameWrapper.getFuses(wrappedTokenId)
      expect(fuses).to.equal(CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN | 128)
      expect(vulnerability).to.equal(ParentVulnerability.Safe)
    })

    it('can set fuses and then burn ability to burn fuses', async () => {
      const label = 'burnabilitytoburn'
      const tokenId = labelhash(label)
      const wrappedTokenId = namehash(label + '.eth')
      const CAN_DO_EVERYTHING = 0

      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, CANNOT_UNWRAP)

      await NameWrapper.burnFuses(wrappedTokenId, CANNOT_BURN_FUSES)

      const ownerInWrapper = await NameWrapper.ownerOf(wrappedTokenId)

      expect(ownerInWrapper).to.equal(account)

      // check flag in the wrapper

      expect(
        await NameWrapper.allFusesBurned(wrappedTokenId, CANNOT_BURN_FUSES)
      ).to.equal(true)

      //try to set the resolver and ttl
      await expect(
        NameWrapper.burnFuses(wrappedTokenId, CANNOT_REPLACE_SUBDOMAIN)
      ).to.be.revertedWith('NameWrapper: Operation prohibited by fuses')
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

      await NameWrapper.burnFuses(wrappedTokenId, CANNOT_TRANSFER)

      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)

      // check flag in the wrapper

      expect(
        await NameWrapper.allFusesBurned(wrappedTokenId, CANNOT_TRANSFER)
      ).to.equal(true)

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
        wrappedTokenId,
        CANNOT_SET_RESOLVER | CANNOT_SET_TTL
      )

      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)

      // check flag in the wrapper
      expect(
        await NameWrapper.allFusesBurned(
          wrappedTokenId,
          CANNOT_SET_RESOLVER | CANNOT_SET_TTL
        )
      ).to.equal(true)

      //try to set the resolver and ttl
      await expect(
        NameWrapper.setResolver(wrappedTokenId, account)
      ).to.be.revertedWith('NameWrapper: Operation prohibited by fuses')

      await expect(NameWrapper.setTTL(wrappedTokenId, 1000)).to.be.revertedWith(
        'NameWrapper: Operation prohibited by fuses'
      )
    })

    it('can set fuses and burn canCreateSubdomains', async () => {
      const label = 'fuses2'
      const tokenId = labelhash(label)
      const wrappedTokenId = namehash(label + '.eth')

      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)

      await NameWrapper.wrapETH2LD(label, account, CANNOT_UNWRAP)

      expect(
        await NameWrapper.allFusesBurned(
          wrappedTokenId,
          CANNOT_CREATE_SUBDOMAIN
        )
      ).to.equal(false)

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
        wrappedTokenId,
        CAN_DO_EVERYTHING | CANNOT_CREATE_SUBDOMAIN
      )

      const ownerInWrapper = await NameWrapper.ownerOf(wrappedTokenId)

      expect(ownerInWrapper).to.equal(account)

      expect(
        await NameWrapper.allFusesBurned(
          wrappedTokenId,
          CANNOT_CREATE_SUBDOMAIN
        )
      ).to.equal(true)

      //try to create a subdomain

      await expect(
        NameWrapper.setSubnodeOwner(
          namehash('fuses2.eth'),
          labelhash('uncreateable'),
          account
        )
      ).to.be.revertedWith('NameWrapper: Operation prohibited by fuses')

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
        'sub',
        account,
        CAN_DO_EVERYTHING
      )

      expect(await EnsRegistry.owner(namehash(`sub.${label}.eth`))).to.equal(
        NameWrapper.address
      )

      expect(await NameWrapper.ownerOf(namehash(`sub.${label}.eth`))).to.equal(
        account
      )
    })
    it('Can be called by an account authorised by the owner.', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NameWrapper.setApprovalForAll(account2, true)
      await NameWrapper2.setSubnodeOwnerAndWrap(
        wrappedTokenId,
        'sub',
        account,
        0
      )

      expect(await EnsRegistry.owner(namehash(`sub.${label}.eth`))).to.equal(
        NameWrapper.address
      )

      expect(await NameWrapper.ownerOf(namehash(`sub.${label}.eth`))).to.equal(
        account
      )
    })
    it('Transfers the wrapped token to the target address.', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NameWrapper.setSubnodeOwnerAndWrap(
        wrappedTokenId,
        'sub',
        account2,
        CAN_DO_EVERYTHING
      )

      expect(await EnsRegistry.owner(namehash(`sub.${label}.eth`))).to.equal(
        NameWrapper.address
      )

      expect(await NameWrapper.ownerOf(namehash(`sub.${label}.eth`))).to.equal(
        account2
      )
    })
    it('Will not allow wrapping with a target address of 0x0.', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await expect(
        NameWrapper.setSubnodeOwnerAndWrap(
          wrappedTokenId,
          'sub',
          EMPTY_ADDRESS,
          CAN_DO_EVERYTHING
        )
      ).to.be.revertedWith('revert ERC1155: mint to the zero address')
    })
    it('Will not allow wrapping with a target address of the wrapper contract address', async () => {
      await expect(
        NameWrapper.setSubnodeOwnerAndWrap(
          wrappedTokenId,
          'sub',
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
          'sub',
          account,
          CAN_DO_EVERYTHING
        )
      ).to.be.revertedWith(
        'revert NameWrapper: msg.sender is not the owner or approved'
      )
    })
    it('Fuses are not enabled if the parent name does not have CANNOT_REPLACE_SUBDOMAIN burned', async () => {
      const label = 'subdomain2'
      const tokenId = labelhash(label)
      const wrappedTokenId = namehash(label + '.eth')
      await registerSetupAndWrapName(label, account, CAN_DO_EVERYTHING)
      await NameWrapper.setSubnodeOwnerAndWrap(
        wrappedTokenId,
        'sub',
        account,
        CANNOT_UNWRAP
      )
      const [fuses, vulnerability, vulnerableNode] = await NameWrapper.getFuses(
        namehash(`sub.${label}.eth`)
      )
      expect(fuses).to.equal(CANNOT_UNWRAP)
      expect(vulnerability).to.equal(ParentVulnerability.Fuses)
      expect(vulnerableNode).to.equal(wrappedTokenId)
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
          'sub',
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
        'sub',
        account,
        CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN
      )

      expect(
        await NameWrapper.allFusesBurned(
          namehash(`sub.${label}.eth`),
          CANNOT_REPLACE_SUBDOMAIN
        )
      ).to.equal(true)
    })
    it('Emits Wrap event', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      const tx = await NameWrapper.setSubnodeOwnerAndWrap(
        wrappedTokenId,
        'sub',
        account2,
        0
      )
      await expect(tx)
        .to.emit(NameWrapper, 'NameWrapped')
        .withArgs(
          namehash(`sub.${label}.eth`),
          encodeName(`sub.${label}.eth`),
          account2,
          0
        )
    })

    it('Emits TransferSingle event', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      const tx = await NameWrapper.setSubnodeOwnerAndWrap(
        wrappedTokenId,
        'sub',
        account2,
        0
      )
      await expect(tx)
        .to.emit(NameWrapper, 'TransferSingle')
        .withArgs(
          account,
          EMPTY_ADDRESS,
          account2,
          namehash(`sub.${label}.eth`),
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
        'sub',
        account,
        resolver,
        0,
        0
      )

      expect(await EnsRegistry.owner(namehash(`sub.${label}.eth`))).to.equal(
        NameWrapper.address
      )

      expect(await NameWrapper.ownerOf(namehash(`sub.${label}.eth`))).to.equal(
        account
      )
    })

    it('Can be called by an account authorised by the owner.', async () => {
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NameWrapper.setApprovalForAll(account2, true)
      await NameWrapper2.setSubnodeRecordAndWrap(
        wrappedTokenId,
        'sub',
        account,
        resolver,
        0,
        0
      )

      expect(await EnsRegistry.owner(namehash(`sub.${label}.eth`))).to.equal(
        NameWrapper.address
      )

      expect(await NameWrapper.ownerOf(namehash(`sub.${label}.eth`))).to.equal(
        account
      )
    })

    it('Transfers the wrapped token to the target address.', async () => {
      await NameWrapper.setSubnodeRecordAndWrap(
        wrappedTokenId,
        'sub',
        account2,
        resolver,
        0,
        0
      )

      expect(await NameWrapper.ownerOf(namehash(`sub.${label}.eth`))).to.equal(
        account2
      )
    })

    it('Will not allow wrapping with a target address of 0x0', async () => {
      await expect(
        NameWrapper.setSubnodeRecordAndWrap(
          wrappedTokenId,
          'sub',
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
          'sub',
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
          'sub',
          account,
          resolver,
          0,
          0
        )
      ).to.be.revertedWith(
        'revert NameWrapper: msg.sender is not the owner or approved'
      )
    })

    it('Fuses are not enabled if the parent name does not have CANNOT_REPLACE_SUBDOMAIN burned.', async () => {
      const label = 'subdomain3'
      const tokenId = labelhash(label)
      const wrappedTokenId = namehash(label + '.eth')
      await registerSetupAndWrapName(label, account, CAN_DO_EVERYTHING)
      await NameWrapper.setSubnodeRecordAndWrap(
        wrappedTokenId,
        'sub',
        account,
        resolver,
        0,
        CANNOT_UNWRAP
      )
      const [fuses, vulnerable, vulnerableNode] = await NameWrapper.getFuses(
        namehash(`sub.${label}.eth`)
      )
      expect(fuses).to.equal(CANNOT_UNWRAP)
      expect(vulnerable).to.equal(ParentVulnerability.Fuses)
      expect(vulnerableNode).to.equal(wrappedTokenId)
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
          'sub',
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
        'sub',
        account2,
        resolver,
        0,
        0
      )
      await expect(tx)
        .to.emit(NameWrapper, 'NameWrapped')
        .withArgs(
          namehash(`sub.${label}.eth`),
          encodeName(`sub.${label}.eth`),
          account2,
          0
        )
    })

    it('Emits TransferSingle event', async () => {
      const tx = await NameWrapper.setSubnodeRecordAndWrap(
        wrappedTokenId,
        'sub',
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
          namehash(`sub.${label}.eth`),
          1
        )
    })

    it('Sets the appropriate values on the ENS registry.', async () => {
      await NameWrapper.setSubnodeRecordAndWrap(
        wrappedTokenId,
        'sub',
        account2,
        resolver,
        100,
        0
      )

      const node = namehash(`sub.${label}.eth`)

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
      await NameWrapper.burnFuses(wrappedTokenId, CANNOT_TRANSFER)
      await expect(
        NameWrapper.setRecord(wrappedTokenId, account2, account, 50)
      ).to.be.revertedWith('NameWrapper: Operation prohibited by fuses')
    })

    it('Cannot be called if CANNOT_SET_RESOLVER is burned.', async () => {
      await NameWrapper.burnFuses(wrappedTokenId, CANNOT_SET_RESOLVER)

      await expect(
        NameWrapper.setRecord(wrappedTokenId, account2, account, 50)
      ).to.be.revertedWith('NameWrapper: Operation prohibited by fuses')
    })

    it('Cannot be called if CANNOT_SET_TTL is burned.', async () => {
      await NameWrapper.burnFuses(wrappedTokenId, CANNOT_SET_TTL)

      await expect(
        NameWrapper.setRecord(wrappedTokenId, account2, account, 50)
      ).to.be.revertedWith('NameWrapper: Operation prohibited by fuses')
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
      await NameWrapper.burnFuses(wrappedTokenId, CANNOT_CREATE_SUBDOMAIN)

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
      ).to.be.revertedWith('NameWrapper: Operation prohibited by fuses')
    })

    it('Cannot be called if REPLACE_SUBDOMAIN is burned and is an existing subdomain', async () => {
      await NameWrapper.burnFuses(wrappedTokenId, CANNOT_REPLACE_SUBDOMAIN)

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
      ).to.be.revertedWith('NameWrapper: Operation prohibited by fuses')
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
      await NameWrapper.burnFuses(wrappedTokenId, CANNOT_CREATE_SUBDOMAIN)

      //Check the subdomain has not been created yet
      expect(await EnsRegistry.owner(subWrappedTokenId)).to.equal(EMPTY_ADDRESS)
      await expect(
        NameWrapper.setSubnodeOwner(wrappedTokenId, subLabelHash, account2)
      ).to.be.revertedWith('NameWrapper: Operation prohibited by fuses')
    })

    it('Cannot be called if REPLACE_SUBDOMAIN is burned and is an existing subdomain', async () => {
      await NameWrapper.burnFuses(wrappedTokenId, CANNOT_REPLACE_SUBDOMAIN)

      //Check the subdomain has not been created yet
      await NameWrapper.setSubnodeOwner(wrappedTokenId, subLabelHash, account2)
      expect(await EnsRegistry.owner(subWrappedTokenId)).to.equal(account2)
      await expect(
        NameWrapper.setSubnodeOwner(wrappedTokenId, subLabelHash, account)
      ).to.be.revertedWith('NameWrapper: Operation prohibited by fuses')
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
      await NameWrapper.burnFuses(wrappedTokenId, CANNOT_SET_RESOLVER)

      await expect(
        NameWrapper.setResolver(wrappedTokenId, account2)
      ).to.be.revertedWith('NameWrapper: Operation prohibited by fuses')
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
        NameWrapper2.setTTL(wrappedTokenId, 3600)
      ).to.be.revertedWith(
        'revert NameWrapper: msg.sender is not the owner or approved'
      )
    })

    it('Cannot be called if CANNOT_SET_TTL is burned', async () => {
      await NameWrapper.burnFuses(wrappedTokenId, CANNOT_SET_TTL)

      await expect(NameWrapper.setTTL(wrappedTokenId, 100)).to.be.revertedWith(
        'NameWrapper: Operation prohibited by fuses'
      )
    })
  })

  describe('onERC721Received', () => {
    const label = 'send2contract'
    const name = label + '.eth'
    const tokenId = labelhash(label)
    const wrappedTokenId = namehash(label + '.eth')
    it('Wraps a name transferred to it and sets the owner to the provided address', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar['safeTransferFrom(address,address,uint256,bytes)'](
        account,
        NameWrapper.address,
        tokenId,
        abiCoder.encode(
          ['string', 'address', 'uint96'],
          [label, account2, '0x0']
        )
      )

      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account2)
      expect(await BaseRegistrar.ownerOf(tokenId)).to.equal(NameWrapper.address)
    })

    it('Reverts if called by anything other than the ENS registrar address', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await expect(
        NameWrapper.onERC721Received(
          account,
          account,
          tokenId,
          abiCoder.encode(
            ['string', 'address', 'uint96'],
            [label, account, '0x000000000000000000000001']
          )
        )
      ).to.be.revertedWith(
        'revert NameWrapper: Wrapper only supports .eth ERC721 token transfers'
      )
    })

    it('Accepts fuse values from the data field', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar['safeTransferFrom(address,address,uint256,bytes)'](
        account,
        NameWrapper.address,
        tokenId,
        abiCoder.encode(
          ['string', 'address', 'uint96'],
          [label, account, '0x000000000000000000000001']
        )
      )
      const [fuses] = await NameWrapper.getFuses(wrappedTokenId)
      expect(fuses).to.equal(1)
      expect(
        await NameWrapper.allFusesBurned(wrappedTokenId, CANNOT_UNWRAP)
      ).to.equal(true)
    })

    it('Reverts if transferred without data', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await expect(
        BaseRegistrar['safeTransferFrom(address,address,uint256,bytes)'](
          account,
          NameWrapper.address,
          tokenId,
          '0x'
        )
      ).to.be.revertedWith('')
    })
    it('Rejects transfers where the data field label does not match the tokenId', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await expect(
        BaseRegistrar['safeTransferFrom(address,address,uint256,bytes)'](
          account,
          NameWrapper.address,
          tokenId,
          abiCoder.encode(
            ['string', 'address', 'uint96'],
            ['incorrectlabel', account, '0x000000000000000000000000']
          )
        )
      ).to.be.revertedWith(
        'NameWrapper: Token id does match keccak(label) of label provided in data field'
      )
    })

    it('Reverts if CANNOT_UNWRAP is not burned and attempts to burn other fuses', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)
      await EnsRegistry.setOwner(wrappedTokenId, account2)

      await expect(
        BaseRegistrar['safeTransferFrom(address,address,uint256,bytes)'](
          account,
          NameWrapper.address,
          tokenId,
          abiCoder.encode(
            ['string', 'address', 'uint96'],
            [label, account, '0x000000000000000000000002']
          )
        )
      ).to.be.revertedWith(
        'revert NameWrapper: Cannot burn fuses: domain can be unwrapped'
      )
    })

    it('Allows burning other fuses if CAN_UNWRAP has been burnt', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)
      await EnsRegistry.setOwner(wrappedTokenId, account2)

      await BaseRegistrar['safeTransferFrom(address,address,uint256,bytes)'](
        account,
        NameWrapper.address,
        tokenId,
        abiCoder.encode(
          ['string', 'address', 'uint96'],
          [label, account, '0x000000000000000000000005'] // CANNOT_UNWRAP | CANNOT_TRANSFER
        )
      )

      expect(await EnsRegistry.owner(wrappedTokenId)).to.equal(
        NameWrapper.address
      )
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      expect((await NameWrapper.getFuses(wrappedTokenId))[0]).to.equal(5)

      expect(
        await NameWrapper.allFusesBurned(wrappedTokenId, CANNOT_UNWRAP)
      ).to.equal(true)
    })

    it('Sets the controller in the ENS registry to the wrapper contract', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar['safeTransferFrom(address,address,uint256,bytes)'](
        account,
        NameWrapper.address,
        tokenId,
        abiCoder.encode(
          ['string', 'address', 'uint96'],
          [label, account, '0x000000000000000000000000']
        )
      )

      expect(await EnsRegistry.owner(wrappedTokenId)).to.equal(
        NameWrapper.address
      )
    })
    it('Can wrap a name even if the controller address is different to the registrant address', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)
      await EnsRegistry.setOwner(wrappedTokenId, account2)

      await BaseRegistrar['safeTransferFrom(address,address,uint256,bytes)'](
        account,
        NameWrapper.address,
        tokenId,
        abiCoder.encode(
          ['string', 'address', 'uint96'],
          ['send2contract', account, '0x000000000000000000000000'] // CANNOT_UNWRAP | CANNOT_TRANSFER
        )
      )

      expect(await EnsRegistry.owner(wrappedTokenId)).to.equal(
        NameWrapper.address
      )
      expect(await NameWrapper.ownerOf(wrappedTokenId)).to.equal(account)
    })

    it('emits NameWrapped Event', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)
      const tx = await BaseRegistrar[
        'safeTransferFrom(address,address,uint256,bytes)'
      ](
        account,
        NameWrapper.address,
        tokenId,
        abiCoder.encode(
          ['string', 'address', 'uint96'],
          [label, account, '0x000000000000000000000005'] // CANNOT_UNWRAP | CANNOT_TRANSFER
        )
      )

      await expect(tx)
        .to.emit(NameWrapper, 'NameWrapped')
        .withArgs(
          wrappedTokenId,
          encodeName(name),
          account,
          CANNOT_UNWRAP | CANNOT_TRANSFER
        )
    })

    it('emits TransferSingle Event', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)
      const tx = await BaseRegistrar[
        'safeTransferFrom(address,address,uint256,bytes)'
      ](
        account,
        NameWrapper.address,
        tokenId,
        abiCoder.encode(
          ['string', 'address', 'uint96'],
          [label, account, '0x000000000000000000000005'] // CANNOT_UNWRAP | CANNOT_TRANSFER
        )
      )

      await expect(tx)
        .to.emit(NameWrapper, 'TransferSingle')
        .withArgs(
          BaseRegistrar.address,
          EMPTY_ADDRESS,
          account,
          wrappedTokenId,
          1
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
      await NameWrapper.burnFuses(wrappedTokenId, CANNOT_TRANSFER)

      await expect(
        NameWrapper.safeTransferFrom(account, account2, wrappedTokenId, 1, '0x')
      ).to.be.revertedWith(
        'revert NameWrapper: Fuse already burned for transferring owner'
      )
    })

    it('safeBatchTransfer cannot be called if CANNOT_TRANSFER is burned', async () => {
      await NameWrapper.burnFuses(wrappedTokenId, CANNOT_TRANSFER)

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

  describe('getFuses', () => {
    const label = 'getfuses'
    const labelHash = labelhash(label)
    const nameHash = namehash(label + '.eth')
    const subLabel = 'sub'
    const subLabelHash = labelhash(subLabel)
    const subNameHash = namehash(`${subLabel}.${label}.eth`)
    const subSubLabel = 'subsub'
    const subSubLabelhash = labelhash(subSubLabel)
    const subSubNameHash = namehash(`${subSubLabel}.${subLabel}.${label}.eth`)
    it('returns the correct fuses and vulnerability', async () => {
      const initialFuses = CANNOT_UNWRAP | CANNOT_SET_RESOLVER
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await BaseRegistrar.register(labelHash, account, 84600)
      await NameWrapper.wrapETH2LD(label, account, initialFuses)
      const [fuses, vulnerability] = await NameWrapper.getFuses(nameHash)
      expect(fuses).to.equal(initialFuses)
      expect(vulnerability).to.equal(ParentVulnerability.Safe)
    })

    it('identifies vulnerability is in fuses and node associated with it', async () => {
      const initialFuses = CAN_DO_EVERYTHING
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await BaseRegistrar.register(labelHash, account, 84600)
      await NameWrapper.wrapETH2LD(label, account, initialFuses)
      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.setSubnodeOwnerAndWrap(
        nameHash,
        subLabel,
        account,
        initialFuses
      )

      let [fuses, vulnerability, vulnerableNode] = await NameWrapper.getFuses(
        subNameHash
      )

      expect(fuses).to.equal(initialFuses)
      expect(vulnerability).to.equal(ParentVulnerability.Fuses)
      expect(vulnerableNode).to.equal(nameHash)

      //check parent fuses
      ;[fuses, vulnerability] = await NameWrapper.getFuses(nameHash)

      expect(fuses).to.equal(initialFuses)
      expect(vulnerability).to.equal(ParentVulnerability.Safe)
    })

    it('identifies vulnerability is the domain is expired and the vulnerable node', async () => {
      const initialFuses = CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await BaseRegistrar.register(labelHash, account, 84600)
      await NameWrapper.wrapETH2LD(label, account, initialFuses)
      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.setSubnodeOwnerAndWrap(
        nameHash,
        subLabel,
        account,
        initialFuses
      )

      await increaseTime(84600 + 1)
      await mine()

      let [fuses, vulnerability, vulnerableNode] = await NameWrapper.getFuses(
        subNameHash
      )

      expect(fuses).to.equal(initialFuses)
      expect(vulnerability).to.equal(ParentVulnerability.Expired)
      expect(vulnerableNode).to.equal(nameHash)
    })

    it('identifies vulnerability is registrant is not the wrapper and vulnerable node', async () => {
      const GRACE_PERIOD = 90
      const DAY = 24 * 60 * 60

      const initialFuses = CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await BaseRegistrar.register(labelHash, account, DAY)
      await NameWrapper.wrapETH2LD(label, account, initialFuses)
      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.setSubnodeOwnerAndWrap(
        nameHash,
        subLabel,
        account,
        initialFuses
      )

      await increaseTime(DAY * GRACE_PERIOD + DAY + 1)
      await mine()

      await BaseRegistrar.register(labelHash, account, 84600)

      let [fuses, vulnerability, vulnerableNode] = await NameWrapper.getFuses(
        subNameHash
      )

      expect(fuses).to.equal(initialFuses)
      expect(vulnerability).to.equal(ParentVulnerability.Registrant)
      expect(vulnerableNode).to.equal(nameHash)
    })

    it('identifies vulnerability is registrant is not the wrapper and vulnerable node', async () => {
      const GRACE_PERIOD = 90
      const DAY = 24 * 60 * 60

      const initialFuses = CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await BaseRegistrar.register(labelHash, account, DAY)
      await NameWrapper.wrapETH2LD(label, account, initialFuses)
      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.setSubnodeOwnerAndWrap(
        nameHash,
        subLabel,
        account,
        initialFuses
      )

      await NameWrapper.setSubnodeOwnerAndWrap(
        subNameHash,
        subSubLabel,
        account,
        initialFuses
      )

      await increaseTime(DAY * GRACE_PERIOD + DAY + 1)
      await mine()

      // re-register the name
      await BaseRegistrar.register(labelHash, account, 84600)
      // setup the subnode outside the wrapper
      await EnsRegistry.setSubnodeOwner(nameHash, subLabelHash, account)
      // rewrap the name above, without wrapping the subnode
      await NameWrapper.wrapETH2LD(label, account, initialFuses)

      let [fuses, vulnerability, vulnerableNode] = await NameWrapper.getFuses(
        subNameHash
      )

      expect(fuses).to.equal(initialFuses)
      expect(vulnerability).to.equal(ParentVulnerability.Controller)
      expect(vulnerableNode).to.equal(subNameHash)
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
