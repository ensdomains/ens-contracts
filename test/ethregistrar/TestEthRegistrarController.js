const ENS = artifacts.require('./registry/ENSRegistry');
const PublicResolver = artifacts.require('./resolvers/PublicResolver');
const BaseRegistrar = artifacts.require('./BaseRegistrarImplementation');
const ETHRegistrarController = artifacts.require('./ETHRegistrarController');
const DummyOracle = artifacts.require('./DummyOracle');
const StablePriceOracle = artifacts.require('./StablePriceOracle');
const { evm, exceptions } = require("../test-utils");
const NameWrapper = artifacts.require('DummyNameWrapper.sol');
const namehash = require('eth-ens-namehash');
const sha3 = require('web3-utils').sha3;
const toBN = require('web3-utils').toBN;

const DAYS = 24 * 60 * 60;
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000"

contract('ETHRegistrarController', function (accounts) {
    let ens;
    let resolver;
    let baseRegistrar;
    let controller;
    let priceOracle;
    let nameWrapper;

    const secret = "0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF";
    const ownerAccount = accounts[0]; // Account that owns the registrar
    const registrantAccount = accounts[1]; // Account that owns test names

    before(async () => {
        ens = await ENS.new();
        nameWrapper = await NameWrapper.new();
        resolver = await PublicResolver.new(ens.address, nameWrapper.address);

        baseRegistrar = await BaseRegistrar.new(ens.address, namehash.hash('eth'), {from: ownerAccount});
        await ens.setSubnodeOwner('0x0', sha3('eth'), baseRegistrar.address);

        const dummyOracle = await DummyOracle.new(toBN(100000000));
        priceOracle = await StablePriceOracle.new(dummyOracle.address, [1]);
        controller = await ETHRegistrarController.new(
            baseRegistrar.address,
            priceOracle.address,
            600,
            86400,
            {from: ownerAccount});
        await baseRegistrar.addController(controller.address, {from: ownerAccount});
        await controller.setPriceOracle(priceOracle.address, {from: ownerAccount});
    });

    const checkLabels = {
        "testing": true,
        "longname12345678": true,
        "sixsix": true,
        "five5": true,
        "four": true,
        "iii": true,
        "ii": false,
        "i": false,
        "": false,

        // { ni } { hao } { ma } (chinese; simplified)
        "\u4f60\u597d\u5417": true,

        // { ta } { ko } (japanese; hiragana)
        "\u305f\u3053": false,

        // { poop } { poop } { poop } (emoji)
        "\ud83d\udca9\ud83d\udca9\ud83d\udca9": true,

        // { poop } { poop } (emoji)
        "\ud83d\udca9\ud83d\udca9": false
    };

    it('should report label validity', async () => {
        for (const label in checkLabels) {
            assert.equal(await controller.valid(label), checkLabels[label], label);
        }
    });

    it('should report unused names as available', async () => {
        assert.equal(await controller.available(sha3('available')), true);
    });

    it('should permit new registrations', async () => {
        var commitment = await controller.makeCommitment("newname", registrantAccount, secret);
        var tx = await controller.commit(commitment);
        assert.equal(await controller.commitments(commitment), (await web3.eth.getBlock(tx.receipt.blockNumber)).timestamp);

        await evm.advanceTime((await controller.minCommitmentAge()).toNumber());
        var balanceBefore = await web3.eth.getBalance(controller.address);
        var tx = await controller.register("newname", registrantAccount, 28 * DAYS, secret, {value: 28 * DAYS + 1});
        assert.equal(tx.logs.length, 1);
        assert.equal(tx.logs[0].event, "NameRegistered");
        assert.equal(tx.logs[0].args.name, "newname");
        assert.equal(tx.logs[0].args.owner, registrantAccount);
        assert.equal((await web3.eth.getBalance(controller.address)) - balanceBefore, 28 * DAYS);
    });

    it('should report registered names as unavailable', async () => {
        assert.equal(await controller.available('newname'), false);
    });

    it('should permit new registrations with config', async () => {
        var commitment = await controller.makeCommitmentWithConfig("newconfigname", registrantAccount, secret, resolver.address, registrantAccount);
        var tx = await controller.commit(commitment);
        assert.equal(await controller.commitments(commitment), (await web3.eth.getBlock(tx.receipt.blockNumber)).timestamp);

        await evm.advanceTime((await controller.minCommitmentAge()).toNumber());
        var balanceBefore = await web3.eth.getBalance(controller.address);
        var tx = await controller.registerWithConfig("newconfigname", registrantAccount, 28 * DAYS, secret, resolver.address, registrantAccount, {value: 28 * DAYS + 1});
        assert.equal(tx.logs.length, 1);
        assert.equal(tx.logs[0].event, "NameRegistered");
        assert.equal(tx.logs[0].args.name, "newconfigname");
        assert.equal(tx.logs[0].args.owner, registrantAccount);
        assert.equal((await web3.eth.getBalance(controller.address)) - balanceBefore, 28 * DAYS);

        var nodehash = namehash.hash("newconfigname.eth");
        assert.equal((await ens.resolver(nodehash)), resolver.address);
        assert.equal((await ens.owner(nodehash)), registrantAccount);
        assert.equal((await resolver.addr(nodehash)), registrantAccount);
    });

    it('should not allow a commitment with addr but not resolver', async () => {
        await exceptions.expectFailure(controller.makeCommitmentWithConfig("newconfigname2", registrantAccount, secret, NULL_ADDRESS, registrantAccount));
    });

    it('should permit a registration with resolver but not addr', async () => {
        var commitment = await controller.makeCommitmentWithConfig("newconfigname2", registrantAccount, secret, resolver.address, NULL_ADDRESS);
        var tx = await controller.commit(commitment);
        assert.equal(await controller.commitments(commitment), (await web3.eth.getBlock(tx.receipt.blockNumber)).timestamp);

        await evm.advanceTime((await controller.minCommitmentAge()).toNumber());
        var balanceBefore = await web3.eth.getBalance(controller.address);
        var tx = await controller.registerWithConfig("newconfigname2", registrantAccount, 28 * DAYS, secret, resolver.address, NULL_ADDRESS, {value: 28 * DAYS + 1});
        assert.equal(tx.logs.length, 1);
        assert.equal(tx.logs[0].event, "NameRegistered");
        assert.equal(tx.logs[0].args.name, "newconfigname2");
        assert.equal(tx.logs[0].args.owner, registrantAccount);
        assert.equal((await web3.eth.getBalance(controller.address)) - balanceBefore, 28 * DAYS);

        var nodehash = namehash.hash("newconfigname2.eth");
        assert.equal((await ens.resolver(nodehash)), resolver.address);
        assert.equal((await resolver.addr(nodehash)), 0);
    });

    it('should include the owner in the commitment', async () => {
        await controller.commit(await controller.makeCommitment("newname2", accounts[2], secret));

        await evm.advanceTime((await controller.minCommitmentAge()).toNumber());
        var balanceBefore = await web3.eth.getBalance(controller.address);
        await exceptions.expectFailure(controller.register("newname2", registrantAccount, 28 * DAYS, secret, {value: 28 * DAYS}));
    });

    it('should reject duplicate registrations', async () => {
        await controller.commit(await controller.makeCommitment("newname", registrantAccount, secret));

        await evm.advanceTime((await controller.minCommitmentAge()).toNumber());
        var balanceBefore = await web3.eth.getBalance(controller.address);
        await exceptions.expectFailure(controller.register("newname", registrantAccount, 28 * DAYS, secret, {value: 28 * DAYS}));
    });

    it('should reject for expired commitments', async () => {
        await controller.commit(await controller.makeCommitment("newname2", registrantAccount, secret));

        await evm.advanceTime((await controller.maxCommitmentAge()).toNumber() + 1);
        var balanceBefore = await web3.eth.getBalance(controller.address);
        await exceptions.expectFailure(controller.register("newname2", registrantAccount, 28 * DAYS, secret, {value: 28 * DAYS}));
    });

    it('should allow anyone to renew a name', async () => {
        var expires = await baseRegistrar.nameExpires(sha3("newname"));
        var balanceBefore = await web3.eth.getBalance(controller.address);
        await controller.renew("newname", 86400, {value: 86400 + 1});
        var newExpires = await baseRegistrar.nameExpires(sha3("newname"));
        assert.equal(newExpires.toNumber() - expires.toNumber(), 86400);
        assert.equal((await web3.eth.getBalance(controller.address)) - balanceBefore, 86400);
    });

    it('should require sufficient value for a renewal', async () => {
        await exceptions.expectFailure(controller.renew("name", 86400));
    });

    it('should allow the registrar owner to withdraw funds', async () => {
        await controller.withdraw({from: ownerAccount});
        assert.equal(await web3.eth.getBalance(controller.address), 0);
    });
});
