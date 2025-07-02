import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { getAddress, labelhash, namehash, zeroAddress } from 'viem'
import { DAY } from '../../fixtures/constants.js'
import { dnsEncodeName } from '../../fixtures/dnsEncodeName.js'
import { toLabelId, toNameId } from '../../fixtures/utils.js'
import {
  CANNOT_CREATE_SUBDOMAIN,
  CANNOT_SET_RESOLVER,
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

export const setSubnodeOwnerTests = () =>
  describe('setSubnodeOwner()', () => {
    const label = 'ownerandwrap'
    const name = `${label}.eth`
    const sublabel = 'sub'
    const subname = `${sublabel}.${name}`

    async function setSubnodeOwnerFixture() {
      const initial = await loadFixture(fixture)
      const { actions } = initial

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      return initial
    }

    it('Can be called by the owner of a name and sets this contract as owner on the ENS registry.', async () => {
      const { ensRegistry, nameWrapper, actions, accounts } = await loadFixture(
        setSubnodeOwnerFixture,
      )

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      await actions.setRegistryApprovalForWrapper()
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: CAN_DO_EVERYTHING,
        expiry: 0n,
      })

      await expectOwnerOf(subname).on(ensRegistry).toBe(nameWrapper)
      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[0])
    })

    it('Can be called by an account authorised by the owner.', async () => {
      const { ensRegistry, nameWrapper, actions, accounts } = await loadFixture(
        setSubnodeOwnerFixture,
      )

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      await nameWrapper.write.setApprovalForAll([accounts[1].address, true])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: 0,
        expiry: 0n,
        account: 1,
      })

      await expectOwnerOf(subname).on(ensRegistry).toBe(nameWrapper)
      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[0])
    })

    it('Transfers the wrapped token to the target address.', async () => {
      const { ensRegistry, nameWrapper, actions, accounts } = await loadFixture(
        setSubnodeOwnerFixture,
      )

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: CAN_DO_EVERYTHING,
        expiry: 0n,
      })

      await expectOwnerOf(subname).on(ensRegistry).toBe(nameWrapper)
      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[1])
    })

    it('Will not allow wrapping with a target address of 0x0.', async () => {
      const { nameWrapper, accounts } = await loadFixture(
        setSubnodeOwnerFixture,
      )

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      await expect(nameWrapper)
        .write('setSubnodeOwner', [
          namehash(name),
          sublabel,
          zeroAddress,
          CAN_DO_EVERYTHING,
          0n,
        ])
        .toBeRevertedWithString('ERC1155: mint to the zero address')
    })

    it('Will not allow wrapping with a target address of the wrapper contract address', async () => {
      const { nameWrapper } = await loadFixture(setSubnodeOwnerFixture)

      await expect(nameWrapper)
        .write('setSubnodeOwner', [
          namehash(name),
          sublabel,
          nameWrapper.address,
          CAN_DO_EVERYTHING,
          0n,
        ])
        .toBeRevertedWithString(
          'ERC1155: newOwner cannot be the NameWrapper contract',
        )
    })

    it('Does not allow anyone else to wrap a name even if the owner has authorised the wrapper with the ENS registry.', async () => {
      const { ensRegistry, nameWrapper, actions, accounts } = await loadFixture(
        setSubnodeOwnerFixture,
      )

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      // TODO: this is not testing what the description of the test is
      await ensRegistry.write.setApprovalForAll([accounts[1].address, true])

      await expect(nameWrapper)
        .write(
          'setSubnodeOwner',
          [
            namehash(name),
            sublabel,
            accounts[0].address,
            CAN_DO_EVERYTHING,
            0n,
          ],
          { account: accounts[1] },
        )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[1].address))
    })

    it('Fuses cannot be burned if the name does not have PARENT_CANNOT_CONTROL burned', async () => {
      // note: not using suite specific fixture here
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      await expect(nameWrapper)
        .write('setSubnodeOwner', [
          namehash(name),
          sublabel,
          accounts[0].address,
          CANNOT_UNWRAP | CANNOT_TRANSFER,
          MAX_EXPIRY,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Does not allow fuses to be burned if CANNOT_UNWRAP is not burned.', async () => {
      // note: not using suite specific fixture here
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      await expect(nameWrapper)
        .write('setSubnodeOwner', [
          namehash(name),
          sublabel,
          accounts[0].address,
          PARENT_CANNOT_CONTROL | CANNOT_TRANSFER,
          0n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Allows fuses to be burned if CANNOT_UNWRAP and PARENT_CANNOT_CONTROL is burned and is not expired', async () => {
      // note: not using suite specific fixture here
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER,
        expiry: MAX_EXPIRY,
      })

      await expect(
        nameWrapper.read.allFusesBurned([
          namehash(subname),
          CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER,
        ]),
      ).resolves.toBe(true)
    })

    it('Does not allow IS_DOT_ETH to be burned', async () => {
      // note: not using suite specific fixture here
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await expect(nameWrapper)
        .write('setSubnodeOwner', [
          namehash(name),
          sublabel,
          accounts[0].address,
          CANNOT_UNWRAP |
            PARENT_CANNOT_CONTROL |
            CANNOT_SET_RESOLVER |
            IS_DOT_ETH,
          MAX_EXPIRY,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Does not allow fuses to be burned if CANNOT_UNWRAP and PARENT_CANNOT_CONTROL are burned, but the name is expired', async () => {
      // note: not using suite specific fixture here
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING | CANNOT_UNWRAP,
      })

      const [, parentFuses] = await nameWrapper.read.getData([toNameId(name)])
      expect(parentFuses).toEqual(
        PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | IS_DOT_ETH,
      )

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
        expiry: 0n, // set expiry to 0
      })

      await expect(
        nameWrapper.read.allFusesBurned([
          namehash(subname),
          PARENT_CANNOT_CONTROL,
        ]),
      ).resolves.toBe(false)
    })

    it("normalises the max expiry of a subdomain to the parent's expiry", async () => {
      // note: not using suite specific fixture here
      const { baseRegistrar, nameWrapper, actions, accounts } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING | CANNOT_UNWRAP,
      })

      const expectedExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
        expiry: MAX_EXPIRY,
      })

      const [, , expiry] = await nameWrapper.read.getData([toNameId(subname)])

      expect(expiry).toEqual(expectedExpiry + GRACE_PERIOD)
    })

    it('Emits Wrap event', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(
        setSubnodeOwnerFixture,
      )

      await expect(nameWrapper)
        .write('setSubnodeOwner', [
          namehash(name),
          sublabel,
          accounts[1].address,
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
        setSubnodeOwnerFixture,
      )

      await expect(nameWrapper)
        .write('setSubnodeOwner', [
          namehash(name),
          sublabel,
          accounts[1].address,
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

    it('Will not create a subdomain with an empty label', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(
        setSubnodeOwnerFixture,
      )

      await actions.setRegistryApprovalForWrapper()

      await expect(nameWrapper)
        .write('setSubnodeOwner', [
          namehash(name),
          '',
          accounts[0].address,
          CAN_DO_EVERYTHING,
          0n,
        ])
        .toBeRevertedWithCustomError('LabelTooShort')
    })

    it('should be able to call twice and change the owner', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(
        setSubnodeOwnerFixture,
      )

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: 0,
        expiry: 0n,
      })

      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[0])

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: 0,
        expiry: 0n,
      })

      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[1])
    })

    it('setting owner to 0 burns and unwraps', async () => {
      // note: not using suite specific fixture here
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      // Confirm that the name is wrapped
      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      // NameWrapper.setSubnodeOwner to accounts[1]
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: 0,
        expiry: MAX_EXPIRY,
      })

      const tx = await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: zeroAddress,
        fuses: PARENT_CANNOT_CONTROL,
        expiry: MAX_EXPIRY,
      })

      await expectOwnerOf(subname).on(nameWrapper).toBe(zeroAccount)

      await expect(nameWrapper)
        .transaction(tx)
        .toEmitEvent('NameUnwrapped')
        .withArgs(namehash(subname), zeroAddress)
    })

    it('Unwrapping within an external contract does not create any state inconsistencies', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      const testReentrancy = await hre.viem.deployContract(
        'TestNameWrapperReentrancy',
        [
          accounts[0].address,
          nameWrapper.address,
          namehash('test.eth'),
          labelhash('sub'),
        ],
      )
      await nameWrapper.write.setApprovalForAll([testReentrancy.address, true])

      // set self as sub owner
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: CAN_DO_EVERYTHING,
        expiry: MAX_EXPIRY,
      })

      // attempt to move owner to testReentrancy, which unwraps domain itself to account while keeping ERC1155 to testReentrancy
      await expect(nameWrapper)
        .write('setSubnodeOwner', [
          namehash(name),
          sublabel,
          testReentrancy.address,
          CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
          MAX_EXPIRY,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))

      // reverts because CANNOT_UNWRAP/PCC are burned first, and then unwrap is attempted inside contract, which fails, because CU has already been burned
    })

    it('Unwrapping a previously wrapped unexpired name retains PCC and so reverts setSubnodeRecord', async () => {
      // note: not using suite specific fixture here
      const { nameWrapper, actions, accounts, baseRegistrar } =
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
      expect(expiry).toEqual(parentExpiry + GRACE_PERIOD)
      expect(fuses).toEqual(PARENT_CANNOT_CONTROL)

      await expect(nameWrapper)
        .write('setSubnodeOwner', [
          namehash(name),
          sublabel,
          accounts[1].address,
          0,
          0n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Rewrapping a name that had PCC burned, but has now expired is possible and resets fuses', async () => {
      // note: not using suite specific fixture here
      const {
        nameWrapper,
        actions,
        accounts,
        baseRegistrar,
        testClient,
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

      // Advance time so the subdomain expires, but not the parent
      await testClient.increaseTime({ seconds: Number(DAY / 2n + 1n) })
      await testClient.mine({ blocks: 1 })

      const [, fusesAfter, expiryAfter] = await nameWrapper.read.getData([
        toNameId(subname),
      ])
      expect(expiryAfter).toEqual(parentExpiry - DAY / 2n)
      expect(fusesAfter).toEqual(0)

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: 0,
        expiry: 0n,
      })

      const timestamp = await publicClient.getBlock().then((b) => b.timestamp)

      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[1])

      const [rawOwner, rawFuses, expiry2] = await nameWrapper.read.getData([
        toNameId(subname),
      ])
      // TODO: removed active fuses check because it was redundant
      expect(rawFuses).toEqual(0)
      expect(rawOwner).toEqualAddress(accounts[1].address)
      expect(expiry2).toBeLessThan(timestamp)
    })

    it('Expired subnames should still be protected by CANNOT_CREATE_SUBDOMAIN on the parent', async () => {
      // note: not using suite specific fixture here
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

      // NameWrapper.setSubnodeOwner to accounts[1]
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL,
        expiry: parentExpiry - DAY / 2n,
      })

      await nameWrapper.write.setFuses([
        namehash(name),
        CANNOT_CREATE_SUBDOMAIN,
      ])

      await expect(nameWrapper)
        .write('setSubnodeOwner', [
          namehash(name),
          sublabel2,
          accounts[1].address,
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
        .write('setSubnodeOwner', [
          namehash(name),
          sublabel,
          accounts[1].address,
          0,
          parentExpiry - DAY / 2n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Burning a name still protects it from the parent as long as it is unexpired and has PCC burnt', async () => {
      // note: not using suite specific fixture here
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
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
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
        .write('setSubnodeOwner', [
          namehash(name),
          sublabel,
          accounts[0].address,
          PARENT_CANNOT_CONTROL,
          MAX_EXPIRY,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })
  })
