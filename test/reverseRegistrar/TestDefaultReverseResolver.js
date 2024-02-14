const { expect } = require('chai')
const { ethers } = require('hardhat')
const { namehash, encodeName } = require('../test-utils/ens')
const { sha256 } = require('ethers/lib/utils')
const keccak256 = ethers.utils.solidityKeccak256
const coinType = 0

async function makeSignature(signer, account, inceptionDate, dataTypes, data) {
  return await signer.signMessage(
    ethers.utils.arrayify(
      keccak256(
        ['bytes32', 'address', 'uint256', 'uint256'],
        [keccak256(dataTypes, data), account, inceptionDate, coinType],
      ),
    ),
  )
}
describe('DefaultReverseResolver', function () {
  let DefaultReverseResolver
  let DefaultReverseResolverWithAccount2
  let MockSmartContractWallet
  let MockOwnable
  let signers
  let account
  let account2
  let setNameForAddrWithSignatureFuncSig =
    'setNameForAddrWithSignature(address,string,uint256,bytes)'
  let setTextForAddrWithSignatureFuncSig =
    'setTextForAddrWithSignature(address,string,string,uint256,bytes)'
  let clearRecordsWithSignatureSig =
    'clearRecordsWithSignature(address,uint256,bytes)'
  let setNameForAddrWithSignatureFuncId
  let setTextForAddrWithSignatureFuncId
  let DefaultReverseResolverFactory
  before(async function () {
    signers = await ethers.getSigners()
    account = await signers[0].getAddress()
    account2 = await signers[1].getAddress()
    setNameForAddrWithSignatureFuncId = ethers.utils
      .id(setNameForAddrWithSignatureFuncSig)
      .substring(0, 10)
    setTextForAddrWithSignatureFuncId = ethers.utils
      .id(setTextForAddrWithSignatureFuncSig)
      .substring(0, 10)
    clearRecordsWithSignatureFuncId = ethers.utils
      .id(clearRecordsWithSignatureSig)
      .substring(0, 10)
    DefaultReverseResolverFactory = await ethers.getContractFactory(
      'DefaultReverseResolver',
    )
    DefaultReverseResolver = await DefaultReverseResolverFactory.deploy()

    const MockSmartContractWalletFactory = await ethers.getContractFactory(
      'MockSmartContractWallet',
    )
    MockSmartContractWallet = await MockSmartContractWalletFactory.deploy(
      account,
    )

    DefaultReverseResolverWithAccount2 = DefaultReverseResolver.connect(
      signers[1],
    )
    await DefaultReverseResolver.deployed()
  })

  beforeEach(async () => {
    result = await ethers.provider.send('evm_snapshot')
  })
  afterEach(async () => {
    await ethers.provider.send('evm_revert', [result])
  })

  it('should deploy the contract', async function () {
    expect(DefaultReverseResolver.address).to.not.equal(0)
  })

  describe('setNameForAddrWithSignature', () => {
    let name
    let node
    let inceptionDate
    let signature
    beforeEach(async () => {
      name = 'myname.eth'
      node = await DefaultReverseResolver.node(account)
      const funcId = ethers.utils
        .id(setNameForAddrWithSignatureFuncSig)
        .substring(0, 10)

      const block = await ethers.provider.getBlock('latest')
      inceptionDate = block.timestamp
      signature = await signers[0].signMessage(
        ethers.utils.arrayify(
          keccak256(
            ['bytes32', 'address', 'uint256', 'uint256'],
            [
              keccak256(['bytes4', 'string'], [funcId, name]),
              account,
              inceptionDate,
              coinType,
            ],
          ),
        ),
      )
    })

    it('allows an account to sign a message to allow a relayer to claim the address', async () => {
      await DefaultReverseResolverWithAccount2['setNameForAddrWithSignature'](
        account,
        name,
        inceptionDate,
        signature,
      )
      assert.equal(await DefaultReverseResolver.name(account), name)
    })

    it('allows to resolve', async () => {
      await DefaultReverseResolverWithAccount2['setNameForAddrWithSignature'](
        account,
        name,
        inceptionDate,
        signature,
      )
      const reverseName = `${account
        .substring(2)
        .toLowerCase()}.default.reverse`
      const encodedname = encodeName(reverseName)
      const calldata =
        DefaultReverseResolverFactory.interface.encodeFunctionData('name', [
          account,
        ])
      const result = await DefaultReverseResolverWithAccount2['resolve'](
        encodedname,
        calldata,
      )
      assert.equal(ethers.utils.toUtf8String(result), name)
    })

    it('event ReverseClaimed is emitted', async () => {
      await expect(
        DefaultReverseResolverWithAccount2['setNameForAddrWithSignature'](
          account,
          name,
          inceptionDate,
          signature,
        ),
      )
        .to.emit(DefaultReverseResolver, 'ReverseClaimed')
        .withArgs(account, node)
    })

    it('reverts if signature parameters do not match', async () => {
      const funcId = ethers.utils
        .id(setNameForAddrWithSignatureFuncSig)
        .substring(0, 10)

      const block = await ethers.provider.getBlock('latest')
      const inceptionDate = block.timestamp + 3600
      const signature = await signers[0].signMessage(
        ethers.utils.arrayify(
          keccak256(
            ['bytes32', 'address', 'uint256'],
            [
              keccak256(['bytes4', 'string'], [funcId, name]),
              account,
              inceptionDate,
            ],
          ),
        ),
      )

      await expect(
        DefaultReverseResolverWithAccount2[setNameForAddrWithSignatureFuncSig](
          account,
          'notthesamename.eth',
          inceptionDate,
          signature,
        ),
      ).to.be.revertedWith(`InvalidSignature()`)
    })

    it('reverts if inception date is too low', async () => {
      const funcId = ethers.utils
        .id(setNameForAddrWithSignatureFuncSig)
        .substring(0, 10)

      const block = await ethers.provider.getBlock('latest')
      const inceptionDate = block.timestamp
      const signature = await signers[0].signMessage(
        ethers.utils.arrayify(
          keccak256(
            ['bytes32', 'address', 'uint256', 'uint256'],
            [
              keccak256(['bytes4', 'string'], [funcId, 'hello.eth']),
              account,
              inceptionDate,
              coinType,
            ],
          ),
        ),
      )

      await DefaultReverseResolverWithAccount2['setNameForAddrWithSignature'](
        account,
        'hello.eth',
        inceptionDate,
        signature,
      )

      // const node = await DefaultReverseResolver.node(account)
      assert.equal(await DefaultReverseResolver.name(account), 'hello.eth')

      const inceptionDate2 = 0
      const signature2 = await signers[0].signMessage(
        ethers.utils.arrayify(
          keccak256(
            ['bytes32', 'address', 'uint256', 'uint256'],
            [
              keccak256(['bytes4', 'string'], [funcId, 'hello.eth']),
              account,
              inceptionDate2,
              coinType,
            ],
          ),
        ),
      )

      await expect(
        DefaultReverseResolverWithAccount2['setNameForAddrWithSignature'](
          account,
          'hello.eth',
          inceptionDate2,
          signature2,
        ),
      ).to.be.revertedWith(`SignatureOutOfDate()`)
    })
  })

  describe('setTextForAddrWithSignature', function () {
    it('allows an account to sign a message to allow a relayer to claim the address', async () => {
      const key = 'url'
      const value = 'http://ens.domains'

      const funcId = ethers.utils
        .id(setTextForAddrWithSignatureFuncSig)
        .substring(0, 10)

      const block = await ethers.provider.getBlock('latest')
      const inceptionDate = block.timestamp
      const signature = await signers[0].signMessage(
        ethers.utils.arrayify(
          keccak256(
            ['bytes32', 'address', 'uint256', 'uint256'],
            [
              keccak256(
                ['bytes4', 'string', 'string'],
                [funcId, 'url', 'http://ens.domains'],
              ),
              account,
              inceptionDate,
              coinType,
            ],
          ),
        ),
      )

      await DefaultReverseResolverWithAccount2['setTextForAddrWithSignature'](
        account,
        key,
        value,
        inceptionDate,
        signature,
      )

      // const node = await DefaultReverseResolver.node(account)
      assert.equal(await DefaultReverseResolver.text(account, key), value)
      const reverseName = `${account
        .substring(2)
        .toLowerCase()}.default.reverse`
      const encodedname = encodeName(reverseName)
      const calldata =
        DefaultReverseResolverFactory.interface.encodeFunctionData('text', [
          account,
          key,
        ])
      const result = await DefaultReverseResolverWithAccount2['resolve'](
        encodedname,
        calldata,
      )
      assert.equal(ethers.utils.toUtf8String(result), value)
    })
    it('reverts if signature parameters do not match', async () => {
      const funcId = ethers.utils
        .id(setTextForAddrWithSignatureFuncSig)
        .substring(0, 10)

      const block = await ethers.provider.getBlock('latest')
      const inceptionDate = block.timestamp
      const signature = await signers[0].signMessage(
        ethers.utils.arrayify(
          keccak256(
            ['bytes32', 'address', 'uint256'],
            [
              keccak256(
                ['bytes4', 'string', 'string'],
                [funcId, 'url', 'http://ens.domains'],
              ),
              account,
              inceptionDate,
            ],
          ),
        ),
      )

      await expect(
        DefaultReverseResolverWithAccount2[setTextForAddrWithSignatureFuncSig](
          account,
          'url',
          'http://some.other.url.com',
          inceptionDate,
          signature,
        ),
      ).to.be.revertedWith(`InvalidSignature()`)
    })

    it('reverts if inception date is too low', async () => {
      const funcId = ethers.utils
        .id(setTextForAddrWithSignatureFuncSig)
        .substring(0, 10)

      const block = await ethers.provider.getBlock('latest')
      const inceptionDate = block.timestamp
      const signature = await signers[0].signMessage(
        ethers.utils.arrayify(
          keccak256(
            ['bytes32', 'address', 'uint256', 'uint256'],
            [
              keccak256(
                ['bytes4', 'string', 'string'],
                [funcId, 'url', 'http://ens.domains'],
              ),
              account,
              inceptionDate,
              coinType,
            ],
          ),
        ),
      )

      await DefaultReverseResolverWithAccount2['setTextForAddrWithSignature'](
        account,
        'url',
        'http://ens.domains',
        inceptionDate,
        signature,
      )

      // const node = await DefaultReverseResolver.node(account)
      assert.equal(
        await DefaultReverseResolver.text(account, 'url'),
        'http://ens.domains',
      )

      const inceptionDate2 = 0
      const signature2 = await signers[0].signMessage(
        ethers.utils.arrayify(
          keccak256(
            ['bytes32', 'address', 'uint256', 'uint256'],
            [
              keccak256(
                ['bytes4', 'string', 'string'],
                [funcId, 'url', 'http://ens.domains'],
              ),
              account,
              inceptionDate2,
              coinType,
            ],
          ),
        ),
      )

      await expect(
        DefaultReverseResolverWithAccount2['setTextForAddrWithSignature'](
          account,
          'url',
          'http://ens.domains',
          inceptionDate2,
          signature2,
        ),
      ).to.be.revertedWith(`SignatureOutOfDate()`)
    })
  })

  describe('Clear records', function () {
    let name
    let key
    let value
    let inceptionDate
    let signature
    beforeEach(async () => {
      name = 'myname.eth'
      key = 'url'
      value = 'http://ens.domains'
      node = await DefaultReverseResolver.node(account)
      const block = await ethers.provider.getBlock('latest')
      inceptionDate = block.timestamp
    })

    it('clearRecordsWithSignature() clears records', async () => {
      await DefaultReverseResolverWithAccount2['setNameForAddrWithSignature'](
        account,
        name,
        inceptionDate,
        await makeSignature(
          signers[0],
          account,
          inceptionDate,
          ['bytes4', 'string'],
          [setNameForAddrWithSignatureFuncId, name],
        ),
      )
      inceptionDate = inceptionDate + 1
      signature = await makeSignature(
        signers[0],
        account,
        inceptionDate,
        ['bytes4', 'string', 'string'],
        [setTextForAddrWithSignatureFuncId, key, value],
      )
      await DefaultReverseResolverWithAccount2['setTextForAddrWithSignature'](
        account,
        key,
        value,
        inceptionDate,
        signature,
      )
      assert.equal(
        await DefaultReverseResolver.text(account, key),
        'http://ens.domains',
      )
      assert.equal(await DefaultReverseResolver.name(account), name)

      inceptionDate = inceptionDate + 1
      signature = await makeSignature(
        signers[0],
        account,
        inceptionDate,
        ['bytes4'],
        [clearRecordsWithSignatureFuncId],
      )
      await DefaultReverseResolverWithAccount2['clearRecordsWithSignature'](
        account,
        inceptionDate,
        signature,
      )

      assert.equal(await DefaultReverseResolver.text(account, 'url'), '')
      assert.equal(await DefaultReverseResolver.name(account), '')
    })

    it('clearRecordsWithSignature() reverts when signature expiry is too low', async () => {
      await DefaultReverseResolverWithAccount2['setNameForAddrWithSignature'](
        account,
        name,
        inceptionDate,
        await makeSignature(
          signers[0],
          account,
          inceptionDate,
          ['bytes4', 'string'],
          [setNameForAddrWithSignatureFuncId, name],
        ),
      )
      inceptionDate = inceptionDate + 1
      signature = await makeSignature(
        signers[0],
        account,
        inceptionDate,
        ['bytes4', 'string', 'string'],
        [setTextForAddrWithSignatureFuncId, key, value],
      )
      await DefaultReverseResolverWithAccount2['setTextForAddrWithSignature'](
        account,
        key,
        value,
        inceptionDate,
        signature,
      )

      assert.equal(await DefaultReverseResolver.text(account, key), value)
      assert.equal(await DefaultReverseResolver.name(account), name)

      inceptionDate = 0
      signature = await makeSignature(
        signers[0],
        account,
        inceptionDate,
        ['bytes4'],
        [clearRecordsWithSignatureFuncId],
      )
      await expect(
        DefaultReverseResolverWithAccount2['clearRecordsWithSignature'](
          account,
          inceptionDate,
          signature,
        ),
      ).to.be.revertedWith(`SignatureOutOfDate()`)
    })
  })
})
