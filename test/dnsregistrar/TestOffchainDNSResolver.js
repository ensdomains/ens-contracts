const ENSRegistry = artifacts.require('./ENSRegistry.sol')
const Root = artifacts.require('/Root.sol')
const IDNSGateway = artifacts.require('./IDNSGateway.sol')
const SimplePublixSuffixList = artifacts.require('./SimplePublicSuffixList.sol')
const DNSRegistrarContract = artifacts.require('./DNSRegistrar.sol')
const OwnedResolver = artifacts.require('./OwnedResolver.sol')
const ExtendedDNSResolver = artifacts.require('./ExtendedDNSResolver.sol')
const OffchainDNSResolver = artifacts.require('./OffchainDNSResolver.sol')
const DummyOffchainResolver = artifacts.require('./MockOffchainResolver.sol')
const PublicResolver = artifacts.require('./PublicResolver.sol')
const DummyExtendedDNSSECResolver = artifacts.require(
  './DummyExtendedDNSSECResolver.sol',
)
const DummyLegacyTextResolver = artifacts.require(
  './DummyLegacyTextResolver.sol',
)
const DummyNonCCIPAwareResolver = artifacts.require(
  './DummyNonCCIPAwareResolver.sol',
)
const DNSSECImpl = artifacts.require('./DNSSECImpl')
const namehash = require('eth-ens-namehash')
const utils = require('./Helpers/Utils')
const { expect } = require('chai')
const { rootKeys, hexEncodeSignedSet } = require('../utils/dnsutils.js')
const { ethers } = require('hardhat')

const OFFCHAIN_GATEWAY = 'https://localhost:8000/query'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

