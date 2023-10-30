const DelegatableResolver = artifacts.require('DelegatableResolver.sol')
const { encodeName, namehash } = require('../test-utils/ens')
const { exceptions } = require('../test-utils')
const { expect } = require('chai')

contract('DelegatableResolver', function (accounts) {
  let node
  let encodedname
  let resolver
  let signers
  let deployer
  let owner
  let operator
  let operator2

  beforeEach(async () => {
    signers = await ethers.getSigners()
    deployer = await signers[0].getAddress()
    owner = await signers[1].getAddress()
    operator = await signers[2].getAddress()
    operator2 = await signers[3].getAddress()
    node = namehash('eth')
    encodedname = encodeName('eth')
    resolver = await DelegatableResolver.new(owner)
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
      assert.equal(await resolver.supportsInterface('0xdd48591c'), true) // IDelegatable
    })

    it('does not support a random interface', async () => {
      assert.equal(await resolver.supportsInterface('0x3b3b57df'), false)
    })
  })

  describe('addr', async () => {
    it('permits setting address by owner', async () => {
      await resolver.methods['setAddr(bytes32,address)'](node, operator, {
        from: owner,
      })
      assert.equal(await resolver.methods['addr(bytes32)'](node), operator)
    })

    it('forbids setting new address by non-owners', async () => {
      await exceptions.expectFailure(
        resolver.methods['setAddr(bytes32,address)'](node, operator, {
          from: operator,
        }),
      )
    })

    it('forbids approving wrong node', async () => {
      encodedname = encodeName('a.b.c.eth')
      const wrongnode = namehash('d.b.c.eth')
      await resolver.approve(encodedname, operator, true, { from: owner })
      await exceptions.expectFailure(
        resolver.methods['setAddr(bytes32,address)'](wrongnode, operator, {
          from: operator,
        }),
      )
    })
  })

  describe('authorisations', async () => {
    it('owner is the owner', async () => {
      assert.equal(await resolver.owner(), owner)
    })

    it('owner is ahtorised to update any names', async () => {
      assert.equal(
        (await resolver.getAuthorizedNode(encodeName('a.b.c'), 0, owner))
          .authorized,
        true,
      )
      assert.equal(
        (await resolver.getAuthorizedNode(encodeName('x.y.z'), 0, owner))
          .authorized,
        true,
      )
    })

    it('approves multiple users', async () => {
      await resolver.approve(encodedname, operator, true, { from: owner })
      await resolver.approve(encodedname, operator2, true, { from: owner })
      const result = await resolver.getAuthorizedNode(encodedname, 0, operator)
      assert.equal(result.node, node)
      assert.equal(result.authorized, true)
      assert.equal(
        (await resolver.getAuthorizedNode(encodedname, 0, operator2))
          .authorized,
        true,
      )
    })

    it('approves subnames', async () => {
      const subname = 'a.b.c.eth'
      await resolver.approve(encodeName(subname), operator, true, {
        from: owner,
      })
      await resolver.methods['setAddr(bytes32,address)'](
        namehash(subname),
        operator,
        {
          from: operator,
        },
      )
    })

    it('only approves the subname and not its parent', async () => {
      const subname = '1234.123'
      const parentname = 'b.c.eth'
      await resolver.approve(encodeName(subname), operator, true, {
        from: owner,
      })
      const result = await resolver.getAuthorizedNode(
        encodeName(subname),
        0,
        operator,
      )
      assert.equal(result.node, namehash(subname))
      assert.equal(result.authorized, true)
      const result2 = await resolver.getAuthorizedNode(
        encodeName(parentname),
        0,
        operator,
      )
      assert.equal(result2.node, namehash(parentname))
      assert.equal(result2.authorized, false)
    })

    it('approves users to make changes', async () => {
      await resolver.approve(encodedname, operator, true, { from: owner })
      await resolver.methods['setAddr(bytes32,address)'](node, operator, {
        from: operator,
      })
      assert.equal(await resolver.addr(node), operator)
    })

    it('approves to be revoked', async () => {
      await resolver.approve(encodedname, operator, true, { from: owner })
      resolver.methods['setAddr(bytes32,address)'](node, operator2, {
        from: operator,
      }),
        await resolver.approve(encodedname, operator, false, { from: owner })
      await exceptions.expectFailure(
        resolver.methods['setAddr(bytes32,address)'](node, operator2, {
          from: operator,
        }),
      )
    })

    it('does not allow non owner to approve', async () => {
      await expect(
        resolver.approve(encodedname, operator, true, { from: operator }),
      ).to.be.revertedWith('NotAuthorized')
    })

    it('emits an Approval log', async () => {
      var tx = await resolver.approve(encodedname, operator, true, {
        from: owner,
      })
      assert.equal(tx.logs.length, 1)
      assert.equal(tx.logs[0].event, 'Approval')
      assert.equal(tx.logs[0].args.node, node)
      assert.equal(tx.logs[0].args.operator, operator)
      assert.equal(tx.logs[0].args.name, encodedname)
      assert.equal(tx.logs[0].args.approved, true)
    })
  })
})
