const ENS = artifacts.require('./registry/ENSRegistry.sol');
const PublicResolver = artifacts.require('PublicResolver.sol');
const NameWrapper = artifacts.require('DummyNameWrapper.sol');
const UniversalResolver = artifacts.require('UniversalResolver.sol');
const LegacyResolver = artifacts.require('LegacyResolver.sol');
const DummyOffchainResolver = artifacts.require('DummyOffchainResolver.sol');

const { expect } = require('chai');
const namehash = require('eth-ens-namehash');
const sha3 = require('web3-utils').sha3;
const ethers = require('ethers');
const { dns } = require("../test-utils");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

contract('UniversalResolver', function (accounts) {

    let ens, publicResolver, universalResolver, dummyOffchainResolver, nameWrapper;

    beforeEach(async () => {
        node = namehash.hash('eth');
        ens = await ENS.new();
        nameWrapper = await NameWrapper.new();
        publicResolver = await PublicResolver.new(ens.address, nameWrapper.address, ZERO_ADDRESS, ZERO_ADDRESS);
        universalResolver = await UniversalResolver.new(ens.address);
        dummyOffchainResolver = await DummyOffchainResolver.new();

        await ens.setSubnodeOwner('0x0', sha3('eth'), accounts[0], {from: accounts[0]});
        await ens.setSubnodeOwner(namehash.hash('eth'), sha3('test'), accounts[0], {from: accounts[0]});
        await ens.setResolver(namehash.hash('test.eth'), publicResolver.address, {from: accounts[0]});
        await ens.setSubnodeOwner(namehash.hash('test.eth'), sha3('sub'), accounts[0], {from: accounts[0]});
        await ens.setResolver(namehash.hash('sub.test.eth'), accounts[1], {from: accounts[0]});
        await publicResolver.methods["setAddr(bytes32,address)"](namehash.hash('test.eth'), accounts[1], {from: accounts[0]});
        await ens.setSubnodeOwner(namehash.hash('test.eth'), sha3('offchain'), accounts[0], {from: accounts[0]});
        await ens.setResolver(namehash.hash('offchain.test.eth'), dummyOffchainResolver.address, {from: accounts[0]})
    });

    describe('findResolver()', () => {
        it('should find an exact match resolver', async () => {
            const result = await universalResolver.findResolver(dns.hexEncodeName('test.eth'));
            expect(result).to.equal(publicResolver.address);
        });

        it('should find a resolver on a parent name', async () => {
            const result = await universalResolver.findResolver(dns.hexEncodeName('foo.test.eth'));
            expect(result).to.equal(publicResolver.address);
        });

        it('should choose the resolver closest to the leaf', async () => {
            const result = await universalResolver.findResolver(dns.hexEncodeName('sub.test.eth'));
            expect(result).to.equal(accounts[1]);
        });
    });

    describe('resolve()', () => {
        it('should resolve a record if `supportsInterface` throws', async () => {
            const legacyResolver = await LegacyResolver.new();
            await ens.setSubnodeOwner(namehash.hash('eth'), sha3('test2'), accounts[0], {from: accounts[0]});
            await ens.setResolver(namehash.hash('test2.eth'), legacyResolver.address, {from: accounts[0]});
            const data = (await legacyResolver.methods['addr(bytes32)'].request(namehash.hash('test.eth'))).data;
            const result = await universalResolver.resolve(dns.hexEncodeName('test2.eth'), data);
            const [ret] = ethers.utils.defaultAbiCoder.decode(["address"], result);
            expect(ret).to.equal(legacyResolver.address);
        });

        it('should resolve a record via legacy methods', async () => {
            const data = (await publicResolver.methods["addr(bytes32)"].request(namehash.hash('test.eth'))).data;
            const result = await universalResolver.resolve(dns.hexEncodeName('test.eth'), data);
            const [ret] = ethers.utils.defaultAbiCoder.decode(["address"], result);
            expect(ret).to.equal(accounts[1]);
        });

        it('should return a wrapped revert if the resolver reverts with OffchainData', async () => {
            const data = (await publicResolver.methods["addr(bytes32)"].request(namehash.hash('offchain.test.eth'))).data;
            // OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)
            // This is the extraData value the universal resolver should encode
            const extraData = ethers.utils.defaultAbiCoder.encode(
                [
                    'address',
                    'bytes4',
                    'bytes'
                ],
                [
                    dummyOffchainResolver.address,
                    ethers.utils.hexDataSlice(ethers.utils.id('resolveCallback(bytes,bytes)'), 0, 4),
                    data
                ]);
            await expect(universalResolver.resolve(dns.hexEncodeName('offchain.test.eth'), data)).to.be.revertedWith(
                'OffchainLookup(' +
                    `"${universalResolver.address}", ` +
                    '["https://example.com/"], ' +
                    `"${data}", ` +
                    '"0xb4a85801", ' +
                    `"${extraData}"` +
                ')');
        });
    });

    describe('resolveCallback()', () => {
        it('should handle callbacks by calling the original function', async () => {
            const data = (await publicResolver.methods["addr(bytes32)"].request(namehash.hash('offchain.test.eth'))).data;
            // This is the extraData value the universal resolver creates for a call to the dummyOffchainResolver with the above data.
            const extraData = ethers.utils.defaultAbiCoder.encode(['address', 'bytes4', 'bytes'], [dummyOffchainResolver.address, '0xb4a85801', data]);
            // The universalResolver passes the response (first argument) to the nested call, and DummyOffchainResolver expects it to be the same as the original calldata.
            const result = await universalResolver.resolveCallback(data, extraData);
            const [ret] = ethers.utils.defaultAbiCoder.decode(["address"], result);
            // The DummyOffchainResolver returns its own address as the result of all queries.
            expect(ret).to.equal(dummyOffchainResolver.address);
        });
    });
});
