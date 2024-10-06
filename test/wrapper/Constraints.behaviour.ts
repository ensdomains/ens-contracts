import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { getAddress, labelhash, namehash, zeroAddress } from 'viem'
import { DAY, FUSES } from '../fixtures/constants.js'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { toTokenId } from '../fixtures/utils.js'
import { deployNameWrapperFixture } from './fixtures/deploy.js'

// States
// Expiry > block.timestamp	CU burned	PCC burned	Parent burned parent's CU
// CU = CANNOT_UNWRAP
// PCC = PARENT_CANNOT_CONTROL

// Each describe represents a specific state
// 0000 = Default Wrapped (DW)
// 1000 = Not expired (NE)
// 0100 = CU burned (CU)
// 0010 = PCC burned (PCC)
// 0001 = Parent burned parent's CU (PCU)
// Each can be combined to represent multiple states

const {
  CANNOT_UNWRAP,
  CANNOT_SET_RESOLVER,
  PARENT_CANNOT_CONTROL,
  CAN_DO_EVERYTHING,
  IS_DOT_ETH,
} = FUSES

const GRACE_PERIOD = 90n * DAY
const MAX_EXPIRY = 2n ** 64n - 1n

const parentLabel = 'test1'
const parentLabelHash = labelhash(parentLabel)
const parentLabelId = toTokenId(parentLabelHash)
const parentNode = namehash('test1.eth')
const parentNodeId = toTokenId(parentNode)
const childNode = namehash('sub.test1.eth')
const childNodeId = toTokenId(childNode)
const childLabel = 'sub'
const childLabelHash = labelhash(childLabel)

async function baseFixture() {
  const initial = await loadFixture(deployNameWrapperFixture)

  await initial.baseRegistrar.write.setApprovalForAll([
    initial.nameWrapper.address,
    true,
  ])

  return initial
}

// Reusable state setup
const setupState = ({
  parentFuses,
  childFuses,
  childExpiry,
}: {
  parentFuses: number
  childFuses: number
  childExpiry: bigint
}) =>
  async function setupStateFixture() {
    const initial = await loadFixture(baseFixture)
    const { baseRegistrar, nameWrapper, accounts } = initial

    await baseRegistrar.write.register([
      parentLabelId,
      accounts[0].address,
      DAY,
    ])
    await nameWrapper.write.wrapETH2LD([
      parentLabel,
      accounts[0].address,
      parentFuses,
      zeroAddress,
    ])

    await nameWrapper.write.setSubnodeOwner([
      parentNode,
      childLabel,
      accounts[1].address,
      childFuses,
      childExpiry, // Expired ??
    ])

    return initial
  }

// Reusable state setup
const setupStateUnexpired = ({
  parentFuses,
  childFuses,
}: {
  parentFuses: number
  childFuses: number
}) =>
  async function setupStateUnexpiredFixture() {
    const initial = await loadFixture(baseFixture)
    const { baseRegistrar, nameWrapper, accounts } = initial

    await baseRegistrar.write.register([
      parentLabelId,
      accounts[0].address,
      DAY * 2n,
    ])
    const parentExpiry = await baseRegistrar.read.nameExpires([parentLabelId])
    await nameWrapper.write.wrapETH2LD([
      parentLabel,
      accounts[0].address,
      parentFuses,
      zeroAddress,
    ])

    await nameWrapper.write.setSubnodeOwner([
      parentNode,
      childLabel,
      accounts[1].address,
      childFuses,
      parentExpiry - DAY, // Expires a day before parent
    ])

    return initial
  }

// Expired, nothing burnt.
const setupState0000DW = setupState({
  parentFuses: CAN_DO_EVERYTHING,
  childFuses: CAN_DO_EVERYTHING,
  childExpiry: 0n,
})
const setupState0001PCU = setupState({
  parentFuses: CANNOT_UNWRAP,
  childFuses: CAN_DO_EVERYTHING,
  childExpiry: 0n,
})
const setupState1000NE = setupStateUnexpired({
  childFuses: CAN_DO_EVERYTHING,
  parentFuses: CAN_DO_EVERYTHING,
})
const setupState1001NE_PCU = setupStateUnexpired({
  childFuses: CAN_DO_EVERYTHING,
  parentFuses: CANNOT_UNWRAP,
})
const setupState1011NE_PCC_PCU = setupStateUnexpired({
  childFuses: PARENT_CANNOT_CONTROL,
  parentFuses: CANNOT_UNWRAP,
})
const setupState1111NE_CU_PCC_PCU = setupStateUnexpired({
  childFuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
  parentFuses: CANNOT_UNWRAP,
})

type BaseTestParameters = {
  fixture: () => ReturnType<typeof baseFixture>
}

