const L2Registry = artifacts.require('L2Registry.sol')
const RootController = artifacts.require('RootController.sol')
const DelegatableResolver = artifacts.require('DelegatableResolver.sol')
const SimpleController = artifacts.require('SimpleController.sol')
const { labelhash, namehash, encodeName, FUSES } = require('../test-utils/ens')
const ROOT_NODE = namehash('')
const TEST_NODE = namehash('test')
const TEST_SUBNODE = namehash('sub.test')
const { deploy } = require('../test-utils/contracts')

contract('L2Registry', function (accounts) {
  let signers,
    deployer,
    deployerAddress,
    owner,
    ownerAddress,
    resolver,
    root,
    registry,
    controller
  beforeEach(async () => {
    signers = await ethers.getSigners()
    deployer = await signers[0]
    deployerAddress = await deployer.getAddress()
    owner = await signers[1]
    ownerAddress = await owner.getAddress()
    subnodeOwner = await signers[2]
    subnodeOwnerAddress = await subnodeOwner.getAddress()

    resolver = await DelegatableResolver.new()
    root = await RootController.new(resolver.address)
    registry = await L2Registry.new(root.address)
    controller = await SimpleController.new(registry.address)
  })
  it('should deploy', async () => {
    assert.equal(await registry.controller(ROOT_NODE), root.address)

    await root.setSubnode(
      registry.address,
      ROOT_NODE,
      labelhash('test'),
      ethers.utils.solidityPack(
        ['address', 'address', 'address'],
        [controller.address, ownerAddress, resolver.address],
      ),
    )
    assert.equal(await registry.controller(TEST_NODE), controller.address)
    assert.equal(await registry.balanceOf(ownerAddress, TEST_NODE), 1)
    assert.equal(await registry.resolver(TEST_NODE), resolver.address)

    await controller.setSubnode(
      TEST_NODE,
      labelhash('sub'),
      subnodeOwnerAddress,
      resolver.address,
      { from: ownerAddress },
    )
    assert.equal(await registry.controller(TEST_SUBNODE), controller.address)
    assert.equal(await registry.balanceOf(subnodeOwnerAddress, TEST_SUBNODE), 1)
    assert.equal(await registry.resolver(TEST_SUBNODE), resolver.address)
  })
})
