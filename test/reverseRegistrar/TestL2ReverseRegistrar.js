const { expect } = require('chai')
const { ethers } = require('hardhat')
const { namehash } = require('../test-utils/ens')
const { EMPTY_ADDRESS } = require('../test-utils/constants')

describe('L2ReverseRegistrar', function () {
  let L2ReverseRegistrar
  let L2ReverseRegistrarWithAccount2
  let MockSmartContractWallet
  let MockOwnable
  let signers
  let account
  let account2
  let setNameForAddrWithSignatureFuncSig =
    'setNameForAddrWithSignature(address,string,address,uint256,bytes)'

  before(async function () {
    signers = await ethers.getSigners()
    account = await signers[0].getAddress()
    account2 = await signers[1].getAddress()

    const L2ReverseRegistrarFactory = await ethers.getContractFactory(
      'L2ReverseRegistrar',
    )
    L2ReverseRegistrar = await L2ReverseRegistrarFactory.deploy(
      namehash('optimism.reverse'),
    )

    const MockSmartContractWalletFactory = await ethers.getContractFactory(
      'MockSmartContractWallet',
    )
    MockSmartContractWallet = await MockSmartContractWalletFactory.deploy(
      account,
    )

    const MockOwnableFactory = await ethers.getContractFactory('MockOwnable')
    MockOwnable = await MockOwnableFactory.deploy(
      MockSmartContractWallet.address,
    )

    L2ReverseRegistrarWithAccount2 = L2ReverseRegistrar.connect(signers[1])

    await L2ReverseRegistrar.deployed()
  })

  it('should deploy the contract', async function () {
    expect(L2ReverseRegistrar.address).to.not.equal(0)
  })

  //write all my tests for me
  it('should set the name record for the calling account', async function () {
    const name = 'myname.eth'
    const tx = await L2ReverseRegistrar.setName(name)
    await tx.wait()

    const node = await L2ReverseRegistrar.node(
      await ethers.provider.getSigner().getAddress(),
    )
    const actualName = await L2ReverseRegistrar.name(node)
    expect(actualName).to.equal(name)
  })

  describe('setNameForAddrWithSignature', function () {
    it('allows an account to sign a message to allow a relayer to claim the address', async () => {
      const funcId = ethers.utils
        .id(setNameForAddrWithSignatureFuncSig)
        .substring(0, 10)

      const block = await ethers.provider.getBlock('latest')
      const signatureExpiry = block.timestamp + 3600
      const signature = await signers[0].signMessage(
        ethers.utils.arrayify(
          ethers.utils.solidityKeccak256(
            ['bytes4', 'address', 'string', 'address', 'uint256'],
            [funcId, account, 'hello.eth', EMPTY_ADDRESS, signatureExpiry],
          ),
        ),
      )

      await L2ReverseRegistrarWithAccount2['setNameForAddrWithSignature'](
        account,
        'hello.eth',
        EMPTY_ADDRESS,
        signatureExpiry,
        signature,
      )

      const node = await L2ReverseRegistrar.node(account)
      assert.equal(await L2ReverseRegistrar.name(node), 'hello.eth')
    })

    it('reverts if signature parameters do not match', async () => {
      const funcId = ethers.utils
        .id(setNameForAddrWithSignatureFuncSig)
        .substring(0, 10)

      const block = await ethers.provider.getBlock('latest')
      const signatureExpiry = block.timestamp + 3600
      const signature = await signers[0].signMessage(
        ethers.utils.arrayify(
          ethers.utils.solidityKeccak256(
            ['bytes4', 'address', 'string', 'address', 'uint256'],
            [funcId, account, 'hello.eth', EMPTY_ADDRESS, signatureExpiry],
          ),
        ),
      )

      await expect(
        L2ReverseRegistrarWithAccount2[setNameForAddrWithSignatureFuncSig](
          account,
          'notthesamename.eth',
          EMPTY_ADDRESS,
          signatureExpiry,
          signature,
        ),
      ).to.be.revertedWith(`InvalidSignature()`)
    })
  })

  describe('setNameForAddrWithSignatureAndOwnable', function () {
    it('allows an account to sign a message to allow a relayer to claim the address of a contract that is owned by another contract that the account is a signer of', async () => {
      const node = await L2ReverseRegistrar.node(MockOwnable.address)
      assert.equal(await L2ReverseRegistrar.name(node), '')
      const funcId = ethers.utils
        .id(setNameForAddrWithSignatureFuncSig)
        .substring(0, 10)

      const block = await ethers.provider.getBlock('latest')
      const signatureExpiry = block.timestamp + 3600
      const signature = await signers[0].signMessage(
        ethers.utils.arrayify(
          ethers.utils.solidityKeccak256(
            ['bytes4', 'address', 'address', 'string', 'address', 'uint256'],
            [
              funcId,
              MockOwnable.address,
              MockSmartContractWallet.address,
              'ownable.eth',
              EMPTY_ADDRESS,
              signatureExpiry,
            ],
          ),
        ),
      )

      await L2ReverseRegistrarWithAccount2[
        'setNameForAddrWithSignatureAndOwnable'
      ](
        MockOwnable.address,
        MockSmartContractWallet.address,
        'ownable.eth',
        EMPTY_ADDRESS,
        signatureExpiry,
        signature,
      )

      assert.equal(await L2ReverseRegistrar.name(node), 'ownable.eth')
    })
  })
})
