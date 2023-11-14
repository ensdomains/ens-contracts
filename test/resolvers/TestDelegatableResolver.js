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
  let resolver, operatorResolver
  let signers
  let deployer
  let owner, ownerSigner
  let operator, operatorSigner
  let operator2, operator2Signer
  let impl

  beforeEach(async () => {
    signers = await ethers.getSigners()
    deployer = await signers[0]
    ownerSigner = await signers[1]
    owner = await ownerSigner.getAddress()
    operatorSigner = await signers[2]
    operator = await operatorSigner.getAddress()
    operator2Signer = await signers[3]
    operator2 = await operator2Signer.getAddress()
    node = namehash('eth')
    encodedname = encodeName('eth')
    impl = await DelegatableResolver.new()
    factory = await DelegatableResolverFactory.new(impl.address)
    const tx = await factory.create(owner)
    const result = tx.logs[0].args.resolver
    resolver = await (await ethers.getContractFactory('DelegatableResolver'))
      .attach(result)
      .connect(ownerSigner)
    operatorResolver = await (
      await ethers.getContractFactory('DelegatableResolver')
    )
      .attach(result)
      .connect(operatorSigner)
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
      assert.equal(await resolver.supportsInterface('0x8295fc20'), true) // IDelegatable
    })

    it('does not support a random interface', async () => {
      assert.equal(await resolver.supportsInterface('0x3b3b57df'), false)
    })
  })

  describe('factory', async () => {
    it('predicts address', async () => {
      const tx = await factory.create(operator)
      const result = tx.logs[0].args.resolver
      assert.equal(await factory.predictAddress.call(operator), result)
    })

    it('emits an event', async () => {
      const tx = await factory.create(operator)
      const log = tx.logs[0]
      assert.equal(log.args.owner, operator)
    })

    it('does not allow duplicate contracts', async () => {
      await expect(factory.create(owner)).to.be.revertedWith('CreateFail')
    })
  })

  describe('addr', async () => {
    it('permits setting address by owner', async () => {
      await resolver.functions['setAddr(bytes32,address)'](node, operator)
      assert.equal(await resolver.functions['addr(bytes32)'](node), operator)
    })

    it('forbids setting new address by non-owners', async () => {
      await exceptions.expectFailure(
        operatorResolver.functions['setAddr(bytes32,address)'](node, operator),
      )
    })

    it('forbids approving wrong node', async () => {
      encodedname = encodeName('a.b.c.eth')
      const wrongnode = namehash('d.b.c.eth')
      await resolver.approve(encodedname, operator, true)
      await exceptions.expectFailure(
        operatorResolver.functions['setAddr(bytes32,address)'](
          wrongnode,
          operator,
        ),
      )
    })
  })

  describe('authorisations', async () => {
    it('owner is the owner', async () => {
      assert.equal(await resolver.owner(), owner)
    })

    it('owner is ahtorised to update any names', async () => {
      assert.equal(
        (await resolver.getAuthorisedNode(encodeName('a.b.c'), 0, owner))
          .authorized,
        true,
      )
      assert.equal(
        (await resolver.getAuthorisedNode(encodeName('x.y.z'), 0, owner))
          .authorized,
        true,
      )
    })

    it('approves multiple users', async () => {
      await resolver.approve(encodedname, operator, true)
      await resolver.approve(encodedname, operator2, true)
      const result = await resolver.getAuthorisedNode(encodedname, 0, operator)
      assert.equal(result.node, node)
      assert.equal(result.authorized, true)
      assert.equal(
        (await resolver.getAuthorisedNode(encodedname, 0, operator2))
          .authorized,
        true,
      )
    })

    it('approves subnames', async () => {
      const subname = 'a.b.c.eth'
      await resolver.approve(encodeName(subname), operator, true)
      await operatorResolver.functions['setAddr(bytes32,address)'](
        namehash(subname),
        operator,
      )
    })

    it('only approves the subname and not its parent', async () => {
      const subname = '1234.123'
      const parentname = 'b.c.eth'
      await resolver.approve(encodeName(subname), operator, true)
      const result = await resolver.getAuthorisedNode(
        encodeName(subname),
        0,
        operator,
      )
      assert.equal(result.node, namehash(subname))
      assert.equal(result.authorized, true)
      const result2 = await resolver.getAuthorisedNode(
        encodeName(parentname),
        0,
        operator,
      )
      assert.equal(result2.node, namehash(parentname))
      assert.equal(result2.authorized, false)
    })

    it('approves users to make changes', async () => {
      await resolver.approve(encodedname, operator, true)
      await operatorResolver.functions['setAddr(bytes32,address)'](
        node,
        operator,
      )
      console.log('resolver.functions', resolver.functions['addr(bytes32)'])
      assert.equal(await resolver.functions['addr(bytes32)'](node), operator)
    })

    it('approves to be revoked', async () => {
      await resolver.approve(encodedname, operator, true)
      operatorResolver.functions['setAddr(bytes32,address)'](node, operator2)
      await resolver.approve(encodedname, operator, false)
      await exceptions.expectFailure(
        operatorResolver.functions['setAddr(bytes32,address)'](node, operator2),
      )
    })

    it('does not allow non owner to approve', async () => {
      await expect(
        operatorResolver.approve(encodedname, operator, true),
      ).to.be.revertedWith('NotAuthorized')
    })

    it('emits an Approval log', async () => {
      var tx = await (
        await resolver.approve(encodedname, operator, true)
      ).wait()
      const event = tx.events[0]
      const args = event.args
      assert.equal(event.event, 'Approval')
      assert.equal(args.node, node)
      assert.equal(args.operator, operator)
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
      await registrar.register(encodedsubname, operator2)
      assert.equal(
        (await resolver.getAuthorisedNode(encodedsubname, 0, operator2))[1],
        true,
      )

      const operator2Resolver = await (
        await ethers.getContractFactory('DelegatableResolver')
      )
        .attach(resolver.address)
        .connect(operator2Signer)

      await operator2Resolver['setAddr(bytes32,address)'](
        encodedsubnode,
        operator2,
      )
      assert.equal(
        await operator2Resolver['addr(bytes32)'](encodedsubnode),
        operator2,
      )
    })
  })
})
