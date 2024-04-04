const ExtendedDNSResolver = artifacts.require('ExtendedDNSResolver.sol')
const namehash = require('eth-ens-namehash')
const { expect } = require('chai')
const packet = require('dns-packet')

function hexEncodeName(name) {
  return '0x' + packet.name.encode(name).toString('hex')
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

contract('ExtendedDNSResolver', function (accounts) {
  var resolver = null
  var PublicResolver = null

  beforeEach(async function () {
    resolver = await ExtendedDNSResolver.new()
    PublicResolver = await ethers.getContractFactory('PublicResolver')
  })

  async function resolve(name, method, args, context) {
    const node = namehash.hash(name)
    const callData = PublicResolver.interface.encodeFunctionData(method, [
      node,
      ...args,
    ])
    const resolveArgs = [
      hexEncodeName(name),
      callData,
      ethers.utils.hexlify(ethers.utils.toUtf8Bytes(context)),
    ]
    return resolver.resolve(...resolveArgs)
  }

  describe('a records', async () => {
    it('resolves Ethereum addresses using addr(bytes32)', async function () {
      const name = 'test.test'
      const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
      const result = await resolve(
        name,
        'addr(bytes32)',
        [],
        `a[60]=${testAddress}`,
      )
      expect(result).to.equal(testAddress.toLowerCase())
    })

    it('resolves Ethereum addresses using addr(bytes32,uint256)', async function () {
      const COIN_TYPE_ETH = 60
      const name = 'test.test'
      const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
      const result = await resolve(
        name,
        'addr(bytes32,uint256)',
        [COIN_TYPE_ETH],
        `a[60]=${testAddress}`,
      )
      expect(result).to.equal(testAddress.toLowerCase())
    })

    it('ignores records with the wrong cointype', async function () {
      const COIN_TYPE_BTC = 0
      const name = 'test.test'
      const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
      const result = await resolve(
        name,
        'addr(bytes32,uint256)',
        [COIN_TYPE_BTC],
        `a[60]=${testAddress}`,
      )
      expect(result).to.equal(null)
    })

    it('raise an error for invalid hex data', async function () {
      const name = 'test.test'
      const testAddress = '0xfoobar'
      await expect(
        resolve(name, 'addr(bytes32)', [], `a[60]=${testAddress}`),
      ).to.be.revertedWith('InvalidAddressFormat')
    })

    it('works if the record comes after an unrelated one', async function () {
      const name = 'test.test'
      const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
      const result = await resolve(
        name,
        'addr(bytes32)',
        [],
        `foo=bar a[60]=${testAddress}`,
      )
      expect(result).to.equal(testAddress.toLowerCase())
    })

    it('handles multiple spaces between records', async function () {
      const name = 'test.test'
      const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
      const result = await resolve(
        name,
        'addr(bytes32)',
        [],
        `foo=bar  a[60]=${testAddress}`,
      )
      expect(result).to.equal(testAddress.toLowerCase())
    })

    it('handles multiple spaces between quoted records', async function () {
      const name = 'test.test'
      const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
      const result = await resolve(
        name,
        'addr(bytes32)',
        [],
        `foo='bar'  a[60]=${testAddress}`,
      )
      expect(result).to.equal(testAddress.toLowerCase())
    })

    it('handles no spaces between quoted records', async function () {
      const name = 'test.test'
      const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
      const result = await resolve(
        name,
        'addr(bytes32)',
        [],
        `foo='bar'a[60]=${testAddress}`,
      )
      expect(result).to.equal(testAddress.toLowerCase())
    })

    it('works if the record comes after one for another cointype', async function () {
      const name = 'test.test'
      const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
      const result = await resolve(
        name,
        'addr(bytes32)',
        [],
        `a[0]=0x1234 a[60]=${testAddress}`,
      )
      expect(result).to.equal(testAddress.toLowerCase())
    })

    it('uses the first matching record it finds', async function () {
      const name = 'test.test'
      const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
      const result = await resolve(
        name,
        'addr(bytes32)',
        [],
        `a[60]=${testAddress} a[60]=0x1234567890123456789012345678901234567890`,
      )
      expect(result).to.equal(testAddress.toLowerCase())
    })

    it('resolves addresses with coin types', async function () {
      const CHAIN_ID_OPTIMISM = 10
      const COIN_TYPE_OPTIMISM = (0x80000000 | CHAIN_ID_OPTIMISM) >>> 0
      const name = 'test.test'
      const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
      const result = await resolve(
        name,
        'addr(bytes32,uint256)',
        [COIN_TYPE_OPTIMISM],
        `a[e${CHAIN_ID_OPTIMISM}]=${testAddress}`,
      )
      expect(result).to.equal(testAddress.toLowerCase())
    })
  })

  describe('t records', async () => {
    it('decodes an unquoted t record', async function () {
      const name = 'test.test'
      const result = await resolve(
        name,
        'text',
        ['com.twitter'],
        't[com.twitter]=nicksdjohnson',
      )
      expect(ethers.utils.toUtf8String(ethers.utils.arrayify(result))).to.equal(
        'nicksdjohnson',
      )
    })

    it('returns null for a missing key', async function () {
      const name = 'test.test'
      const result = await resolve(
        name,
        'text',
        ['com.discord'],
        't[com.twitter]=nicksdjohnson',
      )
      expect(result).to.equal(null)
    })

    it('decodes a quoted t record', async function () {
      const name = 'test.test'
      const result = await resolve(
        name,
        'text',
        ['url'],
        "t[url]='https://ens.domains/'",
      )
      expect(ethers.utils.toUtf8String(ethers.utils.arrayify(result))).to.equal(
        'https://ens.domains/',
      )
    })

    it('handles escaped quotes', async function () {
      const name = 'test.test'
      const result = await resolve(
        name,
        'text',
        ['note'],
        "t[note]='I\\'m great'",
      )
      expect(ethers.utils.toUtf8String(ethers.utils.arrayify(result))).to.equal(
        "I'm great",
      )
    })

    it('rejects a record with an unterminated quoted string', async function () {
      const name = 'test.test'
      const result = await resolve(
        name,
        'text',
        ['note'],
        "t[note]='I\\'m great",
      )
      expect(result).to.equal(null)
    })
  })
})
