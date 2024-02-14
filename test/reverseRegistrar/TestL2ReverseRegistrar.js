const { expect } = require('chai')
const { ethers } = require('hardhat')
const { namehash } = require('../test-utils/ens')

const keccak256 = ethers.utils.solidityKeccak256

describe('L2ReverseRegistrar', function () {
  let L2ReverseRegistrar
  let L2ReverseRegistrarWithAccount2
  let MockSmartContractWallet
  let MockOwnable
  let signers
  let account
  let account2
  let setNameForAddrWithSignatureFuncSig =
    'setNameForAddrWithSignature(address,string,uint256,bytes)'
  let setNameForAddrWithSignatureAndOwnableFuncSig =
    'setNameForAddrWithSignatureAndOwnable(address,address,string,uint256,bytes)'
  let setTextForAddrWithSignatureFuncSig =
    'setTextForAddrWithSignature(address,string,string,uint256,bytes)'
  let setTextForAddrWithSignatureAndOwnableFuncSig =
    'setTextForAddrWithSignatureAndOwnable(address,address,string,string,uint256,bytes)'
  let coinType = 123

  before(async function () {
    signers = await ethers.getSigners()
    account = await signers[0].getAddress()
    account2 = await signers[1].getAddress()

    const L2ReverseRegistrarFactory = await ethers.getContractFactory(
      'L2ReverseRegistrar',
    )
    L2ReverseRegistrar = await L2ReverseRegistrarFactory.deploy(
      namehash('optimism.reverse'),
      coinType,
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

  beforeEach(async () => {
    result = await ethers.provider.send('evm_snapshot')
  })
  afterEach(async () => {
    await ethers.provider.send('evm_revert', [result])
  })

  it('should deploy the contract', async function () {
    expect(L2ReverseRegistrar.address).to.not.equal(0)
  })

  describe('setName', () => {
    let name
    let node
    beforeEach(async () => {
      name = 'myname.eth'
      node = await L2ReverseRegistrar.node(
        await ethers.provider.getSigner().getAddress(),
      )
    })

    it('should set the name record for the calling account', async function () {
      const tx = await L2ReverseRegistrar.setName(name)
      await tx.wait()
      const actualName = await L2ReverseRegistrar.name(node)
      expect(actualName).to.equal(name)
    })

    it('event ReverseClaimed is emitted', async () => {
      await expect(L2ReverseRegistrar.setName(name))
        .to.emit(L2ReverseRegistrar, 'ReverseClaimed')
        .withArgs(account, node)
    })
  })

  describe('setNameForAddrWithSignature', () => {
    let name
    let node
    let inceptionDate
    let signature
    beforeEach(async () => {
      name = 'myname.eth'
      node = await L2ReverseRegistrar.node(account)
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
      await L2ReverseRegistrarWithAccount2['setNameForAddrWithSignature'](
        account,
        name,
        inceptionDate,
        signature,
      )
      assert.equal(await L2ReverseRegistrar.name(node), name)
    })

    it('event ReverseClaimed is emitted', async () => {
      await expect(
        L2ReverseRegistrarWithAccount2['setNameForAddrWithSignature'](
          account,
          name,
          inceptionDate,
          signature,
        ),
      )
        .to.emit(L2ReverseRegistrar, 'ReverseClaimed')
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
        L2ReverseRegistrarWithAccount2[setNameForAddrWithSignatureFuncSig](
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

      await L2ReverseRegistrarWithAccount2['setNameForAddrWithSignature'](
        account,
        'hello.eth',
        inceptionDate,
        signature,
      )

      const node = await L2ReverseRegistrar.node(account)
      assert.equal(await L2ReverseRegistrar.name(node), 'hello.eth')

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
        L2ReverseRegistrarWithAccount2['setNameForAddrWithSignature'](
          account,
          'hello.eth',
          inceptionDate2,
          signature2,
        ),
      ).to.be.revertedWith(`SignatureOutOfDate()`)
    })
  })

  describe('setNameForAddrWithSignatureAndOwnable', () => {
    let name
    let node
    let inceptionDate
    let signature
    beforeEach(async () => {
      name = 'ownable.eth'
      node = await L2ReverseRegistrar.node(MockOwnable.address)
      assert.equal(await L2ReverseRegistrar.name(node), '')
      const funcId = ethers.utils
        .id(setNameForAddrWithSignatureAndOwnableFuncSig)
        .substring(0, 10)

      const block = await ethers.provider.getBlock('latest')
      inceptionDate = block.timestamp
      signature = await signers[0].signMessage(
        ethers.utils.arrayify(
          keccak256(
            ['bytes32', 'address', 'address', 'uint256', 'uint256'],
            [
              keccak256(['bytes4', 'string'], [funcId, name]),
              MockOwnable.address,
              MockSmartContractWallet.address,
              inceptionDate,
              coinType,
            ],
          ),
        ),
      )
    })

    it('allows an account to sign a message to allow a relayer to claim the address of a contract that is owned by another contract that the account is a signer of', async () => {
      await L2ReverseRegistrarWithAccount2[
        'setNameForAddrWithSignatureAndOwnable'
      ](
        MockOwnable.address,
        MockSmartContractWallet.address,
        name,
        inceptionDate,
        signature,
      )

      assert.equal(await L2ReverseRegistrar.name(node), name)
    })
    it('event ReverseClaimed is emitted', async () => {
      await expect(
        L2ReverseRegistrarWithAccount2['setNameForAddrWithSignatureAndOwnable'](
          MockOwnable.address,
          MockSmartContractWallet.address,
          name,
          inceptionDate,
          signature,
        ),
      )
        .to.emit(L2ReverseRegistrar, 'ReverseClaimed')
        .withArgs(MockOwnable.address, node)
    })
  })

  describe('setText', () => {
    it('should set the text record for the calling account', async function () {
      const key = 'url;'
      const value = 'http://ens.domains'
      const tx = await L2ReverseRegistrar.setText(key, value)
      await tx.wait()

      const node = await L2ReverseRegistrar.node(
        await ethers.provider.getSigner().getAddress(),
      )
      const actualRecord = await L2ReverseRegistrar.text(node, key)
      expect(actualRecord).to.equal(value)
    })
  })

  describe('setTextForAddrWithSignature', function () {
    it('allows an account to sign a message to allow a relayer to claim the address', async () => {
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

      await L2ReverseRegistrarWithAccount2['setTextForAddrWithSignature'](
        account,
        'url',
        'http://ens.domains',
        inceptionDate,
        signature,
      )

      const node = await L2ReverseRegistrar.node(account)
      assert.equal(
        await L2ReverseRegistrar.text(node, 'url'),
        'http://ens.domains',
      )
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
        L2ReverseRegistrarWithAccount2[setTextForAddrWithSignatureFuncSig](
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

      await L2ReverseRegistrarWithAccount2['setTextForAddrWithSignature'](
        account,
        'url',
        'http://ens.domains',
        inceptionDate,
        signature,
      )

      const node = await L2ReverseRegistrar.node(account)
      assert.equal(
        await L2ReverseRegistrar.text(node, 'url'),
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
        L2ReverseRegistrarWithAccount2['setTextForAddrWithSignature'](
          account,
          'url',
          'http://ens.domains',
          inceptionDate2,
          signature2,
        ),
      ).to.be.revertedWith(`SignatureOutOfDate()`)
    })
  })

  describe('setTextForAddrWithSignatureAndOwnable', function () {
    it('allows an account to sign a message to allow a relayer to claim the address of a contract that is owned by another contract that the account is a signer of', async () => {
      const node = await L2ReverseRegistrar.node(MockOwnable.address)
      assert.equal(await L2ReverseRegistrar.text(node, 'url'), '')
      const funcId = ethers.utils
        .id(setTextForAddrWithSignatureAndOwnableFuncSig)
        .substring(0, 10)

      const block = await ethers.provider.getBlock('latest')
      const inceptionDate = block.timestamp
      const signature = await signers[0].signMessage(
        ethers.utils.arrayify(
          keccak256(
            ['bytes32', 'address', 'address', 'uint256', 'uint256'],
            [
              keccak256(
                ['bytes4', 'string', 'string'],
                [funcId, 'url', 'http://ens.domains'],
              ),
              MockOwnable.address,
              MockSmartContractWallet.address,
              inceptionDate,
              coinType,
            ],
          ),
        ),
      )

      await L2ReverseRegistrarWithAccount2[
        'setTextForAddrWithSignatureAndOwnable'
      ](
        MockOwnable.address,
        MockSmartContractWallet.address,
        'url',
        'http://ens.domains',
        inceptionDate,
        signature,
      )

      assert.equal(
        await L2ReverseRegistrar.text(node, 'url'),
        'http://ens.domains',
      )
    })
  })

  describe('Multicallable', function () {
    it('setText() + setName()', async () => {
      const node = await L2ReverseRegistrar.node(account)

      const calls = [
        L2ReverseRegistrar.interface.encodeFunctionData('setText', [
          'url',
          'http://multicall.xyz',
        ]),
        L2ReverseRegistrar.interface.encodeFunctionData('setName', [
          'hello.eth',
        ]),
      ]

      await L2ReverseRegistrar.multicall(calls)

      assert.equal(
        await L2ReverseRegistrar.text(node, 'url'),
        'http://multicall.xyz',
      )

      assert.equal(await L2ReverseRegistrar.name(node), 'hello.eth')
    })

    it('setTextForAddrWithSignature()', async () => {
      const node = await L2ReverseRegistrar.node(account)
      assert.equal(await L2ReverseRegistrar.text(node, 'randomKey'), '')
      const funcId1 = ethers.utils
        .id(setTextForAddrWithSignatureFuncSig)
        .substring(0, 10)

      const funcId2 = ethers.utils
        .id(setNameForAddrWithSignatureFuncSig)
        .substring(0, 10)

      const block = await ethers.provider.getBlock('latest')
      const inceptionDate = block.timestamp

      const signature1 = await signers[0].signMessage(
        ethers.utils.arrayify(
          keccak256(
            ['bytes32', 'address', 'uint256', 'uint256'],
            [
              keccak256(
                ['bytes4', 'string', 'string'],
                [funcId1, 'url', 'http://ens.domains'],
              ),
              account,
              inceptionDate,
              coinType,
            ],
          ),
        ),
      )

      const signature2 = await signers[0].signMessage(
        ethers.utils.arrayify(
          keccak256(
            ['bytes32', 'address', 'uint256', 'uint256'],
            [
              keccak256(['bytes4', 'string'], [funcId2, 'hello.eth']),
              account,
              inceptionDate + 1,
              coinType,
            ],
          ),
        ),
      )

      const calls = [
        L2ReverseRegistrar.interface.encodeFunctionData(
          'setTextForAddrWithSignature',
          [account, 'url', 'http://ens.domains', inceptionDate, signature1],
        ),
        L2ReverseRegistrar.interface.encodeFunctionData(
          'setNameForAddrWithSignature',
          [account, 'hello.eth', inceptionDate + 1, signature2],
        ),
      ]

      await L2ReverseRegistrar.multicall(calls)

      assert.equal(
        await L2ReverseRegistrar.text(node, 'url'),
        'http://ens.domains',
      )

      assert.equal(await L2ReverseRegistrar.name(node), 'hello.eth')
    })
  })
  describe('Clear records', function () {
    it('clearRecords() clears records', async () => {
      const node = await L2ReverseRegistrar.node(account)
      await L2ReverseRegistrar.setText('url', 'http://ens.domains')
      await L2ReverseRegistrar.setName('hello.eth')
      assert.equal(
        await L2ReverseRegistrar.text(node, 'url'),
        'http://ens.domains',
      )
      assert.equal(await L2ReverseRegistrar.name(node), 'hello.eth')
      await L2ReverseRegistrar.clearRecords(account)
      assert.equal(await L2ReverseRegistrar.text(node, 'url'), '')
      assert.equal(await L2ReverseRegistrar.name(node), '')
    })

    it('clearRecordsWithSignature() clears records', async () => {
      const node = await L2ReverseRegistrar.node(account)
      await L2ReverseRegistrar.setText('url', 'http://ens.domains')
      await L2ReverseRegistrar.setName('hello.eth')
      assert.equal(
        await L2ReverseRegistrar.text(node, 'url'),
        'http://ens.domains',
      )
      assert.equal(await L2ReverseRegistrar.name(node), 'hello.eth')

      const funcId = ethers.utils
        .id('clearRecordsWithSignature(address,uint256,bytes)')
        .substring(0, 10)

      const block = await ethers.provider.getBlock('latest')
      const inceptionDate = block.timestamp * 1000
      const signature = await signers[0].signMessage(
        ethers.utils.arrayify(
          keccak256(
            ['bytes32', 'address', 'uint256', 'uint256'],
            [keccak256(['bytes4'], [funcId]), account, inceptionDate, coinType],
          ),
        ),
      )

      await L2ReverseRegistrarWithAccount2['clearRecordsWithSignature'](
        account,
        inceptionDate,
        signature,
      )

      assert.equal(await L2ReverseRegistrar.text(node, 'url'), '')
      assert.equal(await L2ReverseRegistrar.name(node), '')
    })

    it('clearRecordsWithSignature() reverts when signature expiry is too low', async () => {
      const node = await L2ReverseRegistrar.node(account)
      await L2ReverseRegistrar.setText('url', 'http://ens.domains')
      await L2ReverseRegistrar.setName('hello.eth')
      assert.equal(
        await L2ReverseRegistrar.text(node, 'url'),
        'http://ens.domains',
      )
      assert.equal(await L2ReverseRegistrar.name(node), 'hello.eth')

      const funcId = ethers.utils
        .id('clearRecordsWithSignature(address,uint256,bytes)')
        .substring(0, 10)

      const inceptionDate = 0
      const signature = await signers[0].signMessage(
        ethers.utils.arrayify(
          keccak256(
            ['bytes32', 'address', 'uint256', 'uint256'],
            [keccak256(['bytes4'], [funcId]), account, inceptionDate, coinType],
          ),
        ),
      )

      await expect(
        L2ReverseRegistrarWithAccount2['clearRecordsWithSignature'](
          account,
          inceptionDate,
          signature,
        ),
      ).to.be.revertedWith(`SignatureOutOfDate()`)
    })
  })
})
