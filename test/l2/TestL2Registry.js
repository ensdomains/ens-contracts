const { ethers } = require('hardhat')
const { use, expect } = require('chai')
const { solidity } = require('ethereum-waffle')
const { labelhash, namehash, encodeName, FUSES } = require('../test-utils/ens')
const { evm } = require('../test-utils')
const L2Registry = artifacts.require('L2Registry.sol')
const RootController = artifacts.require('RootController.sol')
const DelegatableResolver = artifacts.require('DelegatableResolver.sol')
const FuseController = artifacts.require('FuseController.sol')
const FuseControllerUpgraded = artifacts.require('FuseControllerUpgraded.sol')
const StaticMetadataService = artifacts.require('StaticMetadataService.sol')
const TEST_NODE = namehash('test')
const TEST_SUBNODE = namehash('sub.test')
const { deploy } = require('../test-utils/contracts')
//const { shouldBehaveLikeERC1155 } = require('./ERC1155.behaviour')
//const { shouldSupportInterfaces } = require('./SupportsInterface.behaviour')
//const { shouldRespectConstraints } = require('./Constraints.behaviour')
const { ZERO_ADDRESS } = require('@openzeppelin/test-helpers/src/constants')
const { EMPTY_BYTES32, EMPTY_ADDRESS } = require('../test-utils/constants')

const abiCoder = new ethers.utils.AbiCoder()

use(solidity)

const ROOT_NODE = EMPTY_BYTES32

const DUMMY_ADDRESS = '0x0000000000000000000000000000000000000001'
const DAY = 86400
const GRACE_PERIOD = 90 * DAY

function increaseTime(delay) {
  return ethers.provider.send('evm_increaseTime', [delay])
}

function mine() {
  return ethers.provider.send('evm_mine')
}

const {
  CAN_DO_EVERYTHING,
  CANNOT_BURN_NAME,
  CANNOT_BURN_FUSES,
  CANNOT_TRANSFER,
  CANNOT_SET_RESOLVER,
  CANNOT_CREATE_SUBDOMAIN,
  CANNOT_SET_RENEWAL_CONTROLLER,
  PARENT_CANNOT_CONTROL,
} = {
  CAN_DO_EVERYTHING: 0,
  CANNOT_BURN_NAME: 1,
  CANNOT_BURN_FUSES: 2 ** 1,
  CANNOT_TRANSFER: 2 ** 2,
  CANNOT_SET_RESOLVER: 2 ** 3,
  CANNOT_CREATE_SUBDOMAIN: 2 ** 4,
  CANNOT_SET_RENEWAL_CONTROLLER: 2 ** 5,
  PARENT_CANNOT_CONTROL: 2 ** 6,
}

