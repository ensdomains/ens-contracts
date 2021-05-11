const ENS = artifacts.require('@ensdomains/ens/contracts/ENSRegistry.sol');
const ReverseRegistrar = artifacts.require('@ensdomains/ens/contracts/ReverseRegistrar.sol');
const PublicResolver = artifacts.require('PublicResolver.sol');
const ReverseResolver = artifacts.require('DefaultReverseResolver.sol');

const namehash = require('eth-ens-namehash');
const sha3 = require('web3-utils').sha3;

const { exceptions } = require('@ensdomains/test-utils');

contract('PublicResolver', function (accounts) {

    let node;
    let ens, resolver, reverseRegistrar;

    beforeEach(async () => {
        node = namehash.hash('eth');
        ens = await ENS.new();
        resolver = await PublicResolver.new(ens.address);
        reverseResolver = await DefaultReverseResolver.new(ens.address)
        await ens.setSubnodeOwner('0x0', sha3('eth'), accounts[0], {from: accounts[0]});
        await ens.setSubnodeOwner(namehash.hash('eth'), sha3('foo'), accounts[0], {from: accounts[0]});
        await ens.setSubnodeOwner(namehash.hash('eth'), sha3('bar'), accounts[1], {from: accounts[0]});
        await ens.setSubnodeOwner(namehash.hash('eth'), sha3('baz'), accounts[2], {from: accounts[0]});
        const fooOwner = await ens.owner(namehash.hash('foo.eth'))
        console.log(8, {fooOwner, resolverAddress:resolver.address})
        await ens.setResolver(namehash.hash('foo.eth'), resolver.address, {from: accounts[0]})
        await ens.setResolver(namehash.hash('bar.eth'), resolver.address, {from: accounts[1]})
        await ens.setResolver(namehash.hash('baz.eth'), resolver.address, {from: accounts[2]})
        console.log(9)
        await resolver.methods['setAddr(bytes32,address)'](namehash.hash('foo.eth'), accounts[0], {from: accounts[0]});
        console.log(10)
        const fooAddress = await resolver.addr(namehash.hash('foo.eth'))
        console.log(11, fooAddress)


        console.log(15, ens.address, resolver.address)
        reverseRegistrar = await ReverseRegistrar.new(ens.address, resolver.address);
        console.log(16)
        await ens.setSubnodeOwner('0x0', sha3('reverse'), accounts[0], {from: accounts[0]});
        console.log(16.1)
        await ens.setSubnodeOwner(namehash.hash('reverse'), sha3('addr'), reverseRegistrar.address, {from: accounts[0]});

    });

    describe('name', async () => {

        it.only('permits setting name by owner', async () => {
            console.log('hello')
            // assert.equal(await ens.owner(node), accounts[1]);
            // assert.equal(await ens.resolver(node), accounts[2]);

            // await resolver.setName(node, 'name1', {from: accounts[0]});
            // assert.equal(await resolver.name(node), 'name1');


            // await reverseRegistrar
            // .setName('hello.eth')
            // .send({ from: accounts[0], gas: 1000000 })
        });

    });

    // describe('multicall', async () => {
    //     it('allows setting multiple fields', async () => {
    //         var addrSet = resolver.contract.methods['setAddr(bytes32,address)'](node, accounts[1]).encodeABI();
    //         var textSet = resolver.contract.methods.setText(node, "url", "https://ethereum.org/").encodeABI();
    //         var tx = await resolver.multicall([addrSet, textSet], {from: accounts[0]});

    //         assert.equal(tx.logs.length, 3);
    //         assert.equal(tx.logs[0].event, "AddressChanged");
    //         assert.equal(tx.logs[0].args.node, node);
    //         assert.equal(tx.logs[0].args.newAddress, accounts[1].toLowerCase());
    //         assert.equal(tx.logs[1].event, "AddrChanged");
    //         assert.equal(tx.logs[1].args.node, node);
    //         assert.equal(tx.logs[1].args.a, accounts[1]);
    //         assert.equal(tx.logs[2].event, "TextChanged");
    //         assert.equal(tx.logs[2].args.node, node);
    //         assert.equal(tx.logs[2].args.key, "url");

    //         assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[1]);
    //         assert.equal(await resolver.text(node, "url"), "https://ethereum.org/");
    //     });

    //     it('allows reading multiple fields', async () => {
    //         await resolver.methods['setAddr(bytes32,address)'](node, accounts[1], {from: accounts[0]});
    //         await resolver.setText(node, "url", "https://ethereum.org/", {from: accounts[0]});
    //         var results = await resolver.multicall.call([
    //             resolver.contract.methods['addr(bytes32)'](node).encodeABI(),
    //             resolver.contract.methods.text(node, "url").encodeABI()
    //         ]);
    //         assert.equal(web3.eth.abi.decodeParameters(['address'], results[0])[0], accounts[1]);
    //         assert.equal(web3.eth.abi.decodeParameters(['string'], results[1])[0], "https://ethereum.org/");
    //     });
    // });
});
