import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { DAY } from '../../fixtures/constants.js'
import {
  CAN_DO_EVERYTHING,
  GRACE_PERIOD,
  expectOwnerOf,
  deployNameWrapperWithUtils as fixture,
  zeroAccount,
} from '../fixtures/utils.js'

export const ownerOfTests = () => {
  describe('ownerOf()', () => {
    const label = 'subdomain'
    const name = `${label}.eth`

    it('Returns the owner', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])
    })

    it('Returns 0 when owner is expired', async () => {
      const { nameWrapper, actions, testClient } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      await testClient.increaseTime({
        seconds: Number(1n * DAY + GRACE_PERIOD + 1n),
      })
      await testClient.mine({ blocks: 1 })

      await expectOwnerOf(name).on(nameWrapper).toBe(zeroAccount)
    })
  })
}
