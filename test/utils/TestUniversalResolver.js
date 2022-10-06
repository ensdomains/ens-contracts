const { expect } = require('chai')
const namehash = require('eth-ens-namehash')
const { hexDataSlice } = require('ethers/lib/utils')
const sha3 = require('web3-utils').sha3
const { Contract } = require('ethers')
const { ethers } = require('hardhat')
const { dns } = require('../test-utils')
const { writeFile } = require('fs/promises')

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const EMPTY_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

contract('UniversalResolver', function (accounts) {
  let ENSRegistry,
    PublicResolver,
    NameWrapper,
    UniversalResolver,
    DummyOffchainResolver,
    LegacyResolver,
    ReverseRegistrar
  let ens,
    publicResolver,
    /**
     * @type {Contract}
     */
    universalResolver,
    dummyOffchainResolver,
    nameWrapper,
    reverseRegistrar,
    reverseNode

  before(async () => {
    ENSRegistry = await ethers.getContractFactory('ENSRegistry')
    PublicResolver = await ethers.getContractFactory('PublicResolver')
    NameWrapper = await ethers.getContractFactory('DummyNameWrapper')
    UniversalResolver = await ethers.getContractFactory('UniversalResolver')
    DummyOffchainResolver = await ethers.getContractFactory(
      'DummyOffchainResolver',
    )
    LegacyResolver = await ethers.getContractFactory('LegacyResolver')
    ReverseRegistrar = await ethers.getContractFactory('ReverseRegistrar')
  })

  beforeEach(async () => {
    node = namehash.hash('eth')
    ens = await ENSRegistry.deploy()
    nameWrapper = await NameWrapper.deploy()
    publicResolver = await PublicResolver.deploy(
      ens.address,
      nameWrapper.address,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
    )
    universalResolver = await UniversalResolver.deploy(ens.address, [
      'http://universal-offchain-resolver.local/',
    ])
    dummyOffchainResolver = await DummyOffchainResolver.deploy()
    reverseRegistrar = await ReverseRegistrar.deploy(ens.address)
    reverseNode = accounts[0].toLowerCase().substring(2) + '.addr.reverse'

    await ens.setSubnodeOwner(EMPTY_BYTES32, sha3('eth'), accounts[0], {
      from: accounts[0],
    })
    await ens.setSubnodeOwner(namehash.hash('eth'), sha3('test'), accounts[0], {
      from: accounts[0],
    })
    await ens.setSubnodeOwner(EMPTY_BYTES32, sha3('reverse'), accounts[0], {
      from: accounts[0],
    })
    await ens.setSubnodeOwner(
      namehash.hash('reverse'),
      sha3('addr'),
      reverseRegistrar.address,
      { from: accounts[0] },
    )
    await ens.setResolver(namehash.hash('test.eth'), publicResolver.address, {
      from: accounts[0],
    })
    await ens.setSubnodeOwner(
      namehash.hash('test.eth'),
      sha3('sub'),
      accounts[0],
      { from: accounts[0] },
    )
    await ens.setResolver(namehash.hash('sub.test.eth'), accounts[1], {
      from: accounts[0],
    })
    await publicResolver.functions['setAddr(bytes32,address)'](
      namehash.hash('test.eth'),
      accounts[1],
      { from: accounts[0] },
    )
    await publicResolver.functions['setText(bytes32,string,string)'](
      namehash.hash('test.eth'),
      'foo',
      'bar',
      { from: accounts[0] },
    )
    await ens.setSubnodeOwner(
      namehash.hash('test.eth'),
      sha3('offchain'),
      accounts[0],
      { from: accounts[0] },
    )
    await ens.setResolver(
      namehash.hash('offchain.test.eth'),
      dummyOffchainResolver.address,
      { from: accounts[0] },
    )

    await reverseRegistrar.claim(accounts[0], {
      from: accounts[0],
    })
    await ens.setResolver(namehash.hash(reverseNode), publicResolver.address, {
      from: accounts[0],
    })
    await publicResolver.setName(namehash.hash(reverseNode), 'test.eth')
  })

  describe('findResolver()', () => {
    it('should find an exact match resolver', async () => {
      const result = await universalResolver.findResolver(
        dns.hexEncodeName('test.eth'),
      )
      expect(result['0']).to.equal(publicResolver.address)
    })

    it('should find a resolver on a parent name', async () => {
      const result = await universalResolver.findResolver(
        dns.hexEncodeName('foo.test.eth'),
      )
      expect(result['0']).to.equal(publicResolver.address)
    })

    it('should choose the resolver closest to the leaf', async () => {
      const result = await universalResolver.findResolver(
        dns.hexEncodeName('sub.test.eth'),
      )
      expect(result['0']).to.equal(accounts[1])
    })
  })

  describe('resolve()', () => {
    it('should resolve a record via legacy methods', async () => {
      const data = publicResolver.interface.encodeFunctionData(
        'addr(bytes32)',
        [namehash.hash('test.eth')],
      )

      const result = await universalResolver['resolve(bytes,bytes)'](
        dns.hexEncodeName('test.eth'),
        data,
      )
      const [ret] = ethers.utils.defaultAbiCoder.decode(
        ['address'],
        result['0'],
      )
      expect(ret).to.equal(accounts[1])
    })

    describe('resolve()', () => {
      it('should resolve a record if `supportsInterface` throws', async () => {
        const legacyResolver = await LegacyResolver.deploy()
        await ens.setSubnodeOwner(
          namehash.hash('eth'),
          sha3('test2'),
          accounts[0],
          { from: accounts[0] },
        )
        await ens.setResolver(
          namehash.hash('test2.eth'),
          legacyResolver.address,
          { from: accounts[0] },
        )
        const data = publicResolver.interface.encodeFunctionData(
          'addr(bytes32)',
          [namehash.hash('test.eth')],
        )
        const result = await universalResolver['resolve(bytes,bytes)'](
          dns.hexEncodeName('test2.eth'),
          data,
        )
        const [ret] = ethers.utils.defaultAbiCoder.decode(
          ['address'],
          result['0'],
        )
        expect(ret).to.equal(legacyResolver.address)
      })

      it('should resolve a record via legacy methods', async () => {
        const data = publicResolver.interface.encodeFunctionData(
          'addr(bytes32)',
          [namehash.hash('test.eth')],
        )
        const result = await universalResolver['resolve(bytes,bytes)'](
          dns.hexEncodeName('test.eth'),
          data,
        )
        const [ret] = ethers.utils.defaultAbiCoder.decode(
          ['address'],
          result['0'],
        )
        expect(ret).to.equal(accounts[1])
      })

      it('should return a wrapped revert if the resolver reverts with OffchainData', async () => {
        const data = publicResolver.interface.encodeFunctionData(
          'addr(bytes32)',
          [namehash.hash('offchain.test.eth')],
        )

        const batchGateway = (
          await ethers.getContractAt('BatchGateway', ZERO_ADDRESS)
        ).interface
        // OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)
        // This is the extraData value the universal resolver should encode
        const extraData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'string[]', 'bytes', '(bytes4,bytes)[]'],
          [
            dummyOffchainResolver.address,
            ['http://universal-offchain-resolver.local/'],
            '0x',
            [
              [
                ethers.utils.hexDataSlice(
                  ethers.utils.id('resolveCallback(bytes,bytes)'),
                  0,
                  4,
                ),
                data,
              ],
            ],
          ],
        )

        const callData = batchGateway.encodeFunctionData('query', [
          [[dummyOffchainResolver.address, ['https://example.com/'], data]],
        ])

        try {
          await universalResolver['resolve(bytes,bytes)'](
            dns.hexEncodeName('offchain.test.eth'),
            data,
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

  describe('reverse()', () => {
    const makeEstimateAndResult = async (contract, func, ...args) => ({
      estimate: await contract.estimateGas[func](...args),
      result: await contract.functions[func](...args),
    })
    it('should resolve a reverse record with name and resolver address', async () => {
      const { estimate, result } = await makeEstimateAndResult(
        universalResolver,
        'reverse(bytes)',
        dns.hexEncodeName(reverseNode),
      )
      console.log('GAS ESTIMATE:', estimate)
      expect(result['0']).to.equal('test.eth')
      expect(result['1']).to.equal(accounts[1])
      expect(result['2']).to.equal(publicResolver.address)
      expect(result['3']).to.equal(publicResolver.address)
    })
  })
})
