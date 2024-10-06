import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { getAddress, labelhash, namehash, zeroAddress, zeroHash } from 'viem'
import { DAY } from '../../fixtures/constants.js'
import { toLabelId, toNameId } from '../../fixtures/utils.js'
import {
  CANNOT_BURN_FUSES,
  CANNOT_SET_RESOLVER,
  CANNOT_UNWRAP,
  CAN_DO_EVERYTHING,
  GRACE_PERIOD,
  IS_DOT_ETH,
  MAX_EXPIRY,
  PARENT_CANNOT_CONTROL,
  deployNameWrapperWithUtils as fixture,
} from '../fixtures/utils.js'

export const setChildFusesTests = () => {
  describe('setChildFuses()', () => {
    const label = 'fuses'
    const name = `${label}.eth`
    const sublabel = 'sub'
    const subname = `${sublabel}.${name}`

    it('Allows parent owners to set fuses/expiry', async () => {
      const { baseRegistrar, nameWrapper, actions, accounts } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: 0,
        expiry: 0n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(0)
      expect(initialExpiry).toEqual(0n)

      await nameWrapper.write.setChildFuses([
        namehash(name),
        labelhash(sublabel),
        CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
        MAX_EXPIRY,
      ])

      const expectedExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      const [, newFuses, newExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(newFuses).toEqual(CANNOT_UNWRAP | PARENT_CANNOT_CONTROL)
      expect(newExpiry).toEqual(expectedExpiry + GRACE_PERIOD)
    })

    it('Emits a FusesSet event and ExpiryExtended event', async () => {
      const { baseRegistrar, nameWrapper, actions, accounts } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: 0,
        expiry: 0n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(0)
      expect(initialExpiry).toEqual(0n)

      const tx = await nameWrapper.write.setChildFuses([
        namehash(name),
        labelhash(sublabel),
        CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
        MAX_EXPIRY,
      ])

      const expectedExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      const [, newFuses, newExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(newFuses).toEqual(CANNOT_UNWRAP | PARENT_CANNOT_CONTROL)
      expect(newExpiry).toEqual(expectedExpiry + GRACE_PERIOD)

      await expect(nameWrapper)
        .transaction(tx)
        .toEmitEvent('FusesSet')
        .withArgs(namehash(subname), CANNOT_UNWRAP | PARENT_CANNOT_CONTROL)
      await expect(nameWrapper)
        .transaction(tx)
        .toEmitEvent('ExpiryExtended')
        .withArgs(namehash(subname), expectedExpiry + GRACE_PERIOD)
    })

    it('Allows special cased TLD owners to set fuses/expiry', async () => {
      const { nameWrapper, actions, accounts, publicClient } =
        await loadFixture(fixture)

      await actions.setSubnodeOwner.onEnsRegistry({
        parentName: '',
        label: 'anothertld',
        owner: accounts[0].address,
      })

      await actions.setRegistryApprovalForWrapper()
      await actions.wrapName({
        name: 'anothertld',
        owner: accounts[0].address,
        resolver: zeroAddress,
      })

      const timestamp = await publicClient.getBlock().then((b) => b.timestamp)
      const expectedExpiry = timestamp + 1000n

      await nameWrapper.write.setChildFuses([
        zeroHash,
        labelhash('anothertld'),
        CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
        expectedExpiry,
      ])

      const [, fuses, expiry] = await nameWrapper.read.getData([
        toNameId('anothertld'),
      ])

      expect(fuses).toEqual(CANNOT_UNWRAP | PARENT_CANNOT_CONTROL)
      expect(expiry).toEqual(expectedExpiry)
    })

    it('does not allow parent owners to burn IS_DOT_ETH fuse', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: 0,
        expiry: 0n,
      })

      const [, fuses, expiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(fuses).toEqual(0)
      expect(expiry).toEqual(0n)

      await expect(nameWrapper)
        .write('setChildFuses', [
          namehash(name),
          labelhash(sublabel),
          CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | IS_DOT_ETH,
          MAX_EXPIRY,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Allow parent owners to burn parent controlled fuses without burning PCC', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: 0,
        expiry: 0n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(0)
      expect(initialExpiry).toEqual(0n)

      await nameWrapper.write.setChildFuses([
        namehash(name),
        labelhash(sublabel),
        IS_DOT_ETH * 2, // Next undefined parent controlled fuse
        MAX_EXPIRY,
      ])

      const [, fusesAfter] = await nameWrapper.read.getData([toNameId(subname)])

      expect(fusesAfter).toEqual(IS_DOT_ETH * 2)
    })

    it('Does not allow parent owners to burn parent controlled fuses after burning PCC', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: 0,
        expiry: 0n,
      })

      const [, fuses, expiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(fuses).toEqual(0)
      expect(expiry).toEqual(0n)

      await nameWrapper.write.setChildFuses([
        namehash(name),
        labelhash(sublabel),
        PARENT_CANNOT_CONTROL,
        MAX_EXPIRY,
      ])

      await expect(nameWrapper)
        .write('setChildFuses', [
          namehash(name),
          labelhash(sublabel),
          IS_DOT_ETH * 2, // Next undefined parent controlled fuse
          MAX_EXPIRY,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Allows accounts authorised by the parent node owner to set fuses/expiry', async () => {
      const { baseRegistrar, nameWrapper, actions, accounts } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: 0,
        expiry: 0n,
      })

      const [, initialFuses, initialExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(initialFuses).toEqual(0)
      expect(initialExpiry).toEqual(0n)

      // approve accounts[1] for anything accounts[0] owns
      await nameWrapper.write.setApprovalForAll([accounts[1].address, true])

      await nameWrapper.write.setChildFuses(
        [
          namehash(name),
          labelhash(sublabel),
          CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
          MAX_EXPIRY,
        ],
        { account: accounts[1] },
      )

      const expectedExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])
      const [, newFuses, newExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(newFuses).toEqual(CANNOT_UNWRAP | PARENT_CANNOT_CONTROL)
      expect(newExpiry).toEqual(expectedExpiry + GRACE_PERIOD)
    })

    it('Does not allow non-parent owners to set child fuses', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: 0,
        expiry: 0n,
      })

      const [, fuses, expiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(fuses).toEqual(0)
      expect(expiry).toEqual(0n)

      await expect(nameWrapper)
        .write(
          'setChildFuses',
          [
            namehash(name),
            labelhash(sublabel),
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
            MAX_EXPIRY,
          ],
          { account: accounts[1] },
        )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[1].address))
    })

    it('Normalises expiry to the parent expiry', async () => {
      const { baseRegistrar, nameWrapper, actions, accounts } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: 0,
        expiry: 0n,
      })

      const [, , expiry] = await nameWrapper.read.getData([toNameId(subname)])

      expect(expiry).toEqual(0n)

      await nameWrapper.write.setChildFuses([
        namehash(name),
        labelhash(sublabel),
        CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
        MAX_EXPIRY,
      ])

      const [, , expectedExpiry] = await nameWrapper.read.getData([
        toNameId(name),
      ])
      const [, , newExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(newExpiry).toEqual(expectedExpiry)
    })

    it('Normalises expiry to the old expiry', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: 0,
        expiry: 1000n,
      })

      const [, , expiry] = await nameWrapper.read.getData([toNameId(subname)])

      expect(expiry).toEqual(1000n)

      await nameWrapper.write.setChildFuses([
        namehash(name),
        labelhash(sublabel),
        CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
        500n,
      ])

      const [, , newExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      // normalises to 1000 instead of using 500
      expect(newExpiry).toEqual(1000n)
    })

    it('Does not allow burning fuses if PARENT_CANNOT_CONTROL is not burnt', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: 0,
        expiry: 0n,
      })

      await expect(nameWrapper)
        .write('setChildFuses', [
          namehash(name),
          labelhash(sublabel),
          CANNOT_UNWRAP,
          MAX_EXPIRY,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('should not allow .eth to call setChildFuses()', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      await expect(nameWrapper)
        .write('setChildFuses', [
          namehash('eth'),
          labelhash(label),
          CANNOT_SET_RESOLVER,
          0n,
        ])
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash('eth'), getAddress(accounts[0].address))
    })

    it('Does not allow burning fuses if CANNOT_UNWRAP is not burnt', async () => {
      const { nameWrapper, actions, accounts, publicClient } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const timestamp = await publicClient.getBlock().then((b) => b.timestamp)

      // set up child's PCC
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: PARENT_CANNOT_CONTROL,
        expiry: timestamp + 10000n,
      })

      // attempt to burn a fuse without CANNOT_UNWRAP
      await expect(nameWrapper)
        .write('setChildFuses', [
          namehash(name),
          labelhash(sublabel),
          CANNOT_SET_RESOLVER,
          0n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Does not allow burning fuses if PARENT_CANNOT_CONTROL is already burned', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: 0,
        expiry: 0n,
      })

      const originalFuses = PARENT_CANNOT_CONTROL | CANNOT_UNWRAP

      await nameWrapper.write.setChildFuses([
        namehash(name),
        labelhash(sublabel),
        originalFuses,
        MAX_EXPIRY,
      ])

      await expect(nameWrapper)
        .write('setChildFuses', [
          namehash(name),
          labelhash(sublabel),
          CANNOT_SET_RESOLVER | CANNOT_BURN_FUSES,
          MAX_EXPIRY,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Does not allow burning fuses if PARENT_CANNOT_CONTROL is already burned even if PARENT_CANNOT_CONTROL is added as a fuse', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: 0,
        expiry: 0n,
      })

      const originalFuses = PARENT_CANNOT_CONTROL | CANNOT_UNWRAP

      await nameWrapper.write.setChildFuses([
        namehash(name),
        labelhash(sublabel),
        originalFuses,
        MAX_EXPIRY,
      ])

      await expect(nameWrapper)
        .write('setChildFuses', [
          namehash(name),
          labelhash(sublabel),
          PARENT_CANNOT_CONTROL |
            CANNOT_UNWRAP |
            CANNOT_SET_RESOLVER |
            CANNOT_BURN_FUSES,
          MAX_EXPIRY,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Does not allow burning PARENT_CANNOT_CONTROL if CU on the parent is not burned', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: 0,
        expiry: 0n,
      })

      const originalFuses = PARENT_CANNOT_CONTROL | CANNOT_UNWRAP

      await expect(nameWrapper)
        .write('setChildFuses', [
          namehash(name),
          labelhash(sublabel),
          originalFuses,
          MAX_EXPIRY,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Fuses and owner are set to 0 if expired', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: 0,
        expiry: 0n,
      })

      await nameWrapper.write.setChildFuses([
        namehash(name),
        labelhash(sublabel),
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CANNOT_SET_RESOLVER,
        0n,
      ])

      const [owner, fuses, expiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(fuses).toEqual(0)
      expect(expiry).toEqual(0n)
      expect(owner).toEqual(zeroAddress)
    })

    it('Fuses and owner are set to 0 if expired and fuses cannot be burnt after expiry using setChildFuses()', async () => {
      const { nameWrapper, actions, accounts, publicClient } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: 0,
        expiry: 0n,
      })

      await nameWrapper.write.setChildFuses([
        namehash(name),
        labelhash(sublabel),
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
        0n,
      ])

      const [owner, fuses, expiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(fuses).toEqual(0)
      expect(expiry).toEqual(0n)
      expect(owner).toEqual(zeroAddress)

      const timestamp = await publicClient.getBlock().then((b) => b.timestamp)

      await expect(nameWrapper)
        .write('setChildFuses', [
          namehash(name),
          labelhash(sublabel),
          PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
          timestamp + 1n * DAY,
        ])
        .toBeRevertedWithCustomError('NameIsNotWrapped')
    })
  })
}
