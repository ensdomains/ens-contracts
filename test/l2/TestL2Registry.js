const L2Registry = artifacts.require('L2Registry.sol')
const RootController = artifacts.require('RootController.sol')
const DelegatableResolver = artifacts.require('DelegatableResolver.sol')
const SimpleController = artifacts.require('SimpleController.sol')
const { labelhash, namehash, encodeName, FUSES } = require('../test-utils/ens')
const ROOT_NODE = namehash('')
const TEST_NODE = namehash('test')
const TEST_SUBNODE = namehash('sub.test')
const { deploy } = require('../test-utils/contracts')

contract.only('L2Registry', function (accounts) {
  let signers,
    deployer,
    deployerAddress,
    owner,
    ownerAddress,
    resolver,
    root,
    registry,
    controller,
    dummyAddress,
    operator,
    delegate
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

    dummyAddress = '0x1234567890123456789012345678901234567890'
    operator = signers[3]
    delegate = signers[4]

    assert.equal(await registry.controller(ROOT_NODE), root.address)

    // test to make sure the root node is owned by the deployer
    assert.equal(await registry.balanceOf(deployerAddress, ROOT_NODE), 1)

    await root.setSubnode(
      registry.address,
      0, // This is ignored because the ROOT_NODE is fixed in the root controller.
      labelhash('test'),
      ethers.utils.solidityPack(
        ['address', 'address', 'address'],
        [controller.address, ownerAddress, resolver.address],
      ),
    )
    assert.equal(await registry.controller(TEST_NODE), controller.address)
    assert.equal(await registry.balanceOf(ownerAddress, TEST_NODE), 1)
    assert.equal(await registry.resolver(TEST_NODE), resolver.address)
  })
  it('should set a subnode on the test node', async () => {
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

  it('should set the resolver', async () => {
    await controller.setResolver(TEST_NODE, dummyAddress, {
      from: ownerAddress,
    })
    assert.equal(await registry.resolver(TEST_NODE), dummyAddress)
  })

  it('should set the resolver as an operator', async () => {
    await registry.setApprovalForAll(operator.address, true, {
      from: ownerAddress,
    })
    await controller.setResolver(TEST_NODE, dummyAddress, {
      from: operator.address,
    })
    assert.equal(await registry.resolver(TEST_NODE), dummyAddress)
  })

  it('should set the resolver as a delegate', async () => {
    await registry.setApprovalForId(delegate.address, TEST_NODE, true, {
      from: ownerAddress,
    })
    await controller.setResolver(TEST_NODE, dummyAddress, {
      from: delegate.address,
    })
    assert.equal(await registry.resolver(TEST_NODE), dummyAddress)
  })

  it('should revert if the resolver is set as a delegate after the owner calls clearAllApprovedForIds', async () => {
    await registry.setApprovalForId(delegate.address, TEST_NODE, true, {
      from: ownerAddress,
    })
    await registry.clearAllApprovedForIds(ownerAddress, { from: ownerAddress })
    // make sure the set resolver fails expect revert without a reason
    await expect(
      controller.setResolver(TEST_NODE, dummyAddress, {
        from: delegate.address,
      }),
    ).to.be.reverted
  })

  // Check to make sure that a operator can call the setApprovalForId function.
  it('should set the setApprovalForId as an operator', async () => {
    await registry.setApprovalForAll(operator.address, true, {
      from: ownerAddress,
    })

    await registry.setApprovalForId(dummyAddress, TEST_NODE, true, {
      from: operator.address,
    })

    assert.equal(await registry.isApprovedForId(TEST_NODE, dummyAddress), true)
  })
})