contract('OffchainDNSResolver', function (accounts) {
  var ens = null
  var root = null
  var dnssec = null
  var suffixes = null
  var offchainDNSResolver = null
  var offchainResolver = null
  var dummyResolver = null
  var ownedResolver = null
  var registrar = null
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

    offchainResolver = await DummyOffchainResolver.new()
    offchainDNSResolver = await OffchainDNSResolver.new(
      ens.address,
      dnssec.address,
      OFFCHAIN_GATEWAY,
    )
    ownedResolver = await OwnedResolver.new()

    dummyResolver = await DummyNonCCIPAwareResolver.new(
      offchainDNSResolver.address,
    )

    registrar = await DNSRegistrarContract.new(
      ZERO_ADDRESS, // Previous registrar
      offchainDNSResolver.address,
      dnssec.address,
      suffixes.address,
      ens.address,
    )
    await root.setController(registrar.address, true)
    await root.setController(accounts[0], true)
  })

  it('should respond to resolution requests with a CCIP read request to the DNS gateway', async function () {
    const pr = await PublicResolver.at(offchainDNSResolver.address)
    const DNSGatewayInterface = new ethers.utils.Interface(IDNSGateway.abi)
    const dnsName = utils.hexEncodeName('test.test')
    const callData = pr.contract.methods['addr(bytes32)'](
      namehash.hash('test.test'),
    ).encodeABI()
    await expect(
      offchainDNSResolver.resolve(dnsName, callData),
    ).to.be.revertedWith(
      'OffchainLookup(' +
        '"' +
        offchainDNSResolver.address +
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
          ['bytes', 'bytes', 'bytes4'],
          [dnsName, callData, '0x00000000'],
        ) +
        '"' +
        ')',
    )
  })

  function doDNSResolveCallback(name, texts, callData) {
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
      ['bytes', 'bytes', 'bytes4'],
      [dnsName, callData, '0x00000000'],
    )
    return offchainDNSResolver.resolveCallback(response, extraData)
  }

  function doResolveCallback(extraData, result) {
    let validUntil = Math.floor(Date.now() / 1000 + 10000)

    const response = ethers.utils.defaultAbiCoder.encode(
      ['bytes', 'uint64', 'bytes'],
      [result, validUntil, '0x'],
    )
    return offchainResolver.resolveCallback(response, extraData)
  }

  it('handles calls to resolveCallback() with valid DNS TXT records containing an address', async function () {
    const name = 'test.test'
    const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
    await ownedResolver.setAddr(namehash.hash(name), testAddress)
    const pr = await PublicResolver.at(offchainDNSResolver.address)
    const callData = pr.contract.methods['addr(bytes32)'](
      namehash.hash(name),
    ).encodeABI()
    const result = await doDNSResolveCallback(
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
    const pr = await PublicResolver.at(offchainDNSResolver.address)
    const callData = pr.contract.methods['addr(bytes32)'](
      namehash.hash(name),
    ).encodeABI()
    const result = await doDNSResolveCallback(
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
    const pr = await PublicResolver.at(offchainDNSResolver.address)
    const callData = pr.contract.methods['addr(bytes32)'](
      namehash.hash(name),
    ).encodeABI()
    const result = await doDNSResolveCallback(
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
    const pr = await PublicResolver.at(offchainDNSResolver.address)
    const callData = pr.contract.methods['addr(bytes32)'](
      namehash.hash(name),
    ).encodeABI()
    await expect(
      doDNSResolveCallback(name, ['nonsense'], callData),
    ).to.be.revertedWith('CouldNotResolve')
  })

  it('handles calls to resolveCallback() where the valid TXT record is not the first', async function () {
    const name = 'test.test'
    const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
    await ownedResolver.setAddr(namehash.hash(name), testAddress)
    const pr = await PublicResolver.at(offchainDNSResolver.address)
    const callData = pr.contract.methods['addr(bytes32)'](
      namehash.hash(name),
    ).encodeABI()
    const result = await doDNSResolveCallback(
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
    const pr = await PublicResolver.at(offchainDNSResolver.address)
    const callData = pr.contract.methods['addr(bytes32)'](
      namehash.hash(name),
    ).encodeABI()
    const result = await doDNSResolveCallback(
      name,
      ['ENS1 nonexistent.eth', 'ENS1 0x1234', `ENS1 ${ownedResolver.address}`],
      callData,
    )
    expect(
      ethers.utils.defaultAbiCoder.decode(['address'], result)[0],
    ).to.equal(testAddress)
  })

  it('correctly handles extra (string) data in the TXT record when calling a resolver that supports it', async function () {
    const name = 'test.test'
    const resolver = await DummyExtendedDNSSECResolver.new()
    const pr = await PublicResolver.at(resolver.address)
    const callData = pr.contract.methods['text'](
      namehash.hash(name),
      'test',
    ).encodeABI()
    const result = await doDNSResolveCallback(
      name,
      [`ENS1 ${resolver.address} foobie bletch`],
      callData,
    )
    expect(ethers.utils.defaultAbiCoder.decode(['string'], result)[0]).to.equal(
      'foobie bletch',
    )
  })

  it('correctly handles extra data in the TXT record when calling a resolver that supports address resolution', async function () {
    const name = 'test.test'
    const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
    const resolver = await ExtendedDNSResolver.new()
    const pr = await PublicResolver.at(resolver.address)
    const callData = pr.contract.methods['addr(bytes32)'](
      namehash.hash(name),
    ).encodeABI()
    const result = await doDNSResolveCallback(
      name,
      [`ENS1 ${resolver.address} a[60]=${testAddress}`],
      callData,
    )
    expect(result).to.equal(testAddress.toLowerCase())
  })

  it('correctly handles extra data in the TXT record when calling a resolver that supports address resolution with valid cointype', async function () {
    const COIN_TYPE_ETH = 60
    const name = 'test.test'
    const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
    const resolver = await ExtendedDNSResolver.new()
    const pr = await PublicResolver.at(resolver.address)
    const callData = pr.contract.methods['addr(bytes32,uint256)'](
      namehash.hash(name),
      COIN_TYPE_ETH,
    ).encodeABI()
    const result = await doDNSResolveCallback(
      name,
      [`ENS1 ${resolver.address} a[${COIN_TYPE_ETH}]=${testAddress}`],
      callData,
    )
    expect(result).to.equal(testAddress.toLowerCase())
  })

  it('handles extra data in the TXT record when calling a resolver that supports address resolution with invalid cointype', async function () {
    const COIN_TYPE_BTC = 0
    const name = 'test.test'
    const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
    const resolver = await ExtendedDNSResolver.new()
    const pr = await PublicResolver.at(resolver.address)
    const callData = pr.contract.methods['addr(bytes32,uint256)'](
      namehash.hash(name),
      COIN_TYPE_BTC,
    ).encodeABI()
    const result = await doDNSResolveCallback(
      name,
      [`ENS1 ${resolver.address} a[60]=${testAddress}`],
      callData,
    )
    expect(result).to.equal(null)
  })

  it('raise an error if extra (address) data in the TXT record is invalid', async function () {
    const name = 'test.test'
    const testAddress = '0xsmth'
    const resolver = await ExtendedDNSResolver.new()
    const pr = await PublicResolver.at(resolver.address)
    const callData = pr.contract.methods['addr(bytes32)'](
      namehash.hash(name),
    ).encodeABI()
    await expect(
      doDNSResolveCallback(
        name,
        [`ENS1 ${resolver.address} a[60]=${testAddress}`],
        callData,
      ),
    ).to.be.revertedWith('InvalidAddressFormat')
  })

  it('correctly resolves using legacy resolvers without resolve() support', async function () {
    const name = 'test.test'
    const resolver = await DummyLegacyTextResolver.new()
    const callData = resolver.contract.methods['text'](
      namehash.hash(name),
      'test',
    ).encodeABI()
    const result = await doDNSResolveCallback(
      name,
      [`ENS1 ${resolver.address} foobie bletch`],
      callData,
    )
    expect(ethers.utils.defaultAbiCoder.decode(['string'], result)[0]).to.equal(
      'test',
    )
  })

  it('correctly resolves using offchain resolver', async function () {
    const name = 'test.test'
    const pr = await PublicResolver.at(offchainDNSResolver.address)
    const dnsName = utils.hexEncodeName('test.test')
    const callData = pr.contract.methods['addr(bytes32)'](
      namehash.hash(name),
    ).encodeABI()

    const extraData = ethers.utils.defaultAbiCoder.encode(
      ['bytes', 'bytes', 'bytes4'],
      [
        dnsName,
        callData,
        ethers.utils.id('resolveCallback(bytes,bytes)').slice(0, 10),
      ],
    )

    await expect(
      doDNSResolveCallback(
        name,
        [`ENS1 ${offchainResolver.address} foobie bletch`],
        callData,
      ),
    ).to.be.revertedWith(
      'OffchainLookup(' +
        '"' +
        offchainDNSResolver.address +
        '", ' +
        '["https://example.com/"], ' +
        '"' +
        callData +
        '", ' +
        '"' +
        ethers.utils.id('resolveCallback(bytes,bytes)').slice(0, 10) +
        '", ' +
        '"' +
        extraData +
        '"' +
        ')',
    )

    const expectedResult = ethers.utils.defaultAbiCoder.encode(
      ['address'],
      ['0x0D59d0f7DcC0fBF0A3305cE0261863aAf7Ab685c'],
    )

    const result = await doResolveCallback(extraData, expectedResult)
    expect(
      ethers.utils.defaultAbiCoder.decode(['address'], result)[0],
    ).to.equal('0x0D59d0f7DcC0fBF0A3305cE0261863aAf7Ab685c')
  })

  it('should prevent OffchainLookup error propagation from non-CCIP-aware contracts', async function () {
    const name = 'test.test'
    const pr = await PublicResolver.at(offchainDNSResolver.address)
    const callData = pr.contract.methods['addr(bytes32)'](
      namehash.hash(name),
    ).encodeABI()
    await expect(
      doDNSResolveCallback(name, [`ENS1 ${dummyResolver.address}`], callData),
    ).to.be.revertedWith('InvalidOperation')
  })
})
