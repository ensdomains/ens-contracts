const ENS = artifacts.require('@ensdomains/ens/ENSRegistry');
const ENSWithFallback = artifacts.require('@ensdomains/ens/ENSRegistryWithFallback');
const HashRegistrar = artifacts.require('@ensdomains/ens/HashRegistrar');
const EthRegistrarSubdomainRegistrar = artifacts.require('@ensdomains/subdomain-registrar/EthRegistrarSubdomainRegistrar');
const ENSMigrationSubdomainRegistrar = artifacts.require('@ensdomains/subdomain-registrar/ENSMigrationSubdomainRegistrar');
const BaseRegistrar = artifacts.require('./BaseRegistrarImplementation');
const OldBaseRegistrar = artifacts.require('./OldBaseRegistrarImplementation');
const RegistrarMigration = artifacts.require('./RegistrarMigration');
const TestResolver = artifacts.require('./TestResolver');
var Promise = require('bluebird');
const { evm, exceptions } = require("@ensdomains/test-utils");

const namehash = require('eth-ens-namehash');
const sha3 = require('web3-utils').sha3;
const toBN = require('web3-utils').toBN;

const DAYS = 24 * 60 * 60;
const SALT = sha3('foo');
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

contract('RegistrarMigration', function (accounts) {
	const ownerAccount = accounts[0];
	const controllerAccount = accounts[1];
	const registrantAccount = accounts[2];
	const otherAccount = accounts[3];

	let oldEns;
	let ens;
	let interimRegistrar;
	let oldRegistrar;
	let oldSubdomainRegistrar;
	let registrar;
	let subdomainRegistrar;
	let transferPeriodEnds;
	let testResolver;

	async function registerOldNames(ens, names, finalisedNames, account) {
		var hashes = names.map(sha3);
		var value = toBN(10000000000000000);
		var bidHashes = await Promise.map(hashes, (hash) => interimRegistrar.shaBid(hash, account, value, SALT));
		await interimRegistrar.startAuctions(hashes);
		await Promise.map(bidHashes, (h) => interimRegistrar.newBid(h, {value: value, from: account}));
		await evm.advanceTime(3 * DAYS + 1);
		await Promise.map(hashes, (hash) => interimRegistrar.unsealBid(hash, value, SALT, {from: account}));
		await evm.advanceTime(2 * DAYS + 1);
		await Promise.map(finalisedNames.map(sha3), (hash) => interimRegistrar.finalizeAuction(hash, {from: account}));
		for(var name of finalisedNames) {
			assert.equal(await ens.owner(namehash.hash(name + '.eth')), account);
		}
	}

	before(async () => {
		// Create the original ENS registry
		oldEns = await ENS.new();

		// Create a test resolver
		testResolver = await TestResolver.new();

		// Create the auction registrar and register some names on it
		interimRegistrar = await HashRegistrar.new(oldEns.address, namehash.hash('eth'), 1493895600);
		await oldEns.setSubnodeOwner('0x0', sha3('eth'), interimRegistrar.address);
		await registerOldNames(oldEns, ['oldname', 'oldname2'], ['oldname'], registrantAccount);

		// Create the original 'permanent' registrar and register some names on it
		transferPeriodEnds = (await web3.eth.getBlock('latest')).timestamp + 365 * DAYS;
		oldRegistrar = await OldBaseRegistrar.new(oldEns.address, interimRegistrar.address, namehash.hash('eth'), transferPeriodEnds, {from: ownerAccount});
		await oldRegistrar.addController(controllerAccount, {from: ownerAccount});
		await oldEns.setSubnodeOwner('0x0', sha3('eth'), oldRegistrar.address);
		await Promise.map(["name", "name2", "subname"].map(sha3), (label) => oldRegistrar.register(label, registrantAccount, 86400, {from: controllerAccount}));

		// Create the old subdomain registrar and transfer a name to it
		oldSubdomainRegistrar = await EthRegistrarSubdomainRegistrar.new(oldEns.address);
		await oldRegistrar.approve(oldSubdomainRegistrar.address, sha3('subname'), {from: registrantAccount});
		await oldSubdomainRegistrar.configureDomain("subname", 0, 0, {from: registrantAccount});

		// Register a subdomain on the old subdomain registrar
		await oldSubdomainRegistrar.register(sha3('subname'), 'foo', registrantAccount, ZERO_ADDRESS, testResolver.address, {from: registrantAccount});

		// Create the new ENS registry and registrar
		ens = await ENSWithFallback.new(oldEns.address);
		registrar = await BaseRegistrar.new(ens.address, namehash.hash('eth'), {from: ownerAccount});
		await registrar.addController(controllerAccount, {from: ownerAccount});
		await ens.setSubnodeOwner('0x0', sha3('eth'), registrar.address);

		// Create the new subdomain registrar
		subdomainRegistrar = await ENSMigrationSubdomainRegistrar.new(ens.address);

		// Create the migration contract. Make it the owner of 'eth' on the old
		// registry, and a controller of the new registrar.
		registrarMigration = await RegistrarMigration.new(oldRegistrar.address, registrar.address, oldSubdomainRegistrar.address, subdomainRegistrar.address);
		await registrar.addController(registrarMigration.address, {from: ownerAccount});
		await oldEns.setSubnodeOwner('0x0', sha3('eth'), registrarMigration.address);
	});

	it('should allow auction registrar names to be migrated', async () => {
		await oldEns.setResolver(namehash.hash("oldname.eth"), otherAccount, {from: registrantAccount});
		await oldEns.setTTL(namehash.hash("oldname.eth"), 123, {from: registrantAccount});

		let tx = await registrarMigration.migrateLegacy(sha3("oldname"), {from: otherAccount});
		assert.equal(tx.receipt.status, 1);

		// New registrar should have owner and expiry date set correctly
		assert.equal(await registrar.ownerOf(sha3("oldname")), registrantAccount);
		assert.equal((await registrar.nameExpires(sha3("oldname"))).toString(), transferPeriodEnds.toString());

		// Old registry ownership should be set to the migration contract
		assert.equal(await oldEns.owner(namehash.hash("oldname.eth")), registrarMigration.address);

		// New registry ownership, resolver and TTL should be set correctly
		assert.equal(await ens.recordExists(namehash.hash("oldname.eth")), true);
		assert.equal(await ens.owner(namehash.hash("oldname.eth")), registrantAccount);
		assert.equal(await ens.resolver(namehash.hash("oldname.eth")), otherAccount);
		assert.equal(await ens.ttl(namehash.hash("oldname.eth")), 123);
	});

	it('should allow non-finalised auction registrar names to be migrated', async () => {
		let tx = await registrarMigration.migrateLegacy(sha3("oldname2"), {from: otherAccount});
		assert.equal(tx.receipt.status, 1);

		// New registrar should have owner and expiry date set correctly
		assert.equal(await registrar.ownerOf(sha3("oldname2")), registrantAccount);
		assert.equal((await registrar.nameExpires(sha3("oldname2"))).toString(), transferPeriodEnds.toString());

		// Old registry ownership should be set to the migration contract
		assert.equal(await oldEns.owner(namehash.hash("oldname2.eth")), registrarMigration.address);

		// New registry ownership, resolver and TTL should be set correctly
		assert.equal(await ens.recordExists(namehash.hash("oldname2.eth")), true);
		assert.equal(await ens.owner(namehash.hash("oldname2.eth")), ZERO_ADDRESS);
		assert.equal(await ens.resolver(namehash.hash("oldname2.eth")), ZERO_ADDRESS);
		assert.equal(await ens.ttl(namehash.hash("oldname2.eth")), 0);
	});

	it('should still allow auction registrar names to be released', async () => {
		var balanceBefore = await web3.eth.getBalance(registrantAccount);
		await interimRegistrar.releaseDeed(sha3('oldname'), {gasPrice: 0, from: registrantAccount});
		var balanceAfter = await web3.eth.getBalance(registrantAccount);
		assert.equal(balanceAfter - balanceBefore, 10000000000000000);
	});

	it('should still permit transfers on the old registrar', async () => {
		await oldRegistrar.transferFrom(registrantAccount, otherAccount, sha3("name"), {from: registrantAccount});
		assert.equal((await oldRegistrar.ownerOf(sha3("name"))), otherAccount);
		await oldRegistrar.transferFrom(otherAccount, registrantAccount, sha3("name"), {from: otherAccount});
	});

	it('should permit anyone to migrate a name', async () => {
		await oldEns.setResolver(namehash.hash("name.eth"), otherAccount, {from: registrantAccount});
		await oldEns.setTTL(namehash.hash("name.eth"), 123, {from: registrantAccount});

		let tx = await registrarMigration.migrate(sha3("name"), {from: otherAccount});
		assert.equal(tx.receipt.status, 1);

		// New registrar should have owner and expiry date set correctly
		assert.equal(await registrar.ownerOf(sha3("name")), registrantAccount);
		assert.equal((await oldRegistrar.nameExpires(sha3("name"))).toString(), (await registrar.nameExpires(sha3("name"))).toString());

		// Old registry ownership should be set to the migration contract
		assert.equal(await oldEns.owner(namehash.hash("name.eth")), registrarMigration.address);

		// New registry ownership, resolver and TTL should be set correctly
		assert.equal(await ens.recordExists(namehash.hash("name.eth")), true);
		assert.equal(await ens.owner(namehash.hash("name.eth")), registrantAccount);
		assert.equal(await ens.resolver(namehash.hash("name.eth")), otherAccount);
		assert.equal(await ens.ttl(namehash.hash("name.eth")), 123);
	});

	it('should not allow migrating a name twice', async () => {
		await exceptions.expectFailure(registrarMigration.migrate(sha3("name"), {from: otherAccount}));
	});

	it('should not update the registry for names controlled by contracts', async () => {
		await oldEns.setOwner(namehash.hash("name2.eth"), testResolver.address, {from: registrantAccount});
		assert.equal(await oldEns.owner(namehash.hash("name2.eth")), testResolver.address);

		let tx = await registrarMigration.migrate(sha3("name2"), {from: otherAccount});
		assert.equal(tx.receipt.status, 1);

		// New registrar should have owner and expiry date set correctly
		assert.equal(await registrar.ownerOf(sha3("name2")), registrantAccount);
		assert.equal((await oldRegistrar.nameExpires(sha3("name2"))).toString(), (await registrar.nameExpires(sha3("name2"))).toString());

		// Old registry ownership should be unchanged
		assert.equal(await oldEns.owner(namehash.hash("name2.eth")), testResolver.address);

		// New registry ownership, resolver and TTL should be unmodified
		assert.equal(await ens.recordExists(namehash.hash("name2.eth")), false);
		assert.equal(await ens.owner(namehash.hash("name2.eth")), testResolver.address);
		assert.equal(await ens.resolver(namehash.hash("name2.eth")), ZERO_ADDRESS);
		assert.equal(await ens.ttl(namehash.hash("name2.eth")), 0);
	});

	it('should allow migrating a name owned by the subdomain registrar', async () => {
		await oldSubdomainRegistrar.setResolver("subname", testResolver.address, {from: registrantAccount});
		let tx = await registrarMigration.migrate(sha3("subname"), {from: otherAccount});
		assert.equal(tx.receipt.status, 1);

		// New registrar should have owner and expiry date set correctly
		assert.equal(await registrar.ownerOf(sha3("subname")), subdomainRegistrar.address);
		assert.equal((await oldRegistrar.nameExpires(sha3("subname"))).toString(), (await registrar.nameExpires(sha3("subname"))).toString());

		// Old registry ownership should be cleared
		assert.equal(await oldEns.owner(namehash.hash("subname.eth")), registrarMigration.address);

		// New registry ownership should point at the new subdomain registrar, and resolver should be unmodified
		assert.equal(await ens.recordExists(namehash.hash("subname.eth")), true);
		assert.equal(await ens.owner(namehash.hash("subname.eth")), subdomainRegistrar.address);
		assert.equal(await ens.resolver(namehash.hash("subname.eth")), testResolver.address);
	});

	it('should allow migrating subdomains after the parent domain is migrated', async () => {
		await subdomainRegistrar.migrateSubdomain(namehash.hash("subname.eth"), sha3("foo"));
		assert.equal(await ens.recordExists(namehash.hash("foo.subname.eth")), true);
		assert.equal(await ens.owner(namehash.hash("foo.subname.eth")), registrantAccount);
		assert.equal(await ens.resolver(namehash.hash("foo.subname.eth")), testResolver.address);
	});

	it('should allow registering a subdomain on a migrated domain', async () => {
		await subdomainRegistrar.register(sha3('subname'), 'bar', registrantAccount, ZERO_ADDRESS, testResolver.address, {from: registrantAccount});
		assert.equal(await ens.owner(namehash.hash('bar.subname.eth')), registrantAccount);
		assert.equal(await ens.resolver(namehash.hash('bar.subname.eth')), testResolver.address);
	});

	it('should not allow new registrations on the old registrar', async () => {
		await exceptions.expectFailure(oldRegistrar.register(sha3("testname"), registrantAccount, 86400, {from: controllerAccount}));
	});
});
