import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { getAddress, namehash, zeroAddress } from 'viem'
import { dnsEncodeName } from '../../fixtures/dnsEncodeName.js'
import { toLabelId, toNameId } from '../../fixtures/utils.js'
import {
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

export const upgradeTests = () =>
  describe('upgrade()', () => {
    describe('.eth', () => {
      const label = 'wrapped2'
      const name = `${label}.eth`

      it('Upgrades a .eth name if sender is owner', async () => {
        const {
          nameWrapper,
          baseRegistrar,
          ensRegistry,
          nameWrapperUpgraded,
          actions,
          accounts,
        } = await loadFixture(fixture)

        await actions.registerSetupAndWrapName({
          label,
          fuses: CAN_DO_EVERYTHING,
        })

        const expectedExpiry = await baseRegistrar.read.nameExpires([
          toLabelId(label),
        ])

        // make sure reclaim claimed ownership for the wrapper in registry
        await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])
        await expectOwnerOf(name).on(ensRegistry).toBe(nameWrapper)
        await expectOwnerOf(label).on(baseRegistrar).toBe(nameWrapper)

        // set the upgradeContract of the NameWrapper contract
        await nameWrapper.write.setUpgradeContract([
          nameWrapperUpgraded.address,
        ])

        // check the upgraded namewrapper is called with all parameters required
        await expect(nameWrapper)
          .write('upgrade', [dnsEncodeName(name), '0x'])
          .toEmitEventFrom(nameWrapperUpgraded, 'NameUpgraded')
          .withArgs(
            dnsEncodeName(name),
            accounts[0].address,
            PARENT_CANNOT_CONTROL | IS_DOT_ETH,
            expectedExpiry + GRACE_PERIOD,
            zeroAddress,
            '0x00',
          )
      })

      it('Upgrades a .eth name if sender is authorised by the owner', async () => {
        const {
          nameWrapper,
          baseRegistrar,
          ensRegistry,
          nameWrapperUpgraded,
          actions,
          accounts,
        } = await loadFixture(fixture)

        await actions.registerSetupAndWrapName({
          label,
          fuses: CAN_DO_EVERYTHING,
        })

        const expectedExpiry = await baseRegistrar.read.nameExpires([
          toLabelId(label),
        ])

        // make sure reclaim claimed ownership for the wrapper in registry
        await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])
        await expectOwnerOf(name).on(ensRegistry).toBe(nameWrapper)
        await expectOwnerOf(label).on(baseRegistrar).toBe(nameWrapper)

        // set the upgradeContract of the NameWrapper contract
        await nameWrapper.write.setUpgradeContract([
          nameWrapperUpgraded.address,
        ])
        await nameWrapper.write.setApprovalForAll([accounts[1].address, true])

        // check the upgraded namewrapper is called with all parameters required
        await expect(nameWrapper)
          .write('upgrade', [dnsEncodeName(name), '0x'], {
            account: accounts[1],
          })
          .toEmitEventFrom(nameWrapperUpgraded, 'NameUpgraded')
          .withArgs(
            dnsEncodeName(name),
            accounts[0].address,
            PARENT_CANNOT_CONTROL | IS_DOT_ETH,
            expectedExpiry + GRACE_PERIOD,
            zeroAddress,
            '0x00',
          )
      })

      it('Cannot upgrade a name if the upgradeContract has not been set.', async () => {
        const { nameWrapper, actions } = await loadFixture(fixture)

        await actions.registerSetupAndWrapName({
          label,
          fuses: CAN_DO_EVERYTHING,
        })

        await expect(nameWrapper)
          .write('upgrade', [dnsEncodeName(name), '0x'])
          .toBeRevertedWithCustomError('CannotUpgrade')
      })

      it('Cannot upgrade a name if the upgradeContract has been set and then set back to the 0 address.', async () => {
        const { nameWrapper, nameWrapperUpgraded, actions } = await loadFixture(
          fixture,
        )

        await actions.registerSetupAndWrapName({
          label,
          fuses: CAN_DO_EVERYTHING,
        })

        await nameWrapper.write.setUpgradeContract([
          nameWrapperUpgraded.address,
        ])

        await expect(
          nameWrapper.read.upgradeContract(),
        ).resolves.toEqualAddress(nameWrapperUpgraded.address)

        await nameWrapper.write.setUpgradeContract([zeroAddress])

        await expect(nameWrapper)
          .write('upgrade', [dnsEncodeName(name), '0x'])
          .toBeRevertedWithCustomError('CannotUpgrade')
      })

      it('Will pass fuses and expiry to the upgradedContract without any changes.', async () => {
        const {
          nameWrapper,
          baseRegistrar,
          nameWrapperUpgraded,
          actions,
          accounts,
        } = await loadFixture(fixture)

        await actions.registerSetupAndWrapName({
          label,
          fuses: CANNOT_UNWRAP | CANNOT_SET_RESOLVER,
        })

        const expectedExpiry = await baseRegistrar.read
          .nameExpires([toLabelId(label)])
          .then((e) => e + GRACE_PERIOD)

        // set the upgradeContract of the NameWrapper contract
        await nameWrapper.write.setUpgradeContract([
          nameWrapperUpgraded.address,
        ])

        // assert the fuses and expiry have been passed through to the new NameWrapper
        await expect(nameWrapper)
          .write('upgrade', [dnsEncodeName(name), '0x'])
          .toEmitEventFrom(nameWrapperUpgraded, 'NameUpgraded')
          .withArgs(
            dnsEncodeName(name),
            accounts[0].address,
            PARENT_CANNOT_CONTROL |
              CANNOT_UNWRAP |
              CANNOT_SET_RESOLVER |
              IS_DOT_ETH,
            expectedExpiry,
            zeroAddress,
            '0x00',
          )
      })

      // TODO: this label seems wrong ??
      it('Will burn the token, fuses and expiry of the name in the NameWrapper contract when upgraded.', async () => {
        const {
          nameWrapper,
          baseRegistrar,
          nameWrapperUpgraded,
          actions,
          accounts,
        } = await loadFixture(fixture)

        await actions.registerSetupAndWrapName({
          label,
          fuses: CANNOT_UNWRAP,
        })

        const parentExpiry = await baseRegistrar.read.nameExpires([
          toLabelId(label),
        ])

        // set the upgradeContract of the NameWrapper contract
        await nameWrapper.write.setUpgradeContract([
          nameWrapperUpgraded.address,
        ])

        await nameWrapper.write.upgrade([dnsEncodeName(name), '0x'])

        await expectOwnerOf(name).on(nameWrapper).toBe(zeroAccount)

        const [, fuses, expiry] = await nameWrapper.read.getData([
          toNameId(name),
        ])

        expect(fuses).toEqual(
          CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | IS_DOT_ETH,
        )
        expect(expiry).toEqual(parentExpiry + GRACE_PERIOD)
      })

      it('will revert if called twice by the original owner', async () => {
        const { nameWrapper, nameWrapperUpgraded, actions, accounts } =
          await loadFixture(fixture)

        await actions.registerSetupAndWrapName({
          label,
          fuses: CANNOT_UNWRAP,
        })

        await nameWrapper.write.setUpgradeContract([
          nameWrapperUpgraded.address,
        ])

        await nameWrapper.write.upgrade([dnsEncodeName(name), '0x'])

        await expectOwnerOf(name).on(nameWrapper).toBe(zeroAccount)

        await expect(nameWrapper)
          .write('upgrade', [dnsEncodeName(name), '0x'])
          .toBeRevertedWithCustomError('Unauthorised')
          .withArgs(namehash(name), getAddress(accounts[0].address))
      })

      it('Will allow you to pass through extra data on upgrade', async () => {
        const {
          nameWrapper,
          baseRegistrar,
          nameWrapperUpgraded,
          actions,
          accounts,
        } = await loadFixture(fixture)

        await actions.registerSetupAndWrapName({
          label,
          fuses: CANNOT_UNWRAP | CANNOT_SET_RESOLVER,
        })

        await nameWrapper.write.setUpgradeContract([
          nameWrapperUpgraded.address,
        ])

        const expectedExpiry = await baseRegistrar.read
          .nameExpires([toLabelId(label)])
          .then((e) => e + GRACE_PERIOD)

        await expect(nameWrapper)
          .write('upgrade', [dnsEncodeName(name), '0x01'])
          .toEmitEventFrom(nameWrapperUpgraded, 'NameUpgraded')
          .withArgs(
            dnsEncodeName(name),
            accounts[0].address,
            PARENT_CANNOT_CONTROL |
              CANNOT_UNWRAP |
              CANNOT_SET_RESOLVER |
              IS_DOT_ETH,
            expectedExpiry,
            zeroAddress,
            '0x01',
          )
      })

      it('Does not allow anyone else to upgrade a name even if the owner has authorised the wrapper with the ENS registry.', async () => {
        const { nameWrapper, nameWrapperUpgraded, actions, accounts } =
          await loadFixture(fixture)

        await actions.registerSetupAndWrapName({
          label,
          fuses: CAN_DO_EVERYTHING,
        })

        await nameWrapper.write.setUpgradeContract([
          nameWrapperUpgraded.address,
        ])

        await expect(nameWrapper)
          .write('upgrade', [dnsEncodeName(name), '0x'], {
            account: accounts[1],
          })
          .toBeRevertedWithCustomError('Unauthorised')
          .withArgs(namehash(name), getAddress(accounts[1].address))
      })
    })

    describe('other', () => {
      const label = 'to-upgrade'
      const parentLabel = 'wrapped2'
      const parentName = `${parentLabel}.eth`
      const name = `${label}.${parentName}`

      it('Allows owner to upgrade name', async () => {
        const { nameWrapper, nameWrapperUpgraded, actions, accounts } =
          await loadFixture(fixture)

        await actions.registerSetupAndWrapName({
          label: parentLabel,
          fuses: CANNOT_UNWRAP,
        })
        await actions.setRegistryApprovalForWrapper()

        await actions.setSubnodeOwner.onNameWrapper({
          parentName,
          label,
          owner: accounts[0].address,
          expiry: 0n,
          fuses: 0,
        })

        await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

        // set the upgradeContract of the NameWrapper contract
        await nameWrapper.write.setUpgradeContract([
          nameWrapperUpgraded.address,
        ])

        await expect(nameWrapper)
          .write('upgrade', [dnsEncodeName(name), '0x'])
          .toEmitEventFrom(nameWrapperUpgraded, 'NameUpgraded')
          .withArgs(
            dnsEncodeName(name),
            accounts[0].address,
            0,
            0n,
            zeroAddress,
            '0x00',
          )
      })

      it('upgrades a name if sender is authorized by the owner', async () => {
        const { nameWrapper, nameWrapperUpgraded, actions, accounts } =
          await loadFixture(fixture)

        const xyzName = `${label}.xyz`

        await actions.setRegistryApprovalForWrapper()
        await actions.wrapName({
          name: 'xyz',
          owner: accounts[0].address,
          resolver: zeroAddress,
        })
        await actions.setSubnodeOwner.onNameWrapper({
          parentName: 'xyz',
          label: label,
          owner: accounts[0].address,
          expiry: 0n,
          fuses: 0,
        })

        await expectOwnerOf(xyzName).on(nameWrapper).toBe(accounts[0])

        // set the upgradeContract of the NameWrapper contract
        await nameWrapper.write.setUpgradeContract([
          nameWrapperUpgraded.address,
        ])

        await nameWrapper.write.setApprovalForAll([accounts[1].address, true])

        await expect(nameWrapper)
          .write('upgrade', [dnsEncodeName(xyzName), '0x'], {
            account: accounts[1],
          })
          .toEmitEventFrom(nameWrapperUpgraded, 'NameUpgraded')
          .withArgs(
            dnsEncodeName(xyzName),
            accounts[0].address,
            0,
            0n,
            zeroAddress,
            '0x00',
          )
      })

      it('Cannot upgrade a name if the upgradeContract has not been set.', async () => {
        const { nameWrapper, actions, accounts } = await loadFixture(fixture)

        const xyzName = `${label}.xyz`

        await actions.setRegistryApprovalForWrapper()
        await actions.wrapName({
          name: 'xyz',
          owner: accounts[0].address,
          resolver: zeroAddress,
        })
        await actions.setSubnodeOwner.onNameWrapper({
          parentName: 'xyz',
          label,
          owner: accounts[0].address,
          expiry: 0n,
          fuses: 0,
        })

        await expectOwnerOf(xyzName).on(nameWrapper).toBe(accounts[0])

        await expect(nameWrapper)
          .write('upgrade', [dnsEncodeName(xyzName), '0x'])
          .toBeRevertedWithCustomError('CannotUpgrade')
      })

      it('Will pass fuses and expiry to the upgradedContract without any changes.', async () => {
        const {
          nameWrapper,
          nameWrapperUpgraded,
          actions,
          accounts,
          baseRegistrar,
        } = await loadFixture(fixture)

        await actions.registerSetupAndWrapName({
          label: parentLabel,
          fuses: CANNOT_UNWRAP,
        })
        await actions.setRegistryApprovalForWrapper()

        const expectedFuses =
          PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CANNOT_TRANSFER

        await actions.setSubnodeOwner.onNameWrapper({
          parentName,
          label,
          owner: accounts[0].address,
          expiry: MAX_EXPIRY,
          fuses: expectedFuses,
        })

        await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

        // set the upgradeContract of the NameWrapper contract
        await nameWrapper.write.setUpgradeContract([
          nameWrapperUpgraded.address,
        ])

        const expectedExpiry = await baseRegistrar.read
          .nameExpires([toLabelId(parentLabel)])
          .then((e) => e + GRACE_PERIOD)

        await expect(nameWrapper)
          .write('upgrade', [dnsEncodeName(name), '0x'])
          .toEmitEventFrom(nameWrapperUpgraded, 'NameUpgraded')
          .withArgs(
            dnsEncodeName(name),
            accounts[0].address,
            expectedFuses,
            expectedExpiry,
            zeroAddress,
            '0x00',
          )
      })

      it('Will burn the token of the name in the NameWrapper contract when upgraded, but keep expiry and fuses', async () => {
        const {
          nameWrapper,
          nameWrapperUpgraded,
          actions,
          accounts,
          baseRegistrar,
        } = await loadFixture(fixture)

        const expectedFuses =
          PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CANNOT_TRANSFER

        await actions.registerSetupAndWrapName({
          label: parentLabel,
          fuses: CANNOT_UNWRAP,
        })
        await actions.setRegistryApprovalForWrapper()

        await actions.setSubnodeOwner.onNameWrapper({
          parentName,
          label,
          owner: accounts[0].address,
          expiry: MAX_EXPIRY,
          fuses: expectedFuses,
        })

        await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

        const expectedExpiry = await baseRegistrar.read
          .nameExpires([toLabelId(parentLabel)])
          .then((e) => e + GRACE_PERIOD)

        // set the upgradeContract of the NameWrapper contract
        await nameWrapper.write.setUpgradeContract([
          nameWrapperUpgraded.address,
        ])

        await nameWrapper.write.upgrade([dnsEncodeName(name), '0x'])

        await expectOwnerOf(name).on(nameWrapper).toBe(zeroAccount)

        const [, fuses, expiry] = await nameWrapper.read.getData([
          toNameId(name),
        ])

        expect(fuses).toEqual(expectedFuses)
        expect(expiry).toEqual(expectedExpiry)
      })

      it('reverts if called twice by the original owner', async () => {
        const { nameWrapper, nameWrapperUpgraded, actions, accounts } =
          await loadFixture(fixture)

        await actions.registerSetupAndWrapName({
          label: parentLabel,
          fuses: CANNOT_UNWRAP,
        })
        await actions.setRegistryApprovalForWrapper()

        await actions.setSubnodeOwner.onNameWrapper({
          parentName,
          label,
          owner: accounts[0].address,
          expiry: MAX_EXPIRY,
          fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CANNOT_TRANSFER,
        })

        await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

        // set the upgradeContract of the NameWrapper contract
        await nameWrapper.write.setUpgradeContract([
          nameWrapperUpgraded.address,
        ])

        await nameWrapper.write.upgrade([dnsEncodeName(name), '0x'])

        await expect(nameWrapper)
          .write('upgrade', [dnsEncodeName(name), '0x'])
          .toBeRevertedWithCustomError('Unauthorised')
          .withArgs(namehash(name), getAddress(accounts[0].address))
      })

      it('Keeps approval information on upgrade', async () => {
        const { nameWrapper, nameWrapperUpgraded, actions, accounts } =
          await loadFixture(fixture)

        const xyzName = `${label}.xyz`

        await actions.setRegistryApprovalForWrapper()
        await actions.wrapName({
          name: 'xyz',
          owner: accounts[0].address,
          resolver: zeroAddress,
        })

        await actions.setSubnodeRecord.onNameWrapper({
          parentName: 'xyz',
          label,
          owner: accounts[0].address,
          resolver: accounts[1].address,
          ttl: 0n,
          expiry: 0n,
          fuses: 0,
        })

        await expectOwnerOf(xyzName).on(nameWrapper).toBe(accounts[0])

        await nameWrapper.write.approve([
          accounts[2].address,
          toNameId(xyzName),
        ])

        await expect(
          nameWrapper.read.getApproved([toNameId(xyzName)]),
        ).resolves.toEqualAddress(accounts[2].address)

        // set the upgradeContract of the NameWrapper contract
        await nameWrapper.write.setUpgradeContract([
          nameWrapperUpgraded.address,
        ])

        await expect(nameWrapper)
          .write('upgrade', [dnsEncodeName(xyzName), '0x'])
          .toEmitEventFrom(nameWrapperUpgraded, 'NameUpgraded')
          .withArgs(
            dnsEncodeName(xyzName),
            accounts[0].address,
            0,
            0n,
            accounts[2].address,
            '0x',
          )
      })

      it('Will allow you to pass through extra data on upgrade', async () => {
        const { nameWrapper, nameWrapperUpgraded, actions, accounts } =
          await loadFixture(fixture)

        const xyzName = `${label}.xyz`

        await actions.setRegistryApprovalForWrapper()
        await actions.wrapName({
          name: 'xyz',
          owner: accounts[0].address,
          resolver: zeroAddress,
        })

        await actions.setSubnodeRecord.onNameWrapper({
          parentName: 'xyz',
          label,
          owner: accounts[0].address,
          resolver: accounts[1].address,
          ttl: 0n,
          expiry: 0n,
          fuses: 0,
        })

        await expectOwnerOf(xyzName).on(nameWrapper).toBe(accounts[0])

        // set the upgradeContract of the NameWrapper contract
        await nameWrapper.write.setUpgradeContract([
          nameWrapperUpgraded.address,
        ])

        await expect(nameWrapper)
          .write('upgrade', [dnsEncodeName(xyzName), '0x01'])
          .toEmitEventFrom(nameWrapperUpgraded, 'NameUpgraded')
          .withArgs(
            dnsEncodeName(xyzName),
            accounts[0].address,
            0,
            0n,
            zeroAddress,
            '0x01',
          )
      })

      it('Does not allow anyone else to upgrade a name even if the owner has authorised the wrapper with the ENS registry.', async () => {
        const { nameWrapper, nameWrapperUpgraded, actions, accounts } =
          await loadFixture(fixture)

        const xyzName = `${label}.xyz`

        await actions.setRegistryApprovalForWrapper()
        await actions.wrapName({
          name: 'xyz',
          owner: accounts[0].address,
          resolver: zeroAddress,
        })

        await actions.setSubnodeOwner.onNameWrapper({
          parentName: 'xyz',
          label,
          owner: accounts[0].address,
          expiry: 0n,
          fuses: 0,
        })

        await expectOwnerOf(xyzName).on(nameWrapper).toBe(accounts[0])

        // set the upgradeContract of the NameWrapper contract
        await nameWrapper.write.setUpgradeContract([
          nameWrapperUpgraded.address,
        ])

        await expect(nameWrapper)
          .write('upgrade', [dnsEncodeName(xyzName), '0x'], {
            account: accounts[1],
          })
          .toBeRevertedWithCustomError('Unauthorised')
          .withArgs(namehash(xyzName), getAddress(accounts[1].address))
      })
    })
  })
