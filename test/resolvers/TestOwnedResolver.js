const ENS = artifacts.require('./registry/ENSRegistry.sol')
const OwnedResolver = artifacts.require('OwnedResolver.sol')
const NameWrapper = artifacts.require('DummyNameWrapper.sol')
const { deploy } = require('../test-utils/contracts')
const { labelhash } = require('../test-utils/ens')
const { EMPTY_BYTES32: ROOT_NODE } = require('../test-utils/constants')

const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3

const {
  exceptions,
  dns: { nameToHex },
} = require('../test-utils')

contract('OwnedResolver', function (accounts) {
  let node
  let ens, resolver, nameWrapper
  let account
  let signers

  beforeEach(async () => {
    signers = await ethers.getSigners()
    account = await signers[0].getAddress()
    node = namehash.hash('eth')
    ens = await ENS.new()
    nameWrapper = await NameWrapper.new()

    //setup reverse registrar

    const ReverseRegistrar = await deploy('ReverseRegistrar', ens.address)

    await ens.setSubnodeOwner(ROOT_NODE, labelhash('reverse'), account)
    await ens.setSubnodeOwner(
      namehash.hash('reverse'),
      labelhash('addr'),
      ReverseRegistrar.address,
    )

    resolver = await OwnedResolver.new(
      ens.address,
      nameWrapper.address,
      accounts[9], // trusted contract
      ReverseRegistrar.address, //ReverseRegistrar.address,
    )

    await ReverseRegistrar.setDefaultResolver(resolver.address)

    await ens.setSubnodeOwner('0x0', sha3('eth'), accounts[0], {
      from: accounts[0],
    })
  })

  describe('dns', async () => {
    const basicSetDNSRecords = async () => {
      // a.eth. 3600 IN A 1.2.3.4
      const arec = '016103657468000001000100000e10000401020304'
      // b.eth. 3600 IN A 2.3.4.5
      const b1rec = '016203657468000001000100000e10000402030405'
      // b.eth. 3600 IN A 3.4.5.6
      const b2rec = '016203657468000001000100000e10000403040506'
      // eth. 86400 IN SOA ns1.ethdns.xyz. hostmaster.test.eth. 2018061501 15620 1800 1814400 14400
      const soarec =
        '03657468000006000100015180003a036e733106657468646e730378797a000a686f73746d6173746572057465737431036574680078492cbd00003d0400000708001baf8000003840'
      const rec = '0x' + arec + b1rec + b2rec + soarec

      await resolver.setDNSRecords(node, rec, { from: accounts[0] })

      assert.equal(
        await resolver.dnsRecord(node, sha3(nameToHex('a.eth.')), 1),
        '0x016103657468000001000100000e10000401020304',
      )
      assert.equal(
        await resolver.dnsRecord(node, sha3(nameToHex('b.eth.')), 1),
        '0x016203657468000001000100000e10000402030405016203657468000001000100000e10000403040506',
      )
      assert.equal(
        await resolver.dnsRecord(node, sha3(nameToHex('eth.')), 6),
        '0x03657468000006000100015180003a036e733106657468646e730378797a000a686f73746d6173746572057465737431036574680078492cbd00003d0400000708001baf8000003840',
      )
    }
    it('permits setting name by owner', basicSetDNSRecords)

    it('should keep track of entries', async () => {
      // c.eth. 3600 IN A 1.2.3.4
      const crec = '016303657468000001000100000e10000401020304'
      const rec = '0x' + crec

      await resolver.setDNSRecords(node, rec, { from: accounts[0] })

      // Initial check
      let hasEntries = await resolver.hasDNSRecords(
        node,
        sha3(nameToHex('c.eth.')),
      )
      assert.equal(hasEntries, true)
      hasEntries = await resolver.hasDNSRecords(node, sha3(nameToHex('d.eth.')))
      assert.equal(hasEntries, false)

      // Update with no new data makes no difference
      await resolver.setDNSRecords(node, rec, { from: accounts[0] })
      hasEntries = await resolver.hasDNSRecords(node, sha3(nameToHex('c.eth.')))
      assert.equal(hasEntries, true)

      // c.eth. 3600 IN A
      const crec2 = '016303657468000001000100000e100000'
      const rec2 = '0x' + crec2

      await resolver.setDNSRecords(node, rec2, { from: accounts[0] })

      // Removal returns to 0
      hasEntries = await resolver.hasDNSRecords(node, sha3(nameToHex('c.eth.')))
      assert.equal(hasEntries, false)
    })

    it('forbids setting DNS records by non-owners', async () => {
      // f.eth. 3600 IN A 1.2.3.4
      const frec = '016603657468000001000100000e10000401020304'
      const rec = '0x' + frec
      await exceptions.expectFailure(
        resolver.setDNSRecords(node, rec, { from: accounts[1] }),
      )
    })

    const basicSetZonehash = async () => {
      await resolver.setZonehash(
        node,
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        { from: accounts[0] },
      )
      assert.equal(
        await resolver.zonehash(node),
        '0x0000000000000000000000000000000000000000000000000000000000000001',
      )
    }

    it('permits setting zonehash by owner', basicSetZonehash)

    it('can overwrite previously set zonehash', async () => {
      await resolver.setZonehash(
        node,
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        { from: accounts[0] },
      )
      assert.equal(
        await resolver.zonehash(node),
        '0x0000000000000000000000000000000000000000000000000000000000000001',
      )

      await resolver.setZonehash(
        node,
        '0x0000000000000000000000000000000000000000000000000000000000000002',
        { from: accounts[0] },
      )
      assert.equal(
        await resolver.zonehash(node),
        '0x0000000000000000000000000000000000000000000000000000000000000002',
      )
    })

    it('can overwrite to same zonehash', async () => {
      await resolver.setZonehash(
        node,
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        { from: accounts[0] },
      )
      assert.equal(
        await resolver.zonehash(node),
        '0x0000000000000000000000000000000000000000000000000000000000000001',
      )

      await resolver.setZonehash(
        node,
        '0x0000000000000000000000000000000000000000000000000000000000000002',
        { from: accounts[0] },
      )
      assert.equal(
        await resolver.zonehash(node),
        '0x0000000000000000000000000000000000000000000000000000000000000002',
      )
    })

    it('forbids setting zonehash by non-owners', async () => {
      await exceptions.expectFailure(
        resolver.setZonehash(
          node,
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          { from: accounts[1] },
        ),
      )
    })

    it('forbids writing same zonehash by non-owners', async () => {
      await resolver.setZonehash(
        node,
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        { from: accounts[0] },
      )

      await exceptions.expectFailure(
        resolver.setZonehash(
          node,
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          { from: accounts[1] },
        ),
      )
    })

    it('returns empty when fetching nonexistent zonehash', async () => {
      assert.equal(await resolver.zonehash(node), null)
    })
  })
})
