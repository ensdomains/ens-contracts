import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { getAddress, labelhash, namehash, zeroAddress } from 'viem'
import { DAY } from '../../fixtures/constants.js'
import { toLabelId, toNameId } from '../../fixtures/utils.js'
import {
  CANNOT_UNWRAP,
  CAN_EXTEND_EXPIRY,
  GRACE_PERIOD,
  IS_DOT_ETH,
  MAX_EXPIRY,
  PARENT_CANNOT_CONTROL,
  expectOwnerOf,
  deployNameWrapperWithUtils as fixture,
} from '../fixtures/utils.js'

export const extendExpiryTests = () => {
  describe('extendExpiry()', () => {
    const label = 'fuses'
    const name = `${label}.eth`
    const sublabel = 'sub'
    const subname = `${sublabel}.${name}`

    it('Allows parent owner to set expiry without CAN_EXTEND_EXPIRY burned', async () => {
      const { nameWrapper, actions, accounts, baseRegistrar } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
        expiry: parentExpiry - 3600n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP)
      expect(initialExpiry).toEqual(parentExpiry - 3600n)

      await nameWrapper.write.extendExpiry([
        namehash(name),
        labelhash(sublabel),
        MAX_EXPIRY,
      ])

      const [, newFuses, newExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(newFuses).toEqual(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP)
      expect(newExpiry).toEqual(parentExpiry + GRACE_PERIOD)
    })

    it('Allows parent owner to set expiry with CAN_EXTEND_EXPIRY burned', async () => {
      const { nameWrapper, actions, accounts, baseRegistrar } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
        expiry: parentExpiry - 3600n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
      )
      expect(initialExpiry).toEqual(parentExpiry - 3600n)

      await nameWrapper.write.extendExpiry([
        namehash(name),
        labelhash(sublabel),
        MAX_EXPIRY,
      ])

      const [, newFuses, newExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(newFuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
      )
      expect(newExpiry).toEqual(parentExpiry + GRACE_PERIOD)
    })

    it('Allows parent owner to set expiry with same child owner and CAN_EXTEND_EXPIRY burned', async () => {
      const { nameWrapper, actions, accounts, baseRegistrar } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
        expiry: parentExpiry - 3600n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
      )
      expect(initialExpiry).toEqual(parentExpiry - 3600n)

      await nameWrapper.write.extendExpiry([
        namehash(name),
        labelhash(sublabel),
        MAX_EXPIRY,
      ])

      const [, newFuses, newExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(newFuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
      )
      expect(newExpiry).toEqual(parentExpiry + GRACE_PERIOD)
    })

    it('Allows approved operators of parent owner to set expiry without CAN_EXTEND_EXPIRY burned', async () => {
      const { nameWrapper, actions, accounts, baseRegistrar } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
        expiry: parentExpiry - 3600n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP)
      expect(initialExpiry).toEqual(parentExpiry - 3600n)

      // approve hacker for anything account owns
      await nameWrapper.write.setApprovalForAll([accounts[2].address, true])

      await nameWrapper.write.extendExpiry(
        [namehash(name), labelhash(sublabel), MAX_EXPIRY],
        { account: accounts[2] },
      )

      const [, newFuses, newExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(newFuses).toEqual(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP)
      expect(newExpiry).toEqual(parentExpiry + GRACE_PERIOD)
    })

    it('Allows approved operators of parent owner to set expiry with CAN_EXTEND_EXPIRY burned', async () => {
      const { nameWrapper, actions, accounts, baseRegistrar } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
        expiry: parentExpiry - 3600n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
      )
      expect(initialExpiry).toEqual(parentExpiry - 3600n)

      // approve hacker for anything account owns
      await nameWrapper.write.setApprovalForAll([accounts[2].address, true])

      await nameWrapper.write.extendExpiry(
        [namehash(name), labelhash(sublabel), MAX_EXPIRY],
        { account: accounts[2] },
      )

      const [, newFuses, newExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(newFuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
      )
      expect(newExpiry).toEqual(parentExpiry + GRACE_PERIOD)
    })

    it('Does not allow child owner to set expiry without CAN_EXTEND_EXPIRY burned', async () => {
      const { nameWrapper, actions, accounts, baseRegistrar } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
        expiry: parentExpiry - 3600n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP)
      expect(initialExpiry).toEqual(parentExpiry - 3600n)

      await expect(nameWrapper)
        .write(
          'extendExpiry',
          [namehash(name), labelhash(sublabel), MAX_EXPIRY],
          { account: accounts[1] },
        )
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Allows child owner to set expiry with CAN_EXTEND_EXPIRY burned', async () => {
      const { nameWrapper, actions, accounts, baseRegistrar } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
        expiry: parentExpiry - 3600n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
      )
      expect(initialExpiry).toEqual(parentExpiry - 3600n)

      await nameWrapper.write.extendExpiry(
        [namehash(name), labelhash(sublabel), MAX_EXPIRY],
        { account: accounts[1] },
      )

      const [, newFuses, newExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(newFuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
      )
      expect(newExpiry).toEqual(parentExpiry + GRACE_PERIOD)
    })

    it('Does not allow approved operator of child owner to set expiry without CAN_EXTEND_EXPIRY burned', async () => {
      const { nameWrapper, actions, accounts, baseRegistrar } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
        expiry: parentExpiry - 3600n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP)
      expect(initialExpiry).toEqual(parentExpiry - 3600n)

      // approve hacker for anything accounts[1] owns
      await nameWrapper.write.setApprovalForAll([accounts[2].address, true], {
        account: accounts[1],
      })

      await expect(nameWrapper)
        .write(
          'extendExpiry',
          [namehash(name), labelhash(sublabel), MAX_EXPIRY],
          { account: accounts[2] },
        )
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Allows approved operator of child owner to set expiry with CAN_EXTEND_EXPIRY burned', async () => {
      const { nameWrapper, actions, accounts, baseRegistrar } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
        expiry: parentExpiry - 3600n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
      )
      expect(initialExpiry).toEqual(parentExpiry - 3600n)

      // approve hacker for anything accounts[1] owns
      await nameWrapper.write.setApprovalForAll([accounts[2].address, true], {
        account: accounts[1],
      })

      await nameWrapper.write.extendExpiry(
        [namehash(name), labelhash(sublabel), MAX_EXPIRY],
        { account: accounts[2] },
      )

      const [, newFuses, newExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(newFuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
      )
      expect(newExpiry).toEqual(parentExpiry + GRACE_PERIOD)
    })

    it('Does not allow accounts other than parent/child owners or approved operators to set expiry', async () => {
      const { nameWrapper, actions, accounts, baseRegistrar } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
        expiry: parentExpiry - 3600n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
      )
      expect(initialExpiry).toEqual(parentExpiry - 3600n)

      await expect(nameWrapper)
        .write(
          'extendExpiry',
          [namehash(name), labelhash(sublabel), MAX_EXPIRY],
          { account: accounts[2] },
        )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(subname), getAddress(accounts[2].address))
    })

    it('Does not allow owner of .eth 2LD to set expiry', async () => {
      const { nameWrapper, actions } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const [, initialFuses, expiry] = await nameWrapper.read.getData([
        toNameId(name),
      ])

      expect(initialFuses).toEqual(
        IS_DOT_ETH | PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
      )

      await expect(nameWrapper)
        .write('extendExpiry', [namehash('eth'), labelhash(label), expiry])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(name))
    })

    it('Allows parent owner of non-Emancipated name to set expiry', async () => {
      const { nameWrapper, actions, accounts, baseRegistrar } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: 0,
        expiry: parentExpiry - 3600n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(0)
      expect(initialExpiry).toEqual(parentExpiry - 3600n)

      await nameWrapper.write.extendExpiry([
        namehash(name),
        labelhash(sublabel),
        MAX_EXPIRY,
      ])

      const [, newFuses, newExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(newFuses).toEqual(0)
      expect(newExpiry).toEqual(parentExpiry + GRACE_PERIOD)
    })

    it('Allows child owner of non-Emancipated name to set expiry', async () => {
      const { nameWrapper, actions, accounts, baseRegistrar } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: CAN_EXTEND_EXPIRY,
        expiry: parentExpiry - 3600n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(CAN_EXTEND_EXPIRY)
      expect(initialExpiry).toEqual(parentExpiry - 3600n)

      await nameWrapper.write.extendExpiry(
        [namehash(name), labelhash(sublabel), MAX_EXPIRY],
        { account: accounts[1] },
      )

      const [, newFuses, newExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(newFuses).toEqual(CAN_EXTEND_EXPIRY)
      expect(newExpiry).toEqual(parentExpiry + GRACE_PERIOD)
    })

    it('Expiry is normalized to old expiry if too low', async () => {
      const { nameWrapper, actions, accounts, baseRegistrar } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
        expiry: parentExpiry - 3600n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
      )
      expect(initialExpiry).toEqual(parentExpiry - 3600n)

      await nameWrapper.write.extendExpiry(
        [namehash(name), labelhash(sublabel), parentExpiry - 3601n],
        { account: accounts[1] },
      )

      const [, newFuses, newExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(newFuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
      )
      expect(newExpiry).toEqual(parentExpiry - 3600n)
    })

    it('Expiry is normalized to parent expiry if too high', async () => {
      const { nameWrapper, actions, accounts, baseRegistrar } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
        expiry: parentExpiry - 3600n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
      )
      expect(initialExpiry).toEqual(parentExpiry - 3600n)

      await nameWrapper.write.extendExpiry(
        [namehash(name), labelhash(sublabel), parentExpiry + GRACE_PERIOD + 1n],
        { account: accounts[1] },
      )

      const [, newFuses, newExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(newFuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
      )
      expect(newExpiry).toEqual(parentExpiry + GRACE_PERIOD)
    })

    it('Expiry is not normalized to new value if between old expiry and parent expiry', async () => {
      const { nameWrapper, actions, accounts, baseRegistrar } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
        expiry: parentExpiry - 3600n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
      )
      expect(initialExpiry).toEqual(parentExpiry - 3600n)

      await nameWrapper.write.extendExpiry(
        [namehash(name), labelhash(sublabel), parentExpiry - 1800n],
        { account: accounts[1] },
      )

      const [, newFuses, newExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(newFuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
      )
      expect(newExpiry).toEqual(parentExpiry - 1800n)
    })

    it('Does not allow .eth 2LD owner to set expiry on child if the .eth 2LD is expired but grace period has not ended', async () => {
      const { baseRegistrar, nameWrapper, testClient, actions, accounts } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
        expiry: parentExpiry + GRACE_PERIOD - 3600n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP)
      expect(initialExpiry).toEqual(parentExpiry + GRACE_PERIOD - 3600n)

      // Fast forward until the 2LD expires
      await testClient.increaseTime({ seconds: Number(DAY + 1n) })
      await testClient.mine({ blocks: 1 })

      await expect(nameWrapper)
        .write('extendExpiry', [
          namehash(name),
          labelhash(sublabel),
          MAX_EXPIRY,
        ])
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(subname), getAddress(accounts[0].address))
    })

    it('Allows child owner to set expiry if parent .eth 2LD is expired but grace period has not ended', async () => {
      const { baseRegistrar, nameWrapper, testClient, actions, accounts } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
        expiry: parentExpiry + GRACE_PERIOD - 3600n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
      )
      expect(initialExpiry).toEqual(parentExpiry + GRACE_PERIOD - 3600n)

      // Fast forward until the 2LD expires
      await testClient.increaseTime({ seconds: Number(DAY + 1n) })
      await testClient.mine({ blocks: 1 })

      await nameWrapper.write.extendExpiry(
        [namehash(name), labelhash(sublabel), MAX_EXPIRY],
        { account: accounts[1] },
      )

      const [, newFuses, newExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(newFuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
      )
      expect(newExpiry).toEqual(parentExpiry + GRACE_PERIOD)
    })

    it('Does not allow child owner to set expiry if Emancipated child name has expired', async () => {
      const { nameWrapper, actions, accounts, baseRegistrar, testClient } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL | CAN_EXTEND_EXPIRY,
        expiry: parentExpiry - DAY + 3600n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(PARENT_CANNOT_CONTROL | CAN_EXTEND_EXPIRY)
      expect(initialExpiry).toEqual(parentExpiry - DAY + 3600n)

      // Fast forward until the child name expires
      await testClient.increaseTime({ seconds: 3601 })
      await testClient.mine({ blocks: 1 })

      await expect(nameWrapper)
        .write(
          'extendExpiry',
          [namehash(name), labelhash(sublabel), MAX_EXPIRY],
          { account: accounts[1] },
        )
        .toBeRevertedWithCustomError('NameIsNotWrapped')
    })

    it('Does not allow child owner to set expiry if non-Emancipated child name has reached its expiry', async () => {
      const { nameWrapper, actions, accounts, baseRegistrar, testClient } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: CAN_EXTEND_EXPIRY,
        expiry: parentExpiry - DAY + 3600n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(CAN_EXTEND_EXPIRY)
      expect(initialExpiry).toEqual(parentExpiry - DAY + 3600n)

      // Fast forward until the child name expires
      await testClient.increaseTime({ seconds: 3601 })
      await testClient.mine({ blocks: 1 })

      await expect(nameWrapper)
        .write(
          'extendExpiry',
          [namehash(name), labelhash(sublabel), MAX_EXPIRY],
          { account: accounts[1] },
        )
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Does not allow parent owner to set expiry if Emancipated child name has expired', async () => {
      const { nameWrapper, actions, accounts, baseRegistrar, testClient } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL,
        expiry: parentExpiry - DAY + 3600n,
      })

      const [owner, initialFuses, initialExpiry] =
        await nameWrapper.read.getData([toNameId(subname)])

      expect(owner).toEqualAddress(accounts[1].address)
      expect(initialFuses).toEqual(PARENT_CANNOT_CONTROL)
      expect(initialExpiry).toEqual(parentExpiry - DAY + 3600n)

      // Fast forward until the child name expires
      await testClient.increaseTime({ seconds: 3601 })
      await testClient.mine({ blocks: 1 })

      await expect(nameWrapper)
        .write('extendExpiry', [
          namehash(name),
          labelhash(sublabel),
          MAX_EXPIRY,
        ])
        .toBeRevertedWithCustomError('NameIsNotWrapped')
    })

    it('Allows parent owner to set expiry if non-Emancipated child name has reached its expiry', async () => {
      const { nameWrapper, actions, accounts, baseRegistrar, testClient } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: 0,
        expiry: parentExpiry - DAY + 3600n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(0)
      expect(initialExpiry).toEqual(parentExpiry - DAY + 3600n)

      // Fast forward until the child name expires
      await testClient.increaseTime({ seconds: 3601 })
      await testClient.mine({ blocks: 1 })

      await nameWrapper.write.extendExpiry([
        namehash(name),
        labelhash(sublabel),
        MAX_EXPIRY,
      ])

      const [owner, newFuses, newExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(owner).toEqualAddress(accounts[1].address)
      expect(newFuses).toEqual(0)
      expect(newExpiry).toEqual(parentExpiry + GRACE_PERIOD)
    })

    it('Does not allow extendExpiry() to be called on unregistered names (not registered ever)', async () => {
      const { nameWrapper, actions } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const [owner, initialFuses, initialExpiry] =
        await nameWrapper.read.getData([toNameId(subname)])

      expect(owner).toEqual(zeroAddress)
      expect(initialFuses).toEqual(0)
      expect(initialExpiry).toEqual(0n)

      await expect(nameWrapper)
        .write('extendExpiry', [
          namehash(name),
          labelhash(sublabel),
          MAX_EXPIRY,
        ])
        .toBeRevertedWithCustomError('NameIsNotWrapped')
    })

    it('Does not allow extendExpiry() to be called on unregistered names (expired w/ PCC burnt)', async () => {
      const { baseRegistrar, nameWrapper, accounts, actions, testClient } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
        duration: 10n * DAY,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: PARENT_CANNOT_CONTROL,
        expiry: parentExpiry - 5n * DAY,
      })

      // Advance time so the subdomain expires, but not the parent
      await testClient.increaseTime({ seconds: Number(5n * DAY + 1n) })
      await testClient.mine({ blocks: 1 })

      // extendExpiry() on the unregistered name will be reverted
      await expect(nameWrapper)
        .write('extendExpiry', [
          namehash(name),
          labelhash(sublabel),
          MAX_EXPIRY,
        ])
        .toBeRevertedWithCustomError('NameIsNotWrapped')
    })

    it('Allow extendExpiry() to be called on wrapped names', async () => {
      const { baseRegistrar, nameWrapper, accounts, actions, testClient } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
        duration: 10n * DAY,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: CAN_EXTEND_EXPIRY,
        expiry: parentExpiry - 5n * DAY,
      })

      // Advance time so the subdomain expires, but not the parent
      await testClient.increaseTime({ seconds: Number(5n * DAY + 1n) })
      await testClient.mine({ blocks: 1 })

      await nameWrapper.write.extendExpiry([
        namehash(name),
        labelhash(sublabel),
        MAX_EXPIRY,
      ])

      const [owner, newFuses, newExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(owner).toEqualAddress(accounts[0].address)
      expect(newFuses).toEqual(0)
      expect(newExpiry).toEqual(parentExpiry + GRACE_PERIOD)
    })

    it('Does not allow extendExpiry() to be called on unwrapped names', async () => {
      const { ensRegistry, baseRegistrar, nameWrapper, actions, accounts } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: 0,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: 0,
        expiry: parentExpiry - 3600n,
      })

      // First unwrap the parent
      await actions.unwrapEth2ld({
        label,
        controller: accounts[0].address,
        registrant: accounts[0].address,
      })
      // Then manually change the registry owner outside of the wrapper
      await actions.setSubnodeOwner.onEnsRegistry({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
      })
      // Rewrap the parent
      await actions.wrapEth2ld({
        label,
        fuses: CANNOT_UNWRAP,
        owner: accounts[0].address,
        resolver: zeroAddress,
      })

      const [owner, fuses, expiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(owner).toEqualAddress(accounts[0].address)
      expect(fuses).toEqual(0)
      expect(expiry).toEqual(parentExpiry - 3600n)

      // Verify the registry owner is the account and not the wrapper contract
      await expectOwnerOf(subname).on(ensRegistry).toBe(accounts[0])

      await expect(nameWrapper)
        .write('extendExpiry', [
          namehash(name),
          labelhash(sublabel),
          MAX_EXPIRY,
        ])
        .toBeRevertedWithCustomError('NameIsNotWrapped')
    })

    it('Emits Expiry Extended event', async () => {
      const { baseRegistrar, nameWrapper, actions, accounts } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
        expiry: parentExpiry - 3600n,
      })

      await expect(nameWrapper)
        .write(
          'extendExpiry',
          [namehash(name), labelhash(sublabel), MAX_EXPIRY],
          { account: accounts[1] },
        )
        .toEmitEvent('ExpiryExtended')
        .withArgs(namehash(subname), parentExpiry + GRACE_PERIOD)
    })
  })
}
