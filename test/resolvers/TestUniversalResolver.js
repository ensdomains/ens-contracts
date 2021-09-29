const ENS = artifacts.require('./registry/ENSRegistry.sol');
const PublicResolver = artifacts.require('PublicResolver.sol');
const UniversalResolver = artifacts.require('UniversalResolver.sol');
const NameWrapper = artifacts.require('DummyNameWrapper.sol');
const namehash = require('eth-ens-namehash');
const sha3 = require('web3-utils').sha3;

const { exceptions } = require("../test-utils");
const labels = ['node1', 'node2']
const nodes = labels.map(l => namehash.hash(`${l}.eth`))

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
        }
    });

    describe.only('multicall', async () => {
        it('allows reading multiple fields', async () => {
          const input = [
            resolver.contract.methods['addr(bytes32)'](nodes[0]).encodeABI(),
            resolver.contract.methods['addr(bytes32)'](nodes[1]).encodeABI()
          ]
          var results = await universal.multicall.call(input);
          console.log({labels, nodes, input, results})
          assert.equal(web3.eth.abi.decodeParameters(['address'], results[0])[0], accounts[0]);
          assert.equal(web3.eth.abi.decodeParameters(['address'], results[1])[0], accounts[1]);
        });
    });
});
