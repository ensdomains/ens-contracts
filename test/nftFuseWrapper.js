const fs = require('fs')
const chalk = require('chalk')
const { config, ethers } = require('hardhat')
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

describe('NFT fuse wrapper', () => {
  let ENSRegistry
  let BaseRegistrar
  let NFTFuseWrapper
  let signers
  let account
  let result

  before(async () => {
    signers = await ethers.getSigners()
    account = await signers[0].getAddress()

    const registryJSON = loadENSContract('ens', 'ENSRegistry')

    const registryContractFactory = new ethers.ContractFactory(
      registryJSON.abi,
      registryJSON.bytecode,
      signers[0]
    )

    EnsRegistry = await registryContractFactory.deploy()

    try {
      const rootOwner = await EnsRegistry.owner(ROOT_NODE)
    } catch (e) {
      console.log('failing on rootOwner', e)
    }
    console.log('succeeded on root owner')

    BaseRegistrar = await new ethers.ContractFactory(
      baseRegistrarJSON.abi,
      baseRegistrarJSON.bytecode,
      signers[0]
    ).deploy(EnsRegistry.address, namehash('eth'))

    console.log(`*** BaseRegistrar deployed at ${BaseRegistrar.address} *** `)

    await BaseRegistrar.addController(account)

    NFTFuseWrapper = await deploy('NFTFuseWrapper', [
      EnsRegistry.address,
      BaseRegistrar.address,
    ])

    // setup .eth
    await EnsRegistry.setSubnodeOwner(
      ROOT_NODE,
      utils.keccak256(utils.toUtf8Bytes('eth')),
      account
    )

    // setup .xyz
    await EnsRegistry.setSubnodeOwner(
      ROOT_NODE,
      utils.keccak256(utils.toUtf8Bytes('xyz')),
      account
    )

    // give .eth back to registrar

    // make base registrar owner of eth
    await EnsRegistry.setSubnodeOwner(
      ROOT_NODE,
      labelhash('eth'),
      BaseRegistrar.address
    )

    const ethOwner = await EnsRegistry.owner(namehash('eth'))
    const ensEthOwner = await EnsRegistry.owner(namehash('ens.eth'))

    console.log('ethOwner', ethOwner)
    console.log('ensEthOwner', ensEthOwner)

    console.log(
      'ens.setApprovalForAll NFTFuseWrapper',
      account,
      addresses['NFTFuseWrapper']
    )

    //make sure base registrar is owner of eth TLD

    const ownerOfEth = await EnsRegistry.owner(namehash('eth'))

    expect(ownerOfEth).to.equal(BaseRegistrar.address)
  })

  beforeEach(async () => {
    ;({ result } = await ethers.provider.send('evm_snapshot'))
  })
  afterEach(async () => {
    await ethers.provider.send('evm_snapshot', result)
  })

  it('wrap() wraps a name with the ERC721 standard and fuses', async () => {
    const fuses = await NFTFuseWrapper.MINIMUM_PARENT_FUSES()

    await EnsRegistry.setApprovalForAll(NFTFuseWrapper.address, true)
    await NFTFuseWrapper.wrap(ROOT_NODE, 'xyz', fuses, account)
    const ownerOfWrappedXYZ = await NFTFuseWrapper.ownerOf(namehash('xyz'))
    expect(ownerOfWrappedXYZ).to.equal(account)
  })

  it('unwrap() can unwrap a wrapped name', async () => {
    await NFTFuseWrapper.setSubnodeOwner(
      namehash('xyz'),
      labelhash('unwrapped'),
      account
    )
    await NFTFuseWrapper.wrap(namehash('xyz'), 'unwrapped', 0, account)
    const ownerOfWrappedXYZ = await NFTFuseWrapper.ownerOf(
      namehash('unwrapped.xyz')
    )
    expect(ownerOfWrappedXYZ).to.equal(account)
    await NFTFuseWrapper.unwrap(namehash('unwrapped.xyz'), account)
    const ownerInRegistry = await EnsRegistry.owner(namehash('unwrapped.xyz'))
    expect(ownerInRegistry).to.equal(account)
  })

  it('unwrapETH2LD() can unwrap a wrapped .eth name', async () => {
    const label = 'unwrapped'
    const labelHash = labelhash(label)

    await BaseRegistrar.register(labelHash, account, 84600)

    //allow the restricted name wrappper to transfer the name to itself and reclaim it
    await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

    await NFTFuseWrapper.wrapETH2LD(label, 0, account)
    const ownerOfWrappedETH = await NFTFuseWrapper.ownerOf(
      namehash('unwrapped.eth')
    )
    expect(ownerOfWrappedETH).to.equal(account)
    await NFTFuseWrapper.unwrapETH2LD(labelHash, account)
    const ownerInRegistry = await EnsRegistry.owner(namehash('unwrapped.eth'))
    expect(ownerInRegistry).to.equal(account)
    const ownerInRegistrar = await BaseRegistrar.ownerOf(labelHash)
    expect(ownerInRegistrar).to.equal(account)
  })

  it('wrapETH2LD() wraps a name with the ERC721 standard and fuses', async () => {
    const label = 'wrapped2'
    const labelHash = labelhash(label)
    const nameHash = namehash(label + '.eth')

    await BaseRegistrar.register(labelHash, account, 84600)

    //allow the restricted name wrappper to transfer the name to itself and reclaim it
    await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

    await NFTFuseWrapper.wrapETH2LD(label, 255, account)

    //make sure reclaim claimed ownership for the wrapper in registry
    const ownerInRegistry = await EnsRegistry.owner(nameHash)

    expect(ownerInRegistry).to.equal(NFTFuseWrapper.address)

    //make sure owner in the wrapper is the user
    const ownerOfWrappedEth = await NFTFuseWrapper.ownerOf(nameHash)

    expect(ownerOfWrappedEth).to.equal(account)

    // make sure registrar ERC721 is owned by Wrapper
    const ownerInRegistrar = await BaseRegistrar.ownerOf(labelHash)

    expect(ownerInRegistrar).to.equal(NFTFuseWrapper.address)

    // make sure it can't be unwrapped
    const canUnwrap = await NFTFuseWrapper.canUnwrap(nameHash)
  })

  it('ownerOf returns the owner', async () => {
    const label = 'ownerof'
    const tokenId = labelhash(label)
    const wrappedTokenId = namehash('ownerof.eth')
    const CAN_DO_EVERYTHING = 0

    await BaseRegistrar.register(tokenId, account, 84600)

    await NFTFuseWrapper.wrapETH2LD(label, CAN_DO_EVERYTHING, account)

    const owner = await NFTFuseWrapper.ownerOf(wrappedTokenId)

    expect(owner).to.equal(account)
  })

  it('can send ERC721 token to restricted wrapper', async () => {
    const tokenId = labelhash('send2contract')
    const wrappedTokenId = namehash('send2contract.eth')

    await BaseRegistrar.register(tokenId, account, 84600)

    const ownerInRegistrar = await BaseRegistrar.ownerOf(tokenId)

    await BaseRegistrar['safeTransferFrom(address,address,uint256)'](
      account,
      NFTFuseWrapper.address,
      tokenId
    )

    const ownerInWrapper = await NFTFuseWrapper.ownerOf(wrappedTokenId)

    expect(ownerInWrapper).to.equal(account)
  })

  it('can set fuses and then burn ability to burn fuses', async () => {
    const label = 'burnabilitytoburn'
    const tokenId = labelhash(label)
    const wrappedTokenId = namehash(label + '.eth')
    const CAN_DO_EVERYTHING = 0
    const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()

    await BaseRegistrar.register(tokenId, account, 84600)

    await NFTFuseWrapper.wrapETH2LD(
      label,
      CAN_DO_EVERYTHING | CANNOT_UNWRAP,
      account
    )

    const CANNOT_BURN_FUSES = await NFTFuseWrapper.CANNOT_BURN_FUSES()

    await NFTFuseWrapper.burnFuses(
      namehash('eth'),
      tokenId,
      CAN_DO_EVERYTHING | CANNOT_BURN_FUSES
    )

    const ownerInWrapper = await NFTFuseWrapper.ownerOf(wrappedTokenId)

    expect(ownerInWrapper).to.equal(account)

    // check flag in the wrapper
    const canBurnFuses = await NFTFuseWrapper.canBurnFuses(wrappedTokenId)

    expect(canBurnFuses).to.equal(false)

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

    await NFTFuseWrapper.wrapETH2LD(
      label,
      CAN_DO_EVERYTHING | CANNOT_UNWRAP,
      account
    )

    const CANNOT_TRANSFER = await NFTFuseWrapper.CANNOT_TRANSFER()

    await NFTFuseWrapper.burnFuses(
      namehash('eth'),
      tokenId,
      CAN_DO_EVERYTHING | CANNOT_TRANSFER
    )

    const ownerInWrapper = await NFTFuseWrapper.ownerOf(wrappedTokenId)

    expect(ownerInWrapper).to.equal(account)

    // check flag in the wrapper
    const canTransfer = await NFTFuseWrapper.canTransfer(wrappedTokenId)

    expect(canTransfer).to.equal(false)

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

  it('can set fuses and burn canSetData', async () => {
    const label = 'fuses1'
    const tokenId = labelhash(label)
    const wrappedTokenId = namehash(label + '.eth')
    const CAN_DO_EVERYTHING = 0
    const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()

    await BaseRegistrar.register(tokenId, account, 84600)

    await NFTFuseWrapper.wrapETH2LD(
      label,
      CAN_DO_EVERYTHING | CANNOT_UNWRAP,
      account
    )

    const CANNOT_SET_DATA = await NFTFuseWrapper.CANNOT_SET_DATA()

    await NFTFuseWrapper.burnFuses(
      namehash('eth'),
      tokenId,
      CAN_DO_EVERYTHING | CANNOT_SET_DATA
    )

    const ownerInWrapper = await NFTFuseWrapper.ownerOf(wrappedTokenId)

    expect(ownerInWrapper).to.equal(account)

    // check flag in the wrapper
    const canSetData = await NFTFuseWrapper.canSetData(wrappedTokenId)

    expect(canSetData).to.equal(false)

    //try to set the resolver and ttl
    expect(NFTFuseWrapper.setResolver(wrappedTokenId, account)).to.be.reverted

    expect(NFTFuseWrapper.setTTL(wrappedTokenId, 1000)).to.be.reverted
  })

  it('can set fuses and burn canCreateSubdomains', async () => {
    const label = 'fuses2'
    const tokenId = labelhash(label)
    const wrappedTokenId = namehash(label + '.eth')
    const CAN_DO_EVERYTHING = await NFTFuseWrapper.CAN_DO_EVERYTHING()
    const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()
    const CANNOT_REPLACE_SUBDOMAIN = await NFTFuseWrapper.CANNOT_REPLACE_SUBDOMAIN()
    const CANNOT_CREATE_SUBDOMAIN = await NFTFuseWrapper.CANNOT_CREATE_SUBDOMAIN()

    await BaseRegistrar.register(tokenId, account, 84600)

    await NFTFuseWrapper.wrapETH2LD(
      label,
      CAN_DO_EVERYTHING | CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN,
      account
    )

    const canCreateSubdomain1 = await NFTFuseWrapper.canCreateSubdomain(
      wrappedTokenId
    )

    expect(canCreateSubdomain1, 'createSubdomain is set to false').to.equal(
      true
    )

    // can create before burn

    //revert not approved and isn't sender because subdomain isnt owned by contract?
    await NFTFuseWrapper.setSubnodeOwnerAndWrap(
      wrappedTokenId,
      labelhash('creatable'),
      account,
      255
    )

    expect(await EnsRegistry.owner(namehash('creatable.fuses2.eth'))).to.equal(
      NFTFuseWrapper.address
    )

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

  it('can setSubnodeOwnerAndWrap', async () => {
    const label = 'subdomains'
    const tokenId = labelhash(label)
    const wrappedTokenId = namehash(label + '.eth')
    const CAN_DO_EVERYTHING = 0
    const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()
    const CANNOT_REPLACE_SUBDOMAIN = await NFTFuseWrapper.CANNOT_REPLACE_SUBDOMAIN()

    await BaseRegistrar.register(tokenId, account, 84600)

    await NFTFuseWrapper.wrapETH2LD(
      label,
      CAN_DO_EVERYTHING | CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN,
      account
    )

    // can create before burn

    //revert not approved and isn't sender because subdomain isnt owned by contract?
    await NFTFuseWrapper.setSubnodeOwnerAndWrap(
      wrappedTokenId,
      labelhash('setsubnodeownerandwrap'),
      account,
      255
    )

    expect(
      await EnsRegistry.owner(namehash('setsubnodeownerandwrap.subdomains.eth'))
    ).to.equal(NFTFuseWrapper.address)

    expect(
      await NFTFuseWrapper.ownerOf(
        namehash('setsubnodeownerandwrap.subdomains.eth')
      )
    ).to.equal(account)
  })

  it('can setSubnodeRecordAndWrap', async () => {
    const label = 'subdomains2'
    const tokenId = labelhash(label)
    const wrappedTokenId = namehash(label + '.eth')
    const CAN_DO_EVERYTHING = 0
    const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()
    const CANNOT_REPLACE_SUBDOMAIN = await NFTFuseWrapper.CANNOT_REPLACE_SUBDOMAIN()

    await BaseRegistrar.register(tokenId, account, 84600)

    await NFTFuseWrapper.wrapETH2LD(
      label,
      CAN_DO_EVERYTHING | CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN,
      account
    )
    // can create before burn

    //revert not approved and isn't sender because subdomain isnt owned by contract?
    await NFTFuseWrapper.setSubnodeRecordAndWrap(
      wrappedTokenId,
      labelhash('setsubnoderecordandwrap'),
      account,
      account,
      0,
      255
    )

    expect(
      await EnsRegistry.owner(
        namehash('setsubnoderecordandwrap.subdomains2.eth')
      )
    ).to.equal(NFTFuseWrapper.address)

    expect(
      await NFTFuseWrapper.ownerOf(
        namehash('setsubnoderecordandwrap.subdomains2.eth')
      )
    ).to.equal(account)
  })
})
