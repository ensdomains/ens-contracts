import type { NetworkConnection } from 'hardhat/types/network'
import { getAddress, namehash, zeroAddress } from 'viem'

import { DAY } from '../../fixtures/constants.js'
import { dnsEncodeName } from '../../fixtures/dnsEncodeName.js'
import { toLabelId, toNameId } from '../../fixtures/utils.js'
import {
  CANNOT_UNWRAP,
  CAN_DO_EVERYTHING,
  GRACE_PERIOD,
  MAX_EXPIRY,
  PARENT_CANNOT_CONTROL,
  expectOwnerOf,
  zeroAccount,
  type LoadNameWrapperFixture,
} from '../fixtures/utils.js'

export const wrapTests = (
  connection: NetworkConnection,
  loadFixture: LoadNameWrapperFixture,
) =>
  describe('wrap()', () => {
    it('Wraps a name if you are the owner', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture()

      const label = 'xyz'

      await expectOwnerOf(label).on(nameWrapper).toBe(zeroAccount)

      await actions.setRegistryApprovalForWrapper()
      await actions.wrapName({
        name: label,
        owner: accounts[0].address,
        resolver: zeroAddress,
      })

      await expectOwnerOf(label).on(nameWrapper).toBe(accounts[0])
    })

    it('Allows specifying resolver', async () => {
      const { ensRegistry, accounts, actions } = await loadFixture()

      const label = 'xyz'

      await actions.setRegistryApprovalForWrapper()
      await actions.wrapName({
        name: label,
        owner: accounts[0].address,
        resolver: accounts[1].address,
      })

      await expect(
        ensRegistry.read.resolver([namehash(label)]),
      ).resolves.toEqualAddress(accounts[1].address)
    })

    it('emits event for NameWrapped', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture()

      await actions.setRegistryApprovalForWrapper()

      await expect(
        nameWrapper.write.wrap([
          dnsEncodeName('xyz'),
          accounts[0].address,
          zeroAddress,
        ]),
      )
        .toEmitEvent('NameWrapped')
        .withArgs({
          node: namehash('xyz'),
          name: dnsEncodeName('xyz'),
          owner: getAddress(accounts[0].address),
          fuses: 0,
          expiry: 0n,
        })
    })

    it('emits event for TransferSingle', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture()

      await actions.setRegistryApprovalForWrapper()

      await expect(
        nameWrapper.write.wrap([
          dnsEncodeName('xyz'),
          accounts[0].address,
          zeroAddress,
        ]),
      )
        .toEmitEvent('TransferSingle')
        .withArgs({
          operator: getAddress(accounts[0].address),
          from: zeroAddress,
          to: getAddress(accounts[0].address),
          id: toNameId('xyz'),
          value: 1n,
        })
    })

    it('Cannot wrap a name if the owner has not authorised the wrapper with the ENS registry', async () => {
      const { nameWrapper, accounts } = await loadFixture()

      await expect(
        nameWrapper.write.wrap([
          dnsEncodeName('xyz'),
          accounts[0].address,
          zeroAddress,
        ]),
      ).toBeRevertedWithoutReason()
    })

    it('Will not allow wrapping with a target address of 0x0 or the wrapper contract address.', async () => {
      const { nameWrapper, actions } = await loadFixture()

      await actions.setRegistryApprovalForWrapper()

      await expect(
        nameWrapper.write.wrap([
          dnsEncodeName('xyz'),
          zeroAddress,
          zeroAddress,
        ]),
      ).toBeRevertedWithString('ERC1155: mint to the zero address')
    })

    it('Will not allow wrapping with a target address of the wrapper contract address.', async () => {
      const { nameWrapper, actions } = await loadFixture()

      await actions.setRegistryApprovalForWrapper()

      await expect(
        nameWrapper.write.wrap([
          dnsEncodeName('xyz'),
          nameWrapper.address,
          zeroAddress,
        ]),
      ).toBeRevertedWithString(
        'ERC1155: newOwner cannot be the NameWrapper contract',
      )
    })

    it('Allows an account approved by the owner on the ENS registry to wrap a name.', async () => {
      const { ensRegistry, nameWrapper, accounts, actions } =
        await loadFixture()

      const label = 'abc'

      // setup .abc with accounts[1] as owner
      await actions.setSubnodeOwner.onEnsRegistry({
        parentName: '',
        label,
        owner: accounts[1].address,
      })
      // allow account to deal with all accounts[1]'s names
      await ensRegistry.write.setApprovalForAll([accounts[0].address, true], {
        account: accounts[1],
      })
      await actions.setRegistryApprovalForWrapper({ account: 1 })

      // confirm abc is owner by accounts[1] not accounts[0]
      await expectOwnerOf(label).on(ensRegistry).toBe(accounts[1])

      // wrap using accounts[0]
      await actions.wrapName({
        name: label,
        owner: accounts[1].address,
        resolver: zeroAddress,
      })

      await expectOwnerOf(label).on(nameWrapper).toBe(accounts[1])
    })

    it('Does not allow anyone else to wrap a name even if the owner has authorised the wrapper with the ENS registry', async () => {
      const { ensRegistry, nameWrapper, accounts, actions } =
        await loadFixture()

      const label = 'abc'

      // setup .abc with accounts[1] as owner
      await actions.setSubnodeOwner.onEnsRegistry({
        parentName: '',
        label,
        owner: accounts[1].address,
      })
      await actions.setRegistryApprovalForWrapper({
        account: 1,
      })

      // confirm abc is owner by accounts[1] not accounts[0]
      await expectOwnerOf(label).on(ensRegistry).toBe(accounts[1])

      // wrap using accounts[0]
      await expect(
        nameWrapper.write.wrap([
          dnsEncodeName(label),
          accounts[1].address,
          zeroAddress,
        ]),
      )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs([namehash(label), getAddress(accounts[0].address)])
    })

    it('Does not allow wrapping .eth 2LDs.', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture()

      const label = 'wrapped'

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })
      await actions.setRegistryApprovalForWrapper()

      await expect(
        nameWrapper.write.wrap([
          dnsEncodeName(`${label}.eth`),
          accounts[1].address,
          zeroAddress,
        ]),
      ).toBeRevertedWithCustomError('IncompatibleParent')
    })

    it('Can re-wrap a name that was reassigned by an unwrapped parent', async () => {
      const { ensRegistry, nameWrapper, accounts, actions } =
        await loadFixture()

      const parentLabel = 'xyz'
      const childLabel = 'sub'
      const childName = `${childLabel}.${parentLabel}`

      await expectOwnerOf(parentLabel).on(nameWrapper).toBe(zeroAccount)

      await actions.setRegistryApprovalForWrapper()
      await actions.setSubnodeOwner.onEnsRegistry({
        parentName: parentLabel,
        label: childLabel,
        owner: accounts[0].address,
      })
      await actions.wrapName({
        name: childName,
        owner: accounts[0].address,
        resolver: zeroAddress,
      })

      await actions.setSubnodeOwner.onEnsRegistry({
        parentName: parentLabel,
        label: childLabel,
        owner: accounts[1].address,
      })

      await expectOwnerOf(childName).on(ensRegistry).toBe(accounts[1])
      await expectOwnerOf(childName).on(nameWrapper).toBe(accounts[0])

      await actions.setRegistryApprovalForWrapper({ account: 1 })

      const tx = actions.wrapName({
        name: childName,
        owner: accounts[1].address,
        resolver: zeroAddress,
        account: 1,
      })

      await expect(tx)
        .toEmitEvent('NameUnwrapped')
        .withArgs({ node: namehash(childName), owner: zeroAddress })
      await expect(tx)
        .toEmitEvent('TransferSingle')
        .withArgs({
          operator: getAddress(accounts[1].address),
          from: getAddress(accounts[0].address),
          to: zeroAddress,
          id: toNameId(childName),
          value: 1n,
        })
      await expect(tx)
        .toEmitEvent('NameWrapped')
        .withArgs({
          node: namehash(childName),
          name: dnsEncodeName(childName),
          owner: getAddress(accounts[1].address),
          fuses: CAN_DO_EVERYTHING,
          expiry: 0n,
        })
      await expect(tx)
        .toEmitEvent('TransferSingle')
        .withArgs({
          operator: getAddress(accounts[1].address),
          from: zeroAddress,
          to: getAddress(accounts[1].address),
          id: toNameId(childName),
          value: 1n,
        })

      await expectOwnerOf(childName).on(nameWrapper).toBe(accounts[1])
      await expectOwnerOf(childName).on(ensRegistry).toBe(nameWrapper)
    })

    it('Will not wrap a name with junk at the end', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture()

      await actions.setRegistryApprovalForWrapper()

      await expect(
        nameWrapper.write.wrap([
          `${dnsEncodeName('xyz')}123456`,
          accounts[0].address,
          zeroAddress,
        ]),
      ).toBeRevertedWithString('namehash: Junk at end of name')
    })

    it('Does not allow wrapping a name you do not own', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture()

      const label = 'xyz'

      await actions.setRegistryApprovalForWrapper()
      // Register the name to accounts[0]
      await actions.wrapName({
        name: label,
        owner: accounts[0].address,
        resolver: zeroAddress,
      })

      // Deploy the destroy-your-name contract
      const nameGriefer = await connection.viem.deployContract('NameGriefer', [
        nameWrapper.address,
      ])

      const tx = nameGriefer.write.destroy([dnsEncodeName(label)])

      // Try and burn the name
      await expect(tx)
        .toBeRevertedWithCustomErrorFrom(nameWrapper, 'Unauthorised')
        .withArgs([namehash(label), getAddress(nameGriefer.address)])

      // Make sure it didn't succeed
      await expectOwnerOf(label).on(nameWrapper).toBe(accounts[0])
    })

    it('Rewrapping a previously wrapped unexpired name retains PCC', async () => {
      const { baseRegistrar, nameWrapper, accounts, actions } =
        await loadFixture()

      const label = 'test'
      const name = `${label}.eth`
      const subLabel = 'sub'
      const subname = `${subLabel}.${name}`

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])

      // Confirm that name is wrapped
      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      // NameWrapper.setSubnodeOwner to accounts[1]
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: subLabel,
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
        label: subLabel,
        controller: accounts[1].address,
        account: 1,
      })
      await actions.setRegistryApprovalForWrapper({
        account: 1,
      })
      await actions.wrapName({
        name: subname,
        owner: accounts[1].address,
        resolver: zeroAddress,
        account: 1,
      })

      const [, fusesAfter, expiryAfter] = await nameWrapper.read.getData([
        toNameId(subname),
      ])
      expect(fusesAfter).toEqual(PARENT_CANNOT_CONTROL)
      expect(expiryAfter).toEqual(parentExpiry + GRACE_PERIOD)
    })
  })
