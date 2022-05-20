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
  let ENSRegistry
  let ENSRegistry2
  let BaseRegistrar
  let BaseRegistrar2
  let NameWrapper
  let NameWrapper2
  let MetaDataservice
  let signers
  let account
  let account2
  let result

  before(async () => {
    signers = await ethers.getSigners()
    account = await signers[0].getAddress()
    account2 = await signers[1].getAddress()

    EnsRegistry = await deploy('ENSRegistry')
    EnsRegistry2 = EnsRegistry.connect(signers[1])

    BaseRegistrar = await deploy(
      'BaseRegistrarImplementation',
      EnsRegistry.address,
      namehash('eth')
    )

    BaseRegistrar2 = BaseRegistrar.connect(signers[1])

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

    SubdomainRegistrar = await deploy('SubdomainRegistrar', NameWrapper.address)
  })

  beforeEach(async () => {
    result = await ethers.provider.send('evm_snapshot')
  })
  afterEach(async () => {
    await ethers.provider.send('evm_revert', [result])
  })

  describe('createSubdomain', () => {
    it('should allow subdomains to be created', async () => {
      await BaseRegistrar.register(labelhash('test'), account, 86400)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD('test', account, 0, EMPTY_ADDRESS)
      expect(await NameWrapper.ownerOf(namehash('test.eth'))).to.equal(account)
      await NameWrapper.setApprovalForAll(SubdomainRegistrar.address, true)
      await SubdomainRegistrar.registerSubname(
        namehash('test.eth'),
        'subname',
        account,
        EMPTY_ADDRESS,
        0,
        0,
        []
      )
    })
    it('should allow not approved subdomains to be created', async () => {
      await BaseRegistrar.register(labelhash('test'), account, 86400)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD('test', account, 0, EMPTY_ADDRESS)
      expect(await NameWrapper.ownerOf(namehash('test.eth'))).to.equal(account)

      await expect(
        SubdomainRegistrar.registerSubname(
          namehash('test.eth'),
          'subname',
          account,
          EMPTY_ADDRESS,
          0,
          0,
          []
        )
      ).to.be.revertedWith(
        `Unauthorised("${namehash('test.eth')}", "${
          SubdomainRegistrar.address
        }")`
      )
    })
  })
})
