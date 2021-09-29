const ENS = artifacts.require('./registry/ENSRegistry.sol');
const PublicResolver = artifacts.require('PublicResolver.sol');
const UniversalResolver = artifacts.require('UniversalResolver.sol');
const NameWrapper = artifacts.require('DummyNameWrapper.sol');
const namehash = require('eth-ens-namehash');
const sha3 = require('web3-utils').sha3;
const ethers = require('ethers')
const { exceptions } = require("../test-utils");
const labels = ['node1', 'node2']
const url = "https://ethereum.org/"
const nodes = labels.map(l => namehash.hash(`${l}.eth`))
const iface = new ethers.utils.Interface(PublicResolver.abi);
contract('UniversalResolver', function (accounts) {
    let ens, resolver, nameWrapper;

    beforeEach(async () => {
        ethnode = namehash.hash('eth');
        ens = await ENS.new();
        nameWrapper = await NameWrapper.new();
        resolver = await PublicResolver.new(ens.address, nameWrapper.address);
        universal = await UniversalResolver.new(ens.address);
        await ens.setSubnodeOwner('0x0', sha3('eth'), accounts[0], {from: accounts[0]});
        for (let index = 0; index < labels.length; index++) {
          const label = labels[index];
          const node = nodes[index];
          const account = accounts[index]
          await ens.setSubnodeOwner(ethnode, sha3(label), accounts[0], {from: accounts[0]});
          await ens.setResolver(node, resolver.address, {from: accounts[0]})
          await resolver.methods['setAddr(bytes32,address)'](node, account, {from: accounts[0]})
          await resolver.setText(node, "url", url, {from: accounts[0]});
        }
    });
    describe('multicall', async () => {
      it('allows reading multiple fields', async () => {
        const input = [
          resolver.contract.methods['addr(bytes32)'](nodes[0]).encodeABI(),
          resolver.contract.methods['addr(bytes32)'](nodes[1]).encodeABI(),
          resolver.contract.methods.text(nodes[0], 'url').encodeABI(),
          resolver.contract.methods.text(nodes[1], 'url').encodeABI()
        ]
        var results = await universal.multicall.call(input);
        assert.equal(iface.decodeFunctionResult('addr(bytes32)', results[0])[0], accounts[0]);
        assert.equal(iface.decodeFunctionResult('addr(bytes32)', results[1])[0], accounts[1]);
        assert.equal(iface.decodeFunctionResult('text', results[2])[0], url);
        assert.equal(iface.decodeFunctionResult('text', results[3])[0], url);
      });

      it('returns null if resolver is not set', async () => {
        const input = [
          resolver.contract.methods['addr(bytes32)'](namehash.hash(`nodes3.eth`)).encodeABI(),
        ]
        var results = await universal.multicall.call(input);
        assert.equal(results[0], '0x')
      });

      it('returns null if value is not set', async () => {
        const input = [
          resolver.contract.methods.text(nodes[0], 'avatar').encodeABI(),
        ]
        var results = await universal.multicall.call(input);
        assert.equal(iface.decodeFunctionResult('text', results[0])[0], '');
      });

      it('throws an error if input is too short', async () =>{
        await exceptions.expectFailure(universal.multicall.call(['0x01']),'too short');
      })
    });

    describe('fallback', async () => {
      it('allows calling with same resolver interface', async () => {
        const fallbackResolver =  new web3.eth.Contract(PublicResolver.abi, universal.address)
        const result = await fallbackResolver.methods['addr(bytes32)'](nodes[0]).call()
        assert.equal(result, accounts[0])
      })
    })
  });
