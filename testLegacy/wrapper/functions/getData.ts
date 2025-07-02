import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { DAY } from '../../fixtures/constants.js'
import { toLabelId, toNameId } from '../../fixtures/utils.js'
import {
  CANNOT_SET_RESOLVER,
  CANNOT_UNWRAP,
  GRACE_PERIOD,
  IS_DOT_ETH,
  MAX_EXPIRY,
  PARENT_CANNOT_CONTROL,
  deployNameWrapperWithUtils as fixture,
} from '../fixtures/utils.js'

export const getDataTests = () => {
  describe('getData()', () => {
    const label = 'getfuses'
    const name = `${label}.eth`
    const sublabel = 'sub'
    const subname = `${sublabel}.${name}`

    it('returns the correct fuses and expiry', async () => {
      const { baseRegistrar, nameWrapper, accounts, actions } =
        await loadFixture(fixture)

      const initialFuses = CANNOT_UNWRAP | CANNOT_SET_RESOLVER

      await actions.registerSetupAndWrapName({
        label,
        fuses: initialFuses,
      })

      const expectedExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])

      const [, fuses, expiry] = await nameWrapper.read.getData([toNameId(name)])

      expect(fuses).toEqual(initialFuses | PARENT_CANNOT_CONTROL | IS_DOT_ETH)
      expect(expiry).toEqual(expectedExpiry + GRACE_PERIOD)
    })

    it('clears fuses when domain is expired', async () => {
      const { baseRegistrar, nameWrapper, accounts, actions, testClient } =
        await loadFixture(fixture)

      const initialFuses = PARENT_CANNOT_CONTROL | CANNOT_UNWRAP

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await actions.setRegistryApprovalForWrapper()

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        fuses: initialFuses,
        expiry: MAX_EXPIRY,
      })

      await testClient.increaseTime({
        seconds: Number(DAY + 1n + GRACE_PERIOD),
      })
      await testClient.mine({ blocks: 1 })

      const [, fuses, expiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])
      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])

      expect(fuses).toEqual(0)
      expect(expiry).toEqual(parentExpiry + GRACE_PERIOD)
    })
  })
}
