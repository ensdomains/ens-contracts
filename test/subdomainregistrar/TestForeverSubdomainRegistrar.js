const { ethers } = require('hardhat')
const { utils, BigNumber: BN } = ethers
const { use, expect } = require('chai')
const { solidity } = require('ethereum-waffle')
const n = require('eth-ens-namehash')
const namehash = n.hash
const { FUSES } = require('../test-utils/ens')
const { deploy } = require('../test-utils/contracts')

const { CANNOT_UNWRAP, CAN_EXTEND_EXPIRY, PARENT_CANNOT_CONTROL } = FUSES

use(solidity)

const labelhash = (label) => utils.keccak256(utils.toUtf8Bytes(label))
const ROOT_NODE =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

const GRACE_PERIOD = 86400 * 90

const EMPTY_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000'
const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000'
const MAX_EXPIRY = 2n ** 64n - 1n

function increaseTime(delay) {
  return ethers.provider.send('evm_increaseTime', [delay])
}

function mine() {
  return ethers.provider.send('evm_mine')
}

describe('Forever Subdomain registrar', () => {
  let EnsRegistry
  let BaseRegistrar
  let NameWrapper
  let MetaDataservice
  let FixedPricer
  let FixedPricerFree
  let Erc20
  let Erc20WithAccount2
  let Erc20WithAccount3
  let signers
  let account
  let account2
  let result
  let parentDuration

  //constants
  const node = namehash('test.eth')
  const subNode = namehash('subname.test.eth')
  const subNode2 = namehash('subname2.test.eth')

  before(async () => {
    signers = await ethers.getSigners()
    account = await signers[0].getAddress()
    account2 = await signers[1].getAddress()
    account3 = await signers[2].getAddress()

    EnsRegistry = await deploy('ENSRegistry')

    console.log('ENSRegistry deployed at: ', EnsRegistry.address)

    BaseRegistrar = await deploy(
      'BaseRegistrarImplementation',
      EnsRegistry.address,
      namehash('eth'),
    )

    console.log(
      'BaseRegistrarImplementation deployed at: ',
      BaseRegistrar.address,
    )

    await BaseRegistrar.addController(account)
    await BaseRegistrar.addController(account2)

    MetaDataservice = await deploy(
      'StaticMetadataService',
      'https://ens.domains',
    )

    //setup reverse registrar

    const ReverseRegistrar = await deploy(
      'ReverseRegistrar',
      EnsRegistry.address,
    )

    console.log('ReverseRegistrar deployed at: ', ReverseRegistrar.address)

    await EnsRegistry.setSubnodeOwner(ROOT_NODE, labelhash('reverse'), account)
    await EnsRegistry.setSubnodeOwner(
      namehash('reverse'),
      labelhash('addr'),
      ReverseRegistrar.address,
    )

    NameWrapper = await deploy(
      'NameWrapper',
      EnsRegistry.address,
      BaseRegistrar.address,
      MetaDataservice.address,
    )

    console.log('NameWrapper deployed at: ', NameWrapper.address)

    NameWrapper2 = NameWrapper.connect(signers[1])

    await BaseRegistrar.addController(NameWrapper.address)
    await NameWrapper.setController(account, true)

    PublicResolver = await deploy(
      'PublicResolver',
      EnsRegistry.address,
      NameWrapper.address,
      '0x0000000000000000000000000000000000000000',
      ReverseRegistrar.address,
    )

    console.log('PublicResolver deployed at: ', PublicResolver.address)

    Erc20 = await deploy('MockERC20', 'ENS Token', 'ENS', [account2])
    Erc20WithAccount2 = Erc20.connect(signers[1])
    Erc20WithAccount3 = Erc20.connect(signers[2])

    console.log('MockERC20 deployed at: ', Erc20.address)

    // setup .eth
    await EnsRegistry.setSubnodeOwner(
      ROOT_NODE,
      utils.keccak256(utils.toUtf8Bytes('eth')),
      BaseRegistrar.address,
    )

    // setup .xyz
    await EnsRegistry.setSubnodeOwner(
      ROOT_NODE,
      utils.keccak256(utils.toUtf8Bytes('xyz')),
      account,
    )

    //make sure base registrar is owner of eth TLD
    expect(await EnsRegistry.owner(namehash('eth'))).to.equal(
      BaseRegistrar.address,
    )

    SubdomainRegistrar = await deploy(
      'ForeverSubdomainRegistrar',
      NameWrapper.address,
    )

    console.log(
      'ForeverSubdomainRegistrar deployed at: ',
      SubdomainRegistrar.address,
    )

    SubdomainRegistrar2 = SubdomainRegistrar.connect(signers[1])
    SubdomainRegistrar3 = SubdomainRegistrar.connect(signers[2])

    FixedPricer = await deploy('FixedPricer', 1, EMPTY_ADDRESS)
    FixedPricerERC20 = await deploy('FixedPricer', 1, Erc20.address)
    FixedPricerFree = await deploy('FixedPricer', 0, EMPTY_ADDRESS)
  })

  beforeEach(async () => {
    result = await ethers.provider.send('evm_snapshot')
  })
  afterEach(async () => {
    await ethers.provider.send('evm_revert', [result])
  })

  describe('setupDomain()', () => {
    beforeEach(async () => {
      parentDuration = 86400 * 2
      await BaseRegistrar.register(labelhash('test'), account, parentDuration)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD(
        'test',
        account,
        CANNOT_UNWRAP,
        EMPTY_ADDRESS,
      )
      ;[, , parentExpiry] = await NameWrapper.getData(node)
      expect(await NameWrapper.ownerOf(node)).to.equal(account)
    })

    it('should emit an event when a domain is setup', async () => {
      await expect(
        SubdomainRegistrar.setupDomain(
          node,
          FixedPricer.address,
          account,
          true,
        ),
      )
        .to.emit(SubdomainRegistrar, 'NameSetup')
        .withArgs(node, FixedPricer.address, account, true)
    })
  })

  describe('register', () => {
    let parentExpiry

    beforeEach(async () => {
      await BaseRegistrar.register(labelhash('test'), account, parentDuration)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD(
        'test',
        account,
        CANNOT_UNWRAP,
        EMPTY_ADDRESS,
      )
      ;[, , parentExpiry] = await NameWrapper.getData(node)
      expect(await NameWrapper.ownerOf(node)).to.equal(account)
      await SubdomainRegistrar.setupDomain(
        node,
        FixedPricerERC20.address,
        account,
        true,
      )
      await NameWrapper.setApprovalForAll(SubdomainRegistrar.address, true)
    })
    it('should allow subdomains to be created', async () => {
      const balanceBefore = await Erc20WithAccount2.balanceOf(account2)

      const [, fee] = await FixedPricerERC20.price(
        namehash('test.eth'),
        'subname',
        0,
      )

      await Erc20WithAccount2.approve(
        SubdomainRegistrar.address,
        ethers.constants.MaxUint256,
      )

      await SubdomainRegistrar2.register(
        node,
        'subname',
        account2,
        EMPTY_ADDRESS,
        0,
        [],
      )

      const balanceAfter = await Erc20WithAccount2.balanceOf(account2)
      expect(balanceBefore.sub(balanceAfter)).to.equal(fee)
      const [owner, fuses, expiry] = await NameWrapper.getData(subNode)

      expect(owner).to.equal(account2)
      expect(expiry).to.equal(parentExpiry - GRACE_PERIOD)
      expect(fuses).to.equal(CAN_EXTEND_EXPIRY | PARENT_CANNOT_CONTROL)
    })

    it('should not allow subdomains to be registerd over another domain', async () => {
      const balanceBefore = await Erc20WithAccount2.balanceOf(account2)

      const [, fee] = await FixedPricerERC20.price(
        namehash('test.eth'),
        'subname',
        0,
      )

      await Erc20WithAccount2.approve(
        SubdomainRegistrar.address,
        ethers.constants.MaxUint256,
      )

      await SubdomainRegistrar2.register(
        node,
        'subname',
        account2,
        EMPTY_ADDRESS,
        0,
        [],
      )
      const balanceAfter = await Erc20WithAccount2.balanceOf(account2)
      expect(balanceBefore.sub(balanceAfter)).to.equal(fee)
      const [owner, fuses, expiry] = await NameWrapper.getData(subNode)

      expect(owner).to.equal(account2)
      expect(expiry).to.equal(parentExpiry - GRACE_PERIOD)
      expect(fuses).to.equal(CAN_EXTEND_EXPIRY | PARENT_CANNOT_CONTROL)

      await expect(
        SubdomainRegistrar2.register(
          node,
          'subname',
          account2,
          EMPTY_ADDRESS,
          0,
          [],
        ),
      ).to.be.revertedWith(`Unavailable()`)
    })

    it('Names can extend their own expiry', async () => {
      const balanceBefore = await Erc20WithAccount2.balanceOf(account2)
      const fee = (await SubdomainRegistrar.names(namehash('test.eth')))
        .registrationFee

      await Erc20WithAccount2.approve(
        SubdomainRegistrar.address,
        ethers.constants.MaxUint256,
      )
      await SubdomainRegistrar2.register(
        node,
        'subname',
        account2,
        EMPTY_ADDRESS,
        0,
        [],
      )

      await NameWrapper.renew(labelhash('test'), 86400)
      const [, , newParentExpiry] = await NameWrapper.getData(node)
      expect(parseInt(newParentExpiry)).to.equal(parseInt(parentExpiry) + 86400)

      await NameWrapper2.extendExpiry(
        node,
        labelhash('subname'),
        newParentExpiry,
      )
      const [, , newSubnodeExpiry] = await NameWrapper.getData(
        namehash('subname.test.eth'),
      )
      expect(parseInt(newSubnodeExpiry)).to.equal(parseInt(newParentExpiry))
    })
  })
})
