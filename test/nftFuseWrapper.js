const fs = require('fs')
const chalk = require('chalk')
const { ethers } = require('hardhat')
const { utils, BigNumber: BN } = ethers
const { use, expect } = require('chai')
const { solidity } = require('ethereum-waffle')
const n = require('eth-ens-namehash')
const namehash = n.hash
const { loadENSContract } = require('../utils/contracts')
const baseRegistrarJSON = require('./baseRegistrarABI')

use(solidity)

const labelhash = (label) => utils.keccak256(utils.toUtf8Bytes(label))
const ROOT_NODE =
  '0x0000000000000000000000000000000000000000000000000000000000000000'
const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000'

const addresses = {}

async function deploy(name, _args) {
  const args = _args || []

  console.log(`📄 ${name}`)
  const contractArtifacts = await ethers.getContractFactory(name)
  const contract = await contractArtifacts.deploy(...args)
  console.log(chalk.cyan(name), 'deployed to:', chalk.magenta(contract.address))
  fs.writeFileSync(`artifacts/${name}.address`, contract.address)
  console.log('\n')
  contract.name = name
  addresses[name] = contract.address
  return contract
}

function increaseTime(delay) {
  return ethers.provider.send('evm_increaseTime', [delay])
}

function mine() {
  return ethers.provider.send('evm_mine')
}

