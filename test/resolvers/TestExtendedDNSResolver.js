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
    return resolver.resolve(
      hexEncodeName(name),
      callData,
      ethers.utils.hexlify(ethers.utils.toUtf8Bytes(context)),
    )
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
  })
})
