import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { encodeFunctionData, getAddress, namehash, type Hex } from 'viem'
import { DAY } from '../../fixtures/constants.js'
import { toLabelId, toNameId } from '../../fixtures/utils.js'
import {
  CANNOT_BURN_FUSES,
  CANNOT_CREATE_SUBDOMAIN,
  CANNOT_SET_RESOLVER,
  CANNOT_SET_TTL,
  CANNOT_TRANSFER,
  CANNOT_UNWRAP,
  CAN_DO_EVERYTHING,
  GRACE_PERIOD,
  IS_DOT_ETH,
  MAX_EXPIRY,
  PARENT_CANNOT_CONTROL,
  expectOwnerOf,
  deployNameWrapperWithUtils as fixture,
} from '../fixtures/utils.js'

export const setFusesTests = () => {
  describe('setFuses()', () => {
    const label = 'fuses'
    const name = `${label}.eth`

    it('cannot burn PARENT_CANNOT_CONTROL', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: 'sub',
        owner: accounts[0].address,
        expiry: MAX_EXPIRY,
        fuses: CAN_DO_EVERYTHING,
      })

      await expect(nameWrapper)
        .write('setFuses', [namehash(`sub.${name}`), PARENT_CANNOT_CONTROL])
        .toBeRevertedWithoutReason()
    })

    it('cannot burn any parent controlled fuse', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: 'sub',
        owner: accounts[0].address,
        expiry: MAX_EXPIRY,
        fuses: CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
      })

      // check the 7 fuses above PCC
      for (let i = 0; i < 7; i++) {
        await expect(nameWrapper)
          .write('setFuses', [namehash(`sub.${name}`), IS_DOT_ETH * 2 ** i])
          .toBeRevertedWithoutReason()
      }
    })

    // TODO: why is this tested?
    it('Errors when manually changing calldata to incorrect type', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      const [walletClient] = await hre.viem.getWalletClients()

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: 'sub',
        owner: accounts[0].address,
        expiry: MAX_EXPIRY,
        fuses: CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
      })

      let data = encodeFunctionData({
        abi: nameWrapper.abi,
        functionName: 'setFuses',
        args: [namehash(`sub.${name}`), 4],
      })
      const rogueFuse = '40000' // 2 ** 18 in hex
      data = data.substring(0, data.length - rogueFuse.length) as Hex
      data += rogueFuse

      const tx = walletClient.sendTransaction({
        to: nameWrapper.address,
        data: data as Hex,
      })

      await expect(nameWrapper).transaction(tx).toBeRevertedWithoutReason()
    })

    it('cannot burn fuses as the previous owner of a .eth when the name has expired', async () => {
      const { nameWrapper, actions, accounts, testClient } = await loadFixture(
        fixture,
      )

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await testClient.increaseTime({
        seconds: Number(GRACE_PERIOD + 1n * DAY + 1n),
      })
      await testClient.mine({ blocks: 1 })

      await expect(nameWrapper)
        .write('setFuses', [namehash(name), CANNOT_UNWRAP])
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[0].address))
    })

    it('Will not allow burning fuses if PARENT_CANNOT_CONTROL has not been burned', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: 'sub',
        owner: accounts[0].address,
        expiry: MAX_EXPIRY,
        fuses: CAN_DO_EVERYTHING,
      })

      await expect(nameWrapper)
        .write('setFuses', [
          namehash(`sub.${name}`),
          CANNOT_UNWRAP | CANNOT_TRANSFER,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(`sub.${name}`))
    })

    it('Will not allow burning fuses of subdomains if CANNOT_UNWRAP has not been burned', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: 'sub',
        owner: accounts[0].address,
        expiry: MAX_EXPIRY,
        fuses: PARENT_CANNOT_CONTROL,
      })

      await expect(nameWrapper)
        .write('setFuses', [namehash(`sub.${name}`), CANNOT_TRANSFER])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(`sub.${name}`))
    })

    it('Will not allow burning fuses of .eth names unless CANNOT_UNWRAP is also burned.', async () => {
      const { nameWrapper, actions } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      await expect(nameWrapper)
        .write('setFuses', [namehash(name), CANNOT_TRANSFER])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(name))
    })

    it('Can be called by the owner', async () => {
      const { nameWrapper, actions } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const [, initialFuses] = await nameWrapper.read.getData([toNameId(name)])
      expect(initialFuses).toEqual(
        CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | IS_DOT_ETH,
      )

      await nameWrapper.write.setFuses([namehash(name), CANNOT_TRANSFER])

      const [, newFuses] = await nameWrapper.read.getData([toNameId(name)])
      expect(newFuses).toEqual(
        CANNOT_UNWRAP | CANNOT_TRANSFER | PARENT_CANNOT_CONTROL | IS_DOT_ETH,
      )
    })

    it('Emits FusesSet event', async () => {
      const { nameWrapper, baseRegistrar, actions } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const expectedExpiry = await baseRegistrar.read
        .nameExpires([toLabelId(label)])
        .then((e) => e + GRACE_PERIOD)

      await expect(nameWrapper)
        .write('setFuses', [namehash(name), CANNOT_TRANSFER])
        .toEmitEvent('FusesSet')
        .withArgs(
          namehash(name),
          CANNOT_UNWRAP | CANNOT_TRANSFER | PARENT_CANNOT_CONTROL | IS_DOT_ETH,
        )

      const [, fuses, expiry] = await nameWrapper.read.getData([toNameId(name)])
      expect(fuses).toEqual(
        CANNOT_UNWRAP | CANNOT_TRANSFER | PARENT_CANNOT_CONTROL | IS_DOT_ETH,
      )
      expect(expiry).toEqual(expectedExpiry)
    })

    it('Returns the correct fuses', async () => {
      const { nameWrapper, actions } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      // The `simulate` function is called to get the return value of the function.
      // Note: simulate does not modify the state of the contract.
      const { result: fusesReturned } = await nameWrapper.simulate.setFuses([
        namehash(name),
        CANNOT_TRANSFER,
      ])
      expect(fusesReturned).toEqual(
        CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | IS_DOT_ETH,
      )
    })

    it('Can be called by an account authorised by the owner', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      await nameWrapper.write.setApprovalForAll([accounts[1].address, true])

      await nameWrapper.write.setFuses([namehash(name), CANNOT_UNWRAP], {
        account: accounts[1],
      })

      const [, fuses] = await nameWrapper.read.getData([toNameId(name)])
      expect(fuses).toEqual(CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | IS_DOT_ETH)
    })

    it('Cannot be called by an unauthorised account', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      await expect(nameWrapper)
        .write('setFuses', [namehash(name), CANNOT_UNWRAP], {
          account: accounts[1],
        })
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[1].address))
    })

    it('Allows burning unknown fuses', async () => {
      const { nameWrapper, actions } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      // Each fuse is represented by the next bit, 64 is the next undefined fuse
      await nameWrapper.write.setFuses([namehash(name), 64])

      const [, fuses] = await nameWrapper.read.getData([toNameId(name)])
      expect(fuses).toEqual(
        CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | IS_DOT_ETH | 64,
      )
    })

    it('Logically ORs passed in fuses with already-burned fuses.', async () => {
      const { nameWrapper, actions } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP | CANNOT_TRANSFER,
      })

      await nameWrapper.write.setFuses([namehash(name), 64 | CANNOT_TRANSFER])

      const [, fuses] = await nameWrapper.read.getData([toNameId(name)])
      expect(fuses).toEqual(
        CANNOT_UNWRAP |
          PARENT_CANNOT_CONTROL |
          IS_DOT_ETH |
          64 |
          CANNOT_TRANSFER,
      )
    })

    it('can set fuses and then burn ability to burn fuses', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await nameWrapper.write.setFuses([namehash(name), CANNOT_BURN_FUSES])

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      // check flag in the wrapper
      await expect(
        nameWrapper.read.allFusesBurned([namehash(name), CANNOT_BURN_FUSES]),
      ).resolves.toEqual(true)

      // try to set the resolver and ttl
      await expect(nameWrapper)
        .write('setFuses', [namehash(name), CANNOT_TRANSFER])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(name))
    })

    it('can set fuses and burn transfer', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await nameWrapper.write.setFuses([namehash(name), CANNOT_TRANSFER])

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      // check flag in the wrapper
      await expect(
        nameWrapper.read.allFusesBurned([namehash(name), CANNOT_TRANSFER]),
      ).resolves.toEqual(true)

      // Transfer should revert
      await expect(nameWrapper)
        .write('safeTransferFrom', [
          accounts[0].address,
          accounts[1].address,
          toNameId(name),
          1n,
          '0x',
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(name))
    })

    it('can set fuses and burn canSetResolver and canSetTTL', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await nameWrapper.write.setFuses([
        namehash(name),
        CANNOT_SET_RESOLVER | CANNOT_SET_TTL,
      ])

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      // check flag in the wrapper
      await expect(
        nameWrapper.read.allFusesBurned([
          namehash(name),
          CANNOT_SET_RESOLVER | CANNOT_SET_TTL,
        ]),
      ).resolves.toEqual(true)

      // try to set the resolver and ttl
      await expect(nameWrapper)
        .write('setResolver', [namehash(name), accounts[1].address])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(name))

      await expect(nameWrapper)
        .write('setTTL', [namehash(name), 1000n])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(name))
    })

    it('can set fuses and burn canCreateSubdomains', async () => {
      const { ensRegistry, nameWrapper, actions, accounts } = await loadFixture(
        fixture,
      )

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await expect(
        nameWrapper.read.allFusesBurned([
          namehash(name),
          CANNOT_CREATE_SUBDOMAIN,
        ]),
      ).resolves.toEqual(false)

      // can create before burn
      // revert not approved and isn't sender because subdomain isnt owned by contract?
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: 'creatable',
        owner: accounts[0].address,
        fuses: CAN_DO_EVERYTHING,
        expiry: 0n,
      })

      await expectOwnerOf(`creatable.${name}`).on(ensRegistry).toBe(nameWrapper)
      await expectOwnerOf(`creatable.${name}`).on(nameWrapper).toBe(accounts[0])

      await nameWrapper.write.setFuses([
        namehash(name),
        CAN_DO_EVERYTHING | CANNOT_CREATE_SUBDOMAIN,
      ])

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      await expect(
        nameWrapper.read.allFusesBurned([
          namehash(name),
          CANNOT_CREATE_SUBDOMAIN,
        ]),
      ).resolves.toEqual(true)

      // try to create a subdomain
      await expect(nameWrapper)
        .write('setSubnodeOwner', [
          namehash(name),
          'uncreatable',
          accounts[0].address,
          0,
          86400n,
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(`uncreatable.${name}`))
    })
  })
}
