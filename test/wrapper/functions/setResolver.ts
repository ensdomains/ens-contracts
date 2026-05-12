import type { NetworkConnection } from 'hardhat/types/network'
import { getAddress, namehash, zeroAddress } from 'viem'

import {
  CANNOT_SET_RESOLVER,
  CANNOT_UNWRAP,
  expectOwnerOf,
  type LoadNameWrapperFixture,
} from '../fixtures/utils.js'

export const setResolverTests = (
  connection: NetworkConnection,
  loadNameWrapperFixture: LoadNameWrapperFixture,
) => {
  describe('setResolver', () => {
    const label = 'setresolver'
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

      await nameWrapper.write.setResolver([namehash(name), accounts[1].address])
    })

    it('Performs the appropriate function on the ENS registry.', async () => {
      const { ensRegistry, nameWrapper, accounts } = await loadFixture()

      await expect(
        ensRegistry.read.resolver([namehash(name)]),
      ).resolves.toEqualAddress(zeroAddress)

      await nameWrapper.write.setResolver([namehash(name), accounts[1].address])

      await expect(
        ensRegistry.read.resolver([namehash(name)]),
      ).resolves.toEqualAddress(accounts[1].address)
    })

    it('Can be called by an account authorised by the owner.', async () => {
      const { nameWrapper, accounts } = await loadFixture()

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      await nameWrapper.write.setApprovalForAll([accounts[1].address, true])

      await nameWrapper.write.setResolver(
        [namehash(name), accounts[1].address],
        {
          account: accounts[1],
        },
      )
    })

    it('Cannot be called by anyone else.', async () => {
      const { nameWrapper, accounts } = await loadFixture()

      await expect(
        nameWrapper.write.setResolver([namehash(name), accounts[1].address], {
          account: accounts[1],
        }),
      )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs([namehash(name), getAddress(accounts[1].address)])
    })

    it('Cannot be called if CANNOT_SET_RESOLVER is burned', async () => {
      const { nameWrapper, accounts } = await loadFixture()

      await nameWrapper.write.setFuses([namehash(name), CANNOT_SET_RESOLVER])

      await expect(
        nameWrapper.write.setResolver([namehash(name), accounts[1].address]),
      )
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs([namehash(name)])
    })
  })
}
