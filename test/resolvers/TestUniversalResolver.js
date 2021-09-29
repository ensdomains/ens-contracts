const ENS = artifacts.require('./registry/ENSRegistry.sol');
const PublicResolver = artifacts.require('PublicResolver.sol');
const UniversalResolver = artifacts.require('UniversalResolver.sol');

const namehash = require('eth-ens-namehash');
const sha3 = require('web3-utils').sha3;

const { exceptions } = require("../test-utils");

contract('UniversalResolver', function (accounts) {

    let node;
    let ens, resolver, nameWrapper;

    beforeEach(async () => {
        node = namehash.hash('eth');
        ens = await ENS.new();
        nameWrapper = await NameWrapper.new();
        resolver = await PublicResolver.new(ens.address);
        await ens.setSubnodeOwner('0x0', sha3('eth'), accounts[0], {from: accounts[0]});
    });

    // describe('fallback function', async () => {

    //     it('forbids calls to the fallback function with 0 value', async () => {
    //         await exceptions.expectFailure(
    //             web3.eth.sendTransaction({
    //                 from: accounts[0],
    //                 to: resolver.address,
    //                 gas: 3000000
    //             })
    //         );
    //     });

    //     it('forbids calls to the fallback function with 1 value', async () => {
    //         await exceptions.expectFailure(
    //             web3.eth.sendTransaction({
    //                 from: accounts[0],
    //                 to: resolver.address,
    //                 gas: 3000000,
    //                 value: 1
    //             })
    //         );
    //     });
    // });

    describe('multicall', async () => {
        it('allows setting multiple fields', async () => {
            var addrSet = resolver.contract.methods['setAddr(bytes32,address)'](node, accounts[1]).encodeABI();
            var textSet = resolver.contract.methods.setText(node, "url", "https://ethereum.org/").encodeABI();
            var tx = await resolver.multicall([addrSet, textSet], {from: accounts[0]});

            assert.equal(tx.logs.length, 3);
            assert.equal(tx.logs[0].event, "AddressChanged");
            assert.equal(tx.logs[0].args.node, node);
            assert.equal(tx.logs[0].args.newAddress, accounts[1].toLowerCase());
            assert.equal(tx.logs[1].event, "AddrChanged");
            assert.equal(tx.logs[1].args.node, node);
            assert.equal(tx.logs[1].args.a, accounts[1]);
            assert.equal(tx.logs[2].event, "TextChanged");
            assert.equal(tx.logs[2].args.node, node);
            assert.equal(tx.logs[2].args.key, "url");

            assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[1]);
            assert.equal(await resolver.text(node, "url"), "https://ethereum.org/");
        });

        it('allows reading multiple fields', async () => {
            await resolver.methods['setAddr(bytes32,address)'](node, accounts[1], {from: accounts[0]});
            await resolver.setText(node, "url", "https://ethereum.org/", {from: accounts[0]});
            var results = await resolver.multicall.call([
                resolver.contract.methods['addr(bytes32)'](node).encodeABI(),
                resolver.contract.methods.text(node, "url").encodeABI()
            ]);
            assert.equal(web3.eth.abi.decodeParameters(['address'], results[0])[0], accounts[1]);
            assert.equal(web3.eth.abi.decodeParameters(['string'], results[1])[0], "https://ethereum.org/");
        });
    });
});