describe.only('L2Registry', () => {
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
  let MAX_EXPIRY = 2n ** 64n - 1n

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

    const testNodeData = ethers.utils.solidityPack(
      ['address', 'address', 'address', 'uint64', 'uint64', 'address'],
      [
        controller.address,
        ownerAddress,
        resolver.address,
        MAX_EXPIRY,
        CANNOT_BURN_NAME | PARENT_CANNOT_CONTROL,
        EMPTY_ADDRESS,
      ],
    )

    await root.setSubnode(
      registry.address,
      0, // This is ignored because the ROOT_NODE is fixed in the root controller.
      labelhash('test'),
      testNodeData,
    )

    assert.equal(await registry.controller(TEST_NODE), controller.address)
    assert.equal(await registry.balanceOf(ownerAddress, TEST_NODE), 1)
    assert.equal(await registry.resolver(TEST_NODE), resolver.address)
    assert.equal(await controller.ownerOf(TEST_NODE), ownerAddress)
    assert.equal(await controller.expiryOf(TEST_NODE), MAX_EXPIRY)
    assert.equal(
      await controller.fusesOf(TEST_NODE),
      CANNOT_BURN_NAME | PARENT_CANNOT_CONTROL,
    )
    assert.equal(await controller.renewalControllerOf(TEST_NODE), EMPTY_ADDRESS)
  })

  beforeEach(async () => {
    result = await ethers.provider.send('evm_snapshot')
  })
  afterEach(async () => {
    await ethers.provider.send('evm_revert', [result])
  })

  describe('??()', () => {
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
        MAX_EXPIRY,
        CANNOT_SET_RESOLVER | CANNOT_BURN_NAME | PARENT_CANNOT_CONTROL, // no fuse
        EMPTY_ADDRESS, // no controller
        { from: ownerAddress },
      )
      assert.equal(await registry.controller(TEST_SUBNODE), controller.address)
      assert.equal(
        await registry.balanceOf(subnodeOwnerAddress, TEST_SUBNODE),
        1,
      )
      assert.equal(await registry.resolver(TEST_SUBNODE), resolver.address)
      assert.equal(await controller.ownerOf(TEST_SUBNODE), subnodeOwnerAddress)
      assert.equal(await controller.expiryOf(TEST_SUBNODE), MAX_EXPIRY)
      assert.equal(
        await controller.fusesOf(TEST_SUBNODE),
        CANNOT_SET_RESOLVER | CANNOT_BURN_NAME | PARENT_CANNOT_CONTROL,
      )
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
      await registry.clearAllApprovedForIds(ownerAddress, {
        from: ownerAddress,
      })
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

      assert.equal(
        await registry.isApprovedForId(TEST_NODE, dummyAddress),
        true,
      )
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
    it('should set a subnode, and then let the subnode expire', async () => {
      // Get the block time in seconds
      let blockTime = (await ethers.provider.getBlock('latest')).timestamp

      // An expiry that is 2 months in seconds beyond the current block time
      let expiry = blockTime + 60 * DAY

      await controller.setSubnode(
        TEST_NODE,
        labelhash('sub'),
        subnodeOwnerAddress,
        resolver.address,
        expiry,
        0, // no fuse
        EMPTY_ADDRESS, // no controller
        { from: ownerAddress },
      )
      assert.equal(await registry.controller(TEST_SUBNODE), controller.address)
      assert.equal(
        await registry.balanceOf(subnodeOwnerAddress, TEST_SUBNODE),
        1,
      )
      assert.equal(await registry.resolver(TEST_SUBNODE), resolver.address)
      assert.equal(await controller.ownerOf(TEST_SUBNODE), subnodeOwnerAddress)
      assert.equal(await controller.expiryOf(TEST_SUBNODE), expiry)
      assert.equal(await controller.fusesOf(TEST_SUBNODE), 0)
      assert.equal(
        await controller.renewalControllerOf(TEST_SUBNODE),
        EMPTY_ADDRESS,
      )

      console.log('blockTime', blockTime)

      await increaseTime(60 * DAY)
      await mine()

      //Make sure all the values are set to the default values
      assert.equal(
        await registry.balanceOf(subnodeOwnerAddress, TEST_SUBNODE),
        0,
      )
      assert.equal(await registry.resolver(TEST_SUBNODE), EMPTY_ADDRESS)
      assert.equal(await controller.ownerOf(TEST_SUBNODE), EMPTY_ADDRESS)
      assert.equal(await controller.expiryOf(TEST_SUBNODE), expiry)
      assert.equal(await controller.fusesOf(TEST_SUBNODE), 0)
      assert.equal(
        await controller.renewalControllerOf(TEST_SUBNODE),
        EMPTY_ADDRESS,
      )
    })

    // make sure that the name can't be transferred when the CANNOT_TRANSFER fuse is set
    it('should set the CANNOT_TRANSFER fuse', async () => {
      await controller.setFuses(TEST_NODE, CANNOT_TRANSFER, {
        from: ownerAddress,
      })
      assert.equal(await controller.fusesOf(TEST_NODE), CANNOT_TRANSFER)
      await expect(
        registry.safeTransferFrom(
          ownerAddress,
          dummyAddress,
          TEST_NODE,
          1,
          '0x',
          {
            from: ownerAddress,
          },
        ),
      ).to.be.revertedWith('')
    })

    // Make sure the resolver can't be set when the CANNOT_SET_RESOLVER fuse is burned
    it('should set the CANNOT_SET_RESOLVER fuse', async () => {
      await controller.setFuses(TEST_NODE, CANNOT_SET_RESOLVER, {
        from: ownerAddress,
      })
      assert.equal(await controller.fusesOf(TEST_NODE), CANNOT_SET_RESOLVER)
      await expect(
        controller.setResolver(TEST_NODE, dummyAddress, {
          from: ownerAddress,
        }),
      ).to.be.revertedWith('')
    })

    it('should transfer the name to the zero address', async () => {
      await registry.safeTransferFrom(
        ownerAddress,
        ZERO_ADDRESS,
        TEST_NODE,
        1,
        '0x',
        {
          from: ownerAddress,
        },
      )
      assert.equal(await registry.balanceOf(ownerAddress, TEST_NODE), 0)
      assert.equal(await registry.resolver(TEST_NODE), EMPTY_ADDRESS)
      assert.equal(await controller.ownerOf(TEST_NODE), EMPTY_ADDRESS)
      assert.equal(await controller.expiryOf(TEST_NODE), 0)
      assert.equal(await controller.fusesOf(TEST_NODE), 0)
      assert.equal(
        await controller.renewalControllerOf(TEST_NODE),
        EMPTY_ADDRESS,
      )
    })
  })
})