describe('NFT fuse wrapper', () => {
  let ENSRegistry
  let ENSRegistry2
  let BaseRegistrar
  let BaseRegistrar2
  let NFTFuseWrapper
  let NFTFuseWrapper2
  let signers
  let account
  let account2
  let result

  let CANNOT_UNWRAP,
    CANNOT_TRANSFER,
    CANNOT_BURN_FUSES,
    CANNOT_SET_RESOLVER,
    CANNOT_SET_TTL,
    CANNOT_CREATE_SUBDOMAIN,
    CANNOT_REPLACE_SUBDOMAIN,
    CAN_DO_EVERYTHING

  /* Utility funcs */

  async function registerSetupAndWrapName(label, account, fuses) {
    const tokenId = labelhash(label)

    await BaseRegistrar.register(tokenId, account, 84600)

    await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

    await NFTFuseWrapper.wrapETH2LD(label, account, fuses)
  }

  before(async () => {
    signers = await ethers.getSigners()
    account = await signers[0].getAddress()
    account2 = await signers[1].getAddress()

    const registryJSON = loadENSContract('ens', 'ENSRegistry')

    const registryContractFactory = new ethers.ContractFactory(
      registryJSON.abi,
      registryJSON.bytecode,
      signers[0]
    )

    EnsRegistry = await registryContractFactory.deploy()
    EnsRegistry2 = EnsRegistry.connect(signers[1])

    BaseRegistrar = await new ethers.ContractFactory(
      baseRegistrarJSON.abi,
      baseRegistrarJSON.bytecode,
      signers[0]
    ).deploy(EnsRegistry.address, namehash('eth'))

    BaseRegistrar2 = BaseRegistrar.connect(signers[1])

    console.log(`*** BaseRegistrar deployed at ${BaseRegistrar.address} *** `)

    await BaseRegistrar.addController(account)
    await BaseRegistrar.addController(account2)

    NFTFuseWrapper = await deploy('NFTFuseWrapper', [
      EnsRegistry.address,
      BaseRegistrar.address,
    ])
    NFTFuseWrapper2 = NFTFuseWrapper.connect(signers[1])

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

    const ethOwner = await EnsRegistry.owner(namehash('eth'))
    console.log('ethOwner', ethOwner)
    const ensEthOwner = await EnsRegistry.owner(namehash('ens.eth'))

    console.log('ensEthOwner', ensEthOwner)

    //make sure base registrar is owner of eth TLD

    const ownerOfEth = await EnsRegistry.owner(namehash('eth'))

    expect(ownerOfEth).to.equal(BaseRegistrar.address)

    //setup constants for fuses
    ;[
      CANNOT_UNWRAP,
      CANNOT_TRANSFER,
      CANNOT_BURN_FUSES,
      CANNOT_SET_RESOLVER,
      CANNOT_SET_TTL,
      CANNOT_CREATE_SUBDOMAIN,
      CANNOT_REPLACE_SUBDOMAIN,
      CAN_DO_EVERYTHING,
    ] = await Promise.all([
      NFTFuseWrapper.CANNOT_UNWRAP(),
      NFTFuseWrapper.CANNOT_TRANSFER(),
      NFTFuseWrapper.CANNOT_BURN_FUSES(),
      NFTFuseWrapper.CANNOT_SET_RESOLVER(),
      NFTFuseWrapper.CANNOT_SET_TTL(),
      NFTFuseWrapper.CANNOT_CREATE_SUBDOMAIN(),
      NFTFuseWrapper.CANNOT_REPLACE_SUBDOMAIN(),
      NFTFuseWrapper.CAN_DO_EVERYTHING(),
    ])
  })

  beforeEach(async () => {
    result = await ethers.provider.send('evm_snapshot')
  })
  afterEach(async () => {
    await ethers.provider.send('evm_revert', [result])
  })

  describe('wrap()', () => {
    it('Wraps a name if you are the owner', async () => {
      const fuses = await NFTFuseWrapper.MINIMUM_PARENT_FUSES()
      expect(await NFTFuseWrapper.ownerOf(namehash('xyz'))).to.equal(
        EMPTY_ADDRESS
      )

      await EnsRegistry.setApprovalForAll(NFTFuseWrapper.address, true)
      await NFTFuseWrapper.wrap(ROOT_NODE, 'xyz', account, fuses)
      expect(await NFTFuseWrapper.ownerOf(namehash('xyz'))).to.equal(account)
    })

    it('emits event for Wrap', async () => {
      const fuses = await NFTFuseWrapper.MINIMUM_PARENT_FUSES()

      await EnsRegistry.setApprovalForAll(NFTFuseWrapper.address, true)

      const tx = NFTFuseWrapper.wrap(ROOT_NODE, 'xyz', account, fuses)
      await expect(tx)
        .to.emit(NFTFuseWrapper, 'Wrap')
        .withArgs(ROOT_NODE, 'xyz', account, fuses)
    })

    it('emits event for TransferSingle', async () => {
      const fuses = await NFTFuseWrapper.MINIMUM_PARENT_FUSES()

      await EnsRegistry.setApprovalForAll(NFTFuseWrapper.address, true)

      const tx = NFTFuseWrapper.wrap(ROOT_NODE, 'xyz', account, fuses)
      await expect(tx)
        .to.emit(NFTFuseWrapper, 'TransferSingle')
        .withArgs(account, EMPTY_ADDRESS, account, namehash('xyz'), 1)
    })

    it('Cannot wrap a name if the owner has not authorised the wrapper with the ENS registry.', async () => {
      expect(NFTFuseWrapper.wrap(ROOT_NODE, 'xyz', account, 0)).to.be.reverted
    })

    it('Will not allow wrapping with a target address of 0x0 or the wrapper contract address.', async () => {
      await expect(
        NFTFuseWrapper.wrap(ROOT_NODE, 'xyz', EMPTY_ADDRESS, 0)
      ).to.be.revertedWith('revert ERC1155: mint to the zero address')
    })

    it('Will not allow wrapping with a target address of the wrapper contract address.', async () => {
      await expect(
        NFTFuseWrapper.wrap(ROOT_NODE, 'xyz', NFTFuseWrapper.address, 0)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: newOwner cannot be the NFTFuseWrapper contract'
      )
    })

    it('Allows an account approved by the owner on the ENS registry to wrap a name.', async () => {
      const labelHash = labelhash('abc')

      // setup .abc with account2 as owner
      await EnsRegistry.setSubnodeOwner(ROOT_NODE, labelHash, account2)
      // allow account to deal with all account2's names
      await EnsRegistry2.setApprovalForAll(account, true)
      await EnsRegistry2.setApprovalForAll(NFTFuseWrapper.address, true)

      //confirm abc is owner by account2 not account 1
      expect(await EnsRegistry.owner(namehash('abc'))).to.equal(account2)
      // wrap using account
      await NFTFuseWrapper.wrap(ROOT_NODE, 'abc', account2, 0)
      const ownerOfWrappedXYZ = await NFTFuseWrapper.ownerOf(namehash('abc'))
      expect(ownerOfWrappedXYZ).to.equal(account2)
    })

    it('Does not allow anyone else to wrap a name even if the owner has authorised the wrapper with the ENS registry.', async () => {
      const labelHash = labelhash('abc')

      // setup .abc with account2 as owner
      await EnsRegistry.setSubnodeOwner(ROOT_NODE, labelHash, account2)
      await EnsRegistry2.setApprovalForAll(NFTFuseWrapper.address, true)

      //confirm abc is owner by account2 not account 1
      expect(await EnsRegistry.owner(namehash('abc'))).to.equal(account2)
      // wrap using account
      await expect(
        NFTFuseWrapper.wrap(ROOT_NODE, 'abc', account2, 0)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Domain is not owned by the sender'
      )
    })

    it('Does not allow wrapping .eth 2LDs.', async () => {
      const label = 'wrapped'
      const labelHash = labelhash(label)
      await BaseRegistrar.register(labelHash, account, 84600)
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)
      await expect(
        NFTFuseWrapper.wrap(namehash('eth'), 'blah', account2, 0)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: .eth domains need to use wrapETH2LD()'
      )
    })

    it('Fuses cannot be burned if CANNOT_REPLACE_SUBDOMAIN has not burned', async () => {
      const fuses = [
        NFTFuseWrapper.CANNOT_UNWRAP(),
        NFTFuseWrapper.CANNOT_REPLACE_SUBDOMAIN(),
      ]

      const [CANNOT_UNWRAP, CANNOT_REPLACE_SUBDOMAIN] = await Promise.all(fuses)

      // register sub.xyz before we wrap xyz
      await EnsRegistry.setSubnodeOwner(
        namehash('xyz'),
        labelhash('sub'),
        account
      )

      await EnsRegistry.setApprovalForAll(NFTFuseWrapper.address, true)
      await NFTFuseWrapper.wrap(ROOT_NODE, 'xyz', account, CANNOT_UNWRAP)

      //attempt to burn fuse
      expect(
        NFTFuseWrapper.wrap(
          namehash('xyz'),
          'sub',
          account,
          CANNOT_REPLACE_SUBDOMAIN
        )
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Cannot burn fuses: parent name can replace subdomain'
      )
    })

    it('Only allows fuses to be burned if CANNOT_UNWRAP is burned.', async () => {
      const fuses = [
        NFTFuseWrapper.CANNOT_UNWRAP(),
        NFTFuseWrapper.CANNOT_REPLACE_SUBDOMAIN(),
      ]

      const [CANNOT_UNWRAP, CANNOT_REPLACE_SUBDOMAIN] = await Promise.all(fuses)

      // register sub.xyz before we wrap xyz
      await EnsRegistry.setSubnodeOwner(
        namehash('xyz'),
        labelhash('sub'),
        account
      )

      await EnsRegistry.setApprovalForAll(NFTFuseWrapper.address, true)

      //attempt to burn fuse
      expect(
        NFTFuseWrapper.wrap(ROOT_NODE, 'xyz', account, CANNOT_REPLACE_SUBDOMAIN)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Cannot burn fuses: domain can be unwrapped'
      )
    })
  })

  describe('unwrap()', () => {
    it('Allows owner to unwrap name', async () => {
      const fuses = await NFTFuseWrapper.MINIMUM_PARENT_FUSES()

      await EnsRegistry.setApprovalForAll(NFTFuseWrapper.address, true)
      await NFTFuseWrapper.wrap(ROOT_NODE, 'xyz', account, fuses)
      await NFTFuseWrapper.setSubnodeOwner(
        namehash('xyz'),
        labelhash('unwrapped'),
        account
      )
      await NFTFuseWrapper.wrap(namehash('xyz'), 'unwrapped', account, 0)
      const ownerOfWrappedXYZ = await NFTFuseWrapper.ownerOf(
        namehash('unwrapped.xyz')
      )
      expect(ownerOfWrappedXYZ).to.equal(account)
      await NFTFuseWrapper.unwrap(
        namehash('xyz'),
        labelhash('unwrapped'),
        account
      )

      //Transfers ownership in the ENS registry to the target address.
      expect(await EnsRegistry.owner(namehash('unwrapped.xyz'))).to.equal(
        account
      )
    })

    it('emits Unwrap event', async () => {
      await EnsRegistry.setApprovalForAll(NFTFuseWrapper.address, true)
      await NFTFuseWrapper.wrap(ROOT_NODE, 'xyz', account, 0)
      const tx = await NFTFuseWrapper.unwrap(
        ROOT_NODE,
        labelhash('xyz'),
        account
      )

      await expect(tx)
        .to.emit(NFTFuseWrapper, 'Unwrap')
        .withArgs(ROOT_NODE, labelhash('xyz'), account)
    })

    it('emits TransferSingle event', async () => {
      await EnsRegistry.setApprovalForAll(NFTFuseWrapper.address, true)
      await NFTFuseWrapper.wrap(ROOT_NODE, 'xyz', account, 0)
      const tx = await NFTFuseWrapper.unwrap(
        ROOT_NODE,
        labelhash('xyz'),
        account
      )

      await expect(tx)
        .to.emit(NFTFuseWrapper, 'TransferSingle')
        .withArgs(account, account, EMPTY_ADDRESS, namehash('xyz'), 1)
    })

    it('Allows an account authorised by the owner on the NFT Wrapper to unwrap a name', async () => {
      const labelHash = labelhash('abc')

      // setup .abc with account2 as owner
      await EnsRegistry.setSubnodeOwner(ROOT_NODE, labelHash, account)

      await EnsRegistry.setApprovalForAll(NFTFuseWrapper.address, true)

      // wrap using account
      await NFTFuseWrapper.wrap(ROOT_NODE, 'abc', account, 0)
      await NFTFuseWrapper.setApprovalForAll(account2, true)
      const ownerOfWrapperAbc = await NFTFuseWrapper.ownerOf(namehash('abc'))
      expect(ownerOfWrapperAbc).to.equal(account)

      //unwrap using account
      await NFTFuseWrapper2.unwrap(ROOT_NODE, labelhash('abc'), account2)
      expect(await EnsRegistry.owner(namehash('abc'))).to.equal(account2)
      expect(await NFTFuseWrapper.ownerOf(namehash('abc'))).to.equal(
        EMPTY_ADDRESS
      )
    })

    it('Does not allow an account authorised by the owner on the ENS registry to unwrap a name', async () => {
      const labelHash = labelhash('abc')

      // setup .abc with account2 as owner
      await EnsRegistry.setSubnodeOwner(ROOT_NODE, labelHash, account2)
      // allow account to deal with all account2's names
      await EnsRegistry2.setApprovalForAll(account, true)
      await EnsRegistry2.setApprovalForAll(NFTFuseWrapper.address, true)

      //confirm abc is owner by account2 not account 1
      expect(await EnsRegistry.owner(namehash('abc'))).to.equal(account2)
      // wrap using account
      await NFTFuseWrapper.wrap(ROOT_NODE, 'abc', account2, 0)
      const ownerOfWrapperAbc = await NFTFuseWrapper.ownerOf(namehash('abc'))
      expect(ownerOfWrapperAbc).to.equal(account2)

      //unwrap using account
      expect(NFTFuseWrapper.unwrap(ROOT_NODE, labelHash, account2)).to.be
        .reverted
    })

    it('unwrap() - Does not allow anyone else to unwrap a name', async () => {
      const labelHash = labelhash('abc')

      await EnsRegistry.setSubnodeOwner(ROOT_NODE, labelHash, account)
      await EnsRegistry.setApprovalForAll(NFTFuseWrapper.address, true)
      await NFTFuseWrapper.wrap(ROOT_NODE, 'abc', account, 0)
      const ownerOfWrapperAbc = await NFTFuseWrapper.ownerOf(namehash('abc'))
      expect(ownerOfWrapperAbc).to.equal(account)
      //unwrap using account
      expect(NFTFuseWrapper2.unwrap(ROOT_NODE, labelHash, account2)).to.be
        .reverted
    })

    it('Will not unwrap .eth 2LDs.', async () => {
      const label = 'unwrapped'
      const labelHash = labelhash(label)

      await BaseRegistrar.register(labelHash, account, 84600)

      //allow the restricted name wrappper to transfer the name to itself and reclaim it
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

      await NFTFuseWrapper.wrapETH2LD(label, account, 0)
      const ownerOfWrappedETH = await NFTFuseWrapper.ownerOf(
        namehash('unwrapped.eth')
      )
      expect(ownerOfWrappedETH).to.equal(account)
      await expect(
        NFTFuseWrapper.unwrap(namehash('eth'), labelhash('unwrapped'), account)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: .eth names must be unwrapped with unwrapETH2LD()'
      )
    })

    it('Will not allow a target address of 0x0 or the wrapper contract address.', async () => {
      const labelHash = labelhash('abc')

      await EnsRegistry.setSubnodeOwner(ROOT_NODE, labelHash, account)
      await EnsRegistry.setApprovalForAll(NFTFuseWrapper.address, true)
      await NFTFuseWrapper.wrap(ROOT_NODE, 'abc', account, 0)
      await expect(
        NFTFuseWrapper.unwrap(ROOT_NODE, labelHash, EMPTY_ADDRESS)
      ).to.be.revertedWith('revert NFTFuseWrapper: Target owner cannot be 0x0')

      await expect(
        NFTFuseWrapper.unwrap(ROOT_NODE, labelHash, NFTFuseWrapper.address)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Target owner cannot be the NFTFuseWrapper contract'
      )
    })
  })

  describe('wrapETH2LD()', () => {
    const label = 'wrapped2'
    const labelHash = labelhash(label)
    const nameHash = namehash(label + '.eth')
    it('wraps a name if sender is owner', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)

      //allow the restricted name wrappper to transfer the name to itself and reclaim it
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

      expect(await NFTFuseWrapper.ownerOf(nameHash)).to.equal(EMPTY_ADDRESS)

      await NFTFuseWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)

      //make sure reclaim claimed ownership for the wrapper in registry

      expect(await EnsRegistry.owner(nameHash)).to.equal(NFTFuseWrapper.address)

      //make sure owner in the wrapper is the user

      expect(await NFTFuseWrapper.ownerOf(nameHash)).to.equal(account)

      // make sure registrar ERC721 is owned by Wrapper

      expect(await BaseRegistrar.ownerOf(labelHash)).to.equal(
        NFTFuseWrapper.address
      )
    })

    it('Cannot wrap a name if the owner has not authorised the wrapper with the .eth registrar.', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      expect(NFTFuseWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)).to.be
        .reverted
    })

    it('Can wrap a name that has already expired', async () => {
      const DAY = 60 * 60 * 24
      const GRACE_PERIOD = 90
      await BaseRegistrar.register(labelHash, account, DAY)
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)
      await NFTFuseWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)
      await increaseTime(DAY * GRACE_PERIOD + DAY + 1)
      await mine()

      expect(await BaseRegistrar.available(labelHash)).to.equal(true)

      await BaseRegistrar2.register(labelHash, account2, DAY)
      expect(await BaseRegistrar.ownerOf(labelHash)).to.equal(account2)
      await BaseRegistrar2.setApprovalForAll(NFTFuseWrapper.address, true)
      await NFTFuseWrapper2.wrapETH2LD(label, account2, CAN_DO_EVERYTHING)

      expect(await NFTFuseWrapper2.ownerOf(nameHash)).to.equal(account2)
      expect(await BaseRegistrar.ownerOf(labelHash)).to.equal(
        NFTFuseWrapper.address
      )
    })

    it('emits WrapETH2LD event', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)
      const tx = await NFTFuseWrapper.wrapETH2LD(
        label,
        account,
        CAN_DO_EVERYTHING
      )
      await expect(tx)
        .to.emit(NFTFuseWrapper, 'WrapETH2LD')
        .withArgs(labelHash, account, CAN_DO_EVERYTHING)
    })

    it('emits TransferSingle event', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)
      const tx = await NFTFuseWrapper.wrapETH2LD(
        label,
        account,
        CAN_DO_EVERYTHING
      )
      await expect(tx)
        .to.emit(NFTFuseWrapper, 'TransferSingle')
        .withArgs(account, EMPTY_ADDRESS, account, nameHash, 1)
    })

    it('Transfers the wrapped token to the target address.', async () => {
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)
      await BaseRegistrar.register(labelHash, account, 84600)
      await NFTFuseWrapper.wrapETH2LD(label, account2, CAN_DO_EVERYTHING)
      expect(await NFTFuseWrapper.ownerOf(nameHash)).to.equal(account2)
    })

    it('Does not allow wrapping with a target address of 0x0', async () => {
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)
      await BaseRegistrar.register(labelHash, account, 84600)
      await expect(
        NFTFuseWrapper.wrapETH2LD(label, EMPTY_ADDRESS, CAN_DO_EVERYTHING)
      ).to.be.revertedWith('revert ERC1155: mint to the zero address')
    })

    it('Does not allow wrapping with a target address of the wrapper contract address.', async () => {
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)
      await BaseRegistrar.register(labelHash, account, 84600)

      await expect(
        NFTFuseWrapper.wrapETH2LD(
          label,
          NFTFuseWrapper.address,
          CAN_DO_EVERYTHING
        )
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: newOwner cannot be the NFTFuseWrapper contract'
      )
    })

    it('Allows an account approved by the owner on the .eth registrar to wrap a name.', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)
      await BaseRegistrar.setApprovalForAll(account2, true)

      await NFTFuseWrapper2.wrapETH2LD(label, account, 0)

      expect(await NFTFuseWrapper.ownerOf(nameHash)).to.equal(account)
    })

    it('Does not allow anyone else to wrap a name even if the owner has authorised the wrapper with the ENS registry.', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)

      await EnsRegistry.setApprovalForAll(NFTFuseWrapper.address, true)
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

      await expect(NFTFuseWrapper2.wrapETH2LD(label, account, 0)).to.be.reverted
    })

    it('Can wrap a name even if the controller address is different to the registrant address.', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await EnsRegistry.setOwner(nameHash, account2)
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

      await NFTFuseWrapper.wrapETH2LD(label, account, 0)

      expect(await NFTFuseWrapper.ownerOf(nameHash)).to.equal(account)
    })

    it('Does not allow the controller of a name to wrap it if they are not also the registrant.', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await EnsRegistry.setOwner(nameHash, account2)
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

      await expect(NFTFuseWrapper2.wrapETH2LD(label, account2, 0)).to.be
        .reverted
    })

    it('Does not allows fuse to be burned if CANNOT_UNWRAP has not been burned.', async () => {
      const CANNOT_SET_RESOLVER = await NFTFuseWrapper.CANNOT_SET_RESOLVER()
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)
      await BaseRegistrar.register(labelHash, account, 84600)
      await expect(
        NFTFuseWrapper.wrapETH2LD(label, account, CANNOT_SET_RESOLVER)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Cannot burn fuses: domain can be unwrapped'
      )
    })

    it('Allows fuse to be burned if CANNOT_UNWRAP has been burned.', async () => {
      const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()
      const CANNOT_SET_RESOLVER = await NFTFuseWrapper.CANNOT_SET_RESOLVER()
      const initialFuses = CANNOT_UNWRAP | CANNOT_SET_RESOLVER
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)
      await BaseRegistrar.register(labelHash, account, 84600)
      await NFTFuseWrapper.wrapETH2LD(label, account, initialFuses)
      expect(await NFTFuseWrapper.getFuses(nameHash)).to.equal(initialFuses)
    })
  })

  describe('unwrapETH2LD()', () => {
    const label = 'unwrapped'
    const labelHash = labelhash(label)
    const nameHash = namehash(label + '.eth')
    it('Allows the owner to unwrap a name.', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)

      //allow the restricted name wrappper to transfer the name to itself and reclaim it
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

      await NFTFuseWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)
      expect(await NFTFuseWrapper.ownerOf(namehash('unwrapped.eth'))).to.equal(
        account
      )
      await NFTFuseWrapper.unwrapETH2LD(labelHash, account, account)
      // transfers the controller on the .eth registrar to the target address.
      expect(await EnsRegistry.owner(namehash('unwrapped.eth'))).to.equal(
        account
      )
      //Transfers the registrant on the .eth registrar to the target address
      expect(await BaseRegistrar.ownerOf(labelHash)).to.equal(account)
    })

    it('emits Unwrap event', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)
      await NFTFuseWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)
      const tx = await NFTFuseWrapper.unwrapETH2LD(labelHash, account, account)
      await expect(tx)
        .to.emit(NFTFuseWrapper, 'UnwrapETH2LD')
        .withArgs(labelHash, account, account)
    })

    it('emits TransferSingle event', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)
      await NFTFuseWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)
      const tx = await NFTFuseWrapper.unwrapETH2LD(labelHash, account, account)
      await expect(tx)
        .to.emit(NFTFuseWrapper, 'TransferSingle')
        .withArgs(account, account, EMPTY_ADDRESS, nameHash, 1)
    })
    it('Does not allows an account authorised by the owner on the ENS registrar to unwrap a name', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)
      await BaseRegistrar.setApprovalForAll(account2, true)
      await NFTFuseWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)
      await expect(
        NFTFuseWrapper2.unwrapETH2LD(labelHash, account2, account2)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: msg.sender is not the owner or approved'
      )
    })

    it('Does not allow anyone else to unwrap a name even if the owner has authorised the wrapper with the ENS registry.', async () => {
      await BaseRegistrar.register(labelHash, account, 84600)
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)
      await EnsRegistry.setApprovalForAll(account2, true)
      await NFTFuseWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)
      await expect(
        NFTFuseWrapper2.unwrapETH2LD(labelHash, account2, account2)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: msg.sender is not the owner or approved'
      )
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

      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)
      await NFTFuseWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)

      const owner = await NFTFuseWrapper.ownerOf(wrappedTokenId)

      expect(owner).to.equal(account)
    })
  })

  describe('onERC721Received', () => {
    const tokenId = labelhash('send2contract')
    const wrappedTokenId = namehash('send2contract.eth')
    it('Wraps a name transferred to it and sets the owner to the from address', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar['safeTransferFrom(address,address,uint256)'](
        account,
        NFTFuseWrapper.address,
        tokenId
      )

      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      expect(await BaseRegistrar.ownerOf(tokenId)).to.equal(
        NFTFuseWrapper.address
      )
    })

    it('Reverts if called by anything other than the ENS registrar address', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await expect(
        NFTFuseWrapper.onERC721Received(account, account, tokenId, '0x')
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Wrapper only supports .eth ERC721 token transfers'
      )
    })

    it('Accepts fuse values from the data field', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar['safeTransferFrom(address,address,uint256,bytes)'](
        account,
        NFTFuseWrapper.address,
        tokenId,
        '0x000000000000000000000001'
      )

      expect(await NFTFuseWrapper.getFuses(wrappedTokenId)).to.equal(1)
      expect(await NFTFuseWrapper.canUnwrap(wrappedTokenId)).to.equal(false)
    })

    it('Accepts a zero-length data field for no fuses', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar['safeTransferFrom(address,address,uint256,bytes)'](
        account,
        NFTFuseWrapper.address,
        tokenId,
        '0x'
      )

      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      expect(await BaseRegistrar.ownerOf(tokenId)).to.equal(
        NFTFuseWrapper.address
      )
    })
    it('Rejects transfers where the data field is not 0 or 96 bits.', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await expect(
        BaseRegistrar['safeTransferFrom(address,address,uint256,bytes)'](
          account,
          NFTFuseWrapper.address,
          tokenId,
          '0x000000' // This should revert as this is not the correct format for fuses
        )
      ).to.be.revertedWith('NFTFuseWrapper: Data is not of length 0 or 12')
    })

    it('Reverts if CANNOT_UNWRAP is not burned and attempts to burn other fuses', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)
      await EnsRegistry.setOwner(wrappedTokenId, account2)

      await expect(
        BaseRegistrar['safeTransferFrom(address,address,uint256,bytes)'](
          account,
          NFTFuseWrapper.address,
          tokenId,
          '0x000000000000000000000002'
        )
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Cannot burn fuses: domain can be unwrapped'
      )
    })

    it('Allows burning other fuses if CAN_UNWRAP has been burnt', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)
      await EnsRegistry.setOwner(wrappedTokenId, account2)

      await BaseRegistrar['safeTransferFrom(address,address,uint256,bytes)'](
        account,
        NFTFuseWrapper.address,
        tokenId,
        '0x000000000000000000000005' // CANNOT_UNWRAP | CANNOT_TRANSFER
      )

      expect(await EnsRegistry.owner(wrappedTokenId)).to.equal(
        NFTFuseWrapper.address
      )
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      expect(await NFTFuseWrapper.getFuses(wrappedTokenId)).to.equal(5)
      expect(await NFTFuseWrapper.canUnwrap(wrappedTokenId)).to.equal(false)
    })

    it('Sets the controller in the ENS registry to the wrapper contract', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar['safeTransferFrom(address,address,uint256,bytes)'](
        account,
        NFTFuseWrapper.address,
        tokenId,
        '0x'
      )

      expect(await EnsRegistry.owner(wrappedTokenId)).to.equal(
        NFTFuseWrapper.address
      )
    })
    it('Can wrap a name even if the controller address is different to the registrant address', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)
      await EnsRegistry.setOwner(wrappedTokenId, account2)

      await BaseRegistrar['safeTransferFrom(address,address,uint256,bytes)'](
        account,
        NFTFuseWrapper.address,
        tokenId,
        '0x'
      )

      expect(await EnsRegistry.owner(wrappedTokenId)).to.equal(
        NFTFuseWrapper.address
      )
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
    })

    it('emits Wrapped Event', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)
      const tx = await BaseRegistrar[
        'safeTransferFrom(address,address,uint256,bytes)'
      ](account, NFTFuseWrapper.address, tokenId, '0x')

      await expect(tx)
        .to.emit(NFTFuseWrapper, 'WrapETH2LD')
        .withArgs(tokenId, account, CAN_DO_EVERYTHING)
    })

    it('emits TransferSingle Event', async () => {
      await BaseRegistrar.register(tokenId, account, 84600)
      const tx = await BaseRegistrar[
        'safeTransferFrom(address,address,uint256,bytes)'
      ](account, NFTFuseWrapper.address, tokenId, '0x')

      await expect(tx)
        .to.emit(NFTFuseWrapper, 'TransferSingle')
        .withArgs(
          BaseRegistrar.address,
          EMPTY_ADDRESS,
          account,
          wrappedTokenId,
          1
        )
    })
  })

  describe('burnFuses()', () => {
    const label = 'fuses'
    const tokenId = labelhash('fuses')
    const wrappedTokenId = namehash('fuses.eth')
    it('Will not allow burning fuses unless the parent domain has CANNOT_REPLACE_SUBDOMAIN burned.', async () => {
      const CAN_DO_EVERYTHING = 0
      const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()

      await EnsRegistry.setSubnodeOwner(ROOT_NODE, labelhash('abc'), account)

      await EnsRegistry.setSubnodeOwner(
        namehash('abc'),
        labelhash('sub'),
        account
      )

      await EnsRegistry.setApprovalForAll(NFTFuseWrapper.address, true)
      await NFTFuseWrapper.wrap(ROOT_NODE, 'abc', account, CAN_DO_EVERYTHING)

      await NFTFuseWrapper.wrap(namehash('abc'), 'sub', account, 0)

      await expect(
        NFTFuseWrapper.burnFuses(
          namehash('abc'),
          labelhash('sub'),
          CAN_DO_EVERYTHING | (await NFTFuseWrapper.CANNOT_TRANSFER())
        )
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Parent has not burned CAN_REPLACE_SUBDOMAIN fuse'
      )
    })
    it('Will not allow burning fuses unless CANNOT_UNWRAP is also burned.', async () => {
      const CAN_DO_EVERYTHING = 0
      const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()

      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

      await NFTFuseWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)

      await expect(
        NFTFuseWrapper.burnFuses(
          namehash('eth'),
          tokenId,
          CAN_DO_EVERYTHING | (await NFTFuseWrapper.CANNOT_TRANSFER())
        )
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Domain has not burned unwrap fuse'
      )
    })

    it('Can be called by the owner.', async () => {
      const CAN_DO_EVERYTHING = 0
      const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()

      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

      await NFTFuseWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)

      await NFTFuseWrapper.burnFuses(namehash('eth'), tokenId, CANNOT_UNWRAP)

      expect(await NFTFuseWrapper.getFuses(wrappedTokenId)).to.equal(
        CANNOT_UNWRAP
      )
    })

    //  (Do we want more granular permissions - ability to create subdomains etc, but not burn fuses?).
    it('Can be called by an account authorised by the owner', async () => {
      const CAN_DO_EVERYTHING = NFTFuseWrapper.CAN_DO_EVERYTHING()
      const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()

      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

      await NFTFuseWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)

      await NFTFuseWrapper.setApprovalForAll(account2, true)

      await NFTFuseWrapper2.burnFuses(
        namehash('eth'),
        tokenId,
        CAN_DO_EVERYTHING | CANNOT_UNWRAP
      )

      expect(await NFTFuseWrapper.getFuses(wrappedTokenId)).to.equal(1)
    })
    it('Cannot be called by an unauthorised account', async () => {
      const CAN_DO_EVERYTHING = NFTFuseWrapper.CAN_DO_EVERYTHING()
      const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()

      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

      await NFTFuseWrapper.wrapETH2LD(label, account, CAN_DO_EVERYTHING)

      await expect(
        NFTFuseWrapper2.burnFuses(
          namehash('eth'),
          tokenId,
          CAN_DO_EVERYTHING | CANNOT_UNWRAP
        )
      ).to.be.reverted
    })

    it('Allows burning unknown fuses', async () => {
      const CAN_DO_EVERYTHING = 0
      const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()

      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

      await NFTFuseWrapper.wrapETH2LD(
        label,
        account,
        CAN_DO_EVERYTHING | CANNOT_UNWRAP
      )

      // Each fuse is represented by the next bit, 64 is the next undefined fuse

      await NFTFuseWrapper.burnFuses(namehash('eth'), tokenId, 64)

      expect(await NFTFuseWrapper.getFuses(wrappedTokenId)).to.equal(
        CANNOT_UNWRAP | 64
      )
    })

    it('Logically ORs passed in fuses with already-burned fuses.', async () => {
      const CAN_DO_EVERYTHING = 0
      const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()
      const CANNOT_REPLACE_SUBDOMAIN = await NFTFuseWrapper.CANNOT_REPLACE_SUBDOMAIN()

      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

      await NFTFuseWrapper.wrapETH2LD(
        label,
        account,
        CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN
      )

      await NFTFuseWrapper.burnFuses(namehash('eth'), tokenId, 64)

      expect(await NFTFuseWrapper.getFuses(wrappedTokenId)).to.equal(
        CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN | 64
      )
    })

    it('can set fuses and then burn ability to burn fuses', async () => {
      const label = 'burnabilitytoburn'
      const tokenId = labelhash(label)
      const wrappedTokenId = namehash(label + '.eth')
      const CAN_DO_EVERYTHING = 0
      const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()

      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

      await NFTFuseWrapper.wrapETH2LD(label, account, CANNOT_UNWRAP)

      await NFTFuseWrapper.burnFuses(
        namehash('eth'),
        tokenId,
        await NFTFuseWrapper.CANNOT_BURN_FUSES()
      )

      const ownerInWrapper = await NFTFuseWrapper.ownerOf(wrappedTokenId)

      expect(ownerInWrapper).to.equal(account)

      // check flag in the wrapper

      expect(await NFTFuseWrapper.canBurnFuses(wrappedTokenId)).to.equal(false)

      const CANNOT_REPLACE_SUBDOMAIN = await NFTFuseWrapper.CANNOT_REPLACE_SUBDOMAIN()

      //try to set the resolver and ttl
      expect(
        NFTFuseWrapper.burnFuses(
          namehash('eth'),
          tokenId,
          CANNOT_REPLACE_SUBDOMAIN
        )
      ).to.be.reverted
    })

    it('can set fuses and burn transfer', async () => {
      const [signer2] = await ethers.getSigners()
      const account2 = await signer2.getAddress()
      const label = 'fuses3'
      const tokenId = labelhash('fuses3')
      const wrappedTokenId = namehash('fuses3.eth')
      const CAN_DO_EVERYTHING = 0
      const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()

      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

      await NFTFuseWrapper.wrapETH2LD(label, account, CANNOT_UNWRAP)

      await NFTFuseWrapper.burnFuses(
        namehash('eth'),
        tokenId,
        await NFTFuseWrapper.CANNOT_TRANSFER()
      )

      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)

      // check flag in the wrapper

      expect(await NFTFuseWrapper.canTransfer(wrappedTokenId)).to.equal(false)

      //try to set the resolver and ttl
      expect(
        NFTFuseWrapper.safeTransferFrom(
          account,
          account2,
          wrappedTokenId,
          1,
          '0x'
        )
      ).to.be.reverted
    })

    it('can set fuses and burn canSetResolver and canSetTTL', async () => {
      const label = 'fuses1'
      const tokenId = labelhash(label)
      const wrappedTokenId = namehash(label + '.eth')
      const CAN_DO_EVERYTHING = 0
      const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()

      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

      await NFTFuseWrapper.wrapETH2LD(label, account, CANNOT_UNWRAP)

      await NFTFuseWrapper.burnFuses(
        namehash('eth'),
        tokenId,
        CANNOT_SET_RESOLVER | CANNOT_SET_TTL
      )

      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)

      // check flag in the wrapper
      expect(await NFTFuseWrapper.canSetResolver(wrappedTokenId)).to.equal(
        false
      )
      expect(await NFTFuseWrapper.canSetTTL(wrappedTokenId)).to.equal(false)

      //try to set the resolver and ttl
      expect(NFTFuseWrapper.setResolver(wrappedTokenId, account)).to.be.reverted

      expect(NFTFuseWrapper.setTTL(wrappedTokenId, 1000)).to.be.reverted
    })

    it('can set fuses and burn canCreateSubdomains', async () => {
      const label = 'fuses2'
      const tokenId = labelhash(label)
      const wrappedTokenId = namehash(label + '.eth')

      await BaseRegistrar.register(tokenId, account, 84600)

      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

      await NFTFuseWrapper.wrapETH2LD(label, account, CANNOT_UNWRAP)

      const canCreateSubdomain1 = await NFTFuseWrapper.canCreateSubdomain(
        wrappedTokenId
      )

      expect(canCreateSubdomain1).to.equal(true)

      // can create before burn

      //revert not approved and isn't sender because subdomain isnt owned by contract?
      await NFTFuseWrapper.setSubnodeOwnerAndWrap(
        wrappedTokenId,
        'creatable',
        account,
        CAN_DO_EVERYTHING
      )

      expect(
        await EnsRegistry.owner(namehash('creatable.fuses2.eth'))
      ).to.equal(NFTFuseWrapper.address)

      expect(
        await NFTFuseWrapper.ownerOf(namehash('creatable.fuses2.eth'))
      ).to.equal(account)

      await NFTFuseWrapper.burnFuses(
        namehash('eth'),
        tokenId,
        CAN_DO_EVERYTHING | CANNOT_CREATE_SUBDOMAIN
      )

      const ownerInWrapper = await NFTFuseWrapper.ownerOf(wrappedTokenId)

      expect(ownerInWrapper).to.equal(account)

      const canCreateSubdomain = await NFTFuseWrapper.canCreateSubdomain(
        wrappedTokenId
      )

      expect(canCreateSubdomain).to.equal(false)

      //try to create a subdomain

      expect(
        NFTFuseWrapper.setSubnodeOwner(
          namehash('fuses2.eth'),
          labelhash('uncreateable'),
          account
        )
      ).to.be.reverted

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
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await EnsRegistry.setApprovalForAll(NFTFuseWrapper.address, true)
      await NFTFuseWrapper.setSubnodeOwnerAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account,
        CAN_DO_EVERYTHING
      )

      expect(
        await EnsRegistry.owner(namehash(`setsubnodeownerandwrap.${label}.eth`))
      ).to.equal(NFTFuseWrapper.address)

      expect(
        await NFTFuseWrapper.ownerOf(
          namehash(`setsubnodeownerandwrap.${label}.eth`)
        )
      ).to.equal(account)
    })
    it('Can be called by an account authorised by the owner.', async () => {
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NFTFuseWrapper.setApprovalForAll(account2, true)
      await NFTFuseWrapper2.setSubnodeOwnerAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account,
        0
      )

      expect(
        await EnsRegistry.owner(namehash(`setsubnodeownerandwrap.${label}.eth`))
      ).to.equal(NFTFuseWrapper.address)

      expect(
        await NFTFuseWrapper.ownerOf(
          namehash(`setsubnodeownerandwrap.${label}.eth`)
        )
      ).to.equal(account)
    })
    it('Transfers the wrapped token to the target address.', async () => {
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NFTFuseWrapper.setSubnodeOwnerAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account2,
        CAN_DO_EVERYTHING
      )

      expect(
        await EnsRegistry.owner(namehash(`setsubnodeownerandwrap.${label}.eth`))
      ).to.equal(NFTFuseWrapper.address)

      expect(
        await NFTFuseWrapper.ownerOf(
          namehash(`setsubnodeownerandwrap.${label}.eth`)
        )
      ).to.equal(account2)
    })
    it('Will not allow wrapping with a target address of 0x0.', async () => {
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await expect(
        NFTFuseWrapper.setSubnodeOwnerAndWrap(
          wrappedTokenId,
          'setsubnodeownerandwrap',
          EMPTY_ADDRESS,
          CAN_DO_EVERYTHING
        )
      ).to.be.revertedWith('revert ERC1155: mint to the zero address')
    })
    it('Will not allow wrapping with a target address of the wrapper contract address', async () => {
      await expect(
        NFTFuseWrapper.setSubnodeOwnerAndWrap(
          wrappedTokenId,
          'setsubnodeownerandwrap',
          NFTFuseWrapper.address,
          CAN_DO_EVERYTHING
        )
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: newOwner cannot be the NFTFuseWrapper contract'
      )
    })
    it('Does not allow anyone else to wrap a name even if the owner has authorised the wrapper with the ENS registry.', async () => {
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await EnsRegistry.setApprovalForAll(account2, true)
      await expect(
        NFTFuseWrapper2.setSubnodeOwnerAndWrap(
          wrappedTokenId,
          'setsubnodeownerandwrap',
          account,
          CAN_DO_EVERYTHING
        )
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: msg.sender is not the owner or approved'
      )
    })
    it('Does not allow fuses to be burned if the parent name does not have CANNOT_REPLACE_SUBDOMAIN burned', async () => {
      const label = 'subdomain2'
      const tokenId = labelhash(label)
      const wrappedTokenId = namehash(label + '.eth')
      await registerSetupAndWrapName(label, account, CAN_DO_EVERYTHING)
      await expect(
        NFTFuseWrapper.setSubnodeOwnerAndWrap(
          wrappedTokenId,
          'setsubnodeownerandwrap',
          account,
          CANNOT_UNWRAP
        )
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Cannot burn fuses: parent name can replace subdomain'
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
        NFTFuseWrapper.setSubnodeOwnerAndWrap(
          wrappedTokenId,
          'setsubnodeownerandwrap',
          account,
          CANNOT_REPLACE_SUBDOMAIN
        )
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Cannot burn fuses: domain can be unwrapped'
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
      await NFTFuseWrapper.setSubnodeOwnerAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account,
        CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN
      )

      expect(
        await NFTFuseWrapper.canReplaceSubdomain(
          namehash(`setsubnodeownerandwrap.${label}.eth`)
        )
      ).to.equal(false)
    })
    it('Emits Wrap event', async () => {
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      const tx = await NFTFuseWrapper.setSubnodeOwnerAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account2,
        0
      )
      await expect(tx)
        .to.emit(NFTFuseWrapper, 'Wrap')
        .withArgs(wrappedTokenId, 'setsubnodeownerandwrap', account2, 0)
    })

    it('Emits TransferSingle event', async () => {
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      const tx = await NFTFuseWrapper.setSubnodeOwnerAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account2,
        0
      )
      await expect(tx)
        .to.emit(NFTFuseWrapper, 'TransferSingle')
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
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NFTFuseWrapper.setSubnodeRecordAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account,
        resolver,
        0,
        0
      )

      expect(
        await EnsRegistry.owner(namehash(`setsubnodeownerandwrap.${label}.eth`))
      ).to.equal(NFTFuseWrapper.address)

      expect(
        await NFTFuseWrapper.ownerOf(
          namehash(`setsubnodeownerandwrap.${label}.eth`)
        )
      ).to.equal(account)
    })

    it('Can be called by an account authorised by the owner.', async () => {
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NFTFuseWrapper.setApprovalForAll(account2, true)
      await NFTFuseWrapper2.setSubnodeRecordAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account,
        resolver,
        0,
        0
      )

      expect(
        await EnsRegistry.owner(namehash(`setsubnodeownerandwrap.${label}.eth`))
      ).to.equal(NFTFuseWrapper.address)

      expect(
        await NFTFuseWrapper.ownerOf(
          namehash(`setsubnodeownerandwrap.${label}.eth`)
        )
      ).to.equal(account)
    })

    it('Transfers the wrapped token to the target address.', async () => {
      await NFTFuseWrapper.setSubnodeRecordAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account2,
        resolver,
        0,
        0
      )

      expect(
        await NFTFuseWrapper.ownerOf(
          namehash(`setsubnodeownerandwrap.${label}.eth`)
        )
      ).to.equal(account2)
    })

    it('Will not allow wrapping with a target address of 0x0', async () => {
      await expect(
        NFTFuseWrapper.setSubnodeRecordAndWrap(
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
        NFTFuseWrapper.setSubnodeRecordAndWrap(
          wrappedTokenId,
          'setsubnodeownerandwrap',
          NFTFuseWrapper.address,
          resolver,
          0,
          0
        )
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: newOwner cannot be the NFTFuseWrapper contract'
      )
    })

    it('Does not allow anyone else to wrap a name even if the owner has authorised the wrapper with the ENS registry.', async () => {
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await EnsRegistry.setApprovalForAll(account2, true)
      await expect(
        NFTFuseWrapper2.setSubnodeRecordAndWrap(
          wrappedTokenId,
          'setsubnodeownerandwrap',
          account,
          resolver,
          0,
          0
        )
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: msg.sender is not the owner or approved'
      )
    })

    it('Does not allow fuses to be burned if the parent name does not have CANNOT_REPLACE_SUBDOMAIN burned.', async () => {
      const label = 'subdomain3'
      const tokenId = labelhash(label)
      const wrappedTokenId = namehash(label + '.eth')
      await registerSetupAndWrapName(label, account, CAN_DO_EVERYTHING)
      await expect(
        NFTFuseWrapper.setSubnodeRecordAndWrap(
          wrappedTokenId,
          'setsubnodeownerandwrap',
          account,
          resolver,
          0,
          CANNOT_UNWRAP
        )
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Cannot burn fuses: parent name can replace subdomain'
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
        NFTFuseWrapper.setSubnodeRecordAndWrap(
          wrappedTokenId,
          'setsubnodeownerandwrap',
          account,
          resolver,
          0,
          CANNOT_REPLACE_SUBDOMAIN
        )
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Cannot burn fuses: domain can be unwrapped'
      )
    })

    it('Emits Wrap event', async () => {
      const tx = await NFTFuseWrapper.setSubnodeRecordAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account2,
        resolver,
        0,
        0
      )
      await expect(tx)
        .to.emit(NFTFuseWrapper, 'Wrap')
        .withArgs(wrappedTokenId, 'setsubnodeownerandwrap', account2, 0)
    })

    it('Emits TransferSingle event', async () => {
      const tx = await NFTFuseWrapper.setSubnodeRecordAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account2,
        resolver,
        0,
        0
      )
      await expect(tx)
        .to.emit(NFTFuseWrapper, 'TransferSingle')
        .withArgs(
          account,
          EMPTY_ADDRESS,
          account2,
          namehash(`setsubnodeownerandwrap.${label}.eth`),
          1
        )
    })

    it('Sets the appropriate values on the ENS registry.', async () => {
      await NFTFuseWrapper.setSubnodeRecordAndWrap(
        wrappedTokenId,
        'setsubnodeownerandwrap',
        account2,
        resolver,
        100,
        0
      )

      const node = namehash(`setsubnodeownerandwrap.${label}.eth`)

      expect(await EnsRegistry.owner(node)).to.equal(NFTFuseWrapper.address)
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
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NFTFuseWrapper.setRecord(wrappedTokenId, account2, account, 50)
    })

    it('Performs the appropriate function on the ENS registry.', async () => {
      await NFTFuseWrapper.setRecord(wrappedTokenId, account2, account, 50)

      expect(await EnsRegistry.owner(wrappedTokenId)).to.equal(account2)
      expect(await EnsRegistry.resolver(wrappedTokenId)).to.equal(account)
      expect(await EnsRegistry.ttl(wrappedTokenId)).to.equal(50)
    })

    it('Can be called by an account authorised by the owner.', async () => {
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NFTFuseWrapper.setApprovalForAll(account2, true)
      await NFTFuseWrapper2.setRecord(wrappedTokenId, account2, account, 50)
    })

    it('Cannot be called by anyone else.', async () => {
      await expect(
        NFTFuseWrapper2.setRecord(wrappedTokenId, account2, account, 50)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: msg.sender is not the owner or approved'
      )
    })

    it('Cannot be called if CANNOT_TRANSFER is burned.', async () => {
      await NFTFuseWrapper.burnFuses(
        namehash('eth'),
        labelHash,
        CANNOT_TRANSFER
      )
      await expect(
        NFTFuseWrapper.setRecord(wrappedTokenId, account2, account, 50)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Fuse is burned for transferring'
      )
    })

    it('Cannot be called if CANNOT_SET_RESOLVER is burned.', async () => {
      await NFTFuseWrapper.burnFuses(
        namehash('eth'),
        labelHash,
        CANNOT_SET_RESOLVER
      )

      await expect(
        NFTFuseWrapper.setRecord(wrappedTokenId, account2, account, 50)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Fuse is burned for setting resolver'
      )
    })

    it('Cannot be called if CANNOT_SET_RESOLVER is burned.', async () => {
      await NFTFuseWrapper.burnFuses(namehash('eth'), labelHash, CANNOT_SET_TTL)

      await expect(
        NFTFuseWrapper.setRecord(wrappedTokenId, account2, account, 50)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Fuse is burned for setting TTL'
      )
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
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NFTFuseWrapper.setSubnodeRecord(
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
      await NFTFuseWrapper.setSubnodeRecord(
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
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NFTFuseWrapper.setApprovalForAll(account2, true)
      await NFTFuseWrapper2.setSubnodeRecord(
        wrappedTokenId,
        subLabelHash,
        account2,
        account,
        50
      )
    })

    it('Cannot be called by anyone else.', async () => {
      await expect(
        NFTFuseWrapper2.setSubnodeRecord(
          wrappedTokenId,
          subLabelHash,
          account2,
          account,
          50
        )
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: msg.sender is not the owner or approved'
      )
    })

    it('Cannot be called if CREATE_SUBDOMAIN is burned and is a new subdomain', async () => {
      await NFTFuseWrapper.burnFuses(
        namehash('eth'),
        labelHash,
        CANNOT_CREATE_SUBDOMAIN
      )

      //Check the subdomain has not been created yet
      expect(await EnsRegistry.owner(subWrappedTokenId)).to.equal(EMPTY_ADDRESS)
      await expect(
        NFTFuseWrapper.setSubnodeRecord(
          wrappedTokenId,
          subLabelHash,
          account2,
          account,
          50
        )
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Fuse has been burned for creating or replacing a subdomain'
      )
    })

    it('Cannot be called if REPLACE_SUBDOMAIN is burned and is an existing subdomain', async () => {
      await NFTFuseWrapper.burnFuses(
        namehash('eth'),
        labelHash,
        CANNOT_REPLACE_SUBDOMAIN
      )

      //Check the subdomain has not been created yet
      await NFTFuseWrapper.setSubnodeRecord(
        wrappedTokenId,
        subLabelHash,
        account2,
        account,
        50
      )
      expect(await EnsRegistry.owner(subWrappedTokenId)).to.equal(account2)
      await expect(
        NFTFuseWrapper.setSubnodeRecord(
          wrappedTokenId,
          subLabelHash,
          account,
          account,
          50
        )
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Fuse has been burned for creating or replacing a subdomain'
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
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NFTFuseWrapper.setSubnodeOwner(
        wrappedTokenId,
        subLabelHash,
        account2
      )
    })

    it('Performs the appropriate function on the ENS registry.', async () => {
      expect(await EnsRegistry.owner(subWrappedTokenId)).to.equal(EMPTY_ADDRESS)
      await NFTFuseWrapper.setSubnodeOwner(
        wrappedTokenId,
        subLabelHash,
        account2
      )
      expect(await EnsRegistry.owner(subWrappedTokenId)).to.equal(account2)
    })

    it('Can be called by an account authorised by the owner.', async () => {
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NFTFuseWrapper.setApprovalForAll(account2, true)
      await NFTFuseWrapper2.setSubnodeOwner(
        wrappedTokenId,
        subLabelHash,
        account2
      )
    })

    it('Cannot be called by anyone else.', async () => {
      await expect(
        NFTFuseWrapper2.setSubnodeOwner(wrappedTokenId, subLabelHash, account2)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: msg.sender is not the owner or approved'
      )
    })

    it('Cannot be called if CREATE_SUBDOMAIN is burned and is a new subdomain', async () => {
      await NFTFuseWrapper.burnFuses(
        namehash('eth'),
        labelHash,
        CANNOT_CREATE_SUBDOMAIN
      )

      //Check the subdomain has not been created yet
      expect(await EnsRegistry.owner(subWrappedTokenId)).to.equal(EMPTY_ADDRESS)
      await expect(
        NFTFuseWrapper.setSubnodeOwner(wrappedTokenId, subLabelHash, account2)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Fuse has been burned for creating or replacing a subdomain'
      )
    })

    it('Cannot be called if REPLACE_SUBDOMAIN is burned and is an existing subdomain', async () => {
      await NFTFuseWrapper.burnFuses(
        namehash('eth'),
        labelHash,
        CANNOT_REPLACE_SUBDOMAIN
      )

      //Check the subdomain has not been created yet
      await NFTFuseWrapper.setSubnodeOwner(
        wrappedTokenId,
        subLabelHash,
        account2
      )
      expect(await EnsRegistry.owner(subWrappedTokenId)).to.equal(account2)
      await expect(
        NFTFuseWrapper.setSubnodeOwner(wrappedTokenId, subLabelHash, account)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Fuse has been burned for creating or replacing a subdomain'
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
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NFTFuseWrapper.setResolver(wrappedTokenId, account2)
    })

    it('Performs the appropriate function on the ENS registry.', async () => {
      expect(await EnsRegistry.resolver(wrappedTokenId)).to.equal(EMPTY_ADDRESS)
      await NFTFuseWrapper.setResolver(wrappedTokenId, account2)
      expect(await EnsRegistry.resolver(wrappedTokenId)).to.equal(account2)
    })

    it('Can be called by an account authorised by the owner.', async () => {
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NFTFuseWrapper.setApprovalForAll(account2, true)
      await NFTFuseWrapper2.setResolver(wrappedTokenId, account2)
    })

    it('Cannot be called by anyone else.', async () => {
      await expect(
        NFTFuseWrapper2.setResolver(wrappedTokenId, account2)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: msg.sender is not the owner or approved'
      )
    })

    it('Cannot be called if CANNOT_SET_RESOLVER is burned', async () => {
      await NFTFuseWrapper.burnFuses(
        namehash('eth'),
        labelHash,
        CANNOT_SET_RESOLVER
      )

      await expect(
        NFTFuseWrapper.setResolver(wrappedTokenId, account2)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Fuse already burned for setting resolver'
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
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NFTFuseWrapper.setTTL(wrappedTokenId, 100)
    })

    it('Performs the appropriate function on the ENS registry.', async () => {
      expect(await EnsRegistry.ttl(wrappedTokenId)).to.equal(EMPTY_ADDRESS)
      await NFTFuseWrapper.setTTL(wrappedTokenId, 100)
      expect(await EnsRegistry.ttl(wrappedTokenId)).to.equal(100)
    })

    it('Can be called by an account authorised by the owner.', async () => {
      expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)
      await NFTFuseWrapper.setApprovalForAll(account2, true)
      await NFTFuseWrapper2.setTTL(wrappedTokenId, 100)
    })

    it('Cannot be called by anyone else.', async () => {
      await expect(
        NFTFuseWrapper2.setResolver(wrappedTokenId, account2)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: msg.sender is not the owner or approved'
      )
    })

    it('Cannot be called if CANNOT_SET_TTL is burned', async () => {
      await NFTFuseWrapper.burnFuses(namehash('eth'), labelHash, CANNOT_SET_TTL)

      await expect(
        NFTFuseWrapper.setTTL(wrappedTokenId, 100)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Fuse already burned for setting TTL'
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

    it('Transfer cannot be called if CANNOT_TRANSFER is burned', async () => {
      await NFTFuseWrapper.burnFuses(
        namehash('eth'),
        labelHash,
        CANNOT_TRANSFER
      )

      await expect(
        NFTFuseWrapper.safeTransferFrom(
          account,
          account2,
          wrappedTokenId,
          1,
          '0x'
        )
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Fuse already burned for setting owner'
      )
    })
  })

  describe('ERC1155', () => {
    // ERC1155 methods
    // Incorporate OpenZeppelin test suite.
  })
})
