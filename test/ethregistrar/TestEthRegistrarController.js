const ENS = artifacts.require('./registry/ENSRegistry')
const PublicResolver = artifacts.require('./resolvers/PublicResolver')
const BaseRegistrar = artifacts.require('./BaseRegistrarImplementation')
const ETHRegistrarController = artifacts.require('./ETHRegistrarController')
const DummyOracle = artifacts.require('./DummyOracle')
const StablePriceOracle = artifacts.require('./StablePriceOracle')
const ReverseRegistrar = artifacts.require('./registry/ReverseRegistrar.sol')
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
// const NameWrapper = artifacts.require(
//   '@ensdomains/name-wrapper/contracts/NameWrapper.sol'
// )
const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3
const toBN = require('web3-utils').toBN

const DAYS = 24 * 60 * 60
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'
const EMPTY_BYTES =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

describe.only('ETHRegistrarController Tests', () => {
  contract('ETHRegistrarController', function(accounts) {
    let ens
    let resolver
    let baseRegistrar
    let controller
    let priceOracle
    let reverseRegistrar
    let nameWrapper

    const secret =
      '0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF'
    const ownerAccount = accounts[0] // Account that owns the registrar
    const registrantAccount = accounts[1] // Account that owns test names

    before(async () => {
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
        signer
      )
      nameWrapper = await factory.deploy(
        ens.address,
        baseRegistrar.address,
        ownerAccount
      )

      resolver = await deploy(
        'PublicResolver',
        ens.address,
        nameWrapper.address
      )

      reverseRegistrar = await deploy(
        'ReverseRegistrar',
        ens.address,
        resolver.address
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
      await baseRegistrar.addController(controller.address)
      await nameWrapper.setController(controller.address, true)
      await baseRegistrar.addController(nameWrapper.address)
      await reverseRegistrar.setController(controller.address, true)
      await controller.setPriceOracle(priceOracle.address)

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
        secret
      )
      var tx = await controller.commit(commitment)
      console.log(tx)
      assert.equal(
        await controller.commitments(commitment),
        (await provider.getBlock(tx.blockNumber)).timestamp
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      var balanceBefore = await web3.eth.getBalance(controller.address)
      var tx = await controller.register(
        'newname',
        registrantAccount,
        28 * DAYS,
        secret,
        { value: 28 * DAYS + 1, gasPrice: 0 }
      )

      await expect(tx).to.emit(controller, 'NameRegistered')
      assert.equal(
        (await web3.eth.getBalance(controller.address)) - balanceBefore,
        28 * DAYS
      )
    })

    it('should report registered names as unavailable', async () => {
      assert.equal(await controller.available('newname'), false)
    })

    it('should permit new registrations with config', async () => {
      var commitment = await controller.makeCommitmentWithConfig(
        'newconfigname',
        registrantAccount,
        secret,
        resolver.address,
        registrantAccount
      )
      var tx = await controller.commit(commitment)
      assert.equal(
        await controller.commitments(commitment),
        (await web3.eth.getBlock(tx.blockNumber)).timestamp
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      var balanceBefore = await web3.eth.getBalance(controller.address)
      var tx = await controller.registerWithConfig(
        'newconfigname',
        registrantAccount,
        28 * DAYS,
        secret,
        resolver.address,
        registrantAccount,
        false,
        0,
        { value: 28 * DAYS + 1, gasPrice: 0 }
      )
      assert.equal(tx.logs.length, 1)
      assert.equal(tx.logs[0].event, 'NameRegistered')
      assert.equal(tx.logs[0].args.name, 'newconfigname')
      assert.equal(tx.logs[0].args.owner, registrantAccount)
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
      assert.equal(await nameWrapper.ownerOf(nodehash), registrantAccount)
    })

    it('should not allow a commitment with addr but not resolver', async () => {
      await exceptions.expectFailure(
        controller.makeCommitmentWithConfig(
          'newconfigname2',
          registrantAccount,
          secret,
          NULL_ADDRESS,
          registrantAccount
        )
      )
    })

    it('should permit a registration with resolver but not addr', async () => {
      var commitment = await controller.makeCommitmentWithConfig(
        'newconfigname2',
        registrantAccount,
        secret,
        resolver.address,
        NULL_ADDRESS
      )
      var tx = await controller.commit(commitment)
      assert.equal(
        await controller.commitments(commitment),
        (await web3.eth.getBlock(tx.blockNumber)).timestamp
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      var balanceBefore = await web3.eth.getBalance(controller.address)
      var tx = await controller.registerWithConfig(
        'newconfigname2',
        registrantAccount,
        28 * DAYS,
        secret,
        resolver.address,
        NULL_ADDRESS,
        false,
        0,
        { value: 28 * DAYS + 1, gasPrice: 0 }
      )
      assert.equal(tx.logs.length, 1)
      assert.equal(tx.logs[0].event, 'NameRegistered')
      assert.equal(tx.logs[0].args.name, 'newconfigname2')
      assert.equal(tx.logs[0].args.owner, registrantAccount)
      assert.equal(
        (await web3.eth.getBalance(controller.address)) - balanceBefore,
        28 * DAYS
      )

      var nodehash = namehash.hash('newconfigname2.eth')
      assert.equal(await ens.resolver(nodehash), resolver.address)
      assert.equal(await resolver['addr(bytes32)'](nodehash), 0)
    })

    it('should include the owner in the commitment', async () => {
      await controller.commit(
        await controller.makeCommitment('newname2', accounts[2], secret)
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      var balanceBefore = await web3.eth.getBalance(controller.address)
      await exceptions.expectFailure(
        controller.register('newname2', registrantAccount, 28 * DAYS, secret, {
          value: 28 * DAYS,
          gasPrice: 0,
        })
      )
    })

    it('should reject duplicate registrations', async () => {
      await controller.commit(
        await controller.makeCommitment('newname', registrantAccount, secret)
      )

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      var balanceBefore = await web3.eth.getBalance(controller.address)
      await exceptions.expectFailure(
        controller.register('newname', registrantAccount, 28 * DAYS, secret, {
          value: 28 * DAYS,
          gasPrice: 0,
        })
      )
    })

    it('should reject for expired commitments', async () => {
      await controller.commit(
        await controller.makeCommitment('newname2', registrantAccount, secret)
      )

      await evm.advanceTime(
        (await controller.maxCommitmentAge()).toNumber() + 1
      )
      var balanceBefore = await web3.eth.getBalance(controller.address)
      await exceptions.expectFailure(
        controller.register('newname2', registrantAccount, 28 * DAYS, secret, {
          value: 28 * DAYS,
          gasPrice: 0,
        })
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
      const commitment = await controller.makeCommitmentWithConfig(
        'reverse',
        registrantAccount,
        secret,
        resolver.address,
        NULL_ADDRESS
      )
      await controller.commit(commitment)

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await controller.registerWithConfig(
        'reverse',
        registrantAccount,
        28 * DAYS,
        secret,
        resolver.address,
        NULL_ADDRESS,
        true,
        0,
        { value: 28 * DAYS + 1, gasPrice: 0 }
      )

      const name = await resolver.name(getReverseNode(ownerAccount))
      assert.equal(name, 'reverse.eth')
    })

    it('should auto wrap the name and set the ERC721 owner to the wrapper', async () => {
      const label = 'wrapper'
      const name = label + '.eth'
      const commitment = await controller.makeCommitmentWithConfig(
        label,
        registrantAccount,
        secret,
        resolver.address,
        NULL_ADDRESS
      )
      await controller.commit(commitment)

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await controller.registerWithConfig(
        label,
        registrantAccount,
        28 * DAYS,
        secret,
        resolver.address,
        NULL_ADDRESS,
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
      const commitment = await controller.makeCommitmentWithConfig(
        label,
        registrantAccount,
        secret,
        resolver.address,
        NULL_ADDRESS
      )
      await controller.commit(commitment)

      await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
      await controller.registerWithConfig(
        label,
        registrantAccount,
        28 * DAYS,
        secret,
        resolver.address,
        NULL_ADDRESS,
        true,
        1,
        { value: 28 * DAYS + 1, gasPrice: 0 }
      )

      const [, fuses] = await nameWrapper.getData(namehash.hash(name))
      assert.equal(fuses, 1)
    })
  })
})
