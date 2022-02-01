const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3
const PublicResolver = artifacts.require('./resolvers/PublicResolver.sol')
const ReverseRegistrar = artifacts.require('./registry/ReverseRegistrar.sol')
const ENS = artifacts.require('./registry/ENSRegistry.sol')
const NameWrapper = artifacts.require('DummyNameWrapper.sol')
const { exceptions } = require('../test-utils')

const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000'

function assertReverseClaimedEventEmitted(tx, addr, node) {
  assert.equal(tx.logs.length, 1)
  assert.equal(tx.logs[0].event, 'ReverseClaimed')
  assert.equal(tx.logs[0].args.addr, addr)
  assert.equal(tx.logs[0].args.node, node)
}

function getReverseNode(addr) {
  return namehash.hash(addr.slice(2).toLowerCase() + '.addr.reverse')
}

describe('ReverseRegistrar Tests', () => {
  contract('ReverseRegistar', function(accounts) {
    let node, node2, node3, dummyOwnableReverseNode

    let registrar, resolver, ens, nameWrapper, dummyOwnable

    beforeEach(async () => {
      node = getReverseNode(accounts[0])
      node2 = getReverseNode(accounts[1])
      node3 = getReverseNode(accounts[2])
      ens = await ENS.new()
      nameWrapper = await NameWrapper.new()
      resolver = await PublicResolver.new(ens.address, nameWrapper.address)
      registrar = await ReverseRegistrar.new(ens.address, resolver.address)
      dummyOwnable = await ReverseRegistrar.new(ens.address, resolver.address)
      dummyOwnableReverseNode = getReverseNode(dummyOwnable.address)

      await ens.setSubnodeOwner('0x0', sha3('reverse'), accounts[0], {
        from: accounts[0],
      })
      await ens.setSubnodeOwner(
        namehash.hash('reverse'),
        sha3('addr'),
        registrar.address,
        { from: accounts[0] }
      )
    })

    it('should calculate node hash correctly', async () => {
      assert.equal(await registrar.node.call(accounts[0]), node)
    })

    describe('claim', () => {
      it('allows an account to claim its address', async () => {
        await registrar.claim(accounts[1], { from: accounts[0] })
        assert.equal(await ens.owner(node), accounts[1])
      })

      it('event ReverseClaimed is emitted', async () => {
        const tx = await registrar.claim(accounts[1], { from: accounts[0] })
        assertReverseClaimedEventEmitted(tx, accounts[0], node)
      })
    })

    describe('claimForAddr', () => {
      it('allows an account to claim its address', async () => {
        await registrar.claimForAddr(accounts[0], accounts[1], {
          from: accounts[0],
        })
        assert.equal(await ens.owner(node), accounts[1])
      })

      it('event ReverseClaimed is emitted', async () => {
        const tx = await registrar.claimForAddr(accounts[0], accounts[1], {
          from: accounts[0],
        })
        assertReverseClaimedEventEmitted(tx, accounts[0], node)
      })

      it('forbids an account to claim another address', async () => {
        await exceptions.expectFailure(
          registrar.claimForAddr(accounts[1], accounts[0], {
            from: accounts[0],
          })
        )
      })

      it('allows an authorised account to claim a different address', async () => {
        await ens.setApprovalForAll(accounts[0], true, { from: accounts[1] })
        await registrar.claimForAddr(accounts[1], accounts[2], {
          from: accounts[0],
        })
        assert.equal(await ens.owner(node2), accounts[2])
      })

      it('allows a controller to claim a different address', async () => {
        await registrar.setController(accounts[0], true)
        await registrar.claimForAddr(accounts[1], accounts[2], {
          from: accounts[0],
        })
        assert.equal(await ens.owner(node2), accounts[2])
      })

      it('allows an owner() of a contract to claim the reverse node of that contract', async () => {
        await registrar.setController(accounts[0], true)
        await registrar.claimForAddr(dummyOwnable.address, accounts[0], {
          from: accounts[0],
        })
        assert.equal(await ens.owner(dummyOwnableReverseNode), accounts[0])
      })
    })

    describe('claimWithResolver', () => {
      it('allows an account to specify resolver', async () => {
        await registrar.claimWithResolver(accounts[1], accounts[2], {
          from: accounts[0],
        })
        assert.equal(await ens.owner(node), accounts[1])
        assert.equal(await ens.resolver(node), accounts[2])
      })

      it('event ReverseClaimed is emitted', async () => {
        const tx = await registrar.claimWithResolver(accounts[1], accounts[2], {
          from: accounts[0],
        })
        assertReverseClaimedEventEmitted(tx, accounts[0], node)
      })

      it('does not overwrite resolver if not specified', async () => {
        await registrar.claimWithResolver(accounts[1], accounts[2], {
          from: accounts[0],
        })
        await registrar.claim(accounts[3], { from: accounts[0] })

        assert.equal(await ens.owner(node), accounts[3])
        assert.equal(await ens.resolver(node), accounts[2])
      })
    })

    describe('claimWithResolverForAddr', () => {
      it('allows an account with the same address to specify resolver', async () => {
        await registrar.claimWithResolverForAddr(
          accounts[0],
          accounts[0],
          resolver.address,
          {
            from: accounts[0],
          }
        )
        assert.equal(await ens.owner(node), accounts[0])
        assert.equal(await ens.resolver(node), resolver.address)
      })

      it('event ReverseClaimed is emitted', async () => {
        const tx = await registrar.claimWithResolverForAddr(
          accounts[0],
          accounts[0],
          resolver.address,
          {
            from: accounts[0],
          }
        )
        assertReverseClaimedEventEmitted(tx, accounts[0], node)
      })

      it('allows an account authorised by the address to specify resolver', async () => {
        await ens.setApprovalForAll(accounts[1], true, { from: accounts[0] })
        await registrar.claimWithResolverForAddr(
          accounts[0],
          accounts[0],
          resolver.address,
          {
            from: accounts[1],
          }
        )
        assert.equal(await ens.owner(node), accounts[0])
        assert.equal(await ens.resolver(node), resolver.address)
      })

      it('allows a controller specify resolver', async () => {
        await registrar.setController(accounts[1], true)
        await registrar.claimWithResolverForAddr(
          accounts[0],
          accounts[0],
          resolver.address,
          {
            from: accounts[1],
          }
        )
        assert.equal(await ens.owner(node), accounts[0])
        assert.equal(await ens.resolver(node), resolver.address)
      })

      it('does not overwrite resolver if not specified', async () => {
        await registrar.claimWithResolverForAddr(
          accounts[0],
          accounts[0],
          resolver.address,
          {
            from: accounts[0],
          }
        )

        assert.equal(await ens.owner(node), accounts[0])
        assert.equal(await ens.resolver(node), resolver.address)

        await registrar.claimWithResolverForAddr(
          accounts[0],
          accounts[0],
          EMPTY_ADDRESS,
          {
            from: accounts[0],
          }
        )

        assert.equal(await ens.owner(node), accounts[0])
        assert.equal(await ens.resolver(node), resolver.address)
      })

      it('forbids an account with a different address', async () => {
        await exceptions.expectFailure(
          registrar.claimWithResolverForAddr(
            accounts[0],
            accounts[0],
            resolver.address,
            {
              from: accounts[1],
            }
          )
        )
      })

      it('allows an owner() of a contract to claimWithResolverForAddr on behalf of the contract', async () => {
        await registrar.claimWithResolverForAddr(
          dummyOwnable.address,
          accounts[0],
          resolver.address,
          {
            from: accounts[0],
          }
        )
        assert.equal(await ens.owner(dummyOwnableReverseNode), accounts[0])
        assert.equal(
          await ens.resolver(dummyOwnableReverseNode),
          resolver.address
        )
      })
    })

    describe('setName', () => {
      it('sets name records', async () => {
        await registrar.setName('testname', { from: accounts[0], gas: 1000000 })
        assert.equal(await ens.resolver(node), resolver.address)
        assert.equal(await resolver.name(node), 'testname')
      })

      it('event ReverseClaimed is emitted', async () => {
        const tx = await registrar.setName('testname', {
          from: accounts[0],
          gas: 1000000,
        })
        assertReverseClaimedEventEmitted(tx, accounts[0], node)
      })
    })

    describe('setNameForAddr', () => {
      it('allows controller to set name records for other accounts', async () => {
        await registrar.setController(accounts[0], true)
        await registrar.setNameForAddr(accounts[1], accounts[0], 'testname', {
          from: accounts[0],
          gas: 1000000,
        })
        assert.equal(await ens.resolver(node2), resolver.address)
        assert.equal(await resolver.name(node2), 'testname')
      })

      it('event ReverseClaimed is emitted', async () => {
        const tx = await registrar.setNameForAddr(
          accounts[0],
          accounts[0],
          'testname',
          {
            from: accounts[0],
            gas: 1000000,
          }
        )
        assertReverseClaimedEventEmitted(tx, accounts[0], node)
      })

      it('forbids non-controller if address is different from sender and not authorised', async () => {
        await exceptions.expectFailure(
          registrar.setNameForAddr(accounts[1], accounts[0], 'testname', {
            from: accounts[0],
            gas: 1000000,
          })
        )
      })

      it('allows name to be set for an address if the sender is the address', async () => {
        await registrar.setNameForAddr(accounts[0], accounts[0], 'testname', {
          from: accounts[0],
          gas: 1000000,
        })
        assert.equal(await ens.resolver(node), resolver.address)
        assert.equal(await resolver.name(node), 'testname')
      })

      it('allows name to be set for an address if the sender is authorised', async () => {
        ens.setApprovalForAll(accounts[1], true, { from: accounts[0] })
        await registrar.setNameForAddr(accounts[0], accounts[0], 'testname', {
          from: accounts[1],
          gas: 1000000,
        })
        assert.equal(await ens.resolver(node), resolver.address)
        assert.equal(await resolver.name(node), 'testname')
      })

      it('allows an owner() of a contract to claimWithResolverForAddr on behalf of the contract', async () => {
        await registrar.setNameForAddr(
          dummyOwnable.address,
          accounts[0],
          'dummyownable.eth',
          {
            from: accounts[0],
          }
        )
        assert.equal(await ens.owner(dummyOwnableReverseNode), accounts[0])
        assert.equal(
          await resolver.name(dummyOwnableReverseNode),
          'dummyownable.eth'
        )
      })
    })

    describe('setController', () => {
      it('forbid non-owner from setting a controller', async () => {
        await exceptions.expectFailure(
          registrar.setController(accounts[1], true, { from: accounts[1] })
        )
      })
    })

    // @todo this test does not work.
    // it('allows the owner to update the name', async () => {
    //     await registrar.claimWithResolver(accounts[1], resolver.address, {from: accounts[0]});
    //     await registrar.setName('testname', {from: accounts[1]});
    //     assert.equal(await resolver.name(node), 'testname');
    // });

    // @todo does not work because we shifted to a dummy resolver
    //    it('does not allow non-owners to update the name', async () => {
    //        await registrar.claimWithResolver(accounts[1], resolver, {from: accounts[0]});
    //
    //        try {
    //            await resolver.setName(node, 'testname', {from: accounts[0]})
    //        } catch (error) {
    //            return utils.ensureException(error);
    //        }
    //
    //        assert.fail('updating name did not fail');
    //    });
  })
})
