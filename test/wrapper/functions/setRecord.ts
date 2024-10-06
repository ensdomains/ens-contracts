import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { getAddress, namehash, zeroAddress } from 'viem'
import {
  CANNOT_SET_RESOLVER,
  CANNOT_SET_TTL,
  CANNOT_TRANSFER,
  CANNOT_UNWRAP,
  CAN_DO_EVERYTHING,
  MAX_EXPIRY,
  PARENT_CANNOT_CONTROL,
  expectOwnerOf,
  deployNameWrapperWithUtils as fixture,
  zeroAccount,
} from '../fixtures/utils.js'

export const setRecordTests = () => {
  describe('setRecord', () => {
    const label = 'setrecord'
    const name = `${label}.eth`

    async function setRecordFixture() {
      const initial = await loadFixture(fixture)
      const { actions } = initial

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      return initial
    }

    it('Can be called by the owner', async () => {
      const { nameWrapper, accounts } = await loadFixture(setRecordFixture)

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      await nameWrapper.write.setRecord([
        namehash(name),
        accounts[1].address,
        accounts[0].address,
        50n,
      ])
    })

    it('Performs the appropriate function on the ENS registry and Wrapper', async () => {
      const { ensRegistry, nameWrapper, accounts } = await loadFixture(
        setRecordFixture,
      )

      await nameWrapper.write.setRecord([
        namehash(name),
        accounts[1].address,
        accounts[0].address,
        50n,
      ])

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[1])
      await expect(
        ensRegistry.read.resolver([namehash(name)]),
      ).resolves.toEqualAddress(accounts[0].address)
      await expect(ensRegistry.read.ttl([namehash(name)])).resolves.toEqual(50n)
    })

    it('Can be called by an account authorised by the owner.', async () => {
      const { nameWrapper, accounts } = await loadFixture(setRecordFixture)

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      await nameWrapper.write.setApprovalForAll([accounts[1].address, true])

      await nameWrapper.write.setRecord(
        [namehash(name), accounts[1].address, accounts[0].address, 50n],
        { account: accounts[1] },
      )
    })

    it('Cannot be called by anyone else.', async () => {
      const { nameWrapper, accounts } = await loadFixture(setRecordFixture)

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      await expect(nameWrapper)
        .write(
          'setRecord',
          [namehash(name), accounts[1].address, accounts[0].address, 50n],
          { account: accounts[1] },
        )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[1].address))
    })

    it('Cannot be called if CANNOT_TRANSFER is burned.', async () => {
      const { nameWrapper, accounts } = await loadFixture(setRecordFixture)

      await nameWrapper.write.setFuses([namehash(name), CANNOT_TRANSFER])

      await expect(nameWrapper)
        .write('setRecord', [
          namehash(name),
          accounts[1].address,
          accounts[0].address,
          50n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(name))
    })

    it('Cannot be called if CANNOT_SET_RESOLVER is burned.', async () => {
      const { nameWrapper, accounts } = await loadFixture(setRecordFixture)

      await nameWrapper.write.setFuses([namehash(name), CANNOT_SET_RESOLVER])

      await expect(nameWrapper)
        .write('setRecord', [
          namehash(name),
          accounts[1].address,
          accounts[0].address,
          50n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(name))
    })

    it('Cannot be called if CANNOT_SET_TTL is burned.', async () => {
      const { nameWrapper, accounts } = await loadFixture(setRecordFixture)

      await nameWrapper.write.setFuses([namehash(name), CANNOT_SET_TTL])

      await expect(nameWrapper)
        .write('setRecord', [
          namehash(name),
          accounts[1].address,
          accounts[0].address,
          50n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(name))
    })

    it('Setting the owner to 0 reverts if CANNOT_UNWRAP is burned', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      const subname = `sub.${name}`

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: 'sub',
        owner: accounts[0].address,
        fuses: CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
        expiry: MAX_EXPIRY,
      })

      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[0])

      await expect(nameWrapper)
        .write('setRecord', [
          namehash(subname),
          zeroAddress,
          accounts[0].address,
          50n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Setting the owner of a subdomain to 0 unwraps the name and passes through resolver/ttl', async () => {
      const { ensRegistry, nameWrapper, actions, accounts } = await loadFixture(
        fixture,
      )

      const subname = `sub.${name}`

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: 'sub',
        owner: accounts[0].address,
        fuses: CAN_DO_EVERYTHING,
        expiry: 0n,
      })

      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[0])

      await expect(nameWrapper)
        .write('setRecord', [
          namehash(subname),
          zeroAddress,
          accounts[0].address,
          50n,
        ])
        .toEmitEvent('NameUnwrapped')
        .withArgs(namehash(subname), zeroAddress)

      await expectOwnerOf(subname).on(nameWrapper).toBe(zeroAccount)
      await expectOwnerOf(subname).on(ensRegistry).toBe(zeroAccount)
      await expect(
        ensRegistry.read.resolver([namehash(subname)]),
      ).resolves.toEqualAddress(accounts[0].address)
      await expect(ensRegistry.read.ttl([namehash(subname)])).resolves.toEqual(
        50n,
      )
    })

    it('Setting the owner to 0 on a .eth reverts', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      await expect(nameWrapper)
        .write('setRecord', [
          namehash(name),
          zeroAddress,
          accounts[0].address,
          50n,
        ])
        .toBeRevertedWithCustomError('IncorrectTargetOwner')
        .withArgs(zeroAddress)
    })
  })
}
