const L2Registry = artifacts.require('L2Registry.sol')
const RootController = artifacts.require('RootController.sol')
const DelegatableResolver = artifacts.require('DelegatableResolver.sol')
const SimpleController = artifacts.require('SimpleController.sol')
const SimpleControllerFactory = artifacts.require('SimpleControllerFactory.sol')
const { exceptions } = require('../test-utils')
const { expect } = require('chai')
const { labelhash, namehash, encodeName, FUSES } = require('../test-utils/ens')
const ROOT_NODE = namehash('')
const TEST_NODE = namehash('test')
const { deploy } = require('../test-utils/contracts')
console.log({ ROOT_NODE })
contract('L2Registry', function (accounts) {
  let signers,
    deployer,
    deployerAddress,
    owner,
    ownerAddress,
    resolver,
    root,
    registry,
    controller,
    ownerController,
    controllerFactory
  beforeEach(async () => {
    signers = await ethers.getSigners()
    deployer = await signers[0]
    deployerAddress = await deployer.getAddress()
    deployer = await signers[0]
    deployerAddress = await deployer.getAddress()
    owner = await signers[1]
    ownerAddress = await owner.getAddress()
    subnodeOwner = await signers[2]
    subnodeOwnerAddress = await subnodeOwner.getAddress()

    resolver = await DelegatableResolver.new()
    console.log(1, {
      deployerAddress,
      ownerAddress,
      subnodeOwnerAddress,
    })
    root = await RootController.new(deployerAddress, resolver.address)
    console.log(2, { rootAddress: root.address })
    registry = await L2Registry.new(root.address)
    console.log(3, { registryAddress: registry.address })
    factory = await SimpleControllerFactory.new(registry.address)
    ownerController = await deploy(
      'SimpleController',
      registry.address,
      ownerAddress,
    )
    ownerController = ownerController.connect(owner)
    // controller = await SimpleController.new(
    //     registry.address,
    //     ownerAddress
    // )
    // console.log(4, {controllerAddress:controller.address})
    // ownerController = await (
    //     await ethers.getContractFactory('SimpleController')
    // )
    //     .attach(controller.address)
    //     .connect(ownerAddress)

    // console.log(5, {controllerSigner:ownerController.signer.address})
  })
  it('should deploy', async () => {
    assert.equal(await registry.controller(ROOT_NODE), root.address)
    console.log(6)
    await root.setSubnode(
      registry.address,
      ROOT_NODE,
      labelhash('test'),
      ownerController.address,
    )
    console.log(7)
    assert.equal(await registry.controller(TEST_NODE), ownerController.address)
    console.log(8, await factory.computeAddress(subnodeOwnerAddress))
    console.log(9, await factory.getInstance(subnodeOwnerAddress))
    // console.log(8, {controllerSigner:ownerController.signer.address})
    await ownerController.setSubnode(
      TEST_NODE,
      labelhash('sub'),
      subnodeOwnerAddress,
    )
    console.log(10, await registry.controller(namehash('sub.test')))
  })
})
