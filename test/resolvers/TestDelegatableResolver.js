const DelegatableResolverFactory = artifacts.require(
  'DelegatableResolverFactory.sol',
)
const DelegatableResolver = artifacts.require('DelegatableResolver.sol')
const DelegatableResolverRegistrar = artifacts.require(
  'DelegatableResolverRegistrar.sol',
)
const { encodeName, namehash } = require('../test-utils/ens')
const { exceptions } = require('../test-utils')
const { expect } = require('chai')

contract('DelegatableResolver', function (accounts) {
  let node
  let encodedname
  let resolver, ownerResolver
  let signers
  let deployer
  let contractowner, contractownerSigner
  let owner, ownerSigner
  let owner2, owner2Signer
  let impl

  beforeEach(async () => {
    signers = await ethers.getSigners()
    deployer = await signers[0]
    contractownerSigner = await signers[1]
    contractowner = await contractownerSigner.getAddress()
    ownerSigner = await signers[2]
    owner = await ownerSigner.getAddress()
    owner2Signer = await signers[3]
    owner2 = await owner2Signer.getAddress()
    node = namehash('eth')
    encodedname = encodeName('eth')
    impl = await DelegatableResolver.new()
    factory = await DelegatableResolverFactory.new(impl.address)
    const tx = await factory.create(contractowner)
    const result = tx.logs[0].args.resolver
    resolver = await (await ethers.getContractFactory('DelegatableResolver'))
      .attach(result)
      .connect(contractownerSigner)
    ownerResolver = await (
      await ethers.getContractFactory('DelegatableResolver')
    )
      .attach(result)
      .connect(ownerSigner)
  })

  describe('supportsInterface function', async () => {
    it('supports known interfaces', async () => {
      assert.equal(await resolver.supportsInterface('0x3b3b57de'), true) // IAddrResolver
      assert.equal(await resolver.supportsInterface('0xf1cb7e06'), true) // IAddressResolver
      assert.equal(await resolver.supportsInterface('0x691f3431'), true) // INameResolver
      assert.equal(await resolver.supportsInterface('0x2203ab56'), true) // IABIResolver
      assert.equal(await resolver.supportsInterface('0xc8690233'), true) // IPubkeyResolver
      assert.equal(await resolver.supportsInterface('0x59d1d43c'), true) // ITextResolver
      assert.equal(await resolver.supportsInterface('0xbc1c58d1'), true) // IContentHashResolver
      assert.equal(await resolver.supportsInterface('0xa8fa5682'), true) // IDNSRecordResolver
      assert.equal(await resolver.supportsInterface('0x5c98042b'), true) // IDNSZoneResolver
      assert.equal(await resolver.supportsInterface('0x01ffc9a7'), true) // IInterfaceResolver
      assert.equal(await resolver.supportsInterface('0x4fbf0433'), true) // IMulticallable
      assert.equal(await resolver.supportsInterface('0x6fa8fe37'), true) // IDelegatable
    })

    it('does not support a random interface', async () => {
      assert.equal(await resolver.supportsInterface('0x3b3b57df'), false)
    })
  })

  describe('factory', async () => {
    it('predicts address', async () => {
      const tx = await factory.create(owner)
      const result = tx.logs[0].args.resolver
      assert.equal(await factory.predictAddress.call(owner), result)
    })

    it('emits an event', async () => {
      const tx = await factory.create(owner)
      const log = tx.logs[0]
      console.log(log)
      assert.equal(log.args.owner, owner)
    })

    it('does not allow duplicate contracts', async () => {
      await expect(factory.create(contractowner)).to.be.revertedWith(
        'CreateFail',
      )
    })
  })

  describe('addr', async () => {
    it('permits setting address by contractowner', async () => {
      await resolver.functions['setAddr(bytes32,address)'](node, owner)
      assert.equal(await resolver.functions['addr(bytes32)'](node), owner)
    })

    it('forbids setting new address by non-contractowners', async () => {
      await exceptions.expectFailure(
        ownerResolver.functions['setAddr(bytes32,address)'](node, owner),
      )
    })

    it('forbids approving wrong node', async () => {
      encodedname = encodeName('a.b.c.eth')
      const wrongnode = namehash('d.b.c.eth')
      await resolver.approve(encodedname, owner, true)
      await exceptions.expectFailure(
        ownerResolver.functions['setAddr(bytes32,address)'](wrongnode, owner),
      )
    })
  })

  describe('authorisations', async () => {
    it('contractowner is the contractowner', async () => {
      assert.equal(await resolver.contractowner(), contractowner)
    })

    it('contractowner is ahtorised to update any names', async () => {
      assert.equal(
        (
          await resolver.getAuthorisedNode(
            encodeName('a.b.c'),
            0,
            contractowner,
          )
        ).authorized,
        true,
      )
      assert.equal(
        (
          await resolver.getAuthorisedNode(
            encodeName('x.y.z'),
            0,
            contractowner,
          )
        ).authorized,
        true,
      )
    })

    it('approves multiple users', async () => {
      await resolver.approve(encodedname, owner, true)
      await resolver.approve(encodedname, owner2, true)
      const result = await resolver.getAuthorisedNode(encodedname, 0, owner)
      assert.equal(result.node, node)
      assert.equal(result.authorized, true)
      assert.equal(
        (await resolver.getAuthorisedNode(encodedname, 0, owner2)).authorized,
        true,
      )
    })

    it('approves subnames', async () => {
      const subname = 'a.b.c.eth'
      await resolver.approve(encodeName(subname), owner, true)
      await ownerResolver.functions['setAddr(bytes32,address)'](
        namehash(subname),
        owner,
      )
    })

    it('only approves the subname and not its parent', async () => {
      const subname = '1234.123'
      const parentname = 'b.c.eth'
      await resolver.approve(encodeName(subname), owner, true)
      const result = await resolver.getAuthorisedNode(
        encodeName(subname),
        0,
        owner,
      )
      assert.equal(result.node, namehash(subname))
      assert.equal(result.authorized, true)
      const result2 = await resolver.getAuthorisedNode(
        encodeName(parentname),
        0,
        owner,
      )
      assert.equal(result2.node, namehash(parentname))
      assert.equal(result2.authorized, false)
    })

    it('approves users to make changes', async () => {
      await resolver.approve(encodedname, owner, true)
      await ownerResolver.functions['setAddr(bytes32,address)'](node, owner)
      console.log('resolver.functions', resolver.functions['addr(bytes32)'])
      assert.equal(await resolver.functions['addr(bytes32)'](node), owner)
    })

    it('approves to be revoked', async () => {
      await resolver.approve(encodedname, owner, true)
      ownerResolver.functions['setAddr(bytes32,address)'](node, owner2)
      await resolver.approve(encodedname, owner, false)
      await exceptions.expectFailure(
        ownerResolver.functions['setAddr(bytes32,address)'](node, owner2),
      )
    })

    it('does not allow non contractowner to approve', async () => {
      await expect(
        ownerResolver.approve(encodedname, owner, true),
      ).to.be.revertedWith('NotAuthorized')
    })

    it('emits an Approval log', async () => {
      var tx = await (await resolver.approve(encodedname, owner, true)).wait()
      const event = tx.events[0]
      const args = event.args
      assert.equal(event.event, 'Approval')
      assert.equal(args.node, node)
      assert.equal(args.owner, owner)
      assert.equal(args.name, encodedname)
      assert.equal(args.approved, true)
    })
  })

  describe('registrar', async () => {
    it('approves multiple users', async () => {
      const basename = encodeName('')
      const name = `foo.bar.eth`
      const encodedsubname = encodeName(name)
      const encodedsubnode = namehash(name)

      const registrar = await DelegatableResolverRegistrar.new(resolver.address)
      await resolver.approve(basename, registrar.address, true)
      await registrar.register(encodedsubname, owner2)
      assert.equal(
        (await resolver.getAuthorisedNode(encodedsubname, 0, owner2))[1],
        true,
      )

      const owner2Resolver = await (
        await ethers.getContractFactory('DelegatableResolver')
      )
        .attach(resolver.address)
        .connect(owner2Signer)

      await owner2Resolver['setAddr(bytes32,address)'](encodedsubnode, owner2)
      assert.equal(
        await owner2Resolver['addr(bytes32)'](encodedsubnode),
        owner2,
      )
    })
  })
})
