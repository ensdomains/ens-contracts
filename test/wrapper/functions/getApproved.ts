import { zeroAddress } from 'viem'

import type { NetworkConnection } from 'hardhat/types/network'
import { toNameId } from '../../fixtures/utils.js'
import {
  CAN_DO_EVERYTHING,
  expectOwnerOf,
  zeroAccount,
  type LoadNameWrapperFixture,
} from '../fixtures/utils.js'

export const getApprovedTests = (
  connection: NetworkConnection,
  loadNameWrapperFixture: LoadNameWrapperFixture,
) => {
  describe('getApproved()', () => {
    const label = 'subdomain'
    const name = `${label}.eth`

    async function fixture() {
      const initial = await loadNameWrapperFixture()
      const { actions } = initial

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      return initial
    }
    const loadFixture = async () =>
      connection.networkHelpers.loadFixture(fixture)

    it('Returns returns zero address when ownerOf() is zero', async () => {
      const { nameWrapper } = await loadFixture()

      await expectOwnerOf('unminted.eth').on(nameWrapper).toBe(zeroAccount)
      await expect(
        nameWrapper.read.getApproved([toNameId('unminted.eth')]),
      ).resolves.toEqualAddress(zeroAddress)
    })

    it('Returns the approved address', async () => {
      const { nameWrapper, accounts } = await loadFixture()

      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])

      await expect(
        nameWrapper.read.getApproved([toNameId(name)]),
      ).resolves.toEqualAddress(accounts[1].address)
    })
  })
}