// Reusable tests
const parentCanExtend = ({
  fixture,
  isNotExpired,
}: BaseTestParameters & {
  isNotExpired?: boolean
}) => {
  if (isNotExpired) {
    it('Child should have an expiry < parent', async () => {
      const { nameWrapper, baseRegistrar, publicClient } = await loadFixture(
        fixture,
      )

      const [, , childExpiry] = await nameWrapper.read.getData([childNodeId])
      const parentExpiry = await baseRegistrar.read.nameExpires([parentLabelId])
      expect(childExpiry).toBeLessThan(parentExpiry)

      const timestamp = await publicClient.getBlock().then((b) => b.timestamp)
      expect(childExpiry).toBeGreaterThan(timestamp)
    })
  } else {
    it('Child should have a 0 expiry before extending', async () => {
      const { nameWrapper } = await loadFixture(fixture)

      const [, , expiryBefore] = await nameWrapper.read.getData([childNodeId])
      expect(expiryBefore).toEqual(0n)
    })
  }

  it('Parent can extend expiry with setChildFuses()', async () => {
    const { nameWrapper, baseRegistrar, accounts } = await loadFixture(fixture)

    const parentExpiry = await baseRegistrar.read.nameExpires([parentLabelId])

    await nameWrapper.write.setChildFuses([
      parentNode,
      childLabelHash,
      CAN_DO_EVERYTHING,
      MAX_EXPIRY,
    ])

    const [, , expiry] = await nameWrapper.read.getData([childNodeId])

    expect(expiry).toEqual(parentExpiry + GRACE_PERIOD)
  })

  it('Parent can extend expiry with setSubnodeOwner()', async () => {
    const { nameWrapper, baseRegistrar, accounts } = await loadFixture(fixture)

    const parentExpiry = await baseRegistrar.read.nameExpires([parentLabelId])

    await nameWrapper.write.setSubnodeOwner([
      parentNode,
      childLabel,
      accounts[1].address,
      CAN_DO_EVERYTHING,
      MAX_EXPIRY,
    ])

    const [, , expiry] = await nameWrapper.read.getData([childNodeId])

    expect(expiry).toEqual(parentExpiry + GRACE_PERIOD)
  })

  it('Parent can extend expiry with setSubnodeRecord()', async () => {
    const { nameWrapper, baseRegistrar, accounts } = await loadFixture(fixture)

    const parentExpiry = await baseRegistrar.read.nameExpires([parentLabelId])

    await nameWrapper.write.setSubnodeRecord([
      parentNode,
      childLabel,
      accounts[1].address,
      zeroAddress,
      0n,
      CAN_DO_EVERYTHING,
      MAX_EXPIRY,
    ])

    const [, , expiry] = await nameWrapper.read.getData([childNodeId])

    expect(expiry).toEqual(parentExpiry + GRACE_PERIOD)
  })
}

const parentCannotBurnFusesOrPCC = ({ fixture }: BaseTestParameters) => {
  it('Parent cannot burn fuses with setChildFuses()', async () => {
    const { nameWrapper } = await loadFixture(fixture)

    await expect(nameWrapper)
      .write('setChildFuses', [
        parentNode,
        childLabelHash,
        CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
        0n,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)
  })

  it('Parent cannot burn fuses with setSubnodeOwner()', async () => {
    const { nameWrapper, accounts } = await loadFixture(fixture)

    await expect(nameWrapper)
      .write('setSubnodeOwner', [
        parentNode,
        childLabel,
        accounts[1].address,
        CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
        0n,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)
  })

  it('Parent cannot burn fuses with setSubnodeRecord()', async () => {
    const { nameWrapper, accounts } = await loadFixture(fixture)

    await expect(nameWrapper)
      .write('setSubnodeRecord', [
        parentNode,
        childLabel,
        accounts[1].address,
        zeroAddress,
        0n,
        CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
        0n,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)
  })
}

const parentCanReplaceOwner = ({ fixture }: BaseTestParameters) => {
  it('Parent can replace owner with setSubnodeOwner()', async () => {
    const { nameWrapper, accounts } = await loadFixture(fixture)

    await expect(
      nameWrapper.read.ownerOf([childNodeId]),
    ).resolves.toEqualAddress(accounts[1].address)

    await nameWrapper.write.setSubnodeOwner([
      parentNode,
      childLabel,
      accounts[0].address,
      CAN_DO_EVERYTHING,
      0n,
    ])

    await expect(
      nameWrapper.read.ownerOf([childNodeId]),
    ).resolves.toEqualAddress(accounts[0].address)
  })

  it('Parent can replace owner with setSubnodeRecord()', async () => {
    const { nameWrapper, accounts } = await loadFixture(fixture)

    await expect(
      nameWrapper.read.ownerOf([childNodeId]),
    ).resolves.toEqualAddress(accounts[1].address)

    await nameWrapper.write.setSubnodeRecord([
      parentNode,
      childLabel,
      accounts[0].address,
      zeroAddress,
      0n,
      CAN_DO_EVERYTHING,
      0n,
    ])

    await expect(
      nameWrapper.read.ownerOf([childNodeId]),
    ).resolves.toEqualAddress(accounts[0].address)
  })
}

const parentCanUnwrapChild = ({ fixture }: BaseTestParameters) => {
  it('Parent can unwrap owner with setSubnodeRecord() and then unwrap', async () => {
    const { ensRegistry, nameWrapper, accounts } = await loadFixture(fixture)

    //check previous owners
    await expect(
      nameWrapper.read.ownerOf([childNodeId]),
    ).resolves.toEqualAddress(accounts[1].address)
    await expect(ensRegistry.read.owner([childNode])).resolves.toEqualAddress(
      nameWrapper.address,
    )

    await nameWrapper.write.setSubnodeRecord([
      parentNode,
      childLabel,
      accounts[0].address,
      zeroAddress,
      0n,
      CAN_DO_EVERYTHING,
      0n,
    ])

    await nameWrapper.write.unwrap([
      parentNode,
      childLabelHash,
      accounts[0].address,
    ])

    await expect(
      nameWrapper.read.ownerOf([childNodeId]),
    ).resolves.toEqualAddress(zeroAddress)
    await expect(ensRegistry.read.owner([childNode])).resolves.toEqualAddress(
      accounts[0].address,
    )
  })
}

const parentCannotBurnParentControlledFuses = ({
  fixture,
}: BaseTestParameters) => {
  it('Parent cannot burn parent-controlled fuses', async () => {
    const { nameWrapper } = await loadFixture(fixture)

    await expect(nameWrapper)
      .write('setChildFuses', [parentNode, childLabelHash, 1 << 18, 0n])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)
  })
}

const ownerIsOwnerWhenExpired = ({ fixture }: BaseTestParameters) => {
  it('Owner is still owner when expired', async () => {
    const { nameWrapper, accounts, publicClient } = await loadFixture(fixture)

    const timestamp = await publicClient.getBlock().then((b) => b.timestamp)
    const [, , expiry] = await nameWrapper.read.getData([childNodeId])

    expect(expiry).toBeLessThan(timestamp)

    await expect(
      nameWrapper.read.ownerOf([childNodeId]),
    ).resolves.toEqualAddress(accounts[1].address)
  })
}

const ownerCannotBurnFuses = ({ fixture }: BaseTestParameters) => {
  it('Owner cannot burn CU because PCC is not burned', async () => {
    const { nameWrapper, accounts } = await loadFixture(fixture)

    await expect(nameWrapper)
      .write('setFuses', [childNode, CANNOT_UNWRAP], { account: accounts[1] })
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)
  })

  it('Owner cannot burn other fuses because CU and PCC are not burned', async () => {
    const { nameWrapper, accounts } = await loadFixture(fixture)

    await expect(nameWrapper)
      .write('setFuses', [childNode, CANNOT_SET_RESOLVER], {
        account: accounts[1],
      })
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)
  })
}

