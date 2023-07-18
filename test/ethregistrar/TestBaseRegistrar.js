const ENS = artifacts.require('./registry/ENSRegistry')
const BaseRegistrar = artifacts.require(
  './registrar/BaseRegistrarImplementation',
)
const ETHRegistrarAdmin = artifacts.require('./registrar/ETHRegistrarAdmin')
const ETHRegistrarControllerProxy = artifacts.require(
  './registrar/ETHRegistrarControllerProxy',
)
const { expect } = require('chai')

const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3
const toBN = require('web3-utils').toBN

const { evm, exceptions } = require('../test-utils')

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const ZERO_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

contract('BaseRegistrar', function (accounts) {
  const ownerAccount = accounts[0]
  const controllerAccount = accounts[1]
  const registrantAccount = accounts[2]
  const otherAccount = accounts[3]

  let ens
  let registrar
  let admin
  let controllerProxy

  before(async () => {
    ens = await ENS.new()

    // Deploy the registrar
    registrar = await BaseRegistrar.new(ens.address, namehash.hash('eth'), {
      from: ownerAccount,
    })

    // Deploy the admin contract and transfer ownership to it
    admin = await ETHRegistrarAdmin.new(registrar.address)
    await registrar.transferOwnership(admin.address)

    // Create a new proxy for the controller
    await admin.addController(controllerAccount, { from: ownerAccount })
    controllerProxy = await ETHRegistrarControllerProxy.at(
      await admin.getProxyAddress(controllerAccount),
    )

    // Set the registrar as owner of .eth
    await ens.setSubnodeOwner('0x0', sha3('eth'), registrar.address)
  })

  it('should allow new registrations', async () => {
    var tx = await controllerProxy.register(
      sha3('newname'),
      registrantAccount,
      86400,
      { from: controllerAccount },
    )
    var block = await web3.eth.getBlock(tx.receipt.blockHash)
    assert.equal(
      await ens.owner(namehash.hash('newname.eth')),
      registrantAccount,
    )
    assert.equal(await registrar.ownerOf(sha3('newname')), registrantAccount)
    assert.equal(
      (await registrar.nameExpires(sha3('newname'))).toNumber(),
      block.timestamp + 86400,
    )
  })

  it('should allow registrations without updating the registry', async () => {
    var tx = await controllerProxy.registerOnly(
      sha3('silentname'),
      registrantAccount,
      86400,
      { from: controllerAccount },
    )
    var block = await web3.eth.getBlock(tx.receipt.blockHash)
    assert.equal(await ens.owner(namehash.hash('silentname.eth')), ZERO_ADDRESS)
    assert.equal(await registrar.ownerOf(sha3('silentname')), registrantAccount)
    assert.equal(
      (await registrar.nameExpires(sha3('silentname'))).toNumber(),
      block.timestamp + 86400,
    )
  })

  it('should allow renewals', async () => {
    var oldExpires = await registrar.nameExpires(sha3('newname'))
    await controllerProxy.renew(sha3('newname'), 86400, {
      from: controllerAccount,
    })
    assert.equal(
      (await registrar.nameExpires(sha3('newname'))).toNumber(),
      oldExpires.add(toBN(86400)).toNumber(),
    )
  })

  it('should only allow the controller to register', async () => {
    await exceptions.expectFailure(
      controllerProxy.register(sha3('foo'), otherAccount, 86400, {
        from: otherAccount,
      }),
    )
  })

  it('should only allow the controller to renew', async () => {
    await exceptions.expectFailure(
      controllerProxy.renew(sha3('newname'), 86400, { from: otherAccount }),
    )
  })

  it('should not permit registration of already registered names', async () => {
    await exceptions.expectFailure(
      controllerProxy.register(sha3('newname'), otherAccount, 86400, {
        from: controllerAccount,
      }),
    )
    assert.equal(await registrar.ownerOf(sha3('newname')), registrantAccount)
  })

  it('should not permit renewing a name that is not registered', async () => {
    await exceptions.expectFailure(
      controllerProxy.renew(sha3('name3'), 86400, { from: controllerAccount }),
    )
  })

  it('should permit the owner to reclaim a name', async () => {
    await ens.setSubnodeOwner(ZERO_HASH, sha3('eth'), accounts[0])
    await ens.setSubnodeOwner(
      namehash.hash('eth'),
      sha3('newname'),
      ZERO_ADDRESS,
    )
    assert.equal(await ens.owner(namehash.hash('newname.eth')), ZERO_ADDRESS)
    await ens.setSubnodeOwner(ZERO_HASH, sha3('eth'), registrar.address)
    await registrar.reclaim(sha3('newname'), registrantAccount, {
      from: registrantAccount,
    })
    assert.equal(
      await ens.owner(namehash.hash('newname.eth')),
      registrantAccount,
    )
  })

  it('should prohibit anyone else from reclaiming a name', async () => {
    await exceptions.expectFailure(
      registrar.reclaim(sha3('newname'), registrantAccount, {
        from: otherAccount,
      }),
    )
  })

  it('should permit the owner to transfer a registration', async () => {
    await registrar.transferFrom(
      registrantAccount,
      otherAccount,
      sha3('newname'),
      { from: registrantAccount },
    )
    assert.equal(await registrar.ownerOf(sha3('newname')), otherAccount)
    // Transfer does not update ENS without a call to reclaim.
    assert.equal(
      await ens.owner(namehash.hash('newname.eth')),
      registrantAccount,
    )
    await registrar.transferFrom(
      otherAccount,
      registrantAccount,
      sha3('newname'),
      { from: otherAccount },
    )
  })

  it('should prohibit anyone else from transferring a registration', async () => {
    await exceptions.expectFailure(
      registrar.transferFrom(otherAccount, otherAccount, sha3('newname'), {
        from: otherAccount,
      }),
    )
  })

  it('should not permit transfer or reclaim during the grace period', async () => {
    // Advance to the grace period
    var ts = (await web3.eth.getBlock('latest')).timestamp
    await evm.advanceTime(
      (await registrar.nameExpires(sha3('newname'))).toNumber() - ts + 3600,
    )
    await evm.mine()
    await exceptions.expectFailure(
      registrar.transferFrom(registrantAccount, otherAccount, sha3('newname'), {
        from: registrantAccount,
      }),
    )
    await exceptions.expectFailure(
      registrar.reclaim(sha3('newname'), registrantAccount, {
        from: registrantAccount,
      }),
    )
  })

  it('should allow renewal during the grace period', async () => {
    await controllerProxy.renew(sha3('newname'), 86400, {
      from: controllerAccount,
    })
  })

  it('should allow registration of an expired domain', async () => {
    var ts = (await web3.eth.getBlock('latest')).timestamp
    var expires = await registrar.nameExpires(sha3('newname'))
    var grace = await registrar.GRACE_PERIOD()
    await evm.advanceTime(expires.toNumber() - ts + grace.toNumber() + 3600)
    await evm.mine()

    await expect(registrar.ownerOf(sha3('newname'))).to.be.reverted

    await controllerProxy.register(sha3('newname'), otherAccount, 86400, {
      from: controllerAccount,
    })
    assert.equal(await registrar.ownerOf(sha3('newname')), otherAccount)
  })

  it('should allow the owner to set a resolver address', async () => {
    await admin.setResolver(accounts[1], { from: ownerAccount })
    assert.equal(await ens.resolver(namehash.hash('eth')), accounts[1])
  })

  it('should not allow renewals of longer than 365000000 days', async () => {
    await expect(
      controllerProxy.renew(sha3('newname'), 365000000 * 86400 + 1, {
        from: controllerAccount,
      }),
    ).to.be.reverted
  })
})
