const ENS = artifacts.require('./registry/ENSRegistry.sol')
const PublicResolver = artifacts.require('PublicResolverWithFallback.sol')
const NameWrapper = artifacts.require('DummyNameWrapper.sol')

const { expect } = require('chai')
const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3

contract('PublicResolver', function (accounts) {
  let node
  let ens, resolver, nameWrapper
  const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000'

  beforeEach(async () => {
    node = namehash.hash('eth')
    ens = await ENS.new()
    nameWrapper = await NameWrapper.new()
    resolver = await PublicResolver.new(
      ens.address,
      nameWrapper.address,
      accounts[9], // trusted contract
      EMPTY_ADDRESS,
    )
    await ens.setSubnodeOwner('0x0', sha3('eth'), accounts[0], {
      from: accounts[0],
    })
  })

  const fallbackAvatar = 'https://example.com/avatar?node='
  const newAvatar = 'https://example.com/newavatar.png'

  describe('with fallback', () => {
    beforeEach(async () => {
      await resolver.setFallbackTextURI('avatar', fallbackAvatar, {
        from: accounts[0],
      })
    })

    it('sets fallback text URI with setFallbackTextURI()', async () => {
      expect(await resolver.fallback_text_uris('avatar')).to.equal(
        fallbackAvatar,
      )
    })

    it('uses fallback uri on unset text', async () => {
      assert.equal(await resolver.text(node, 'avatar'), fallbackAvatar + node)
    })

    it('uses set text record', async () => {
      await resolver.setText(node, 'avatar', newAvatar, { from: accounts[0] })
      assert.equal(await resolver.text(node, 'avatar'), newAvatar)
    })
  })

  describe('without fallback', () => {
    it('returns empty string on unset text', async () => {
      assert.equal(await resolver.text(node, 'avatar'), '')
    })

    it('uses set text record', async () => {
      await resolver.setText(node, 'avatar', newAvatar, { from: accounts[0] })
      assert.equal(await resolver.text(node, 'avatar'), newAvatar)
    })
  })
})
