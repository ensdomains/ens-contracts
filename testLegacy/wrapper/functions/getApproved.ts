import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { zeroAddress } from 'viem'
import { toNameId } from '../../fixtures/utils.js'
import {
  CAN_DO_EVERYTHING,
  expectOwnerOf,
  deployNameWrapperWithUtils as fixture,
  zeroAccount,
} from '../fixtures/utils.js'

export const getApprovedTests = () => {
  describe('getApproved()', () => {
    const label = 'subdomain'
    const name = `${label}.eth`

    async function getApprovedFixture() {
      const initial = await loadFixture(fixture)
      const { actions } = initial

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      return initial
    }

    it('Returns returns zero address when ownerOf() is zero', async () => {
      const { nameWrapper } = await loadFixture(getApprovedFixture)

      await expectOwnerOf('unminted.eth').on(nameWrapper).toBe(zeroAccount)
      await expect(
        nameWrapper.read.getApproved([toNameId('unminted.eth')]),
      ).resolves.toEqualAddress(zeroAddress)
    })

    it('Returns the approved address', async () => {
      const { nameWrapper, accounts } = await loadFixture(getApprovedFixture)

      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])

      await expect(
        nameWrapper.read.getApproved([toNameId(name)]),
      ).resolves.toEqualAddress(accounts[1].address)
    })
  })
}
