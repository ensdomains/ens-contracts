const ENS = artifacts.require('@ensdomains/ens/ENSRegistry');
const BaseRegistrar = artifacts.require('./BaseRegistrarImplementation');
const ShortNameClaims = artifacts.require('./ShortNameClaims');
const DummyOracle = artifacts.require('./DummyOracle');
const StablePriceOracle = artifacts.require('./StablePriceOracle');
const dns = require('../lib/dns.js');

const namehash = require('eth-ens-namehash');
const sha3 = require('web3-utils').sha3;
const toBN = require('web3-utils').toBN;

const REVIEW = 1;
const FINAL = 2;

const PENDING = 0;
const APPROVED = 1;
const DECLINED = 2;

const { exceptions } = require("@ensdomains/test-utils");

contract('ShortNameClaims', function (accounts) {
    const ownerAccount = accounts[0];
    const claimantAccount = accounts[1];
    const registrarOwner = accounts[2];
    const ratifierAccount = accounts[3];

    let ens;
    let registrar;
    let claims;

    before(async () => {
        ens = await ENS.new();

        registrar = await BaseRegistrar.new(ens.address, namehash.hash('eth'), {from: ownerAccount});
        await ens.setSubnodeOwner('0x0', sha3('eth'), registrar.address);

        const dummyOracle = await DummyOracle.new(toBN(100000000));
        const priceOracle = await StablePriceOracle.new(dummyOracle.address, [1]);

        claims = await ShortNameClaims.new(priceOracle.address, registrar.address, ratifierAccount);
        await registrar.addController(claims.address, {from: ownerAccount});
        await registrar.transferOwnership(registrarOwner);
    });

    it('should permit a DNS name owner to register a claim on an exact match', async () => {
        const tx = await claims.submitExactClaim(dns.hexEncodeName('foo.test.'), claimantAccount, 'test@example.com', {value: 31536001});
        const logs = tx.receipt.logs;
        assert.equal(logs.length, 1);
        assert.equal(logs[0].event, "ClaimSubmitted");
        assert.equal(logs[0].args.claimed, "foo");
        assert.equal(logs[0].args.dnsname, dns.hexEncodeName('foo.test.'));
        assert.equal(logs[0].args.paid.toNumber(), 31536000);
        assert.equal(logs[0].args.email, 'test@example.com');

        assert.equal(await web3.eth.getBalance(claims.address), 31536000);

        assert.equal(await claims.pendingClaims(), 1);

        const claimId = await claims.computeClaimId("foo", dns.hexEncodeName("foo.test."), claimantAccount, 'test@example.com');
        const { labelHash, claimant, paid, status } = await claims.claims(claimId);
        assert.equal(labelHash, sha3("foo"));
        assert.equal(claimant, claimantAccount);
        assert.equal(paid.toNumber(), 31536000);
        assert.equal(status, PENDING);

        await claims.submitExactClaim(dns.hexEncodeName('baz.test.'), claimantAccount, 'test@example.com', {value: 31536000});
    });

    it('should permit a DNS name owner to register a claim on a prefix ending with eth', async () => {
        const tx = await claims.submitPrefixClaim(dns.hexEncodeName('fooeth.test.'), claimantAccount, 'test@example.com', {value: 31536000});
        const logs = tx.receipt.logs;
        assert.equal(logs.length, 1);
        assert.equal(logs[0].event, "ClaimSubmitted");
        assert.equal(logs[0].args.claimed, "foo");
        assert.equal(await claims.pendingClaims(), 3);
    });

    it('should fail to register a prefix of a name if its suffix is not eth', async () => {
        await exceptions.expectFailure(
            claims.submitPrefixClaim(dns.hexEncodeName('foobar.test.'), claimantAccount, 'test@example.com', {value: 31536000})
        );
    });

    it('should permit a DNS name owner to register a claim on a combined name + tld', async () => {
        const tx = await claims.submitCombinedClaim(dns.hexEncodeName('foo.tv.'), claimantAccount, 'test@example.com', {value: 31536000});
        const logs = tx.receipt.logs;
        assert.equal(logs.length, 1);
        assert.equal(logs[0].event, "ClaimSubmitted");
        assert.equal(logs[0].args.claimed, "footv");
        assert.equal(await claims.pendingClaims(), 4);
    });

    it('should not allow subdomains to be used in a claim', async () => {
        await exceptions.expectFailure(
            claims.submitExactClaim(dns.hexEncodeName('foo.bar.test.'), claimantAccount, 'test@example.com', {value: 31536001})
        );
    });

    it('should fail with insufficient payment', async () => {
        await exceptions.expectFailure(
            claims.submitExactClaim(dns.hexEncodeName('bar.test.'), claimantAccount, 'test@example.com', {value: 1000})
        );
    });

    it('should reject claims that are too long or too short', async () => {
        await exceptions.expectFailure(
            claims.submitExactClaim(dns.hexEncodeName("hi.test."), claimantAccount, 'test@example.com', {value: 31536000})
        );
    });

    it('should reject duplicate claims', async () => {
        await exceptions.expectFailure(
            claims.submitExactClaim(dns.hexEncodeName("foo.test."), claimantAccount, 'test@example.com', {value: 31536000})
        );
    });

    it('should not permit claim status to be set during the open phase', async () => {
        const claimId = await claims.computeClaimId("footv", dns.hexEncodeName("foo.tv."), claimantAccount, 'test@example.com');

        await exceptions.expectFailure(
            claims.setClaimStatus(claimId, true, {from: ownerAccount})
        );
    });

    it('should close claims successfully', async () => {
        await claims.closeClaims({from: ownerAccount});
        assert.equal(await claims.phase(), REVIEW);
    });

    it('should not allow non-owners to set claim status', async () => {
        const claimId = await claims.computeClaimId("footv", dns.hexEncodeName("foo.tv."), claimantAccount, 'test@example.com');

        await exceptions.expectFailure(
            claims.setClaimStatus(claimId, true, {from: claimantAccount})
        );
    });

    it('should allow the contract owner to set claim status', async () => {
        const claimId = await claims.computeClaimId("foo", dns.hexEncodeName("foo.test."), claimantAccount, 'test@example.com');
        const tx = await claims.setClaimStatus(claimId, false, {from: ownerAccount});
        const logs = tx.receipt.logs;
        assert.isAtLeast(logs.length, 1);
        assert.equal(logs[0].event, "ClaimStatusChanged");
        assert.equal(logs[0].args.claimId, claimId);
        assert.equal(logs[0].args.status, DECLINED);
        assert.equal(await claims.unresolvedClaims(), 1);
        assert.equal(await claims.pendingClaims(), 3);

        const { status } = await claims.claims(claimId);
        assert.equal(status, DECLINED);

        await claims.setClaimStatus(await claims.computeClaimId("baz", dns.hexEncodeName("baz.test."), claimantAccount, 'test@example.com'), false, {from: ownerAccount});
        assert.equal(await claims.unresolvedClaims(), 2);
        assert.equal(await claims.pendingClaims(), 2);
    });

    it('should allow changing the claim status', async () => {
        const claimId = await claims.computeClaimId("foo", dns.hexEncodeName("foo.test."), claimantAccount, 'test@example.com');
        const tx = await claims.setClaimStatus(claimId, true, {from: ownerAccount});
        const logs = tx.receipt.logs;
        assert.isAtLeast(logs.length, 1);
        assert.equal(logs[0].event, "ClaimStatusChanged");
        assert.equal(logs[0].args.claimId, claimId);
        assert.equal(logs[0].args.status, APPROVED);
        assert.equal(await claims.unresolvedClaims(), 2);
        assert.equal(await claims.pendingClaims(), 2);
    });

    it('should not permit approving two claims for the same name', async () => {
        const claimId = await claims.computeClaimId("foo", dns.hexEncodeName("fooeth.test."), claimantAccount, 'test@example.com');

        await exceptions.expectFailure(
            claims.setClaimStatus(claimId, true, {from: ownerAccount})
        );
    });

    it('should allow the ratifier to set claim status', async () => {
        const claimId = await claims.computeClaimId("foo", dns.hexEncodeName("fooeth.test."), claimantAccount, 'test@example.com');
        const tx = await claims.setClaimStatus(claimId, false, {from: ratifierAccount});
        const logs = tx.receipt.logs;
        assert.isAtLeast(logs.length, 1);
        assert.equal(logs[0].event, "ClaimStatusChanged");
        assert.equal(logs[0].args.claimId, claimId);
        assert.equal(logs[0].args.status, DECLINED);
        assert.equal(await claims.pendingClaims(), 1);
    });

    it('should not allow setting the status of nonexistent claims', async () => {
        const claimId = await claims.computeClaimId("bleh", dns.hexEncodeName("bleh.test."), claimantAccount, 'test@example.com');
        await exceptions.expectFailure(claims.setClaimStatus(claimId, true, {from: ownerAccount}));
    });

    it('should not permit ratification until all claims are resolved', async () => {
        await exceptions.expectFailure(claims.ratifyClaims({from: ratifierAccount}));
    });

    it('should allow claimant to withdraw their claim', async () => {
        const claimId = await claims.computeClaimId("footv", dns.hexEncodeName("foo.tv."), claimantAccount, 'test@example.com');
        await claims.withdrawClaim(claimId, {from: claimantAccount});
        assert.equal(await claims.pendingClaims(), 0);
    });

    it('should not permit the owner to ratify', async () => {
        await exceptions.expectFailure(claims.ratifyClaims({from: ownerAccount}));
    });

    it('should permit ratification once all claims are resolved', async () => {
        await claims.ratifyClaims({from: ratifierAccount});
        assert.equal(await claims.phase(), FINAL);
    });

    it('should resolve approved claims', async () => {
        const balanceBefore = toBN(await web3.eth.getBalance(registrarOwner));
        const claimId = await claims.computeClaimId("foo", dns.hexEncodeName("foo.test."), claimantAccount, 'test@example.com');
        assert.equal(await claims.unresolvedClaims(), 3);

        await claims.resolveClaim(claimId, {from: ownerAccount});

        assert.equal(await claims.unresolvedClaims(), 2);
        const balanceAfter = toBN(await web3.eth.getBalance(registrarOwner));
        assert.equal(balanceAfter.sub(balanceBefore).toNumber(), 31536000);
    });

    it('should allow claimant to withdraw their claim after ratification', async () => {
        const claimId = await claims.computeClaimId("baz", dns.hexEncodeName("baz.test."), claimantAccount, 'test@example.com');
        await claims.withdrawClaim(claimId, {from: claimantAccount});
        assert.equal(await claims.unresolvedClaims(), 1);
    });

    it('should not self destruct while claims are unresolved', async () => {
        await exceptions.expectFailure(claims.destroy({from: ownerAccount}));
    });

    it('should resolve rejected claims', async () => {
        const balanceBefore = toBN(await web3.eth.getBalance(claimantAccount));
        const claimId = await claims.computeClaimId("foo", dns.hexEncodeName("fooeth.test."), claimantAccount, 'test@example.com');
        assert.equal(await claims.unresolvedClaims(), 1);

        await claims.resolveClaim(claimId, {from: ownerAccount});

        assert.equal(await claims.unresolvedClaims(), 0);
        const balanceAfter = toBN(await web3.eth.getBalance(claimantAccount));
        assert.equal(balanceAfter.sub(balanceBefore).toNumber(), 31536000);
    });

    it('should self destruct once all claims are resolved', async () => {
        await claims.destroy({from: ownerAccount});
        assert.equal(await web3.eth.getCode(claims.address), '0x');
    });
});
