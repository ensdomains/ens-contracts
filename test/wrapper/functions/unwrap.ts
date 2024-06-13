import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { getAddress, labelhash, namehash, zeroAddress, zeroHash } from 'viem'
import { DAY } from '../../fixtures/constants.js'
import { toLabelId, toNameId } from '../../fixtures/utils.js'
import {
  CANNOT_UNWRAP,
  CAN_DO_EVERYTHING,
  GRACE_PERIOD,
  MAX_EXPIRY,
  PARENT_CANNOT_CONTROL,
  expectOwnerOf,
  deployNameWrapperWithUtils as fixture,
  zeroAccount,
} from '../fixtures/utils.js'

export const unwrapTests = () =>
  describe('unwrap()', () => {
    it('Allows owner to unwrap name', async () => {
      const { ensRegistry, nameWrapper, accounts, actions } = await loadFixture(
        fixture,
      )

      const parentLabel = 'xyz'
      const childLabel = 'unwrapped'
      const childName = `${childLabel}.${parentLabel}`

      await actions.setRegistryApprovalForWrapper()
      await actions.wrapName({
        name: parentLabel,
        owner: accounts[0].address,
        resolver: zeroAddress,
      })
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: parentLabel,
        label: childLabel,
        owner: accounts[0].address,
        fuses: CAN_DO_EVERYTHING,
        expiry: 0n,
      })

      await expectOwnerOf(childName).on(nameWrapper).toBe(accounts[0])

      await actions.unwrapName({
        parentName: parentLabel,
        label: childLabel,
        controller: accounts[0].address,
      })

      // Transfers ownership in the ENS registry to the target address.
      await expectOwnerOf(childName).on(ensRegistry).toBe(accounts[0])
    })

    it('Will not allow previous owner to unwrap name when name expires', async () => {
      const { baseRegistrar, nameWrapper, accounts, testClient, actions } =
        await loadFixture(fixture)

      const parentLabel = 'unwrapped'
      const parentName = `${parentLabel}.eth`
      const childLabel = 'sub'
      const childName = `${childLabel}.${parentName}`

      await actions.registerSetupAndWrapName({
        label: parentLabel,
        fuses: CANNOT_UNWRAP,
      })
      await actions.setSubnodeOwner.onNameWrapper({
        parentName,
        label: childLabel,
        owner: accounts[0].address,
        fuses: PARENT_CANNOT_CONTROL,
        expiry: MAX_EXPIRY,
      })

      await testClient.increaseTime({
        seconds: Number(GRACE_PERIOD + 1n * DAY + 1n),
      })
      await testClient.mine({ blocks: 1 })

      await expect(nameWrapper)
        .write('unwrap', [
          namehash(parentName),
          labelhash(childLabel),
          accounts[0].address,
        ])
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(childName), getAddress(accounts[0].address))
    })

    it('emits Unwrap event', async () => {
      const { ensRegistry, nameWrapper, accounts, actions } = await loadFixture(
        fixture,
      )

      const label = 'xyz'

      await actions.setRegistryApprovalForWrapper()
      await actions.wrapName({
        name: label,
        owner: accounts[0].address,
        resolver: zeroAddress,
      })

      await expect(nameWrapper)
        .write('unwrap', [zeroHash, labelhash(label), accounts[0].address])
        .toEmitEvent('NameUnwrapped')
        .withArgs(namehash(label), getAddress(accounts[0].address))
    })

    it('emits TransferSingle event', async () => {
      const { ensRegistry, nameWrapper, accounts, actions } = await loadFixture(
        fixture,
      )

      const label = 'xyz'

      await actions.setRegistryApprovalForWrapper()
      await actions.wrapName({
        name: label,
        owner: accounts[0].address,
        resolver: zeroAddress,
      })

      await expect(nameWrapper)
        .write('unwrap', [zeroHash, labelhash(label), accounts[0].address])
        .toEmitEvent('TransferSingle')
        .withArgs(
          accounts[0].address,
          accounts[0].address,
          zeroAddress,
          toNameId(label),
          1n,
        )
    })

    it('Allows an account authorised by the owner on the NFT Wrapper to unwrap a name', async () => {
      const { ensRegistry, nameWrapper, accounts, actions } = await loadFixture(
        fixture,
      )

      const label = 'abc'

      // setup .abc with accounts[0] as owner
      await actions.setSubnodeOwner.onEnsRegistry({
        parentName: '',
        label,
        owner: accounts[0].address,
      })
      await actions.setRegistryApprovalForWrapper()

      // wrap using accounts[0]
      await actions.wrapName({
        name: label,
        owner: accounts[0].address,
        resolver: zeroAddress,
      })
      await nameWrapper.write.setApprovalForAll([accounts[1].address, true])

      await expectOwnerOf(label).on(nameWrapper).toBe(accounts[0])

      // unwrap using accounts[1]
      await actions.unwrapName({
        parentName: '',
        label,
        controller: accounts[1].address,
        account: 1,
      })

      await expectOwnerOf(label).on(ensRegistry).toBe(accounts[1])
      await expectOwnerOf(label).on(nameWrapper).toBe(zeroAccount)
    })

    it('Does not allow an account authorised by the owner on the ENS registry to unwrap a name', async () => {
      const { ensRegistry, nameWrapper, accounts, actions } = await loadFixture(
        fixture,
      )

      const label = 'abc'

      // setup .abc with accounts[1] as owner
      await actions.setSubnodeOwner.onEnsRegistry({
        parentName: '',
        label,
        owner: accounts[1].address,
      })
      // allow account to deal with all account[1]'s names
      await ensRegistry.write.setApprovalForAll([accounts[0].address, true], {
        account: accounts[1],
      })
      await actions.setRegistryApprovalForWrapper({ account: 1 })

      // confirm abc is owner by accounts[1] not accounts[0]
      await expectOwnerOf(label).on(ensRegistry).toBe(accounts[1])
      await expect(
        ensRegistry.read.isApprovedForAll([
          accounts[1].address,
          accounts[0].address,
        ]),
      ).resolves.toBe(true)

      // wrap using accounts[0]
      await actions.wrapName({
        name: label,
        owner: accounts[1].address,
        resolver: zeroAddress,
      })
    })

    it('Does not allow anyone else to unwrap a name', async () => {
      const { ensRegistry, nameWrapper, accounts, actions } = await loadFixture(
        fixture,
      )

      const label = 'abc'

      await actions.setSubnodeOwner.onEnsRegistry({
        parentName: '',
        label,
        owner: accounts[0].address,
      })
      await actions.setRegistryApprovalForWrapper()
      await actions.wrapName({
        name: label,
        owner: accounts[0].address,
        resolver: zeroAddress,
      })

      await expectOwnerOf(label).on(nameWrapper).toBe(accounts[0])

      // unwrap using accounts[1]
      await expect(nameWrapper)
        .write('unwrap', [zeroHash, labelhash(label), accounts[1].address], {
          account: accounts[1],
        })
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(label), getAddress(accounts[1].address))
    })

    it('Will not unwrap .eth 2LDs.', async () => {
      const { nameWrapper, baseRegistrar, accounts, actions } =
        await loadFixture(fixture)

      const label = 'unwrapped'

      await actions.registerSetupAndWrapName({
        label,
        fuses: 0,
      })

      await expectOwnerOf(`${label}.eth`).on(nameWrapper).toBe(accounts[0])

      await expect(nameWrapper)
        .write('unwrap', [
          namehash('eth'),
          labelhash(label),
          accounts[0].address,
        ])
        .toBeRevertedWithCustomError('IncompatibleParent')
    })

    it('Will not allow a target address of 0x0 or the wrapper contract address.', async () => {
      const { ensRegistry, nameWrapper, accounts, actions } = await loadFixture(
        fixture,
      )

      const label = 'abc'

      await actions.setSubnodeOwner.onEnsRegistry({
        parentName: '',
        label,
        owner: accounts[0].address,
      })
      await actions.setRegistryApprovalForWrapper()
      await actions.wrapName({
        name: label,
        owner: accounts[0].address,
        resolver: zeroAddress,
      })

      await expect(nameWrapper)
        .write('unwrap', [zeroHash, labelhash(label), zeroAddress])
        .toBeRevertedWithCustomError('IncorrectTargetOwner')
        .withArgs(zeroAddress)

      await expect(nameWrapper)
        .write('unwrap', [zeroHash, labelhash(label), nameWrapper.address])
        .toBeRevertedWithCustomError('IncorrectTargetOwner')
        .withArgs(getAddress(nameWrapper.address))
    })

    it('Will not allow to unwrap with PCC/CU burned if expired', async () => {
      const { accounts, ensRegistry, nameWrapper, actions } = await loadFixture(
        fixture,
      )

      const parentLabel = 'awesome'
      const parentName = `${parentLabel}.eth`
      const childLabel = 'sub'
      const childName = `${childLabel}.${parentName}`

      await actions.register({
        label: parentLabel,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })
      await actions.setSubnodeOwner.onEnsRegistry({
        parentName,
        label: childLabel,
        owner: accounts[0].address,
      })
      await actions.setBaseRegistrarApprovalForWrapper()
      await actions.wrapEth2ld({
        label: parentLabel,
        owner: accounts[0].address,
        fuses: CANNOT_UNWRAP,
        resolver: zeroAddress,
      })
      await actions.setRegistryApprovalForWrapper()
      await actions.setSubnodeOwner.onNameWrapper({
        parentName,
        label: childLabel,
        owner: accounts[0].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
        expiry: 0n,
      })

      await expectOwnerOf(childName).on(ensRegistry).toBe(nameWrapper)

      await expect(nameWrapper)
        .write('unwrap', [
          namehash(parentName),
          labelhash(childLabel),
          accounts[0].address,
        ])
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(childName), getAddress(accounts[0].address))
    })

    it('Will allow to unwrap with PCC/CU burned if expired and then extended without PCC/CU', async () => {
      const {
        baseRegistrar,
        nameWrapper,
        ensRegistry,
        accounts,
        publicClient,
        testClient,
        actions,
      } = await loadFixture(fixture)

      const parentLabel = 'awesome'
      const parentName = `${parentLabel}.eth`
      const childLabel = 'sub'
      const childName = `${childLabel}.${parentName}`

      await actions.register({
        label: parentLabel,
        owner: accounts[0].address,
        duration: 7n * DAY,
      })
      await actions.setSubnodeOwner.onEnsRegistry({
        parentName,
        label: childLabel,
        owner: accounts[0].address,
      })
      await actions.setBaseRegistrarApprovalForWrapper()
      await actions.wrapEth2ld({
        label: parentLabel,
        owner: accounts[0].address,
        fuses: CANNOT_UNWRAP,
        resolver: zeroAddress,
      })
      await actions.setRegistryApprovalForWrapper()

      const timestamp = await actions.getBlockTimestamp()
      await actions.setSubnodeOwner.onNameWrapper({
        parentName,
        label: childLabel,
        owner: accounts[0].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
        expiry: timestamp + DAY,
      })

      await expectOwnerOf(childName).on(ensRegistry).toBe(nameWrapper)

      await testClient.increaseTime({ seconds: Number(2n * DAY) })
      await testClient.mine({ blocks: 1 })

      await expect(nameWrapper)
        .write('unwrap', [
          namehash(parentName),
          labelhash(childLabel),
          accounts[0].address,
        ])
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(childName), getAddress(accounts[0].address))

      await actions.setSubnodeOwner.onNameWrapper({
        parentName,
        label: childLabel,
        owner: accounts[0].address,
        fuses: 0,
        expiry: MAX_EXPIRY,
      })

      await actions.unwrapName({
        parentName,
        label: childLabel,
        controller: accounts[0].address,
      })

      await expectOwnerOf(childName).on(ensRegistry).toBe(accounts[0])
    })

    it('Will not allow to unwrap a name with the CANNOT_UNWRAP fuse burned if not expired', async () => {
      const { ensRegistry, baseRegistrar, nameWrapper, accounts, actions } =
        await loadFixture(fixture)

      const parentLabel = 'abc'
      const parentName = `${parentLabel}.eth`
      const childLabel = 'sub'
      const childName = `${childLabel}.${parentName}`

      await actions.setSubnodeOwner.onEnsRegistry({
        parentName: '',
        label: parentLabel,
        owner: accounts[0].address,
      })
      await actions.setRegistryApprovalForWrapper()

      await actions.register({
        label: parentLabel,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })
      await actions.setBaseRegistrarApprovalForWrapper()
      await actions.wrapEth2ld({
        label: parentLabel,
        owner: accounts[0].address,
        fuses: CANNOT_UNWRAP,
        resolver: zeroAddress,
      })
      await actions.setSubnodeOwner.onNameWrapper({
        parentName,
        label: childLabel,
        owner: accounts[0].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
        expiry: MAX_EXPIRY,
      })

      await expect(nameWrapper)
        .write('unwrap', [
          namehash(parentName),
          labelhash(childLabel),
          accounts[0].address,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(childName))
    })

    it('Unwrapping a previously wrapped unexpired name retains PCC and expiry', async () => {
      const { ensRegistry, baseRegistrar, nameWrapper, accounts, actions } =
        await loadFixture(fixture)

      const parentLabel = 'test'
      const parentName = `${parentLabel}.eth`
      const childLabel = 'sub'
      const childName = `${childLabel}.${parentName}`

      await actions.registerSetupAndWrapName({
        label: parentLabel,
        fuses: CANNOT_UNWRAP,
      })

      // Confirm that the name is wrapped
      await expectOwnerOf(parentName).on(nameWrapper).toBe(accounts[0])

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(parentLabel),
      ])

      // NameWrapper.setSubnodeOwner to accounts[1]
      await actions.setSubnodeOwner.onNameWrapper({
        parentName,
        label: childLabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL,
        expiry: MAX_EXPIRY,
      })

      // Confirm fuses are set
      const [, fusesBefore] = await nameWrapper.read.getData([
        toNameId(childName),
      ])
      expect(fusesBefore).toEqual(PARENT_CANNOT_CONTROL)

      await actions.unwrapName({
        parentName,
        label: childLabel,
        controller: accounts[1].address,
        account: 1,
      })

      const [, fusesAfter, expiryAfter] = await nameWrapper.read.getData([
        toNameId(childName),
      ])
      expect(fusesAfter).toEqual(PARENT_CANNOT_CONTROL)
      expect(expiryAfter).toEqual(parentExpiry + GRACE_PERIOD)
    })
  })
