const ENS = artifacts.require('./registry/ENSRegistry.sol')
const NameWrapper = artifacts.require('DummyNameWrapper.sol')
const { deploy } = require('../test-utils/contracts')
const { labelhash } = require('../test-utils/ens')
const { EMPTY_BYTES32: ROOT_NODE } = require('../test-utils/constants')

const { expect } = require('chai')
const namehash = require('eth-ens-namehash')

contract('Parent Avatar Resolver', function (accounts) {
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

    resolver = await deploy(
      'ParentAvatarResolver',
      ens.address,
      nameWrapper.address,
      accounts[9], // trusted contract
      ReverseRegistrar.address, //ReverseRegistrar.address,
    )

    await ReverseRegistrar.setDefaultResolver(resolver.address)

    await ens.setSubnodeOwner('0x0', labelhash('eth'), accounts[0], {
      from: accounts[0],
    })
  })

  describe('setText()', () => {
    it('should set text', async () => {
      await resolver.setText(node, 'url', 'https://example.com', {
        from: accounts[0],
      })
      const result = await resolver.text(node, 'url')
      expect(result).to.equal('https://example.com')
    })

    it('should not be able to set avatar', async () => {
      await expect(
        resolver.setText(node, 'avatar', 'https://example.com', {
          from: accounts[0],
        }),
      ).to.be.revertedWith('AvatarCannotBeSetByOwner()')
    })
  })

  describe('setAvatar()', () => {
    it('should be able to set avatar as the parentOwner', async () => {
      resolver.setAvatar(ROOT_NODE, labelhash('eth'), 'https://example.com', {
        from: accounts[0],
      })

      const result = await resolver.text(node, 'avatar')
      expect(result).to.equal('https://example.com')
    })

    it('should not able to set avatar if not the parent Owner', async () => {
      ens.setSubnodeOwner('0x0', labelhash('eth'), accounts[1])
      expect(
        resolver.setAvatar(ROOT_NODE, labelhash('eth'), 'https://example.com', {
          from: accounts[1],
        }),
      ).to.be.revertedWith('AvatarCannotBeSetByOwner()')
    })
  })
})