const ownerCanUnwrap = ({ fixture }: BaseTestParameters) => {
  it('Owner can unwrap', async () => {
    const { nameWrapper, accounts } = await loadFixture(fixture)

    await nameWrapper.write.unwrap(
      [parentNode, childLabelHash, accounts[1].address],
      { account: accounts[1] },
    )

    await expect(
      nameWrapper.read.ownerOf([childNodeId]),
    ).resolves.toEqualAddress(zeroAddress)
  })
}

const parentCanBurnParentControlledFusesWithExpiry = ({
  fixture,
}: BaseTestParameters) => {
  it('Parent cannot burn parent-controlled fuses as they reset to 0', async () => {
    const { nameWrapper } = await loadFixture(fixture)

    await nameWrapper.write.setChildFuses([
      parentNode,
      childLabelHash,
      1 << 18,
      0n,
    ])

    // expired names get normalised to 0
    const [, fuses] = await nameWrapper.read.getData([childNodeId])
    expect(fuses).toEqual(0)
  })

  it('Parent can burn parent-controlled fuses, if expiry is extended', async () => {
    const { nameWrapper } = await loadFixture(fixture)

    await nameWrapper.write.setChildFuses([
      parentNode,
      childLabelHash,
      1 << 18,
      MAX_EXPIRY,
    ])

    const [, fuses] = await nameWrapper.read.getData([childNodeId])
    expect(fuses).toEqual(1 << 18)
  })
}

