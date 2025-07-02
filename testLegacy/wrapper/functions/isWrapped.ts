import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { labelhash, namehash, zeroHash } from 'viem'
import { DAY } from '../../fixtures/constants.js'
import { toLabelId, toNameId } from '../../fixtures/utils.js'
import {
  CANNOT_UNWRAP,
  GRACE_PERIOD,
  PARENT_CANNOT_CONTROL,
  expectOwnerOf,
  deployNameWrapperWithUtils as fixture,
  zeroAccount,
} from '../fixtures/utils.js'

export const isWrappedTests = () => {
  describe('isWrapped(bytes32 node)', () => {
    const label = 'something'
    const name = `${label}.eth`

    async function isWrappedFixture() {
      const initial = await loadFixture(fixture)
      const { nameWrapper, actions } = initial

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const [, , parentExpiry] = await nameWrapper.read.getData([
        toNameId(name),
      ])

      return { ...initial, parentExpiry }
    }

    it('identifies a wrapped .eth name', async () => {
      const { nameWrapper } = await loadFixture(isWrappedFixture)

      await expect(
        nameWrapper.read.isWrapped([namehash(name)]) as Promise<boolean>,
      ).resolves.toBe(true)
    })

    it('identifies an expired .eth name as unwrapped', async () => {
      const { nameWrapper, testClient } = await loadFixture(isWrappedFixture)

      await testClient.increaseTime({ seconds: Number(1n * DAY + 1n) })
      await testClient.mine({ blocks: 1 })

      await expect(
        nameWrapper.read.isWrapped([namehash(name)]) as Promise<boolean>,
      ).resolves.toBe(false)
    })

    it('identifies an eth name registered on old controller as unwrapped', async () => {
      const { baseRegistrar, nameWrapper, accounts } = await loadFixture(
        fixture,
      )

      await baseRegistrar.write.register([
        toLabelId(label),
        accounts[0].address,
        1n * DAY,
      ])

      await expectOwnerOf(label).on(baseRegistrar).toBe(accounts[0])
      await expect(
        nameWrapper.read.isWrapped([namehash(name)]) as Promise<boolean>,
      ).resolves.toBe(false)
    })

    it('identifies an unregistered .eth name as unwrapped', async () => {
      const { nameWrapper } = await loadFixture(isWrappedFixture)

      await expect(
        nameWrapper.read.isWrapped([
          namehash('abcdefghijklmnop.eth'),
        ]) as Promise<boolean>,
      ).resolves.toBe(false)
    })

    it('identifies an unregistered tld as unwrapped', async () => {
      const { nameWrapper } = await loadFixture(isWrappedFixture)

      await expect(
        nameWrapper.read.isWrapped([namehash('abc')]) as Promise<boolean>,
      ).resolves.toBe(false)
    })

    it('identifies a wrapped subname', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(
        isWrappedFixture,
      )

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: 'sub',
        owner: accounts[0].address,
        fuses: 0,
        expiry: 0n,
      })

      await expect(
        nameWrapper.read.isWrapped([
          namehash(`sub.${name}`),
        ]) as Promise<boolean>,
      ).resolves.toBe(true)
    })

    it('identifies an expired wrapped subname with PCC burnt as unwrapped', async () => {
      const { nameWrapper, actions, accounts, testClient, parentExpiry } =
        await loadFixture(isWrappedFixture)

      const subname = `sub.${name}`

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: 'sub',
        owner: accounts[0].address,
        fuses: PARENT_CANNOT_CONTROL,
        expiry: parentExpiry + 100n,
      })

      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[0])

      await testClient.increaseTime({
        seconds: Number(DAY + GRACE_PERIOD + 101n),
      })
      await testClient.mine({ blocks: 1 })

      await expectOwnerOf(subname).on(nameWrapper).toBe(zeroAccount)
      await expect(
        nameWrapper.read.isWrapped([namehash(subname)]) as Promise<boolean>,
      ).resolves.toBe(false)
    })
  })

  describe('isWrapped(bytes32 parentNode, bytes32 labelhash)', () => {
    const label = 'something'
    const name = `${label}.eth`
    const sublabel = 'sub'
    const subname = `${sublabel}.${name}`

    async function isWrappedFixture() {
      const initial = await loadFixture(fixture)
      const { nameWrapper, actions } = initial

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const [, , parentExpiry] = await nameWrapper.read.getData([
        toNameId(name),
      ])

      return { ...initial, parentExpiry }
    }

    it('identifies a wrapped .eth name', async () => {
      const { nameWrapper } = await loadFixture(isWrappedFixture)

      await expect(
        nameWrapper.read.isWrapped([
          namehash('eth'),
          labelhash(label),
        ]) as Promise<boolean>,
      ).resolves.toBe(true)
    })

    it('identifies an expired .eth name as unwrapped', async () => {
      const { nameWrapper, testClient } = await loadFixture(isWrappedFixture)

      await testClient.increaseTime({ seconds: Number(1n * DAY + 1n) })
      await testClient.mine({ blocks: 1 })

      await expect(
        nameWrapper.read.isWrapped([
          namehash('eth'),
          labelhash(label),
        ]) as Promise<boolean>,
      ).resolves.toBe(false)
    })

    it('identifies an eth name registered on old controller as unwrapped', async () => {
      const { baseRegistrar, nameWrapper, accounts } = await loadFixture(
        fixture,
      )

      await baseRegistrar.write.register([
        toLabelId(label),
        accounts[0].address,
        1n * DAY,
      ])

      await expectOwnerOf(label).on(baseRegistrar).toBe(accounts[0])
      await expect(
        nameWrapper.read.isWrapped([
          namehash('eth'),
          labelhash(label),
        ]) as Promise<boolean>,
      ).resolves.toBe(false)
    })

    it('identifies an unregistered .eth name as unwrapped', async () => {
      const { nameWrapper } = await loadFixture(isWrappedFixture)

      await expect(
        nameWrapper.read.isWrapped([
          namehash('eth'),
          labelhash('abcdefghijklmnop'),
        ]) as Promise<boolean>,
      ).resolves.toBe(false)
    })

    it('identifies an unregistered tld as unwrapped', async () => {
      const { nameWrapper } = await loadFixture(isWrappedFixture)

      await expect(
        nameWrapper.read.isWrapped([
          zeroHash,
          labelhash('abc'),
        ]) as Promise<boolean>,
      ).resolves.toBe(false)
    })

    it('identifies a wrapped subname', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(
        isWrappedFixture,
      )

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: 0,
        expiry: 0n,
      })

      await expect(
        nameWrapper.read.isWrapped([
          namehash(name),
          labelhash(sublabel),
        ]) as Promise<boolean>,
      ).resolves.toBe(true)
    })

    it('identifies an expired wrapped subname with PCC burnt as unwrapped', async () => {
      const { nameWrapper, actions, accounts, testClient, parentExpiry } =
        await loadFixture(isWrappedFixture)

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: PARENT_CANNOT_CONTROL,
        expiry: parentExpiry + 100n,
      })

      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[0])

      await testClient.increaseTime({
        seconds: Number(DAY + GRACE_PERIOD + 101n),
      })
      await testClient.mine({ blocks: 1 })

      await expectOwnerOf(subname).on(nameWrapper).toBe(zeroAccount)
      await expect(
        nameWrapper.read.isWrapped([
          namehash(name),
          labelhash(sublabel),
        ]) as Promise<boolean>,
      ).resolves.toBe(false)
    })
  })
}
