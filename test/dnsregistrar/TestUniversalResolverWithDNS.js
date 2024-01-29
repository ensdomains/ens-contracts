const { solidity } = require('ethereum-waffle')
const { use, expect } = require('chai')
const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3
const { ethers } = require('hardhat')
const { dns } = require('../test-utils')
const { deploy } = require('../test-utils/contracts')
const packet = require('dns-packet')
const utils = require('./Helpers/Utils')

use(solidity)

const OFFCHAIN_DNS_GATEWAY = 'https://localhost:8000/lookup'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const EMPTY_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

const realAnchors = [
  {
    name: '.',
    type: 'DS',
    class: 'IN',
    ttl: 3600,
    data: {
      keyTag: 19036,
      algorithm: 8,
      digestType: 2,
      digest: new Buffer(
        '49AAC11D7B6F6446702E54A1607371607A1A41855200FD2CE1CDDE32F24E8FB5',
        'hex',
      ),
    },
  },
  {
    name: '.',
    type: 'DS',
    klass: 'IN',
    ttl: 3600,
    data: {
      keyTag: 20326,
      algorithm: 8,
      digestType: 2,
      digest: new Buffer(
        'E06D44B80B8F1D39A95C0B0D7C65D08458E880409BBC683457104237C7F8EC8D',
        'hex',
      ),
    },
  },
]

const resolveCallbackSig = ethers.utils.hexDataSlice(
  ethers.utils.id('resolveCallback(bytes,bytes)'),
  0,
  4,
)

const anchors = realAnchors.slice()

function encodeAnchors(anchors) {
  return (
    '0x' +
    anchors
      .map((anchor) => {
        return packet.answer.encode(anchor).toString('hex')
      })
      .join('')
  )
}

function encodeName(name) {
  return '0x' + packet.name.encode(name).toString('hex')
}

contract('UniversalResolver', function (accounts) {
  let ENSRegistry,
    Root,
    IDNSGateway,
    DNSSECImpl,
    SimplePublicSuffixList,
    DNSRegistrar,
    OwnedResolver,
    UniversalResolver,
    OffchainDNSResolver,
    DummyOffchainResolver,
    LegacyResolver
  let ens,
    root,
    dnssec,
    suffixes,
    dnsRegistrar,
    ownedResolver,
    /**
     * @type {Contract}
     */
    universalResolver,
    offchainDNSResolver,
    dummyOffchainResolver,
    batchGateway,
    dummyOldResolver

  before(async () => {
    batchGateway = (await ethers.getContractAt('BatchGateway', ZERO_ADDRESS))
      .interface
    ENSRegistry = await ethers.getContractFactory('ENSRegistry')
    Root = await ethers.getContractFactory('Root')
    DNSSECImpl = await ethers.getContractFactory(
      'DNSSECImpl',
      encodeAnchors(anchors),
    )
    SimplePublicSuffixList = await ethers.getContractFactory(
      'SimplePublicSuffixList',
    )
    DNSRegistrar = await ethers.getContractFactory('DNSRegistrar')
    OwnedResolver = await ethers.getContractFactory('OwnedResolver')
    PublicResolver = await ethers.getContractFactory('PublicResolver')
    UniversalResolver = await ethers.getContractFactory('UniversalResolver')
    DummyOffchainResolver = await ethers.getContractFactory(
      'DummyOffchainResolver',
    )
    OffchainDNSResolver = await ethers.getContractFactory('OffchainDNSResolver')
    LegacyResolver = await ethers.getContractFactory('LegacyResolver')
  })

  beforeEach(async () => {
    node = namehash.hash('eth')
    ens = await deploy('ENSRegistry')
    root = await deploy('Root', ens.address)
    dnssec = await deploy('DNSSECImpl', encodeAnchors(anchors))
    suffixes = await deploy('SimplePublicSuffixList')
    await suffixes.addPublicSuffixes([
      utils.hexEncodeName('test'),
      utils.hexEncodeName('co.nz'),
    ])

    offchainDNSResolver = await deploy(
      'OffchainDNSResolver',
      ens.address,
      dnssec.address,
      OFFCHAIN_DNS_GATEWAY,
    )

    ownedResolver = await deploy('OwnedResolver')

    dnsRegistrar = await deploy(
      'DNSRegistrar',
      ZERO_ADDRESS, // Previous registrar
      offchainDNSResolver.address,
      dnssec.address,
      suffixes.address,
      ens.address,
    )

    await ens.setSubnodeOwner(EMPTY_BYTES32, sha3('eth'), accounts[0], {
      from: accounts[0],
    })

    universalResolver = await deploy('UniversalResolver', ens.address, [
      'http://universal-offchain-resolver.local/',
    ])
    dummyOffchainResolver = await deploy('MockOffchainResolver')
    dummyOldResolver = await deploy('DummyOldResolver')

    await ens.setOwner(EMPTY_BYTES32, root.address)
    await root.setController(dnsRegistrar.address, true)
    await root.setController(accounts[0], true)

    await dnsRegistrar.enableNode(encodeName('test'), {
      gasLimit: 10000000,
    })
  })

  describe('findResolver()', () => {
    it('should find an exact match resolver', async () => {
      const result = await universalResolver.findResolver(
        dns.hexEncodeName('test.test'),
      )
      expect(result['0']).to.equal(offchainDNSResolver.address)
    })
  })

  describe('resolve()', () => {
    it('should revert OffchainLookup via universalResolver + offchainDNSresolver', async () => {
      const addrCallData = PublicResolver.interface.encodeFunctionData(
        'addr(bytes32)',
        [namehash.hash('test.test')],
      )

      const IDNSGatewayAbi = [
        'function resolve(bytes memory name, uint16 qtype ) external returns (bytes[] memory)',
      ]
      const iface = new ethers.utils.Interface(IDNSGatewayAbi)
      const innerExtraData = iface.encodeFunctionData('resolve', [
        dns.hexEncodeName('test.test'),
        16,
      ])

      const callData = batchGateway.encodeFunctionData('query', [
        [[offchainDNSResolver.address, [OFFCHAIN_DNS_GATEWAY], innerExtraData]],
      ])

      const extraData = ethers.utils.defaultAbiCoder.encode(
        ['bool', 'address', 'string[]', 'bytes', '(bytes4,bytes)[]'],
        [
          true,
          offchainDNSResolver.address,
          ['http://universal-offchain-resolver.local/'],
          '0x',
          [
            [
              resolveCallbackSig,
              ethers.utils.defaultAbiCoder.encode(
                ['bytes', 'bytes', 'bytes4'],
                [dns.hexEncodeName('test.test'), addrCallData, '0x00000000'],
              ),
            ],
          ],
        ],
      )

      try {
        await universalResolver['resolve(bytes,bytes)'](
          dns.hexEncodeName('test.test'),
          addrCallData,
        )
      } catch (e) {
        expect(e.errorName).to.equal('OffchainLookup')
        expect(e.errorArgs.sender).to.equal(universalResolver.address)
        expect(e.errorArgs.urls).to.deep.equal([
          'http://universal-offchain-resolver.local/',
        ])
        expect(e.errorArgs.callData).to.equal(callData)
        expect(e.errorArgs.callbackFunction).to.equal(
          ethers.utils.hexDataSlice(
            ethers.utils.id('resolveSingleCallback(bytes,bytes)'),
            0,
            4,
          ),
        )
        expect(e.errorArgs.extraData).to.equal(extraData)
      }
    })
  })
})
