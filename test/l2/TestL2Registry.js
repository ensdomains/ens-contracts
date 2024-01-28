const L2Registry = artifacts.require('L2Registry.sol')
const RootController = artifacts.require('RootController.sol')
const DelegatableResolver = artifacts.require('DelegatableResolver.sol')
const FuseController = artifacts.require('FuseController.sol')
const FuseControllerUpgraded = artifacts.require('FuseControllerUpgraded.sol')
const StaticMetadataService = artifacts.require('StaticMetadataService.sol')
const { labelhash, namehash, encodeName, FUSES } = require('../test-utils/ens')
const ROOT_NODE = namehash('')
const TEST_NODE = namehash('test')
const TEST_SUBNODE = namehash('sub.test')
const { deploy } = require('../test-utils/contracts')
const { EMPTY_BYTES32, EMPTY_ADDRESS } = require('../test-utils/constants')

// The maximum value of a uint64 is 2^64 - 1 = 18446744073709551615
// use BN instead of BigNumber to avoid BN error

const MAX_UINT64 = '18446744073709551615'

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
    controllerUpgraded,
    dummyAddress,
    operator,
    delegate,
    metaDataservice

  beforeEach(async () => {
    signers = await ethers.getSigners()
    deployer = await signers[0]
    deployerAddress = await deployer.getAddress()
    owner = await signers[1]
    ownerAddress = await owner.getAddress()
    subnodeOwner = await signers[2]
    subnodeOwnerAddress = await subnodeOwner.getAddress()
    hacker = await signers[3]
    hackerAddress = await hacker.getAddress()
    dummyAccount = await signers[4]
    dummyAccountAddress = await dummyAccount.getAddress()

    resolver = await DelegatableResolver.new()
    metaDataservice = await StaticMetadataService.new('https://ens.domains')
    root = await RootController.new(resolver.address)
    registry = await L2Registry.new(root.address, metaDataservice.address)
    controller = await FuseController.new(registry.address)
    controllerUpgraded = await FuseControllerUpgraded.new(registry.address)

    dummyAddress = '0x1234567890123456789012345678901234567890'
    operator = signers[3]
    delegate = signers[4]

    assert.equal(await registry.controller(ROOT_NODE), root.address)

    // test to make sure the root node is owned by the deployer
    assert.equal(await registry.balanceOf(deployerAddress, ROOT_NODE), 1)

    const packedData = ethers.utils.solidityPack(
      ['address', 'address', 'address', 'uint64', 'uint32', 'address'],
      [
        controller.address,
        ownerAddress,
        resolver.address,
        MAX_UINT64,
        0,
        EMPTY_ADDRESS,
      ],
    )

    await root.setSubnode(
      registry.address,
      0, // This is ignored because the ROOT_NODE is fixed in the root controller.
      labelhash('test'),
      packedData,
    )

    assert.equal(await registry.controller(TEST_NODE), controller.address)
    assert.equal(await registry.balanceOf(ownerAddress, TEST_NODE), 1)
    assert.equal(await registry.resolver(TEST_NODE), resolver.address)
    assert.equal(await controller.ownerOf(TEST_NODE), ownerAddress)
    assert.equal(await controller.expiryOf(TEST_NODE), MAX_UINT64)
    assert.equal(await controller.fusesOf(TEST_NODE), 0)
    assert.equal(await controller.renewalControllerOf(TEST_NODE), EMPTY_ADDRESS)
  })

  it('uri() returns url', async () => {
    expect(await registry.uri(123)).to.equal('https://ens.domains')
  })

  it('owner can set a new MetadataService', async () => {
    await registry.setMetadataService(dummyAccountAddress)
    expect(await registry.metadataService()).to.equal(dummyAccountAddress)
  })

  it('non-owner cannot set a new MetadataService', async () => {
    await expect(
      registry.setMetadataService(dummyAccountAddress, {
        from: hackerAddress,
      }),
    ).to.be.revertedWith('Ownable: caller is not the owner')
  })

  it('should set a subnode on the test node', async () => {
    await controller.setSubnode(
      TEST_NODE,
      labelhash('sub'),
      subnodeOwnerAddress,
      resolver.address,
      5184000, // 60 days
      0, // no fuse
      EMPTY_ADDRESS, // no controller
      { from: ownerAddress },
    )
    assert.equal(await registry.controller(TEST_SUBNODE), controller.address)
    assert.equal(await registry.balanceOf(subnodeOwnerAddress, TEST_SUBNODE), 1)
    assert.equal(await registry.resolver(TEST_SUBNODE), resolver.address)
    assert.equal(await controller.ownerOf(TEST_SUBNODE), subnodeOwnerAddress)
    assert.equal(await controller.expiryOf(TEST_SUBNODE), 5184000)
    assert.equal(await controller.fusesOf(TEST_SUBNODE), 0)
    assert.equal(
      await controller.renewalControllerOf(TEST_SUBNODE),
      EMPTY_ADDRESS,
    )
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

  // Check to make sure we can upgrade the controller
  it('should upgrade the controller', async () => {
    // get the controller
    const currentController = await registry.controller(TEST_NODE)
    // set the upgraded controller on the controller.
    await controller.setUpgradeController(controllerUpgraded.address, {
      from: deployerAddress,
    })

    // upgrade the controller of the TEST_NODE using the upgrade(node, extraData) function
    await controller.upgrade(TEST_NODE, '0x', {
      from: ownerAddress,
    })

    // get the new controller
    const _upgradedController = await registry.controller(TEST_NODE)

    // check to make sure the controller is the upgraded controller
    assert.equal(_upgradedController, controllerUpgraded.address)

    // create am instace from the upgraded controller's address
    _upgradedControllerInstance = await ethers.getContractAt(
      'FuseControllerUpgraded',
      _upgradedController,
    )

    // check to make sure the owner is the same on the upgraded controller
    assert.equal(
      await _upgradedControllerInstance.ownerOf(TEST_NODE),
      ownerAddress,
    )
  })
})
