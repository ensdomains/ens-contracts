import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { getAddress, labelhash, namehash, zeroAddress } from 'viem'
import { DAY } from '../../fixtures/constants.js'
import { dnsEncodeName } from '../../fixtures/dnsEncodeName.js'
import { toLabelId, toNameId } from '../../fixtures/utils.js'
import {
  CANNOT_CREATE_SUBDOMAIN,
  CANNOT_TRANSFER,
  CANNOT_UNWRAP,
  CAN_DO_EVERYTHING,
  GRACE_PERIOD,
  IS_DOT_ETH,
  MAX_EXPIRY,
  PARENT_CANNOT_CONTROL,
  expectOwnerOf,
  deployNameWrapperWithUtils as fixture,
  zeroAccount,
} from '../fixtures/utils.js'

export const setSubnodeRecordTests = () =>
  describe('setSubnodeRecord()', () => {
    const label = 'subdomain2'
    const sublabel = 'sub'
    const name = `${label}.eth`
    const subname = `${sublabel}.${name}`

    async function setSubnodeRecordFixture() {
      const initial = await loadFixture(fixture)
      const { actions, accounts } = initial

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      return { ...initial, resolverAddress: accounts[0].address }
    }

    it('Can be called by the owner of a name', async () => {
      const { ensRegistry, nameWrapper, actions, accounts, resolverAddress } =
        await loadFixture(setSubnodeRecordFixture)

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      await actions.setSubnodeRecord.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        resolver: resolverAddress,
        ttl: 0n,
        fuses: 0,
        expiry: 0n,
      })

      await expectOwnerOf(subname).on(ensRegistry).toBe(nameWrapper)
      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[0])
    })

    it('Can be called by an account authorised by the owner.', async () => {
      const { ensRegistry, nameWrapper, actions, accounts, resolverAddress } =
        await loadFixture(setSubnodeRecordFixture)

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      await nameWrapper.write.setApprovalForAll([accounts[1].address, true])

      await actions.setSubnodeRecord.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        resolver: resolverAddress,
        ttl: 0n,
        fuses: 0,
        expiry: 0n,
        account: 1,
      })

      await expectOwnerOf(subname).on(ensRegistry).toBe(nameWrapper)
      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[0])
    })

    it('Transfers the wrapped token to the target address.', async () => {
      const { nameWrapper, actions, accounts, resolverAddress } =
        await loadFixture(setSubnodeRecordFixture)

      await actions.setSubnodeRecord.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        resolver: resolverAddress,
        ttl: 0n,
        fuses: 0,
        expiry: 0n,
      })

      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[1])
    })

    it('Will not allow wrapping with a target address of 0x0', async () => {
      const { nameWrapper, resolverAddress } = await loadFixture(
        setSubnodeRecordFixture,
      )

      await expect(nameWrapper)
        .write('setSubnodeRecord', [
          namehash(name),
          sublabel,
          zeroAddress,
          resolverAddress,
          0n,
          0,
          0n,
        ])
        .toBeRevertedWithString('ERC1155: mint to the zero address')
    })

    it('Will not allow wrapping with a target address of the wrapper contract address.', async () => {
      const { nameWrapper, resolverAddress } = await loadFixture(
        setSubnodeRecordFixture,
      )

      await expect(nameWrapper)
        .write('setSubnodeRecord', [
          namehash(name),
          sublabel,
          nameWrapper.address,
          resolverAddress,
          0n,
          0,
          0n,
        ])
        .toBeRevertedWithString(
          'ERC1155: newOwner cannot be the NameWrapper contract',
        )
    })

    it('Does not allow anyone else to wrap a name even if the owner has authorised the wrapper with the ENS registry.', async () => {
      const { ensRegistry, nameWrapper, accounts, resolverAddress } =
        await loadFixture(setSubnodeRecordFixture)

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      await ensRegistry.write.setApprovalForAll([accounts[1].address, true])

      await expect(nameWrapper)
        .write(
          'setSubnodeRecord',
          [
            namehash(name),
            sublabel,
            accounts[0].address,
            resolverAddress,
            0n,
            0,
            0n,
          ],
          { account: accounts[1] },
        )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[1].address))
    })

    it('Does not allow fuses to be burned if PARENT_CANNOT_CONTROL is not burned.', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      await expect(nameWrapper)
        .write('setSubnodeRecord', [
          namehash(name),
          sublabel,
          accounts[0].address,
          accounts[0].address,
          0n,
          CANNOT_UNWRAP,
          MAX_EXPIRY,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Does not allow fuses to be burned if CANNOT_UNWRAP is not burned', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      await expect(nameWrapper)
        .write('setSubnodeRecord', [
          namehash(name),
          sublabel,
          accounts[0].address,
          accounts[0].address,
          0n,
          PARENT_CANNOT_CONTROL | CANNOT_TRANSFER,
          MAX_EXPIRY,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Fuses will remain 0 if expired', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await actions.setSubnodeRecord.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        resolver: accounts[0].address,
        ttl: 0n,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CANNOT_TRANSFER,
        expiry: 0n,
      })

      const [, fuses] = await nameWrapper.read.getData([toNameId(subname)])

      expect(fuses).toEqual(0)
    })

    it('Allows fuses to be burned if not expired and PARENT_CANNOT_CONTROL/CANNOT_UNWRAP are burned', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await actions.setSubnodeRecord.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        resolver: accounts[0].address,
        ttl: 0n,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CANNOT_TRANSFER,
        expiry: MAX_EXPIRY,
      })

      const [, fuses] = await nameWrapper.read.getData([toNameId(subname)])

      expect(fuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CANNOT_TRANSFER,
      )
    })

    it('does not allow burning IS_DOT_ETH', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await expect(nameWrapper)
        .write('setSubnodeRecord', [
          namehash(name),
          sublabel,
          accounts[0].address,
          accounts[0].address,
          0n,
          PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CANNOT_TRANSFER | IS_DOT_ETH,
          MAX_EXPIRY,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Emits Wrap event', async () => {
      const { nameWrapper, accounts } = await loadFixture(
        setSubnodeRecordFixture,
      )

      await expect(nameWrapper)
        .write('setSubnodeRecord', [
          namehash(name),
          sublabel,
          accounts[1].address,
          accounts[0].address,
          0n,
          0,
          0n,
        ])
        .toEmitEvent('NameWrapped')
        .withArgs(
          namehash(subname),
          dnsEncodeName(subname),
          accounts[1].address,
          0,
          0n,
        )
    })

    it('Emits TransferSingle event', async () => {
      const { nameWrapper, accounts } = await loadFixture(
        setSubnodeRecordFixture,
      )

      await expect(nameWrapper)
        .write('setSubnodeRecord', [
          namehash(name),
          sublabel,
          accounts[1].address,
          accounts[0].address,
          0n,
          0,
          0n,
        ])
        .toEmitEvent('TransferSingle')
        .withArgs(
          accounts[0].address,
          zeroAddress,
          accounts[1].address,
          toNameId(subname),
          1n,
        )
    })

    it('Sets the appropriate values on the ENS registry', async () => {
      const { ensRegistry, nameWrapper, actions, accounts } = await loadFixture(
        setSubnodeRecordFixture,
      )

      await actions.setSubnodeRecord.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        resolver: accounts[0].address,
        ttl: 100n,
        fuses: 0,
        expiry: 0n,
      })

      await expectOwnerOf(subname).on(ensRegistry).toBe(nameWrapper)
      await expect(
        ensRegistry.read.resolver([namehash(subname)]),
      ).resolves.toEqualAddress(accounts[0].address)
      await expect(ensRegistry.read.ttl([namehash(subname)])).resolves.toEqual(
        100n,
      )
    })

    it('Will not create a subdomain with an empty label', async () => {
      const { nameWrapper, resolverAddress } = await loadFixture(
        setSubnodeRecordFixture,
      )

      await expect(nameWrapper)
        .write('setSubnodeRecord', [
          namehash(name),
          '',
          zeroAddress,
          resolverAddress,
          0n,
          0,
          0n,
        ])
        .toBeRevertedWithCustomError('LabelTooShort')
    })

    it('should be able to call twice and change the owner', async () => {
      const { nameWrapper, actions, accounts, resolverAddress } =
        await loadFixture(setSubnodeRecordFixture)

      await actions.setSubnodeRecord.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        resolver: resolverAddress,
        ttl: 0n,
        fuses: 0,
        expiry: 0n,
      })

      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[0])

      await actions.setSubnodeRecord.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        resolver: resolverAddress,
        ttl: 0n,
        fuses: 0,
        expiry: 0n,
      })

      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[1])
    })

    it('setting owner to 0 burns and unwraps', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      // Confirm that the name is wrapped
      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      // NameWrapper.setSubnodeRecord to accounts[1]
      await actions.setSubnodeRecord.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        resolver: accounts[0].address,
        ttl: 0n,
        fuses: 0,
        expiry: MAX_EXPIRY,
      })

      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[1])

      await expect(nameWrapper)
        .write('setSubnodeRecord', [
          namehash(name),
          sublabel,
          zeroAddress,
          zeroAddress,
          0n,
          PARENT_CANNOT_CONTROL,
          MAX_EXPIRY,
        ])
        .toEmitEvent('NameUnwrapped')
        .withArgs(namehash(subname), zeroAddress)

      await expectOwnerOf(subname).on(nameWrapper).toBe(zeroAccount)
    })

    it('Unwrapping within an external contract does not create any state inconsistencies', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture(fixture)

      await actions.setRegistryApprovalForWrapper()
      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      const testReentrancy = await hre.viem.deployContract(
        'TestNameWrapperReentrancy',
        [
          accounts[0].address,
          nameWrapper.address,
          namehash(name),
          labelhash(sublabel),
        ],
      )
      await nameWrapper.write.setApprovalForAll([testReentrancy.address, true])

      // set self as sub.test.eth owner
      await actions.setSubnodeRecord.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        resolver: zeroAddress,
        ttl: 0n,
        fuses: CAN_DO_EVERYTHING,
        expiry: MAX_EXPIRY,
      })

      // move owner to testReentrancy, which unwraps domain itself to account while keeping ERC1155 to testReentrancy
      await expect(nameWrapper)
        .write('setSubnodeRecord', [
          namehash(name),
          sublabel,
          testReentrancy.address,
          zeroAddress,
          0n,
          CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
          MAX_EXPIRY,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))

      // reverts because CANNOT_UNWRAP/PCC are burned first, and then unwrap is attempted inside contract, which fails, because CU has already been burned
    })

    it('Unwrapping a previously wrapped unexpired name retains PCC and so reverts setSubnodeRecord', async () => {
      const { ensRegistry, nameWrapper, actions, accounts, baseRegistrar } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])

      // Confirm that the name is wrapped
      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      // NameWrapper.setSubnodeOwner to accounts[1]
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL,
        expiry: MAX_EXPIRY,
      })

      // Confirm fuses are set
      const [ownerBefore, fusesBefore, expiryBefore] =
        await nameWrapper.read.getData([toNameId(subname)])

      expect(ownerBefore).toEqualAddress(accounts[1].address)
      expect(fusesBefore).toEqual(PARENT_CANNOT_CONTROL)
      expect(expiryBefore).toEqual(parentExpiry + GRACE_PERIOD)

      await actions.unwrapName({
        parentName: name,
        label: sublabel,
        controller: accounts[1].address,
        account: 1,
      })

      const [owner, fuses, expiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(owner).toEqual(zeroAddress)
      expect(fuses).toEqual(PARENT_CANNOT_CONTROL)
      expect(expiry).toEqual(parentExpiry + GRACE_PERIOD)

      // attempt to rewrap with PCC still burnt
      await expect(nameWrapper)
        .write('setSubnodeRecord', [
          namehash(name),
          sublabel,
          accounts[1].address,
          zeroAddress,
          0n,
          0,
          0n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Rewrapping a name that had PCC burned, but has now expired is possible', async () => {
      const { nameWrapper, actions, accounts, baseRegistrar, testClient } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])

      // Confirm that the name is wrapped
      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      // NameWrapper.setSubnodeOwner to accounts[1]
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL,
        expiry: parentExpiry - DAY / 2n,
      })

      // Confirm fuses are set
      const [, fusesBefore] = await nameWrapper.read.getData([
        toNameId(subname),
      ])
      expect(fusesBefore).toEqual(PARENT_CANNOT_CONTROL)

      await actions.unwrapName({
        parentName: name,
        label: sublabel,
        controller: accounts[1].address,
        account: 1,
      })

      const [owner, fuses, expiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      expect(owner).toEqual(zeroAddress)
      expect(expiry).toEqual(parentExpiry - DAY / 2n)
      expect(fuses).toEqual(PARENT_CANNOT_CONTROL)

      // Advance time so the subname expires, but not the parent
      await testClient.increaseTime({ seconds: Number(DAY / 2n + 1n) })
      await testClient.mine({ blocks: 1 })

      const [, fusesAfter, expiryAfter] = await nameWrapper.read.getData([
        toNameId(subname),
      ])
      expect(expiryAfter).toEqual(parentExpiry - DAY / 2n)
      expect(fusesAfter).toEqual(0)

      await actions.setSubnodeRecord.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        resolver: zeroAddress,
        ttl: 0n,
        fuses: 0,
        expiry: 0n,
      })

      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[1])
    })

    it('Expired subnames should still be protected by CANNOT_CREATE_SUBDOMAIN on the parent', async () => {
      const {
        nameWrapper,
        actions,
        accounts,
        baseRegistrar,
        testClient,
        publicClient,
      } = await loadFixture(fixture)

      const sublabel2 = 'sub2'

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])

      // Confirm that the name is wrapped
      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      // NameWrapper.setSubnodeRecord to accounts[1]
      await actions.setSubnodeRecord.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        resolver: zeroAddress,
        ttl: 0n,
        fuses: PARENT_CANNOT_CONTROL,
        expiry: parentExpiry - DAY / 2n,
      })

      await nameWrapper.write.setFuses([
        namehash(name),
        CANNOT_CREATE_SUBDOMAIN,
      ])

      await expect(nameWrapper)
        .write('setSubnodeRecord', [
          namehash(name),
          sublabel2,
          accounts[1].address,
          zeroAddress,
          0n,
          0,
          parentExpiry - DAY / 2n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(`${sublabel2}.${name}`))

      await testClient.increaseTime({ seconds: Number(DAY / 2n + 1n) })
      await testClient.mine({ blocks: 1 })

      const timestamp = await publicClient.getBlock().then((b) => b.timestamp)

      const [owner, fuses, expiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      // subdomain is expired
      expect(owner).toEqual(zeroAddress)
      expect(fuses).toEqual(0)
      expect(expiry).toBeLessThan(timestamp)

      await expect(nameWrapper)
        .write('setSubnodeRecord', [
          namehash(name),
          sublabel,
          accounts[1].address,
          zeroAddress,
          0n,
          0,
          parentExpiry - DAY / 2n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Burning a name still protects it from the parent as long as it is unexpired and has PCC burnt', async () => {
      const {
        ensRegistry,
        nameWrapper,
        actions,
        accounts,
        baseRegistrar,
        publicClient,
      } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])

      // Confirm that the name is wrapped
      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      // NameWrapper.setSubnodeOwner to accounts[1]
      await actions.setSubnodeRecord.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        resolver: zeroAddress,
        ttl: 0n,
        fuses: PARENT_CANNOT_CONTROL,
        expiry: MAX_EXPIRY,
      })

      // Confirm fuses are set
      const [, fusesBefore] = await nameWrapper.read.getData([
        toNameId(subname),
      ])
      expect(fusesBefore).toEqual(PARENT_CANNOT_CONTROL)

      // Unwrap and set owner to 0 to burn the name
      await actions.unwrapName({
        parentName: name,
        label: sublabel,
        controller: accounts[1].address,
        account: 1,
      })
      await ensRegistry.write.setOwner([namehash(subname), zeroAddress], {
        account: accounts[1],
      })

      const [owner, fuses, expiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      const timestamp = await publicClient.getBlock().then((b) => b.timestamp)

      expect(owner).toEqual(zeroAddress)
      expect(expiry).toEqual(parentExpiry + GRACE_PERIOD)
      expect(expiry).toBeGreaterThan(timestamp)
      expect(fuses).toEqual(PARENT_CANNOT_CONTROL)
      await expectOwnerOf(subname).on(ensRegistry).toBe(zeroAccount)

      // attempt to take back the name
      await expect(nameWrapper)
        .write('setSubnodeRecord', [
          namehash(name),
          sublabel,
          accounts[0].address,
          zeroAddress,
          0n,
          PARENT_CANNOT_CONTROL,
          MAX_EXPIRY,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })
  })
