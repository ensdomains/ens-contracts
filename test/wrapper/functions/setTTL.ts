import type { NetworkConnection } from 'hardhat/types/network'
import { getAddress, namehash } from 'viem'

import {
  CANNOT_SET_TTL,
  CANNOT_UNWRAP,
  expectOwnerOf,
  type LoadNameWrapperFixture,
} from '../fixtures/utils.js'

export const setTTLTests = (
  connection: NetworkConnection,
  loadNameWrapperFixture: LoadNameWrapperFixture,
) =>
  describe('setTTL', () => {
    const label = 'setttl'
    const name = `${label}.eth`

    async function fixture() {
      const initial = await loadNameWrapperFixture()
      const { actions } = initial

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      return initial
    }
    const loadFixture = async () =>
      connection.networkHelpers.loadFixture(fixture)

    it('Can be called by the owner', async () => {
      const { nameWrapper, accounts } = await loadFixture()

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      await nameWrapper.write.setTTL([namehash(name), 100n])
    })

    it('Performs the appropriate function on the ENS registry.', async () => {
      const { ensRegistry, nameWrapper } = await loadFixture()

      await expect(ensRegistry.read.ttl([namehash(name)])).resolves.toEqual(0n)

      await nameWrapper.write.setTTL([namehash(name), 100n])

      await expect(ensRegistry.read.ttl([namehash(name)])).resolves.toEqual(
        100n,
      )
    })

    it('Can be called by an account authorised by the owner.', async () => {
      const { nameWrapper, accounts } = await loadFixture()

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      await nameWrapper.write.setApprovalForAll([accounts[1].address, true])

      await nameWrapper.write.setTTL([namehash(name), 100n], {
        account: accounts[1],
      })
    })

    it('Cannot be called by anyone else.', async () => {
      const { nameWrapper, accounts } = await loadFixture()

      await expect(
        nameWrapper.write.setTTL([namehash(name), 3600n], {
          account: accounts[1],
        }),
      )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs([namehash(name), getAddress(accounts[1].address)])
    })

    it('Cannot be called if CANNOT_SET_TTL is burned', async () => {
      const { nameWrapper } = await loadFixture()

      await nameWrapper.write.setFuses([namehash(name), CANNOT_SET_TTL])

      await expect(nameWrapper.write.setTTL([namehash(name), 100n]))
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs([namehash(name)])
    })
  })