const parentCanBurnFusesOrPCC = ({ fixture }: BaseTestParameters) => {
  it('Parent can burn fuses with setChildFuses()', async () => {
    const { nameWrapper } = await loadFixture(fixture)

    await nameWrapper.write.setChildFuses([
      parentNode,
      childLabelHash,
      CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER,
      0n,
    ])

    const [, fuses] = await nameWrapper.read.getData([childNodeId])
    expect(fuses).toEqual(
      CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER,
    )
  })

  it('Parent can burn fuses with setSubnodeOwner()', async () => {
    const { nameWrapper, accounts } = await loadFixture(fixture)

    await nameWrapper.write.setSubnodeOwner([
      parentNode,
      childLabel,
      accounts[1].address,
      CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER,
      0n,
    ])

    const [, fuses] = await nameWrapper.read.getData([childNodeId])
    expect(fuses).toEqual(
      CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER,
    )
  })

  it('Parent can burn fuses with setSubnodeRecord()', async () => {
    const { nameWrapper, accounts } = await loadFixture(fixture)

    await nameWrapper.write.setSubnodeRecord([
      parentNode,
      childLabel,
      accounts[1].address,
      zeroAddress,
      0n,
      CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER,
      0n,
    ])

    const [, fuses] = await nameWrapper.read.getData([childNodeId])
    expect(fuses).toEqual(
      CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER,
    )
  })

  it('Parent cannot burn fuses if PCC is not burnt too', async () => {
    const { nameWrapper, accounts } = await loadFixture(fixture)

    await expect(nameWrapper)
      .write('setSubnodeRecord', [
        parentNode,
        childLabel,
        accounts[1].address,
        zeroAddress,
        0n,
        CANNOT_UNWRAP | CANNOT_SET_RESOLVER,
        0n,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)

    await expect(nameWrapper)
      .write('setChildFuses', [
        parentNode,
        childLabelHash,
        CANNOT_UNWRAP | CANNOT_SET_RESOLVER,
        0n,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)

    await expect(nameWrapper)
      .write('setSubnodeOwner', [
        parentNode,
        childLabel,
        accounts[1].address,
        CANNOT_UNWRAP | CANNOT_SET_RESOLVER,
        0n,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)
  })
}

const parentCanBurnParentControlledFuses = ({
  fixture,
}: BaseTestParameters) => {
  it('Parent can burn parent-controlled fuses', async () => {
    const { nameWrapper } = await loadFixture(fixture)

    await nameWrapper.write.setChildFuses([
      parentNode,
      childLabelHash,
      1 << 18,
      0n,
    ])

    const [, fuses] = await nameWrapper.read.getData([childNodeId])
    expect(fuses).toEqual(1 << 18)
  })
}

const testStateTransition1000to1010 = ({ fixture }: BaseTestParameters) => {
  it('1000 => 1010 - Parent cannot burn PCC with setChildFuses()', async () => {
    const { nameWrapper } = await loadFixture(fixture)

    await expect(nameWrapper)
      .write('setChildFuses', [
        parentNode,
        childLabelHash,
        PARENT_CANNOT_CONTROL,
        0n,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)
  })

  it('1000 => 1010 - Parent cannot burn PCC with setSubnodeOwner()', async () => {
    const { nameWrapper, accounts } = await loadFixture(fixture)

    await expect(nameWrapper)
      .write('setSubnodeOwner', [
        parentNode,
        childLabel,
        accounts[1].address,
        PARENT_CANNOT_CONTROL,
        0n,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)
  })

  it('1000 => 1010 - Parent cannot burn PCC with setSubnodeRecord()', async () => {
    const { nameWrapper, accounts } = await loadFixture(fixture)

    await expect(nameWrapper)
      .write('setSubnodeRecord', [
        parentNode,
        childLabel,
        accounts[1].address,
        zeroAddress,
        0n,
        PARENT_CANNOT_CONTROL,
        0n,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)
  })
}

const parentCanExtendWithSetChildFuses = ({ fixture }: BaseTestParameters) => {
  it('Child should have a <parent expiry before extending', async () => {
    const { nameWrapper, baseRegistrar, publicClient } = await loadFixture(
      fixture,
    )

    const [, , childExpiry] = await nameWrapper.read.getData([childNodeId])
    const parentExpiry = await baseRegistrar.read.nameExpires([parentLabelId])
    expect(childExpiry).toBeLessThan(parentExpiry)

    const timestamp = await publicClient.getBlock().then((b) => b.timestamp)
    expect(childExpiry).toBeGreaterThan(timestamp)
  })

  it('Parent can extend expiry with setChildFuses()', async () => {
    const { nameWrapper, baseRegistrar } = await loadFixture(fixture)

    const parentExpiry = await baseRegistrar.read.nameExpires([parentLabelId])

    await nameWrapper.write.setChildFuses([
      parentNode,
      childLabelHash,
      CAN_DO_EVERYTHING,
      MAX_EXPIRY,
    ])

    const [, , expiry] = await nameWrapper.read.getData([childNodeId])

    expect(expiry).toEqual(parentExpiry + GRACE_PERIOD)
  })

  it('Parent cannot extend expiry with setSubnodeOwner()', async () => {
    const { nameWrapper, accounts } = await loadFixture(fixture)

    await expect(nameWrapper)
      .write('setSubnodeOwner', [
        parentNode,
        childLabel,
        accounts[1].address,
        CAN_DO_EVERYTHING,
        MAX_EXPIRY,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)
  })

  it('Parent cannot extend expiry with setSubnodeRecord()', async () => {
    const { nameWrapper, accounts } = await loadFixture(fixture)

    await expect(nameWrapper)
      .write('setSubnodeRecord', [
        parentNode,
        childLabel,
        accounts[1].address,
        zeroAddress,
        0n,
        CAN_DO_EVERYTHING,
        MAX_EXPIRY,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)
  })
}

const parentCannotBurnFusesWhenPCCisBurned = ({
  fixture,
}: BaseTestParameters) => {
  it('Parent cannot burn fuses with setChildFuses()', async () => {
    const { nameWrapper } = await loadFixture(fixture)

    const [, fusesBefore] = await nameWrapper.read.getData([childNodeId])
    expect(fusesBefore).toEqual(PARENT_CANNOT_CONTROL)

    await expect(nameWrapper)
      .write('setChildFuses', [
        parentNode,
        childLabelHash,
        CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER,
        0n,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)

    await expect(nameWrapper)
      .write('setChildFuses', [
        parentNode,
        childLabelHash,
        CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
        0n,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)

    // parent can burn PCC again, but has no effect since it's already burnt
    await nameWrapper.write.setChildFuses([
      parentNode,
      childLabelHash,
      PARENT_CANNOT_CONTROL,
      0n,
    ])

    const [, fuses] = await nameWrapper.read.getData([childNodeId])
    expect(fuses).toEqual(PARENT_CANNOT_CONTROL)
  })

  it('Parent cannot burn fuses with setSubnodeOwner()', async () => {
    const { nameWrapper, accounts } = await loadFixture(fixture)

    await expect(nameWrapper)
      .write('setSubnodeOwner', [
        parentNode,
        childLabel,
        accounts[1].address,
        CANNOT_SET_RESOLVER,
        0n,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)

    await expect(nameWrapper)
      .write('setSubnodeOwner', [
        parentNode,
        childLabel,
        accounts[1].address,
        CANNOT_UNWRAP | CANNOT_SET_RESOLVER,
        0n,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)

    await expect(nameWrapper)
      .write('setSubnodeOwner', [
        parentNode,
        childLabel,
        accounts[1].address,
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CANNOT_SET_RESOLVER,
        0n,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)
  })

  it('Parent cannot burn fuses with setSubnodeRecord()', async () => {
    const { nameWrapper, accounts } = await loadFixture(fixture)

    await expect(nameWrapper)
      .write('setSubnodeRecord', [
        parentNode,
        childLabel,
        accounts[1].address,
        zeroAddress,
        0n,
        CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER,
        0n,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)

    await expect(nameWrapper)
      .write('setSubnodeRecord', [
        parentNode,
        childLabel,
        accounts[1].address,
        zeroAddress,
        0n,
        CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
        0n,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)

    await expect(nameWrapper)
      .write('setSubnodeRecord', [
        parentNode,
        childLabel,
        accounts[1].address,
        zeroAddress,
        0n,
        PARENT_CANNOT_CONTROL,
        0n,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)
  })
}

const parentCannotReplaceOwner = ({ fixture }: BaseTestParameters) => {
  it('Parent cannot replace owner with setSubnodeOwner()', async () => {
    const { nameWrapper, accounts } = await loadFixture(fixture)

    await expect(
      nameWrapper.read.ownerOf([childNodeId]),
    ).resolves.toEqualAddress(accounts[1].address)

    await expect(nameWrapper)
      .write('setSubnodeOwner', [
        parentNode,
        childLabel,
        accounts[0].address,
        CAN_DO_EVERYTHING,
        0n,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)

    await expect(
      nameWrapper.read.ownerOf([childNodeId]),
    ).resolves.toEqualAddress(accounts[1].address)
  })

  it('Parent cannot replace owner with setSubnodeRecord()', async () => {
    const { nameWrapper, accounts } = await loadFixture(fixture)

    await expect(
      nameWrapper.read.ownerOf([childNodeId]),
    ).resolves.toEqualAddress(accounts[1].address)

    await expect(nameWrapper)
      .write('setSubnodeRecord', [
        parentNode,
        childLabel,
        accounts[0].address,
        zeroAddress,
        0n,
        CAN_DO_EVERYTHING,
        0n,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(childNode)

    await expect(
      nameWrapper.read.ownerOf([childNodeId]),
    ).resolves.toEqualAddress(accounts[1].address)
  })
}

const parentCannotUnwrapChild = ({ fixture }: BaseTestParameters) => {
  it('Parent cannot unwrap itself', async () => {
    const { nameWrapper, accounts } = await loadFixture(fixture)

    await expect(nameWrapper)
      .write('unwrapETH2LD', [
        parentLabelHash,
        accounts[0].address,
        accounts[0].address,
      ])
      .toBeRevertedWithCustomError('OperationProhibited')
      .withArgs(parentNode)
  })

  it('Parent cannot unwrap child', async () => {
    const { nameWrapper, accounts } = await loadFixture(fixture)

    await expect(nameWrapper)
      .write('unwrap', [parentNode, childLabelHash, accounts[0].address])
      .toBeRevertedWithCustomError('Unauthorised')
      .withArgs(childNode, getAddress(accounts[0].address))
  })

  it('Parent cannot call ens.setSubnodeOwner() to forcefully unwrap', async () => {
    const { ensRegistry, accounts } = await loadFixture(fixture)

    await expect(ensRegistry)
      .write('setSubnodeOwner', [parentNode, childNode, accounts[0].address])
      .toBeRevertedWithoutReason()
  })
}

const ownerResetsToZeroWhenExpired = ({
  fixture,
  expectedFuses,
}: BaseTestParameters & { expectedFuses: number }) => {
  it('Owner resets to 0 after expiry', async () => {
    const { nameWrapper, accounts, publicClient, testClient } =
      await loadFixture(fixture)

    const [ownerBefore, fusesBefore, expiryBefore] =
      await nameWrapper.read.getData([childNodeId])
    const timestampBefore = await publicClient
      .getBlock()
      .then((b) => b.timestamp)
    // not expired
    expect(ownerBefore).toEqualAddress(accounts[1].address)
    expect(fusesBefore).toEqual(expectedFuses)
    expect(expiryBefore).toBeGreaterThan(timestampBefore)

    // force expiry
    await testClient.increaseTime({ seconds: Number(2n * DAY) })
    await testClient.mine({ blocks: 1 })

    const [ownerAfter, fusesAfter, expiryAfter] =
      await nameWrapper.read.getData([childNodeId])
    const timestampAfter = await publicClient
      .getBlock()
      .then((b) => b.timestamp)
    // owner and fuses are reset when expired
    expect(ownerAfter).toEqualAddress(zeroAddress)
    expect(fusesAfter).toEqual(0)
    expect(expiryAfter).toBeLessThan(timestampAfter)
  })
}

export const shouldRespectConstraints = () => {
  describe("0000 - Wrapped expired without CU/PCC burned, Parent's CU not burned", () => {
    const fixture = setupState0000DW

    it('correct test setup', async () => {
      const { nameWrapper } = await loadFixture(fixture)

      const [, parentFuses] = await nameWrapper.read.getData([parentNodeId])
      expect(parentFuses).toEqual(PARENT_CANNOT_CONTROL | IS_DOT_ETH)

      const [, childFuses, childExpiry] = await nameWrapper.read.getData([
        childNodeId,
      ])
      expect(childFuses).toEqual(CAN_DO_EVERYTHING)
      expect(childExpiry).toEqual(0n)
    })

    parentCanExtend({ fixture })

    parentCannotBurnFusesOrPCC({ fixture })

    it('Parent cannot burn fuses with setChildFuses() even when extending expiry', async () => {
      const { nameWrapper } = await loadFixture(fixture)

      const [, fusesBefore] = await nameWrapper.read.getData([childNodeId])
      expect(fusesBefore).toEqual(0)

      await expect(nameWrapper)
        .write('setChildFuses', [
          parentNode,
          childLabelHash,
          CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER,
          0n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)
    })

    parentCanReplaceOwner({ fixture })

    parentCanUnwrapChild({ fixture })

    parentCannotBurnParentControlledFuses({ fixture })

    ownerIsOwnerWhenExpired({ fixture })

    ownerCannotBurnFuses({ fixture })

    ownerCanUnwrap({ fixture })
  })

  describe("0001 - PCU - Wrapped expired without CU/PCC burned, Parent's CU is burned", () => {
    const fixture = setupState0001PCU

    parentCanExtend({ fixture })

    it('Parent cannot burn fuses with setChildFuses()', async () => {
      const { nameWrapper } = await loadFixture(fixture)

      const [, fusesBefore] = await nameWrapper.read.getData([childNodeId])
      expect(fusesBefore).toEqual(0)

      await nameWrapper.write.setChildFuses([
        parentNode,
        childLabelHash,
        CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER,
        0n,
      ])

      // expired names get normalised to 0
      const [, fuses] = await nameWrapper.read.getData([childNodeId])
      expect(fuses).toEqual(0)
    })

    it('Parent can burn fuses with setChildFuses() if expiry is also extended', async () => {
      const { nameWrapper } = await loadFixture(fixture)

      const [, fusesBefore] = await nameWrapper.read.getData([childNodeId])
      expect(fusesBefore).toEqual(0)

      await nameWrapper.write.setChildFuses([
        parentNode,
        childLabelHash,
        CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
        MAX_EXPIRY,
      ])

      const [, fuses] = await nameWrapper.read.getData([childNodeId])
      expect(fuses).toEqual(CANNOT_UNWRAP | PARENT_CANNOT_CONTROL)
    })

    parentCanReplaceOwner({ fixture })

    parentCanUnwrapChild({ fixture })

    parentCanBurnParentControlledFusesWithExpiry({ fixture })

    it('Parent cannot unwrap itself', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('unwrapETH2LD', [
          parentLabelHash,
          accounts[0].address,
          accounts[0].address,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(parentNode)
    })

    ownerCannotBurnFuses({ fixture })

    ownerCanUnwrap({ fixture })

    ownerIsOwnerWhenExpired({ fixture })
  })

  describe("0010 - PCC -  Impossible state - WrappedPCC burned without Parent's CU", () => {
    // starts with the same setup as 0000 to test that this state is impossible
    const fixture = setupState0000DW

    it('0000 => 0010 - Parent cannot burn PCC with setChildFuses()', async () => {
      const { nameWrapper } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setChildFuses', [
          parentNode,
          childLabelHash,
          PARENT_CANNOT_CONTROL,
          0n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)
    })
  })

  describe("0011 - PCC_PCU - Impossible state - Wrapped expired, PCC burned and Parent's CU burned", () => {
    const fixture = setupState0001PCU

    it('0001 => 0010 - PCU => PCC - Parent cannot burn PCC with setChildFuses()', async () => {
      const { nameWrapper } = await loadFixture(fixture)

      await nameWrapper.write.setChildFuses([
        parentNode,
        childLabelHash,
        PARENT_CANNOT_CONTROL,
        0n,
      ])

      const [, fuses] = await nameWrapper.read.getData([childNodeId])

      // fuses are normalised
      expect(fuses).toEqual(0)
    })
  })

  describe("0100 - CU - Impossible state - Wrapped expired, CU burned, PCC unburned and Parent's CU unburned", () => {
    const fixture = setupState0000DW

    it('0000 => 0100 - DW => CU Parent - cannot burn CANNOT_UNWRAP with setChildFuses()', async () => {
      const { nameWrapper } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setChildFuses', [parentNode, childLabelHash, CANNOT_UNWRAP, 0n])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)
    })

    it('0000 => 0100 - DW => CU - Owner cannot burn CANNOT_UNWRAP with setFuses()', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setFuses', [childNode, CANNOT_UNWRAP], { account: accounts[1] })
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)
    })
  })

  describe("0101 - Impossible state - Wrapped expired, CU burned, PCC unburned and Parent's CU burned", () => {
    const fixture = setupState0001PCU

    it('0001 => 0101 - PCU => CU_PCU - Parent cannot burn CANNOT_UNWRAP with setChildFuses()', async () => {
      const { nameWrapper } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setChildFuses', [parentNode, childLabelHash, CANNOT_UNWRAP, 0n])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)
    })

    it('0001 => 0101 - PCU => CU_PCU -  Owner cannot burn CANNOT_UNWRAP with setFuses()', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setFuses', [childNode, CANNOT_UNWRAP], { account: accounts[1] })
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)
    })
  })

  describe("0110 - CU_PCC - Impossible state - Wrapped expired, CU burned, PCC burned and Parent's CU unburned", () => {
    const fixture = setupState0000DW

    it('0000 => 0010 - DW => PCC - Parent cannot burn PARENT_CANNOT_CONTROL with setChildFuses()', async () => {
      const { nameWrapper } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setChildFuses', [
          parentNode,
          childLabelHash,
          PARENT_CANNOT_CONTROL,
          0n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)
    })
  })

  describe("0111 - CU_PCC_PCU - Impossible state - Wrapped expired, CU burned, PCC burned and Parent's CU burned", () => {
    const fixture = setupState0001PCU

    it('0001 => 0111 - PCU => CU_PCC_PCU - Parent cannot burn PARENT_CANNOT_CONTROL | CANNOT_UNWRAP with setChildFuses()', async () => {
      const { nameWrapper } = await loadFixture(fixture)

      await nameWrapper.write.setChildFuses([
        parentNode,
        childLabelHash,
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
        0n,
      ])

      const [, fuses] = await nameWrapper.read.getData([childNodeId])
      expect(fuses).toEqual(0)
    })
  })

  describe("1000 - NE - Wrapped, but not expired, CU, PCC, and Parent's CU unburned", () => {
    const fixture = setupState1000NE

    parentCanExtend({ fixture, isNotExpired: true })
    parentCannotBurnFusesOrPCC({ fixture })
    parentCanReplaceOwner({ fixture })
    parentCanUnwrapChild({ fixture })
    parentCannotBurnParentControlledFuses({ fixture })
    ownerCannotBurnFuses({ fixture })
    ownerCanUnwrap({ fixture })
    // TODO: re-add if necessary
    // ownerIsOwnerWhenExpired({ fixture })
  })

  describe("1001 - NE_PCU - Wrapped unexpired, CU and PCC unburned, and Parent's CU burned", () => {
    const fixture = setupState1001NE_PCU

    parentCanExtend({ fixture, isNotExpired: true })
    parentCanBurnFusesOrPCC({ fixture })
    parentCanReplaceOwner({ fixture })
    parentCanUnwrapChild({ fixture })
    parentCanBurnParentControlledFuses({ fixture })
    ownerCannotBurnFuses({ fixture })
    ownerCanUnwrap({ fixture })
    // TODO: re-add if necessary
    // ownerIsOwnerWhenExpired({ fixture })
  })

  describe("1010 - NE_PCC - Impossible state - Wrapped unexpired, CU unburned, PCC burned and Parent's CU burned", () => {
    const fixture = setupState1000NE

    testStateTransition1000to1010({ fixture })
  })

  describe("1011 - NE_PCC_PCU Wrapped unexpired, CU, PCC and Parent's CU burned", () => {
    const fixture = setupState1011NE_PCC_PCU

    parentCanExtendWithSetChildFuses({ fixture })
    parentCannotBurnFusesWhenPCCisBurned({ fixture })

    it('Parent cannot unburn fuses with setChildFuses()', async () => {
      const { nameWrapper } = await loadFixture(fixture)

      await nameWrapper.write.setChildFuses([parentNode, childLabelHash, 0, 0n])

      const [, fuses] = await nameWrapper.read.getData([childNodeId])
      expect(fuses).toEqual(PARENT_CANNOT_CONTROL)
    })

    it('Parent cannot unburn fuses with setSubnodeOwner()', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setSubnodeOwner', [
          parentNode,
          childLabel,
          accounts[1].address,
          0,
          0n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)

      const [, fuses] = await nameWrapper.read.getData([childNodeId])
      expect(fuses).toEqual(PARENT_CANNOT_CONTROL)
    })

    it('Parent cannot unburn fuses with setSubnodeRecord()', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setSubnodeRecord', [
          parentNode,
          childLabel,
          accounts[1].address,
          zeroAddress,
          0n,
          0,
          0n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)

      const [, fuses] = await nameWrapper.read.getData([childNodeId])
      expect(fuses).toEqual(PARENT_CANNOT_CONTROL)
    })

    parentCannotReplaceOwner({ fixture })
    parentCannotUnwrapChild({ fixture })
    parentCannotBurnParentControlledFuses({ fixture })

    it('Owner can burn CU', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await nameWrapper.write.setFuses([childNode, CANNOT_UNWRAP], {
        account: accounts[1],
      })

      const [, fuses] = await nameWrapper.read.getData([childNodeId])
      expect(fuses).toEqual(CANNOT_UNWRAP | PARENT_CANNOT_CONTROL)
    })

    it('Owner cannot burn fuses because CU is unburned', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setFuses', [childNode, CANNOT_SET_RESOLVER], {
          account: accounts[1],
        })
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)
    })

    it('Owner cannot unwrap and wrap to unburn PCC', async () => {
      const { ensRegistry, nameWrapper, accounts } = await loadFixture(fixture)

      const [, fusesBefore] = await nameWrapper.read.getData([childNodeId])
      expect(fusesBefore).toEqual(PARENT_CANNOT_CONTROL)

      await nameWrapper.write.unwrap(
        [parentNode, childLabelHash, accounts[1].address],
        { account: accounts[1] },
      )
      await ensRegistry.write.setApprovalForAll([nameWrapper.address, true], {
        account: accounts[1],
      })
      await nameWrapper.write.wrap(
        [
          dnsEncodeName(`${childLabel}.${parentLabel}.eth`),
          accounts[1].address,
          zeroAddress,
        ],
        { account: accounts[1] },
      )

      const [, fusesAfter] = await nameWrapper.read.getData([childNodeId])
      expect(fusesAfter).toEqual(PARENT_CANNOT_CONTROL)
    })

    ownerCanUnwrap({ fixture })
    ownerResetsToZeroWhenExpired({
      fixture,
      expectedFuses: PARENT_CANNOT_CONTROL,
    })
  })

  describe("1100 - NE_CU - Impossible State - Wrapped unexpired, CU burned, and PCC and Parent's CU unburned ", () => {
    const fixture = setupState1000NE

    it('1000 => 1100 - NE => NE_CU - Parent cannot burn CU with setChildFuses()', async () => {
      const { nameWrapper } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setChildFuses', [parentNode, childLabelHash, CANNOT_UNWRAP, 0n])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)
    })

    it('1000 => 1100 - NE => NE_CU - Parent cannot burn CU with setSubnodeOwner()', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setSubnodeOwner', [
          parentNode,
          childLabel,
          accounts[1].address,
          CANNOT_UNWRAP,
          0n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)
    })

    it('1000 => 1100 - NE => NE_CU - Parent cannot burn CU with setSubnodeRecord()', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setSubnodeRecord', [
          parentNode,
          childLabel,
          accounts[1].address,
          zeroAddress,
          0n,
          CANNOT_UNWRAP,
          0n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)
    })

    it('1000 => 1100 - NE => NE_CU - Owner cannot burn CU with setFuses()', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setFuses', [childNode, CANNOT_UNWRAP], { account: accounts[1] })
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)
    })
  })

  describe("1101 - NE_CU_PCU -  Impossible State - Wrapped unexpired, CU burned, PCC unburned, and Parent's CU burned ", () => {
    const fixture = setupState1001NE_PCU

    it('1001 => 1101 - NE_PCU => NE_CU_PCU -  Parent cannot burn CU with setChildFuses()', async () => {
      const { nameWrapper } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setChildFuses', [parentNode, childLabelHash, CANNOT_UNWRAP, 0n])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)
    })

    it('1001 => 1101 - NE_PCU => NE_CU_PCU - Parent cannot burn CU with setSubnodeOwner()', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setSubnodeOwner', [
          parentNode,
          childLabel,
          accounts[1].address,
          CANNOT_UNWRAP,
          0n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)
    })

    it('1001 => 1101 - NE_PCU => NE_CU_PCU - Parent cannot burn CU with setSubnodeRecord()', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setSubnodeRecord', [
          parentNode,
          childLabel,
          accounts[1].address,
          zeroAddress,
          0n,
          CANNOT_UNWRAP,
          0n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)
    })

    it('1001 => 1101 - NE_PCU => NE_CU_PCU - Owner cannot burn CU with setFuses()', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setFuses', [childNode, CANNOT_UNWRAP], { account: accounts[1] })
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)
    })
  })

  // TODO: this is a duplicate of 1010 - NE_PCC??
  describe.skip("1110 - NE_CU_PCC - Impossible state -  Wrapped unexpired, CU and PCC burned, and Parent's CU unburned ", () => {
    // testStateTransition1000to1010({  })
  })

  describe("1111 - NE_CU_PCC_PCU - Wrapped unexpired, CU, PCC and Parent's CU burned ", () => {
    const fixture = setupState1111NE_CU_PCC_PCU

    parentCanExtendWithSetChildFuses({ fixture })

    it('Parent cannot unburn fuses with setChildFuses()', async () => {
      const { nameWrapper } = await loadFixture(fixture)

      await nameWrapper.write.setChildFuses([parentNode, childLabelHash, 0, 0n])

      const [, fuses] = await nameWrapper.read.getData([childNodeId])
      expect(fuses).toEqual(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP)
    })

    it('Parent cannot unburn fuses with setSubnodeOwner()', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setSubnodeOwner', [
          parentNode,
          childLabel,
          accounts[1].address,
          0,
          0n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)

      const [, fuses] = await nameWrapper.read.getData([childNodeId])
      expect(fuses).toEqual(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP)
    })

    it('Parent cannot unburn fuses with setSubnodeRecord()', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setSubnodeRecord', [
          parentNode,
          childLabel,
          accounts[1].address,
          zeroAddress,
          0n,
          0,
          0n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)

      const [, fuses] = await nameWrapper.read.getData([childNodeId])
      expect(fuses).toEqual(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP)
    })

    parentCannotReplaceOwner({ fixture })
    parentCannotUnwrapChild({ fixture })
    parentCannotBurnParentControlledFuses({ fixture })

    it('Owner can burn fuses', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      const [, fusesBefore] = await nameWrapper.read.getData([childNodeId])
      expect(fusesBefore).toEqual(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP)

      await nameWrapper.write.setFuses([childNode, CANNOT_SET_RESOLVER], {
        account: accounts[1],
      })

      const [, fusesAfter] = await nameWrapper.read.getData([childNodeId])
      expect(fusesAfter).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CANNOT_SET_RESOLVER,
      )
    })

    it('Owner cannot unburn fuses', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      const [, fusesBefore] = await nameWrapper.read.getData([childNodeId])
      expect(fusesBefore).toEqual(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP)

      await nameWrapper.write.setFuses([childNode, 0], { account: accounts[1] })

      const [, fusesAfter] = await nameWrapper.read.getData([childNodeId])
      expect(fusesAfter).toEqual(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP)
    })

    it('Owner cannot unwrap', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('unwrap', [parentNode, childLabelHash, accounts[1].address], {
          account: accounts[1],
        })
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(childNode)
    })

    ownerResetsToZeroWhenExpired({
      fixture,
      expectedFuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
    })
  })
}
