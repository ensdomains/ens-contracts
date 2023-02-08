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

    SubdomainRegistrar = await deploy(
      'ForeverSubdomainRegistrar',
      NameWrapper.address,
    )

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
      const parentDuration = 86400 * 2
      await BaseRegistrar.register(labelhash('test'), account, parentDuration)
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
      await NameWrapper.wrapETH2LD(
        'test',
        account,
        CANNOT_UNWRAP,
        EMPTY_ADDRESS,
      )
      const [, , parentExpiry] = await NameWrapper.getData(node)
      expect(await NameWrapper.ownerOf(node)).to.equal(account)
      await SubdomainRegistrar.setupDomain(node, Erc20.address, 1, account)
      await NameWrapper.setApprovalForAll(SubdomainRegistrar.address, true)
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
      const balanceAfter = await Erc20WithAccount2.balanceOf(account2)
      expect(balanceBefore.sub(balanceAfter)).to.equal(fee)
      const [owner, fuses, expiry] = await NameWrapper.getData(subNode)

      expect(owner).to.equal(account2)
      expect(expiry).to.equal(parentExpiry)
      expect(fuses).to.equal(CAN_EXTEND_EXPIRY | PARENT_CANNOT_CONTROL)
    })
  })
})
