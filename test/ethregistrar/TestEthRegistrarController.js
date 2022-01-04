const {
  evm,
  exceptions,
  reverse: { getReverseNode },
  contracts: { deploy },
} = require('../test-utils')

const { expect } = require('chai')

const { ethers } = require('hardhat')
const provider = ethers.provider
const NameWrapperJSON = require('@ensdomains/name-wrapper/artifacts/contracts/NameWrapper.sol/NameWrapper.json')
const ReverseResolverJSON = require('../../artifacts/contracts/resolvers/DefaultReverseResolver.sol/DefaultReverseResolver.json')
const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3
const toBN = require('web3-utils').toBN

const DAYS = 24 * 60 * 60
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'
const EMPTY_BYTES =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

describe('ETHRegistrarController Tests', () => {
  contract('ETHRegistrarController', function() {
    let ens
    let resolver
    let resolver2 // resolver signed by accounts[1]
    let baseRegistrar
    let controller
    let controller2 // controller signed by accounts[1]
    let priceOracle
    let reverseRegistrar
    let nameWrapper

    const secret =
      '0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF'
    let ownerAccount // Account that owns the registrar
    let registrantAccount // Account that owns test names
    let accounts = []

    before(async () => {
      signers = await ethers.getSigners()
      ownerAccount = await signers[0].getAddress()
      registrantAccount = await signers[1].getAddress()
      accounts = [ownerAccount, registrantAccount, signers[2].getAddress()]

      ens = await deploy('ENSRegistry')

      baseRegistrar = await deploy(
        'BaseRegistrarImplementation',
        ens.address,
        namehash.hash('eth')
      )

      const signer = ethers.provider.getSigner()
      const factory = new ethers.ContractFactory(
        NameWrapperJSON.abi,
        NameWrapperJSON.bytecode,
        signers[0]
      )
      nameWrapper = await factory.deploy(
        ens.address,
        baseRegistrar.address,
        ownerAccount
      )

      reverseRegistrar = await deploy('ReverseRegistrar', ens.address)

      reverseResolver = new ethers.Contract(
        await reverseRegistrar.defaultResolver(),
        ReverseResolverJSON.abi,
        ethers.provider
      )

      await ens.setSubnodeOwner(EMPTY_BYTES, sha3('eth'), baseRegistrar.address)

      const dummyOracle = await deploy('DummyOracle', '100000000')
      priceOracle = await deploy('StablePriceOracle', dummyOracle.address, [1])
      controller = await deploy(
        'ETHRegistrarController',
        baseRegistrar.address,
        priceOracle.address,
        600,
        86400,
        reverseRegistrar.address,
        nameWrapper.address
      )

      controller2 = controller.connect(signers[1])
      await baseRegistrar.addController(controller.address)
      await nameWrapper.setController(controller.address, true)
      await baseRegistrar.addController(nameWrapper.address)
      await reverseRegistrar.setController(controller.address, true)
      await controller.setPriceOracle(priceOracle.address)

      resolver = await deploy(
        'PublicResolver',
        ens.address,
        nameWrapper.address,
        controller.address,
        reverseRegistrar.address
      )

      resolver2 = await resolver.connect(signers[1])

      await ens.setSubnodeOwner(EMPTY_BYTES, sha3('reverse'), accounts[0], {
        from: accounts[0],
      })
      await ens.setSubnodeOwner(
        namehash.hash('reverse'),
        sha3('addr'),
        reverseRegistrar.address,
        { from: accounts[0] }
      )
    })

    const checkLabels = {
      testing: true,
      longname12345678: true,
      sixsix: true,
      five5: true,
      four: true,
      iii: true,
      ii: false,
      i: false,
      '': false,

      // { ni } { hao } { ma } (chinese; simplified)
      你好吗: true,

      // { ta } { ko } (japanese; hiragana)
      たこ: false,

      // { poop } { poop } { poop } (emoji)
      '\ud83d\udca9\ud83d\udca9\ud83d\udca9': true,

      // { poop } { poop } (emoji)
      '\ud83d\udca9\ud83d\udca9': false,
    }

    it('should report label validity', async () => {
      for (const label in checkLabels) {
        assert.equal(await controller.valid(label), checkLabels[label], label)
      }
    })

    it('should report unused names as available', async () => {
      assert.equal(await controller.available(sha3('available')), true)
    })

    it('should permit new registrations', async () => {
      var commitment = await controller.makeCommitment(
        'newname',
        registrantAccount,
        secret,
        NULL_ADDRESS,
        [],
        false,
        0
      )
      var tx = await controller.commit(commitment)
      assert.equal(
        await controller.commitments(commitment),
        (await provider.getBlock(tx.blockNumber)).timestamp
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      var balanceBefore = await web3.eth.getBalance(controller.address)
      var tx = await controller.register(
        'newname',
        registrantAccount,
        secret,
        NULL_ADDRESS,
        [],
        false,
        0,
        { value: 28 * DAYS, gasPrice: 0 }
      )

      const block = await provider.getBlock(tx.blockNumber)

      await expect(tx)
        .to.emit(controller, 'NameRegistered')
        .withArgs(
          'newname',
          sha3('newname'),
          registrantAccount,
          28 * DAYS,
          0,
          block.timestamp + 28 * DAYS
        )

      assert.equal(
        (await web3.eth.getBalance(controller.address)) - balanceBefore,
        28 * DAYS
      )
    })

    it('should report registered names as unavailable', async () => {
      assert.equal(await controller.available('newname'), false)
    })

    it('should permit new registrations with resolver and records', async () => {
      var commitment = await controller.makeCommitment(
        'newconfigname',
        registrantAccount,
        secret,
        resolver.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            namehash.hash('newconfigname.eth'),
            registrantAccount,
          ]),
          resolver.interface.encodeFunctionData('setText', [
            namehash.hash('newconfigname.eth'),
            'url',
            'ethereum.com',
          ]),
        ],
        false,
        0
      )
      var tx = await controller.commit(commitment)
      assert.equal(
        await controller.commitments(commitment),
        (await web3.eth.getBlock(tx.blockNumber)).timestamp
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      var balanceBefore = await web3.eth.getBalance(controller.address)
      var tx = await controller.register(
        'newconfigname',
        registrantAccount,
        secret,
        resolver.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            namehash.hash('newconfigname.eth'),
            registrantAccount,
          ]),
          resolver.interface.encodeFunctionData('setText', [
            namehash.hash('newconfigname.eth'),
            'url',
            'ethereum.com',
          ]),
        ],
        false,
        0,
        { value: 28 * DAYS, gasPrice: 0 }
      )

      const block = await provider.getBlock(tx.blockNumber)

      await expect(tx)
        .to.emit(controller, 'NameRegistered')
        .withArgs(
          'newconfigname',
          sha3('newconfigname'),
          registrantAccount,
          28 * DAYS,
          0,
          block.timestamp + 28 * DAYS
        )

      assert.equal(
        (await web3.eth.getBalance(controller.address)) - balanceBefore,
        28 * DAYS
      )

      var nodehash = namehash.hash('newconfigname.eth')
      assert.equal(await ens.resolver(nodehash), resolver.address)
      assert.equal(await ens.owner(nodehash), nameWrapper.address)
      assert.equal(
        await baseRegistrar.ownerOf(sha3('newconfigname')),
        nameWrapper.address
      )
      assert.equal(await resolver['addr(bytes32)'](nodehash), registrantAccount)
      assert.equal(await resolver['text'](nodehash, 'url'), 'ethereum.com')
      assert.equal(await nameWrapper.ownerOf(nodehash), registrantAccount)
    })

    it('should not permit new registrations with records updating a different name', async () => {
      var commitment = await controller.makeCommitment(
        'awesome',
        registrantAccount,
        secret,
        resolver.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            namehash.hash('othername.eth'),
            registrantAccount,
          ]),
        ],
        false,
        0
      )
      var tx = await controller.commit(commitment)
      assert.equal(
        await controller.commitments(commitment),
        (await web3.eth.getBlock(tx.blockNumber)).timestamp
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      var balanceBefore = await web3.eth.getBalance(controller.address)

      await expect(
        controller.register(
          'awesome',
          registrantAccount,
          secret,
          resolver.address,
          [
            resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
              namehash.hash('othername.eth'),
              registrantAccount,
            ]),
          ],
          false,
          0,
          { value: 28 * DAYS, gasPrice: 0 }
        )
      ).to.be.revertedWith(
        'ETHRegistrarController: Namehash on record do not match the name being registered'
      )
    })

    it('should not permit new registrations with any record updating a different name', async () => {
      var commitment = await controller.makeCommitment(
        'awesome',
        registrantAccount,
        secret,
        resolver.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            namehash.hash('awesome.eth'),
            registrantAccount,
          ]),
          resolver.interface.encodeFunctionData(
            'setText(bytes32,string,string)',
            [namehash.hash('other.eth'), 'url', 'ethereum.com']
          ),
        ],
        false,
        0
      )
      var tx = await controller.commit(commitment)
      assert.equal(
        await controller.commitments(commitment),
        (await web3.eth.getBlock(tx.blockNumber)).timestamp
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      var balanceBefore = await web3.eth.getBalance(controller.address)

      await expect(
        controller.register(
          'awesome',
          registrantAccount,
          secret,
          resolver.address,
          [
            resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
              namehash.hash('awesome.eth'),
              registrantAccount,
            ]),
            resolver.interface.encodeFunctionData(
              'setText(bytes32,string,string)',
              [namehash.hash('other.eth'), 'url', 'ethereum.com']
            ),
          ],
          false,
          0,
          { value: 28 * DAYS + 1, gasPrice: 0 }
        )
      ).to.be.revertedWith(
        'ETHRegistrarController: Namehash on record do not match the name being registered'
      )
    })

    it('should permit a registration with resolver but no records', async () => {
      var commitment = await controller.makeCommitment(
        'newconfigname2',
        registrantAccount,
        secret,
        resolver.address,
        [],
        false,
        0
      )
      var tx = await controller.commit(commitment)
      assert.equal(
        await controller.commitments(commitment),
        (await web3.eth.getBlock(tx.blockNumber)).timestamp
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      var balanceBefore = await web3.eth.getBalance(controller.address)
      var tx = await controller.register(
        'newconfigname2',
        registrantAccount,
        secret,
        resolver.address,
        [],
        false,
        0,
        { value: 28 * DAYS, gasPrice: 0 }
      )

      const block = await provider.getBlock(tx.blockNumber)

      await expect(tx)
        .to.emit(controller, 'NameRegistered')
        .withArgs(
          'newconfigname2',
          sha3('newconfigname2'),
          registrantAccount,
          28 * DAYS,
          0,
          block.timestamp + 28 * DAYS
        )

      var nodehash = namehash.hash('newconfigname2.eth')
      assert.equal(await ens.resolver(nodehash), resolver.address)
      assert.equal(await resolver['addr(bytes32)'](nodehash), 0)
    })

    it('should include the owner in the commitment', async () => {
      await controller.commit(
        await controller.makeCommitment(
          'newname2',
          accounts[2],
          secret,
          NULL_ADDRESS,
          [],
          false,
          0
        )
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      var balanceBefore = await web3.eth.getBalance(controller.address)
      await exceptions.expectFailure(
        controller.register(
          'newname2',
          registrantAccount,
          secret,
          NULL_ADDRESS,
          [],
          false,
          0,
          {
            value: 28 * DAYS,
            gasPrice: 0,
          }
        )
      )
    })

    it('should reject duplicate registrations', async () => {
      await controller.commit(
        await controller.makeCommitment(
          'newname',
          registrantAccount,
          secret,
          NULL_ADDRESS,
          [],
          false,
          0
        )
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      var balanceBefore = await web3.eth.getBalance(controller.address)
      await exceptions.expectFailure(
        controller.register(
          'newname',
          registrantAccount,
          secret,
          NULL_ADDRESS,
          [],
          false,
          0,
          {
            value: 28 * DAYS,
            gasPrice: 0,
          }
        )
      )
    })

    it('should reject for expired commitments', async () => {
      await controller.commit(
        await controller.makeCommitment(
          'newname2',
          registrantAccount,
          secret,
          NULL_ADDRESS,
          [],
          false,
          0
        )
      )

      await evm.advanceTime(
        (await controller.maxCommitmentAge()).toNumber() + 1
      )
      var balanceBefore = await web3.eth.getBalance(controller.address)
      await exceptions.expectFailure(
        controller.register(
          'newname2',
          registrantAccount,
          secret,
          NULL_ADDRESS,
          [],
          false,
          0,
          {
            value: 28 * DAYS,
            gasPrice: 0,
          }
        )
      )
    })

    it('should allow anyone to renew a name', async () => {
      var expires = await baseRegistrar.nameExpires(sha3('newname'))
      var balanceBefore = await web3.eth.getBalance(controller.address)
      await controller.renew('newname', 86400, { value: 86400 + 1 })
      var newExpires = await baseRegistrar.nameExpires(sha3('newname'))
      assert.equal(newExpires.toNumber() - expires.toNumber(), 86400)
      assert.equal(
        (await web3.eth.getBalance(controller.address)) - balanceBefore,
        86400
      )
    })

    it('should require sufficient value for a renewal', async () => {
      await exceptions.expectFailure(controller.renew('name', 86400))
    })

    it('should allow the registrar owner to withdraw funds', async () => {
      await controller.withdraw({ gasPrice: 0, from: ownerAccount })
      assert.equal(await web3.eth.getBalance(controller.address), 0)
    })

    it('should set the reverse record of the account', async () => {
      const commitment = await controller.makeCommitment(
        'reverse',
        registrantAccount,
        secret,
        resolver.address,
        [],
        true,
        0
      )
      await controller.commit(commitment)

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await controller.register(
        'reverse',
        registrantAccount,
        secret,
        resolver.address,
        [],
        true,
        0,
        { value: 28 * DAYS + 1, gasPrice: 0 }
      )

      expect(await resolver.name(getReverseNode(ownerAccount))).to.equal(
        'reverse.eth'
      )
    })

    it('should auto wrap the name and set the ERC721 owner to the wrapper', async () => {
      const label = 'wrapper'
      const name = label + '.eth'
      const commitment = await controller.makeCommitment(
        label,
        registrantAccount,
        secret,
        resolver.address,
        [],
        true,
        0
      )
      await controller.commit(commitment)

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await controller.register(
        label,
        registrantAccount,
        secret,
        resolver.address,
        [],
        true,
        0,
        { value: 28 * DAYS + 1, gasPrice: 0 }
      )

      assert.equal(
        await nameWrapper.ownerOf(namehash.hash(name)),
        registrantAccount
      )

      assert.equal(await ens.owner(namehash.hash(name)), nameWrapper.address)
      assert.equal(
        await baseRegistrar.ownerOf(sha3(label)),
        nameWrapper.address
      )
    })

    it('should auto wrap the name and allow fuses to be set', async () => {
      const label = 'fuses'
      const name = label + '.eth'
      const commitment = await controller.makeCommitment(
        label,
        registrantAccount,
        secret,
        resolver.address,
        [],
        true,
        1
      )
      await controller.commit(commitment)

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await controller.register(
        label,
        registrantAccount,
        secret,
        resolver.address,
        [],
        true,
        1,
        { value: 28 * DAYS + 1, gasPrice: 0 }
      )

      const [, fuses] = await nameWrapper.getData(namehash.hash(name))
      assert.equal(fuses, 1)
    })

    it('approval should reduce gas for registration', async () => {
      const label = 'other'
      const name = label + '.eth'
      const node = namehash.hash(name)
      const commitment = await controller.makeCommitment(
        label,
        registrantAccount,
        secret,
        resolver.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            node,
            registrantAccount,
          ]),
        ],
        true,
        1
      )

      await controller.commit(commitment)

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())

      const gasA = await controller2.estimateGas.register(
        label,
        registrantAccount,
        secret,
        resolver.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            node,
            registrantAccount,
          ]),
        ],
        true,
        1,
        { value: 28 * DAYS + 1, gasPrice: 0 }
      )

      await resolver2.setApprovalForAll(controller.address, true)

      const gasB = await controller2.estimateGas.register(
        label,
        registrantAccount,
        secret,
        resolver2.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            node,
            registrantAccount,
          ]),
        ],
        true,
        1,
        { value: 28 * DAYS + 1, gasPrice: 0 }
      )

      const tx = await controller2.register(
        label,
        registrantAccount,
        secret,
        resolver2.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            node,
            registrantAccount,
          ]),
        ],
        true,
        1,
        { value: 28 * DAYS + 1, gasPrice: 0 }
      )

      console.log((await tx.wait()).gasUsed.toString())

      console.log(gasA.toString(), gasB.toString())

      expect(await nameWrapper.ownerOf(node)).to.equal(registrantAccount)
      expect(await ens.owner(namehash.hash(name))).to.equal(nameWrapper.address)
      expect(await baseRegistrar.ownerOf(sha3(label))).to.equal(
        nameWrapper.address
      )
      expect(await resolver2['addr(bytes32)'](node)).to.equal(registrantAccount)
    })
  })
})
