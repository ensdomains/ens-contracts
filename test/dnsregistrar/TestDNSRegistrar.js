const ENSRegistry = artifacts.require('./ENSRegistry.sol');
const DummyDNSSEC = artifacts.require('./DummyDnsRegistrarDNSSEC.sol');
const Root = artifacts.require("/Root.sol");
const SimplePublixSuffixList = artifacts.require('./SimplePublicSuffixList.sol');
const DNSRegistrarContract = artifacts.require('./DNSRegistrar.sol');
const PublicResolver = artifacts.require('./PublicResolver.sol');
const namehash = require('eth-ens-namehash');
const utils = require('./Helpers/Utils');
const { exceptions } = require('@ensdomains/test-utils');
const { assert } = require('chai');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

contract('DNSRegistrar', function(accounts) {
  var registrar = null;
  var ens = null;
  var root = null;
  var dnssec = null;
  var suffixes = null;
  var now = Math.round(new Date().getTime() / 1000);

  beforeEach(async function() {
    ens = await ENSRegistry.new();

    root = await Root.new(ens.address);
    await ens.setOwner('0x0', root.address);

    dnssec = await DummyDNSSEC.new();
    
    suffixes = await SimplePublixSuffixList.new();
    await suffixes.addPublicSuffixes([utils.hexEncodeName("test"), utils.hexEncodeName("co.nz")]);

    registrar = await DNSRegistrarContract.new(dnssec.address, suffixes.address, ens.address);
    await root.setController(registrar.address, true);
  });

  it('allows anyone to claim on behalf of the owner of an ENS name', async function() {
    assert.equal(await registrar.oracle(), dnssec.address);
    assert.equal(await registrar.ens(), ens.address);

    var proof = utils.hexEncodeTXT({
      name: '_ens.foo.test',
      type: 'TXT',
      class: 'IN',
      ttl: 3600,
      data: ['a=' + accounts[1]]
    });

    await dnssec.setData(
      16,
      utils.hexEncodeName('_ens.foo.test'),
      now,
      now,
      proof
    );

    await registrar.claim(utils.hexEncodeName('foo.test'), proof);

    assert.equal(await ens.owner(namehash.hash('foo.test')), accounts[1]);
  });

  it('allows the owner to prove-and-claim', async () => {
    var proof = utils.hexEncodeTXT({
      name: '_ens.foo.test',
      type: 'TXT',
      class: 'IN',
      ttl: 3600,
      data: ['a=' + accounts[0]]
    });

    await dnssec.setData(
      16,
      utils.hexEncodeName('_ens.foo.test'),
      now,
      now,
      proof
    );

    await registrar.proveAndClaim(utils.hexEncodeName('foo.test'), [{rrset: proof, sig: '0x'}], '0x');

    assert.equal(await ens.owner(namehash.hash('foo.test')), accounts[0]);
  });

  it('allows claims on names that are not TLDs', async function() {
    var proof = utils.hexEncodeTXT({
      name: '_ens.foo.co.nz',
      type: 'TXT',
      class: 'IN',
      ttl: 3600,
      data: ['a=' + accounts[0]]
    });

    await dnssec.setData(
      16,
      utils.hexEncodeName('_ens.foo.co.nz'),
      now,
      now,
      proof
    );

    await registrar.claim(utils.hexEncodeName('foo.co.nz'), proof);

    assert.equal(await ens.owner(namehash.hash('foo.co.nz')), accounts[0]);
  });

  it('allows anyone to zero out an obsolete name', async function() {
    await dnssec.setData(
      16,
      utils.hexEncodeName('_ens.foo.test'),
      now,
      now,
      '0x'
    );

    await registrar.claim(utils.hexEncodeName('foo.test'), '0x');

    assert.equal(await ens.owner(namehash.hash('foo.test')), 0);
  });

  it('allows anyone to update a DNSSEC referenced name', async function() {
    var proof = utils.hexEncodeTXT({
      name: '_ens.foo.test',
      type: 'TXT',
      class: 'IN',
      ttl: 3600,
      data: ['a=' + accounts[1]]
    });

    await dnssec.setData(
      16,
      utils.hexEncodeName('_ens.foo.test'),
      now,
      now,
      proof
    );

    await registrar.claim(utils.hexEncodeName('foo.test'), proof);
    assert.equal(await ens.owner(namehash.hash('foo.test')), accounts[1]);
  });

  it('does not allow updates with stale records', async function() {
    var proof = utils.hexEncodeTXT({
      name: '_ens.bar.test',
      type: 'TXT',
      class: 'IN',
      ttl: 3600,
      data: ['a=' + accounts[0]]
    });

    await dnssec.setData(16, utils.hexEncodeName('_ens.foo.test'), 0, 0, proof);

    await exceptions.expectFailure(registrar.claim(utils.hexEncodeName('bar.test'), proof));
  });

  it('allows the owner to claim and set a resolver', async () => {
    var proof = utils.hexEncodeTXT({
      name: '_ens.foo.test',
      type: 'TXT',
      class: 'IN',
      ttl: 3600,
      data: ['a=' + accounts[0]]
    });

    await dnssec.setData(
      16,
      utils.hexEncodeName('_ens.foo.test'),
      now,
      now,
      proof
    );

    await registrar.proveAndClaimWithResolver(utils.hexEncodeName('foo.test'), [{rrset: proof, sig: '0x'}], '0x', accounts[1], ZERO_ADDRESS);

    assert.equal(await ens.owner(namehash.hash('foo.test')), accounts[0]);
    assert.equal(await ens.resolver(namehash.hash('foo.test')), accounts[1]);
  });

  it('does not allow anyone else to claim and set a resolver', async () => {
    var proof = utils.hexEncodeTXT({
      name: '_ens.foo.test',
      type: 'TXT',
      class: 'IN',
      ttl: 3600,
      data: ['a=' + accounts[1]]
    });

    await dnssec.setData(
      16,
      utils.hexEncodeName('_ens.foo.test'),
      now,
      now,
      proof
    );

    await exceptions.expectFailure(registrar.proveAndClaimWithResolver(utils.hexEncodeName('foo.test'), [{rrset: proof, sig: '0x'}], '0x', accounts[1], ZERO_ADDRESS));
  });

  it('sets an address on the resolver if provided', async () => {
    var resolver = await PublicResolver.new(ens.address, ZERO_ADDRESS);

    var proof = utils.hexEncodeTXT({
      name: '_ens.foo.test',
      type: 'TXT',
      class: 'IN',
      ttl: 3600,
      data: ['a=' + accounts[0]]
    });

    await dnssec.setData(
      16,
      utils.hexEncodeName('_ens.foo.test'),
      now,
      now,
      proof
    );

    await registrar.proveAndClaimWithResolver(utils.hexEncodeName('foo.test'), [{rrset: proof, sig: '0x'}], '0x', resolver.address, accounts[0]);

    assert.equal(await resolver.addr(namehash.hash('foo.test')), accounts[0])
  });

  it('forbids setting an address if the resolver is not also set', async () => {
    var proof = utils.hexEncodeTXT({
      name: '_ens.foo.test',
      type: 'TXT',
      class: 'IN',
      ttl: 3600,
      data: ['a=' + accounts[0]]
    });

    await dnssec.setData(
      16,
      utils.hexEncodeName('_ens.foo.test'),
      now,
      now,
      proof
    );

    await exceptions.expectFailure(registrar.proveAndClaimWithResolver(utils.hexEncodeName('foo.test'), [{rrset: proof, sig: '0x'}], '0x', ZERO_ADDRESS, accounts[0]));
  });
});
