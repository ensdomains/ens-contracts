const { expect } = require('chai')
const { ethers } = require('hardhat')
const { namehash } = require('../test-utils/ens')
const { EMPTY_ADDRESS } = require('../test-utils/constants')

describe('L2ReverseRegistrar', function () {
  let l2ReverseRegistrar
  let l2ReverseRegistrarWithAccount2
  let signers
  let account
  let account2
  let setNameForAddrWithSignatureFuncSig =
    'setNameForAddrWithSignature(address,string,address,uint256,bytes)'

  before(async function () {
    signers = await ethers.getSigners()
    account = await signers[0].getAddress()
    account2 = await signers[1].getAddress()

    const L2ReverseRegistrar = await ethers.getContractFactory(
      'L2ReverseRegistrar',
    )
    l2ReverseRegistrar = await L2ReverseRegistrar.deploy(
      namehash('optimism.reverse'),
    )

    l2ReverseRegistrarWithAccount2 = l2ReverseRegistrar.connect(signers[1])

    await l2ReverseRegistrar.deployed()
  })

  it('should deploy the contract', async function () {
    expect(l2ReverseRegistrar.address).to.not.equal(0)
  })

  //write all my tests for me
  it('should set the name record for the calling account', async function () {
    const name = 'myname.eth'
    const tx = await l2ReverseRegistrar.setName(name)
    await tx.wait()

    const node = await l2ReverseRegistrar.node(
      await ethers.provider.getSigner().getAddress(),
    )
    const actualName = await l2ReverseRegistrar.name(node)
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

      await l2ReverseRegistrarWithAccount2[setNameForAddrWithSignatureFuncSig](
        account,
        'hello.eth',
        EMPTY_ADDRESS,
        signatureExpiry,
        signature,
      )

      const node = await l2ReverseRegistrar.node(account)
      assert.equal(await l2ReverseRegistrar.name(node), 'hello.eth')
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
        l2ReverseRegistrarWithAccount2[setNameForAddrWithSignatureFuncSig](
          account,
          'notthesamename.eth',
          EMPTY_ADDRESS,
          signatureExpiry,
          signature,
        ),
      ).to.be.revertedWith(`InvalidSignature()`)
    })
  })
})
