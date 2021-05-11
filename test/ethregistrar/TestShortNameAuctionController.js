const ENS = artifacts.require('@ensdomains/ens/ENSRegistry');
const BaseRegistrar = artifacts.require('./BaseRegistrarImplementation');
const ShortNameAuctionController = artifacts.require('./ShortNameAuctionController');
const DummyProxyRegistry = artifacts.require('./mocks/DummyProxyRegistry');

const namehash = require('eth-ens-namehash');
const sha3 = require('web3-utils').sha3;

const { exceptions } = require("@ensdomains/test-utils");

contract('ShortNameAuctionController', function (accounts) {
	let ens;
	let baseRegistrar;
	let controller;
	let priceOracle;

	const ownerAccount = accounts[0]; // Account that owns the registrar
	const openseaAccount = accounts[1];
	const openseaProxyAccount = accounts[2];
	const registrantAccount = accounts[3];

	before(async () => {
		ens = await ENS.new();

		baseRegistrar = await BaseRegistrar.new(ens.address, namehash.hash('eth'), {from: ownerAccount});
		await ens.setSubnodeOwner('0x0', sha3('eth'), baseRegistrar.address);

		const proxy = await DummyProxyRegistry.new(openseaProxyAccount);

		controller = await ShortNameAuctionController.new(
			baseRegistrar.address,
			proxy.address,
			openseaAccount);
		await baseRegistrar.addController(controller.address, {from: ownerAccount});
	});

	it('should report 3-6 character names as available', async () => {
		assert.equal(await controller.available('name'), true);
	});

	it('should report too long names as unavailable', async () => {
		assert.equal(await controller.available('longname'), false);
	});

	it('should report too short names as unavailable', async () => {
		assert.equal(await controller.available('ha'), false);
	});

	it('should permit the opensea address to register a name', async () => {
		var tx = await controller.register('foo', registrantAccount, {from: openseaAccount});
		assert.equal(tx.logs.length, 1);
		assert.equal(tx.logs[0].event, "NameRegistered");
		assert.equal(tx.logs[0].args.name, "foo");
		assert.equal(tx.logs[0].args.owner, registrantAccount);

		assert.equal(await ens.owner(namehash.hash("foo.eth")), registrantAccount);
		assert.equal(await baseRegistrar.ownerOf(sha3("foo")), registrantAccount);
		assert.equal(await baseRegistrar.nameExpires(sha3("foo")), (await web3.eth.getBlock(tx.receipt.blockNumber)).timestamp + 31536000);
	});

	it('should not allow registering an already-registered name', async () => {
		await exceptions.expectFailure(
			controller.register('foo', registrantAccount, {from: openseaAccount})
		);
	})

	it('should permit the opensea proxy address to register a name', async () => {
		var tx = await controller.register('bar', registrantAccount, {from: openseaAccount});
		assert.equal(tx.logs.length, 1);
		assert.equal(tx.logs[0].event, "NameRegistered");
		assert.equal(tx.logs[0].args.name, "bar");
		assert.equal(tx.logs[0].args.owner, registrantAccount);
	});

	it('should not permit anyone else to register a name', async () => {
		await exceptions.expectFailure(
			controller.register('baz', registrantAccount, {from: registrantAccount})
		);
	});
});
