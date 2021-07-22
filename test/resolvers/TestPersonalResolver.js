const ENS = artifacts.require('./registry/ENSRegistry.sol');
const PersonalResolver = artifacts.require('PersonalResolver.sol');
const PersonalResolverFactory = artifacts.require('PersonalResolverFactory.sol');

const namehash = require('eth-ens-namehash');
const sha3 = require('web3-utils').sha3;

const { shouldBehaveLikeAResolver } = require("./Resolver.behaviour");
const { exceptions } = require("../test-utils");

contract('PersonalResolver', function (accounts) {
    let ens, resolver, nameWrapper;
    const node = namehash.hash('eth');

    before(async () => {
        ens = await ENS.new();
        const factory = await PersonalResolverFactory.new();
        const implementation = await PersonalResolver.new(factory.address);
        const tx = await factory.create(implementation.address);
        console.log({deploy: tx.receipt.gasUsed});
        const resolverAddress = await factory.get(accounts[0]);
        resolver = await PersonalResolver.at(resolverAddress);
        await ens.setSubnodeOwner('0x0', sha3('eth'), accounts[0], {from: accounts[0]});
    });

    beforeEach(async () => {
        result = await ethers.provider.send('evm_snapshot');
    });

    afterEach(async () => {
        await ethers.provider.send('evm_revert', [result])
    });

    shouldBehaveLikeAResolver(() => ({ownerAccount: accounts[0], nonOwnerAccount: accounts[1], ens, resolver}));

    describe('authorisations', async () => {

        it('permits authorisations to be set', async () => {
            await resolver.setApprovalForAll(accounts[1], true, {from: accounts[0]});
            assert.equal(await resolver.isApprovedForAll(accounts[1]), true);
        });

        it('permits authorised users to make changes', async () => {
            await resolver.setApprovalForAll(accounts[1], true, {from: accounts[0]});
            assert.equal(await resolver.isApprovedForAll(accounts[1]), true);
            await resolver.methods['setAddr(bytes32,address)'](node, accounts[1], {from: accounts[1]});
            assert.equal(await resolver.addr(node), accounts[1]);
        });

        it('permits authorisations to be cleared', async () => {
            await resolver.setApprovalForAll(accounts[1], false, {from: accounts[0]});
            await exceptions.expectFailure(resolver.methods['setAddr(bytes32,address)'](node, accounts[0], {from: accounts[1]}));
        });

        it('only allows the owner to set authorisations', async () => {
            await exceptions.expectFailure(resolver.setApprovalForAll(accounts[2], true, {from: accounts[1]}));
        });

        it('emits an ApprovalForAll log', async () => {
            var owner = accounts[0]
            var operator = accounts[1]
            var tx = await resolver.setApprovalForAll(operator, true, {from: owner});
            assert.equal(tx.logs.length, 1);
            assert.equal(tx.logs[0].event, "ApprovalForAll");
            assert.equal(tx.logs[0].args.operator, operator);
            assert.equal(tx.logs[0].args.approved, true);
        });

        it('reverts if attempting to approve self as an operator', async () => {
            await expect(
                resolver.setApprovalForAll(accounts[0], true, {from: accounts[0]})
            ).to.be.revertedWith(
                'ERC1155: setting approval status for self',
            );
        });
    });
});
