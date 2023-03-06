const ENSRegistry = artifacts.require('./ENSRegistry.sol')
const Root = artifacts.require('/Root.sol')
const IDNSGateway = artifacts.require('./IDNSGateway.sol')
const SimplePublixSuffixList = artifacts.require('./SimplePublicSuffixList.sol')
const DNSRegistrarContract = artifacts.require('./DNSRegistrar.sol')
const OwnedResolver = artifacts.require('./OwnedResolver.sol')
const OffchainDNSResolver = artifacts.require('./OffchainDNSResolver.sol')
const PublicResolver = artifacts.require('./PublicResolver.sol')
const DummyExtendedDNSSECResolver = artifacts.require(
  './DummyExtendedDNSSECResolver.sol',
)
const DummyLegacyTextResolver = artifacts.require(
  './DummyLegacyTextResolver.sol',
)
const DNSSECImpl = artifacts.require('./DNSSECImpl')
const namehash = require('eth-ens-namehash')
const utils = require('./Helpers/Utils')
const { exceptions } = require('@ensdomains/test-utils')
const { assert, expect } = require('chai')
const { rootKeys, hexEncodeSignedSet } = require('../utils/dnsutils.js')
const { ethers } = require('hardhat')

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

contract('OffchainDNSResolver', function (accounts) {
  var ens = null
  var root = null
  var dnssec = null
  var suffixes = null
  var offchainResolver = null
  var ownedResolver = null
  var registrar = null
  var now = Math.round(new Date().getTime() / 1000)
  const validityPeriod = 2419200
  const expiration = Date.now() / 1000 - 15 * 60 + validityPeriod
  const inception = Date.now() / 1000 - 15 * 60
  const testRrset = (name, values) => ({
    name,
    sig: {
      name: name,
      type: 'RRSIG',
      ttl: 0,
      class: 'IN',
      flush: false,
      data: {
        typeCovered: 'TXT',
        algorithm: 253,
        labels: name.split('.').length,
        originalTTL: 3600,
        expiration,
        inception,
        keyTag: 1278,
        signersName: '.',
        signature: new Buffer([]),
      },
    },
    rrs: values.map((value) => ({
      name,
      type: 'TXT',
      class: 'IN',
      ttl: 3600,
      data: Buffer.from(value, 'ascii'),
    })),
  })

  beforeEach(async function () {
    ens = await ENSRegistry.new()

    root = await Root.new(ens.address)
    await ens.setOwner('0x0', root.address)

    dnssec = await DNSSECImpl.deployed()

    suffixes = await SimplePublixSuffixList.new()
    await suffixes.addPublicSuffixes([
      utils.hexEncodeName('test'),
      utils.hexEncodeName('co.nz'),
    ])

    offchainResolver = await OffchainDNSResolver.new(
      ens.address,
      dnssec.address,
      'https://localhost:8000/query',
    )
    ownedResolver = await OwnedResolver.new()

    registrar = await DNSRegistrarContract.new(
      ZERO_ADDRESS, // Previous registrar
      offchainResolver.address,
      dnssec.address,
      suffixes.address,
      ens.address,
    )
    await root.setController(registrar.address, true)
    await root.setController(accounts[0], true)
  })

  it('should respond to resolution requests with a CCIP read request to the DNS gateway', async function () {
    const pr = await PublicResolver.at(offchainResolver.address)
    const DNSGatewayInterface = new ethers.utils.Interface(IDNSGateway.abi)
    const dnsName = utils.hexEncodeName('test.test')
    const callData = pr.contract.methods['addr(bytes32)'](
      namehash.hash('test.test'),
    ).encodeABI()
    await expect(
      offchainResolver.resolve(dnsName, callData),
    ).to.be.revertedWith(
      'OffchainLookup(' +
        '"' +
        offchainResolver.address +
        '", ' +
        '["https://localhost:8000/query"], ' +
        '"' +
        DNSGatewayInterface.encodeFunctionData('resolve', [dnsName, 16]) +
        '", ' +
        '"' +
        ethers.utils.id('resolveCallback(bytes,bytes)').slice(0, 10) +
        '", ' +
        '"' +
        ethers.utils.defaultAbiCoder.encode(
          ['bytes', 'bytes'],
          [dnsName, callData],
        ) +
        '"' +
        ')',
    )
  })

  function doResolveCallback(name, texts, callData) {
    const proof = [
      hexEncodeSignedSet(rootKeys(expiration, inception)),
      hexEncodeSignedSet(testRrset(name, texts)),
    ]
    const response = ethers.utils.defaultAbiCoder.encode(
      ['tuple(bytes, bytes)[]'],
      [proof],
    )
    const dnsName = utils.hexEncodeName(name)
    const extraData = ethers.utils.defaultAbiCoder.encode(
      ['bytes', 'bytes'],
      [dnsName, callData],
    )
    return offchainResolver.resolveCallback(response, extraData)
  }

  it('handles calls to resolveCallback() with valid DNS TXT records containing an address', async function () {
    const name = 'test.test'
    const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
    await ownedResolver.setAddr(namehash.hash(name), testAddress)
    const pr = await PublicResolver.at(offchainResolver.address)
    const callData = pr.contract.methods['addr(bytes32)'](
      namehash.hash(name),
    ).encodeABI()
    const result = await doResolveCallback(
      name,
      [`ENS1 ${ownedResolver.address}`],
      callData,
    )
    expect(
      ethers.utils.defaultAbiCoder.decode(['address'], result)[0],
    ).to.equal(testAddress)
  })

  it('handles calls to resolveCallback() with extra data and a legacy resolver', async function () {
    const name = 'test.test'
    const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
    await ownedResolver.setAddr(namehash.hash(name), testAddress)
    const pr = await PublicResolver.at(offchainResolver.address)
    const callData = pr.contract.methods['addr(bytes32)'](
      namehash.hash(name),
    ).encodeABI()
    const result = await doResolveCallback(
      name,
      [`ENS1 ${ownedResolver.address} blah`],
      callData,
    )
    expect(
      ethers.utils.defaultAbiCoder.decode(['address'], result)[0],
    ).to.equal(testAddress)
  })

  it('handles calls to resolveCallback() with valid DNS TXT records containing a name', async function () {
    // Configure dnsresolver.eth to resolve to the ownedResolver so we can use it in the test
    await root.setSubnodeOwner(ethers.utils.id('eth'), accounts[0])
    await ens.setSubnodeOwner(
      namehash.hash('eth'),
      ethers.utils.id('dnsresolver'),
      accounts[0],
    )
    await ens.setResolver(
      namehash.hash('dnsresolver.eth'),
      ownedResolver.address,
    )
    await ownedResolver.setAddr(
      namehash.hash('dnsresolver.eth'),
      ownedResolver.address,
    )

    const name = 'test.test'
    const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
    await ownedResolver.setAddr(namehash.hash(name), testAddress)
    const pr = await PublicResolver.at(offchainResolver.address)
    const callData = pr.contract.methods['addr(bytes32)'](
      namehash.hash(name),
    ).encodeABI()
    const result = await doResolveCallback(
      name,
      [`ENS1 dnsresolver.eth`],
      callData,
    )
    expect(
      ethers.utils.defaultAbiCoder.decode(['address'], result)[0],
    ).to.equal(testAddress)
  })

  it('rejects calls to resolveCallback() with an invalid TXT record', async function () {
    const name = 'test.test'
    const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
    await ownedResolver.setAddr(namehash.hash(name), testAddress)
    const pr = await PublicResolver.at(offchainResolver.address)
    const callData = pr.contract.methods['addr(bytes32)'](
      namehash.hash(name),
    ).encodeABI()
    await expect(
      doResolveCallback(name, ['nonsense'], callData),
    ).to.be.revertedWith('CouldNotResolve')
  })

  it('handles calls to resolveCallback() where the valid TXT record is not the first', async function () {
    const name = 'test.test'
    const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
    await ownedResolver.setAddr(namehash.hash(name), testAddress)
    const pr = await PublicResolver.at(offchainResolver.address)
    const callData = pr.contract.methods['addr(bytes32)'](
      namehash.hash(name),
    ).encodeABI()
    const result = await doResolveCallback(
      name,
      ['foo', `ENS1 ${ownedResolver.address}`],
      callData,
    )
    expect(
      ethers.utils.defaultAbiCoder.decode(['address'], result)[0],
    ).to.equal(testAddress)
  })

  it('respects the first record with a valid resolver', async function () {
    const name = 'test.test'
    const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
    await ownedResolver.setAddr(namehash.hash(name), testAddress)
    const pr = await PublicResolver.at(offchainResolver.address)
    const callData = pr.contract.methods['addr(bytes32)'](
      namehash.hash(name),
    ).encodeABI()
    const result = await doResolveCallback(
      name,
      ['ENS1 nonexistent.eth', 'ENS1 0x1234', `ENS1 ${ownedResolver.address}`],
      callData,
    )
    expect(
      ethers.utils.defaultAbiCoder.decode(['address'], result)[0],
    ).to.equal(testAddress)
  })

  it('correctly handles extra data in the TXT record when calling a resolver that supports it', async function () {
    const name = 'test.test'
    const resolver = await DummyExtendedDNSSECResolver.new()
    const pr = await PublicResolver.at(resolver.address)
    const callData = pr.contract.methods['text'](
      namehash.hash(name),
      'test',
    ).encodeABI()
    const result = await doResolveCallback(
      name,
      [`ENS1 ${resolver.address} foobie bletch`],
      callData,
    )
    expect(ethers.utils.defaultAbiCoder.decode(['string'], result)[0]).to.equal(
      'foobie bletch',
    )
  })

  it('correctly resolves using legacy resolvers without resolve() support', async function () {
    const name = 'test.test'
    const resolver = await DummyLegacyTextResolver.new()
    const callData = resolver.contract.methods['text'](
      namehash.hash(name),
      'test',
    ).encodeABI()
    const result = await doResolveCallback(
      name,
      [`ENS1 ${resolver.address} foobie bletch`],
      callData,
    )
    expect(ethers.utils.defaultAbiCoder.decode(['string'], result)[0]).to.equal(
      'test',
    )
  })
})
