import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { getAddress, labelhash, namehash, zeroAddress } from 'viem'
import { DAY } from '../../fixtures/constants.js'
import { toLabelId, toNameId } from '../../fixtures/utils.js'
import {
  CANNOT_UNWRAP,
  CAN_DO_EVERYTHING,
  GRACE_PERIOD,
  IS_DOT_ETH,
  PARENT_CANNOT_CONTROL,
  expectOwnerOf,
  deployNameWrapperWithUtils as fixture,
} from '../fixtures/utils.js'

export const unwrapETH2LDTests = () =>
  describe('unwrapETH2LD()', () => {
    const label = 'unwrapped'
    const name = `${label}.eth`

    it('Allows the owner to unwrap a name.', async () => {
      const { baseRegistrar, ensRegistry, nameWrapper, accounts, actions } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      await actions.unwrapEth2ld({
        label,
        controller: accounts[0].address,
        registrant: accounts[0].address,
      })

      // transfers the controller on the registry to the target address.
      await expectOwnerOf(name).on(ensRegistry).toBe(accounts[0])
      //Transfers the registrant on the .eth registrar to the target address
      await expectOwnerOf(label).on(baseRegistrar).toBe(accounts[0])
    })

    it('Does not allows the previous owner to unwrap when the name has expired.', async () => {
      const { nameWrapper, accounts, testClient, actions } = await loadFixture(
        fixture,
      )

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      await testClient.increaseTime({
        seconds: Number(DAY + 1n),
      })
      await testClient.mine({ blocks: 1 })

      await expect(nameWrapper)
        .write('unwrapETH2LD', [
          labelhash(label),
          accounts[0].address,
          accounts[0].address,
        ])
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[0].address))
    })

    it('emits Unwrap event', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      await expect(nameWrapper)
        .write('unwrapETH2LD', [
          labelhash(label),
          accounts[0].address,
          accounts[0].address,
        ])
        .toEmitEvent('NameUnwrapped')
        .withArgs(namehash(name), accounts[0].address)
    })

    it('Emits TransferSingle event', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      await expect(nameWrapper)
        .write('unwrapETH2LD', [
          labelhash(label),
          accounts[0].address,
          accounts[0].address,
        ])
        .toEmitEvent('TransferSingle')
        .withArgs(
          accounts[0].address,
          accounts[0].address,
          zeroAddress,
          toNameId(name),
          1n,
        )
    })

    it('Does not allows an account authorised by the owner on the .eth registrar to unwrap a name', async () => {
      const { baseRegistrar, nameWrapper, accounts, actions } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      await actions.setBaseRegistrarApprovalForWrapper()
      await baseRegistrar.write.setApprovalForAll([accounts[1].address, true])

      await expect(nameWrapper)
        .write(
          'unwrapETH2LD',
          [labelhash(label), accounts[1].address, accounts[1].address],
          {
            account: accounts[1],
          },
        )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[1].address))
    })

    it('Does not allow anyone else to unwrap a name even if the owner has authorised the wrapper with the ENS registry.', async () => {
      const { ensRegistry, nameWrapper, accounts, actions } = await loadFixture(
        fixture,
      )

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })
      await actions.setBaseRegistrarApprovalForWrapper()

      await ensRegistry.write.setApprovalForAll([accounts[1].address, true])

      await expect(nameWrapper)
        .write(
          'unwrapETH2LD',
          [labelhash(label), accounts[1].address, accounts[1].address],
          {
            account: accounts[1],
          },
        )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[1].address))
    })

    it('Does not allow a name to be unwrapped if CANNOT_UNWRAP fuse has been burned', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await expect(nameWrapper)
        .write('unwrapETH2LD', [
          labelhash(label),
          accounts[0].address,
          accounts[0].address,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(name))
    })

    it('Unwrapping a previously wrapped unexpired name retains PCC and expiry', async () => {
      const { baseRegistrar, nameWrapper, accounts, actions } =
        await loadFixture(fixture)

      // register and wrap a name with PCC
      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })
      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])

      // unwrap it
      await actions.unwrapEth2ld({
        label,
        controller: accounts[0].address,
        registrant: accounts[0].address,
      })

      // check that the PCC is still there
      const [, fuses, expiry] = await nameWrapper.read.getData([toNameId(name)])
      expect(fuses).toEqual(PARENT_CANNOT_CONTROL | IS_DOT_ETH)
      expect(expiry).toEqual(parentExpiry + GRACE_PERIOD)
    })
  })
