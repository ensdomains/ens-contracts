const { ethers } = require('hardhat')
const { utils, BigNumber: BN } = ethers
const { use, expect } = require('chai')
const { solidity } = require('ethereum-waffle')
const n = require('eth-ens-namehash')
const namehash = n.hash
const { deploy } = require('../test-utils/contracts')

use(solidity)

const labelhash = (label) => utils.keccak256(utils.toUtf8Bytes(label))
const ROOT_NODE =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

const EMPTY_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000'
const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000'

describe('Subdomain registrar', () => {
  let EnsRegistry
  let BaseRegistrar
  let NameWrapper
  let MetaDataservice
  let PublicResolver
  let signers
  let account
  let account2
  let result

  //constants
  const node = namehash('test.eth')
  const subNode = namehash('subname.test.eth')

  before(async () => {
    signers = await ethers.getSigners()
    account = await signers[0].getAddress()
    account2 = await signers[1].getAddress()

    EnsRegistry = await deploy('ENSRegistry')

    BaseRegistrar = await deploy(
      'BaseRegistrarImplementation',
      EnsRegistry.address,
      namehash('eth')
    )

    await BaseRegistrar.addController(account)
    await BaseRegistrar.addController(account2)

    MetaDataservice = await deploy(
      'StaticMetadataService',
      'https://ens.domains'
    )

    NameWrapper = await deploy(
      'NameWrapper',
      EnsRegistry.address,
      BaseRegistrar.address,
      MetaDataservice.address
    )
    PublicResolver = await deploy(
      'PublicResolver',
      EnsRegistry.address,
      NameWrapper.address,
      EMPTY_ADDRESS,
      EMPTY_ADDRESS
    )

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

    SubdomainRegistrar = await deploy('SubdomainRegistrar', NameWrapper.address)

    SubdomainRegistrar2 = SubdomainRegistrar.connect(signers[1])
  })

  beforeEach(async () => {
    result = await ethers.provider.send('evm_snapshot')
  })
  afterEach(async () => {
    await ethers.provider.send('evm_revert', [result])
  })

  describe('register', () => {
    it('should allow subdomains to be created', async () => {
      await BaseRegistrar.register(labelhash('test'), account, 86400)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD('test', account, 0, EMPTY_ADDRESS)
      expect(await NameWrapper.ownerOf(node)).to.equal(account)
      await NameWrapper.setApprovalForAll(SubdomainRegistrar.address, true)
      await SubdomainRegistrar2.register(
        node,
        'subname',
        account2,
        EMPTY_ADDRESS,
        0,
        0,
        86400,
        []
      )

      expect(await NameWrapper.ownerOf(subNode)).to.equal(account2)
    })
    it('should allow not approved subdomains to be created', async () => {
      await BaseRegistrar.register(labelhash('test'), account, 86400)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD('test', account, 0, EMPTY_ADDRESS)
      expect(await NameWrapper.ownerOf(namehash('test.eth'))).to.equal(account)

      await expect(
        SubdomainRegistrar.register(
          namehash('test.eth'),
          'subname',
          account2,
          EMPTY_ADDRESS,
          0,
          0,
          86400,
          []
        )
      ).to.be.revertedWith(
        `Unauthorised("${namehash('test.eth')}", "${
          SubdomainRegistrar.address
        }")`
      )
    })
    it('should allow subdomains to be registered with a fee', async () => {
      const node = namehash('test.eth')
      await BaseRegistrar.register(labelhash('test'), account, 86400)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD('test', account, 0, EMPTY_ADDRESS)
      expect(await NameWrapper.ownerOf(node)).to.equal(account)
      await SubdomainRegistrar.setRegistrationFee(node, 1)
      const fee = (await SubdomainRegistrar.names(node)).registrationFee
      await NameWrapper.setApprovalForAll(SubdomainRegistrar.address, true)
      await SubdomainRegistrar2.register(
        node,
        'subname',
        account2,
        EMPTY_ADDRESS,
        0,
        0,
        86400,
        [],
        { value: 86400 * fee }
      )

      expect(await NameWrapper.ownerOf(subNode)).to.equal(account2)
    })

    it('should revert if not enough ether is given', async () => {
      const node = namehash('test.eth')
      await BaseRegistrar.register(labelhash('test'), account, 86400)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD('test', account, 0, EMPTY_ADDRESS)
      expect(await NameWrapper.ownerOf(node)).to.equal(account)
      await SubdomainRegistrar.setupDomain(node, 1, account)
      await NameWrapper.setApprovalForAll(SubdomainRegistrar.address, true)
      await expect(
        SubdomainRegistrar2.register(
          node,
          'subname',
          account2,
          EMPTY_ADDRESS,
          0,
          0,
          86400,
          []
        )
      ).to.be.revertedWith(`InsufficientFunds()`)
    })
  })

  describe('register Subnames with records', () => {
    it('should allow a subname to be registered with records', async () => {
      const node = namehash('test.eth')
      await BaseRegistrar.register(labelhash('test'), account, 86400)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD('test', account, 0, EMPTY_ADDRESS)
      expect(await NameWrapper.ownerOf(node)).to.equal(account)
      await SubdomainRegistrar.setRegistrationFee(node, 1)
      const fee = (await SubdomainRegistrar.names(node)).registrationFee
      await NameWrapper.setApprovalForAll(SubdomainRegistrar.address, true)
      await SubdomainRegistrar2.register(
        node,
        'subname',
        account2,
        PublicResolver.address,
        0,
        0,
        86400,
        [
          PublicResolver.interface.encodeFunctionData(
            'setAddr(bytes32,address)',
            [subNode, account2]
          ),
        ],
        { value: 86400 * fee }
      )

      expect(await NameWrapper.ownerOf(subNode)).to.equal(account2)
      expect(await PublicResolver['addr(bytes32)'](subNode)).to.equal(account2)
    })
  })
})
