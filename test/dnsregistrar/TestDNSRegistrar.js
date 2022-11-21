const ENSRegistry = artifacts.require('./ENSRegistry.sol')
const Root = artifacts.require('/Root.sol')
const SimplePublixSuffixList = artifacts.require('./SimplePublicSuffixList.sol')
const DNSRegistrarContract = artifacts.require('./DNSRegistrar.sol')
const PublicResolver = artifacts.require('./PublicResolver.sol')
const DNSSECImpl = artifacts.require('./DNSSECImpl')
const namehash = require('eth-ens-namehash')
const utils = require('./Helpers/Utils')
const { exceptions } = require('@ensdomains/test-utils')
const { assert } = require('chai')
const { rootKeys, hexEncodeSignedSet } = require('../utils/dnsutils.js')

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

contract('DNSRegistrar', function(accounts) {
  var registrar = null
  var ens = null
  var root = null
  var dnssec = null
  var suffixes = null
  var now = Math.round(new Date().getTime() / 1000)
  const validityPeriod = 2419200
  const expiration = Date.now() / 1000 - 15 * 60 + validityPeriod
  const inception = Date.now() / 1000 - 15 * 60
  const testRrset = (name, account) => ({
    name,
    sig: {
      name: 'test',
      type: 'RRSIG',
      ttl: 0,
      class: 'IN',
      flush: false,
      data: {
        typeCovered: 'TXT',
        algorithm: 253,
        labels: name.split('.').length + 1,
        originalTTL: 3600,
        expiration,
        inception,
        keyTag: 1278,
        signersName: '.',
        signature: new Buffer([]),
      },
    },
    rrs: [
      {
        name: `_ens.${name}`,
        type: 'TXT',
        class: 'IN',
        ttl: 3600,
        data: Buffer.from(`a=${account}`, 'ascii'),
      },
    ],
  });
  
  beforeEach(async function() {
    ens = await ENSRegistry.new()

    root = await Root.new(ens.address)
    await ens.setOwner('0x0', root.address)

    dnssec = await DNSSECImpl.deployed()

    suffixes = await SimplePublixSuffixList.new()
    await suffixes.addPublicSuffixes([
      utils.hexEncodeName('test'),
      utils.hexEncodeName('co.nz'),
    ])

    registrar = await DNSRegistrarContract.new(
      dnssec.address,
      suffixes.address,
      ens.address
    )
    await root.setController(registrar.address, true)
  })

  it('allows anyone to claim on behalf of the owner of an ENS name', async function() {
    assert.equal(await registrar.oracle(), dnssec.address)
    assert.equal(await registrar.ens(), ens.address)

    const proof = [
      hexEncodeSignedSet(rootKeys(expiration, inception)),
      hexEncodeSignedSet(testRrset('foo.test', accounts[0]))
    ];

    await registrar.proveAndClaim(
      utils.hexEncodeName('foo.test'),
      proof,
      {from: accounts[1]}
    )

    assert.equal(await ens.owner(namehash.hash('foo.test')), accounts[0])
  })

  it('allows claims on names that are not TLDs', async function() {
    const proof = [
      hexEncodeSignedSet(rootKeys(expiration, inception)),
      hexEncodeSignedSet(testRrset('foo.co.nz', accounts[0]))
    ];

    await registrar.proveAndClaim(
      utils.hexEncodeName('foo.co.nz'),
      proof
    )

    assert.equal(await ens.owner(namehash.hash('foo.co.nz')), accounts[0])
  })

  it('allows anyone to update a DNSSEC referenced name', async function() {
    const proof = [
      hexEncodeSignedSet(rootKeys(expiration, inception)),
      hexEncodeSignedSet(testRrset('foo.test', accounts[0]))
    ]

    await registrar.proveAndClaim(
      utils.hexEncodeName('foo.test'),
      proof
    )

    proof[1] = hexEncodeSignedSet(testRrset('foo.test', accounts[1]))

    await registrar.proveAndClaim(
      utils.hexEncodeName('foo.test'),
      proof
    )

    assert.equal(await ens.owner(namehash.hash('foo.test')), accounts[1])
  })

  it('rejects proofs with earlier inceptions', async function() {
    const proof = [
      hexEncodeSignedSet(rootKeys(expiration, inception)),
      hexEncodeSignedSet(testRrset('foo.test', accounts[0]))
    ]

    await registrar.proveAndClaim(
      utils.hexEncodeName('foo.test'),
      proof
    )

    const newRrset = testRrset('foo.test', accounts[1])
    newRrset.sig.data.inception -= 3600
    proof[1] = hexEncodeSignedSet(newRrset)

    await exceptions.expectFailure(registrar.proveAndClaim(
      utils.hexEncodeName('foo.test'),
      proof
    ))
  })

  it('does not allow updates with stale records', async function() {
    const rrSet = testRrset('foo.test', accounts[0]);
    rrSet.sig.data.inception = Date.now() / 1000 - 120
    rrSet.sig.data.expiration = Date.now() / 1000 - 60
    const proof = [
      hexEncodeSignedSet(rootKeys(expiration, inception)),
      hexEncodeSignedSet(rrSet)
    ];

    await exceptions.expectFailure(
      registrar.proveAndClaim(utils.hexEncodeName('foo.test'), proof)
    )
  })

  it('allows the owner to claim and set a resolver', async () => {
    const proof = [
      hexEncodeSignedSet(rootKeys(expiration, inception)),
      hexEncodeSignedSet(testRrset('foo.test', accounts[0]))
    ];

    await registrar.proveAndClaimWithResolver(
      utils.hexEncodeName('foo.test'),
      proof,
      accounts[1],
      ZERO_ADDRESS
    )

    assert.equal(await ens.owner(namehash.hash('foo.test')), accounts[0])
    assert.equal(await ens.resolver(namehash.hash('foo.test')), accounts[1])
  })

  it('does not allow anyone else to claim and set a resolver', async () => {
    const proof = [
      hexEncodeSignedSet(rootKeys(expiration, inception)),
      hexEncodeSignedSet(testRrset('foo.test', accounts[1]))
    ];

    await exceptions.expectFailure(
      registrar.proveAndClaimWithResolver(
        utils.hexEncodeName('foo.test'),
        proof,
        accounts[1],
        ZERO_ADDRESS
      )
    )
  })

  it('sets an address on the resolver if provided', async () => {
    var resolver = await PublicResolver.new(
      ens.address,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS
    )

    const proof = [
      hexEncodeSignedSet(rootKeys(expiration, inception)),
      hexEncodeSignedSet(testRrset('foo.test', accounts[0]))
    ];

    await registrar.proveAndClaimWithResolver(
      utils.hexEncodeName('foo.test'),
      proof,
      resolver.address,
      accounts[0]
    )

    assert.equal(await resolver.addr(namehash.hash('foo.test')), accounts[0])
  })

  it('forbids setting an address if the resolver is not also set', async () => {
    const proof = [
      hexEncodeSignedSet(rootKeys(expiration, inception)),
      hexEncodeSignedSet(testRrset('foo.test', accounts[0]))
    ];

    await exceptions.expectFailure(
      registrar.proveAndClaimWithResolver(
        utils.hexEncodeName('foo.test'),
        proof,
        ZERO_ADDRESS,
        accounts[0]
      )
    )
  })
})
