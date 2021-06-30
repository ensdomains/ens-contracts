const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3
const PublicResolver = artifacts.require('./resolvers/PublicResolver.sol')
const ReverseRegistrar = artifacts.require('./registry/ReverseRegistrar.sol')
const ENS = artifacts.require('./registry/ENSRegistry.sol')
const NameWrapper = artifacts.require('DummyNameWrapper.sol')
const { exceptions } = require('../test-utils')

describe.only('ReverseRegistrar Tests', () => {
  contract('ReverseRegistar', function(accounts) {
    let node, node2, node3

    let registrar, resolver, ens, nameWrapper

    beforeEach(async () => {
      node = namehash.hash(accounts[0].slice(2).toLowerCase() + '.addr.reverse')
      node2 = namehash.hash(
        accounts[1].slice(2).toLowerCase() + '.addr.reverse'
      )
      node3 = namehash.hash(
        accounts[2].slice(2).toLowerCase() + '.addr.reverse'
      )
      ens = await ENS.new()
      nameWrapper = await NameWrapper.new()
      resolver = await PublicResolver.new(ens.address, nameWrapper.address)
      registrar = await ReverseRegistrar.new(ens.address, resolver.address)
      await registrar.setController(accounts[0], true)

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

    it('allows an account to claim its address', async () => {
      await registrar.claim(accounts[1], { from: accounts[0] })
      assert.equal(await ens.owner(node), accounts[1])
    })

    it('allows an account to specify resolver', async () => {
      await registrar.claimWithResolver(accounts[1], accounts[2], {
        from: accounts[0],
      })
      assert.equal(await ens.owner(node), accounts[1])
      assert.equal(await ens.resolver(node), accounts[2])
    })

    it('does not overwrite resolver if not specified', async () => {
      await registrar.claimWithResolver(accounts[1], accounts[2], {
        from: accounts[0],
      })
      await registrar.claim(accounts[3], { from: accounts[0] })

      assert.equal(await ens.owner(node), accounts[3])
      assert.equal(await ens.resolver(node), accounts[2])
    })

    it('sets name records', async () => {
      await registrar.setName('testname', { from: accounts[0], gas: 1000000 })
      assert.equal(await ens.resolver(node), resolver.address)
      assert.equal(await resolver.name(node), 'testname')
    })

    it('allows controller to set name records for other accounts', async () => {
      await registrar.setNameForAddr(accounts[1], 'testname', {
        from: accounts[0],
        gas: 1000000,
      })
      assert.equal(await ens.resolver(node2), resolver.address)
      assert.equal(await resolver.name(node2), 'testname')
    })

    it('forbids non-controller from calling setNameWithController', async () => {
      await exceptions.expectFailure(
        registrar.setNameForAddr(accounts[1], 'testname', {
          from: accounts[1],
          gas: 1000000,
        })
      )
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
