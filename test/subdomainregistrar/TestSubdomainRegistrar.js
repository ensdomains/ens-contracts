const { ethers } = require('hardhat')
const { utils, BigNumber: BN } = ethers
const { use, expect } = require('chai')
const { solidity } = require('ethereum-waffle')
const n = require('eth-ens-namehash')
const namehash = n.hash
const { FUSES } = require('../test-utils/ens')
const { deploy } = require('../test-utils/contracts')

const { CANNOT_UNWRAP } = FUSES

use(solidity)

const labelhash = (label) => utils.keccak256(utils.toUtf8Bytes(label))
const ROOT_NODE =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

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

describe('Subdomain registrar', () => {
  let EnsRegistry
  let BaseRegistrar
  let NameWrapper
  let MetaDataservice
  let PublicResolver
  let Erc20
  let Erc20WithAccount2
  let Erc20WithAccount3
  let signers
  let account
  let account2
  let result

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

    BaseRegistrar = await deploy(
      'BaseRegistrarImplementation',
      EnsRegistry.address,
      namehash('eth'),
    )

    await BaseRegistrar.addController(account)
    await BaseRegistrar.addController(account2)

    MetaDataservice = await deploy(
      'StaticMetadataService',
      'https://ens.domains',
    )

    NameWrapper = await deploy(
      'NameWrapper',
      EnsRegistry.address,
      BaseRegistrar.address,
      MetaDataservice.address,
    )
    PublicResolver = await deploy(
      'PublicResolver',
      EnsRegistry.address,
      NameWrapper.address,
      EMPTY_ADDRESS,
      EMPTY_ADDRESS,
    )

    Erc20 = await deploy('MockERC20', 'ENS Token', 'ENS', [account2])
    Erc20WithAccount2 = Erc20.connect(signers[1])
    Erc20WithAccount3 = Erc20.connect(signers[2])

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

    SubdomainRegistrar = await deploy('SubdomainRegistrar', NameWrapper.address)

    SubdomainRegistrar2 = SubdomainRegistrar.connect(signers[1])
    SubdomainRegistrar3 = SubdomainRegistrar.connect(signers[2])
  })

  beforeEach(async () => {
    result = await ethers.provider.send('evm_snapshot')
  })
  afterEach(async () => {
    await ethers.provider.send('evm_revert', [result])
  })

  describe('register', () => {
    it('should allow subdomains to be created', async () => {
      await BaseRegistrar.register(labelhash('test'), account, 86400 * 2)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD(
        'test',
        account,
        CANNOT_UNWRAP,
        MAX_EXPIRY,
        EMPTY_ADDRESS,
      )
      expect(await NameWrapper.ownerOf(node)).to.equal(account)
      await SubdomainRegistrar.setupDomain(node, Erc20.address, 1, account)
      await NameWrapper.setApprovalForAll(SubdomainRegistrar.address, true)
      const balanceBefore = await Erc20WithAccount2.balanceOf(account2)
      const duration = 86400
      const fee =
        (await SubdomainRegistrar.names(namehash('test.eth'))).registrationFee *
        duration

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
        duration,
        [],
      )
      const balanceAfter = await Erc20WithAccount2.balanceOf(account2)
      expect(balanceBefore.sub(balanceAfter)).to.equal(fee)

      expect(await NameWrapper.ownerOf(subNode)).to.equal(account2)
    })
    it('should not allow subdomains to be created on unapproved parents', async () => {
      await BaseRegistrar.register(labelhash('test'), account, 86400 * 2)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD(
        'test',
        account,
        0,
        MAX_EXPIRY,
        EMPTY_ADDRESS,
      )
      expect(await NameWrapper.ownerOf(node)).to.equal(account)
      await SubdomainRegistrar.setupDomain(node, Erc20.address, 1, account)
      await Erc20.approve(
        SubdomainRegistrar.address,
        ethers.constants.MaxUint256,
      )

      await expect(
        SubdomainRegistrar.register(
          node,
          'subname',
          account2,
          EMPTY_ADDRESS,
          0,
          86400,
          [],
        ),
      ).to.be.revertedWith(
        `Unauthorised("${namehash('test.eth')}", "${
          SubdomainRegistrar.address
        }")`,
      )
    })

    it('should allow subdomains to be registered without a fee', async () => {
      await BaseRegistrar.register(labelhash('test'), account, 86400 * 2)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD(
        'test',
        account,
        0,
        MAX_EXPIRY,
        EMPTY_ADDRESS,
      )
      expect(await NameWrapper.ownerOf(node)).to.equal(account)
      const fee = (await SubdomainRegistrar.names(node)).registrationFee
      await NameWrapper.setApprovalForAll(SubdomainRegistrar.address, true)
      await SubdomainRegistrar.setupDomain(node, EMPTY_ADDRESS, 0, account)
      await SubdomainRegistrar2.register(
        node,
        'subname',
        account2,
        EMPTY_ADDRESS,
        0,
        86400,
        [],
      )

      expect(await NameWrapper.ownerOf(subNode)).to.equal(account2)
    })

    it('should revert if user has insufficient balance of the token', async () => {
      const node = namehash('test.eth')
      await BaseRegistrar.register(labelhash('test'), account, 86400 * 2)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD(
        'test',
        account,
        0,
        MAX_EXPIRY,
        EMPTY_ADDRESS,
      )
      expect(await NameWrapper.ownerOf(node)).to.equal(account)
      await SubdomainRegistrar.setupDomain(node, Erc20.address, 1, account)
      await NameWrapper.setApprovalForAll(SubdomainRegistrar.address, true)
      await Erc20WithAccount3.approve(
        SubdomainRegistrar.address,
        ethers.constants.MaxUint256,
      )
      await expect(
        SubdomainRegistrar3.register(
          node,
          'subname',
          account2,
          EMPTY_ADDRESS,
          0,
          86400,
          [],
        ),
      ).to.be.revertedWith(`InsufficientFunds()`)
    })
  })

  describe('renew', () => {
    it('should allow subdomains to be renewed', async () => {
      await BaseRegistrar.register(labelhash('test'), account, 200000)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD(
        'test',
        account,
        0,
        MAX_EXPIRY,
        EMPTY_ADDRESS,
      )
      expect(await NameWrapper.ownerOf(node)).to.equal(account)
      await SubdomainRegistrar.setupDomain(node, Erc20.address, 1, account)
      await NameWrapper.setApprovalForAll(SubdomainRegistrar.address, true)
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
        86400,
        [],
      )

      const [, expiry] = await NameWrapper.getFuses(
        namehash('subname.test.eth'),
      )

      expect(await NameWrapper.ownerOf(subNode)).to.equal(account2)

      await SubdomainRegistrar2.renew(node, labelhash('subname'), 86400)
      const [, expiry2] = await NameWrapper.getFuses(
        namehash('subname.test.eth'),
      )
      expect(expiry2.toNumber()).to.be.greaterThan(expiry.toNumber())
    })

    it('should allow subdomains to be renewed even with 0 registration fee', async () => {
      await BaseRegistrar.register(labelhash('test'), account, 200000)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD(
        'test',
        account,
        0,
        MAX_EXPIRY,
        EMPTY_ADDRESS,
      )
      expect(await NameWrapper.ownerOf(node)).to.equal(account)
      await SubdomainRegistrar.setupDomain(node, Erc20.address, 0, account)
      await NameWrapper.setApprovalForAll(SubdomainRegistrar.address, true)
      await SubdomainRegistrar2.register(
        node,
        'subname',
        account2,
        EMPTY_ADDRESS,
        0,
        86400,
        [],
      )

      const [, expiry] = await NameWrapper.getFuses(
        namehash('subname.test.eth'),
      )

      expect(await NameWrapper.ownerOf(subNode)).to.equal(account2)

      await SubdomainRegistrar2.renew(node, labelhash('subname'), 86400)
      const [, expiry2] = await NameWrapper.getFuses(
        namehash('subname.test.eth'),
      )

      expect(expiry2.toNumber()).to.be.greaterThan(expiry.toNumber())
    })

    it('should revert if parent is expired', async () => {
      await BaseRegistrar.register(labelhash('test'), account, 86400)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD(
        'test',
        account,
        0,
        MAX_EXPIRY,
        EMPTY_ADDRESS,
      )
      expect(await NameWrapper.ownerOf(node)).to.equal(account)
      await SubdomainRegistrar.setupDomain(node, Erc20.address, 1, account)
      await NameWrapper.setApprovalForAll(SubdomainRegistrar.address, true)
      await Erc20WithAccount2.approve(
        SubdomainRegistrar.address,
        ethers.constants.MaxUint256,
      )

      //move time forward to expire parent
      await increaseTime(86400)
      await mine()

      await expect(
        SubdomainRegistrar2.register(
          node,
          'subname',
          account2,
          EMPTY_ADDRESS,
          0,
          0,
          [],
        ),
      ).to.be.revertedWith(`ParentExpired("${node}")`)
    })
  })

  describe('register Subnames with records', () => {
    it('should allow a subname to be registered with records', async () => {
      const node = namehash('test.eth')
      await BaseRegistrar.register(labelhash('test'), account, 86400 * 2)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD(
        'test',
        account,
        0,
        MAX_EXPIRY,
        EMPTY_ADDRESS,
      )
      expect(await NameWrapper.ownerOf(node)).to.equal(account)
      const fee = (await SubdomainRegistrar.names(node)).registrationFee
      await NameWrapper.setApprovalForAll(SubdomainRegistrar.address, true)
      await SubdomainRegistrar2.register(
        node,
        'subname',
        account2,
        PublicResolver.address,
        0,
        86400,
        [
          PublicResolver.interface.encodeFunctionData(
            'setAddr(bytes32,address)',
            [subNode, account2],
          ),
        ],
      )

      expect(await NameWrapper.ownerOf(namehash('subname.test.eth'))).to.equal(
        account2,
      )
      expect(await PublicResolver['addr(bytes32)'](subNode)).to.equal(account2)
    })
  })

  describe('batchRegister()', () => {
    it('should allow subnames to be batch registered with records', async () => {
      const node = namehash('test.eth')
      await BaseRegistrar.register(labelhash('test'), account, 86400 * 2)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD(
        'test',
        account,
        0,
        MAX_EXPIRY,
        EMPTY_ADDRESS,
      )
      expect(await NameWrapper.ownerOf(node)).to.equal(account)
      const fee = (await SubdomainRegistrar.names(node)).registrationFee
      await NameWrapper.setApprovalForAll(SubdomainRegistrar.address, true)
      await SubdomainRegistrar2.batchRegister(
        node,
        ['subname', 'subname2'],
        [account2, account3],
        PublicResolver.address,
        0,
        86400,
        [
          [
            PublicResolver.interface.encodeFunctionData(
              'setAddr(bytes32,address)',
              [subNode, account2],
            ),
          ],
          [
            PublicResolver.interface.encodeFunctionData(
              'setAddr(bytes32,address)',
              [subNode2, account3],
            ),
          ],
        ],
      )

      expect(await NameWrapper.ownerOf(subNode)).to.equal(account2)
      expect(await NameWrapper.ownerOf(subNode2)).to.equal(account3)
      expect(await PublicResolver['addr(bytes32)'](subNode)).to.equal(account2)
      expect(await PublicResolver['addr(bytes32)'](subNode2)).to.equal(account3)
    })

    it('should allow subnames to be batch registered with records with a fee', async () => {
      const node = namehash('test.eth')
      const duration = 86400
      await BaseRegistrar.register(labelhash('test'), account, duration * 2)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD(
        'test',
        account,
        0,
        MAX_EXPIRY,
        EMPTY_ADDRESS,
      )
      expect(await NameWrapper.ownerOf(node)).to.equal(account)
      await NameWrapper.setApprovalForAll(SubdomainRegistrar.address, true)
      await SubdomainRegistrar.setupDomain(node, Erc20.address, 1, account)
      const fee = (await SubdomainRegistrar.names(node)).registrationFee
      const balanceBefore = await Erc20WithAccount2.balanceOf(account2)
      const totalFee = fee * duration * 2
      await Erc20WithAccount2.approve(
        SubdomainRegistrar.address,
        ethers.constants.MaxUint256,
      )
      await SubdomainRegistrar2.batchRegister(
        node,
        ['subname', 'subname2'],
        [account2, account3],
        PublicResolver.address,
        0,
        duration,
        [
          [
            PublicResolver.interface.encodeFunctionData(
              'setAddr(bytes32,address)',
              [subNode, account2],
            ),
          ],
          [
            PublicResolver.interface.encodeFunctionData(
              'setAddr(bytes32,address)',
              [subNode2, account3],
            ),
          ],
        ],
      )

      const balanceAfter = await Erc20WithAccount2.balanceOf(account2)

      expect(balanceBefore).to.equal(balanceAfter.add(totalFee))

      expect(await NameWrapper.ownerOf(subNode)).to.equal(account2)
      expect(await NameWrapper.ownerOf(subNode2)).to.equal(account3)
      expect(await PublicResolver['addr(bytes32)'](subNode)).to.equal(account2)
      expect(await PublicResolver['addr(bytes32)'](subNode2)).to.equal(account3)
    })
  })
  describe('batchRenew()', () => {
    it('should allow a subname to be batch registered with records with a fee', async () => {
      const node = namehash('test.eth')
      const duration = 86400
      await BaseRegistrar.register(labelhash('test'), account, duration * 3)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD(
        'test',
        account,
        0,
        MAX_EXPIRY,
        EMPTY_ADDRESS,
      )
      expect(await NameWrapper.ownerOf(node)).to.equal(account)
      await NameWrapper.setApprovalForAll(SubdomainRegistrar.address, true)
      await SubdomainRegistrar.setupDomain(node, Erc20.address, 1, account)
      const fee = (await SubdomainRegistrar.names(node)).registrationFee
      const balanceBefore = await Erc20WithAccount2.balanceOf(account2)
      const totalFee = fee * duration * 2
      await Erc20WithAccount2.approve(
        SubdomainRegistrar.address,
        ethers.constants.MaxUint256,
      )
      await SubdomainRegistrar2.batchRegister(
        node,
        ['subname', 'subname2'],
        [account2, account3],
        PublicResolver.address,
        0,
        duration,
        [
          [
            PublicResolver.interface.encodeFunctionData(
              'setAddr(bytes32,address)',
              [subNode, account2],
            ),
          ],
          [
            PublicResolver.interface.encodeFunctionData(
              'setAddr(bytes32,address)',
              [subNode2, account3],
            ),
          ],
        ],
      )

      expect(await NameWrapper.ownerOf(namehash('subname.test.eth'))).to.equal(
        account2,
      )

      const [, expiry] = await NameWrapper.getFuses(subNode)
      const [, expiry2] = await NameWrapper.getFuses(subNode2)

      const balanceAfter = await Erc20WithAccount2.balanceOf(account2)

      expect(balanceBefore).to.equal(balanceAfter.add(totalFee))

      expect(await NameWrapper.ownerOf(subNode)).to.equal(account2)
      expect(await NameWrapper.ownerOf(subNode2)).to.equal(account3)

      await SubdomainRegistrar2.batchRenew(
        node,
        [labelhash('subname'), labelhash('subname2')],
        duration,
      )

      const [, expiryAfter] = await NameWrapper.getFuses(subNode)
      const [, expiryAfter2] = await NameWrapper.getFuses(subNode2)

      expect(expiryAfter).to.equal(expiry.add(duration))
      expect(expiryAfter2).to.equal(expiry2.add(duration))

      const balanceAfterRenewal = await Erc20WithAccount2.balanceOf(account2)
      expect(balanceAfter).to.equal(balanceAfterRenewal.add(totalFee))
    })
  })
})
