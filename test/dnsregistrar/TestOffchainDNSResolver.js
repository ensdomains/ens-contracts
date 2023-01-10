const ENSRegistry = artifacts.require('./ENSRegistry.sol')
const Root = artifacts.require('/Root.sol')
const IDNSGateway = artifacts.require('./IDNSGateway.sol')
const SimplePublixSuffixList = artifacts.require('./SimplePublicSuffixList.sol')
const DNSRegistrarContract = artifacts.require('./DNSRegistrar.sol')
const OffchainDNSResolver = artifacts.require('./OffchainDNSResolver.sol')
const PublicResolver = artifacts.require('./PublicResolver.sol')
const DNSSECImpl = artifacts.require('./DNSSECImpl')
const namehash = require('eth-ens-namehash')
const utils = require('./Helpers/Utils')
const { exceptions } = require('@ensdomains/test-utils')
const { assert, expect } = require('chai')
const { rootKeys, hexEncodeSignedSet } = require('../utils/dnsutils.js')
const { ethers } = require('hardhat')

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

contract('OffchainDNSResolver', function(accounts) {
  var ens = null
  var root = null
  var dnssec = null
  var suffixes = null
  var offchainResolver = null
  var registrar = null
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

    offchainResolver = await OffchainDNSResolver.new(ens.address, dnssec.address, "https://localhost:8000/query");

    registrar = await DNSRegistrarContract.new(
      ZERO_ADDRESS, // Previous registrar
      offchainResolver.address,
      dnssec.address,
      suffixes.address,
      ens.address
    )
    await root.setController(registrar.address, true)
  })

  it.only('should respond to resolution requests with a CCIP read request to the DNS gateway', async function() {
    const pr = await PublicResolver.at(offchainResolver.address);
    const DNSGatewayInterface = new ethers.utils.Interface(IDNSGateway.abi);
    const dnsName = utils.hexEncodeName('test.test');
    const callData = pr.contract.methods['addr(bytes32)'](namehash.hash('test.test')).encodeABI();
    await expect(offchainResolver.resolve(
      dnsName,
      callData
    )).to.be.revertedWith('OffchainLookup('
      + '"' + offchainResolver.address + '", '
      + '["https://localhost:8000/query"], '
      + '"' + DNSGatewayInterface.encodeFunctionData('resolve', [dnsName, 16]) + '", '
      + '"' + ethers.utils.id('resolveCallback(bytes,bytes)').slice(0, 10) + '", '
      + '"' + ethers.utils.defaultAbiCoder.encode(['bytes', 'bytes'], [dnsName, callData]) + '"'
      + ')'
    );
  })
});