import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { getAddress, namehash, zeroAddress } from 'viem'
import {
  CANNOT_SET_RESOLVER,
  CANNOT_UNWRAP,
  expectOwnerOf,
  deployNameWrapperWithUtils as fixture,
} from '../fixtures/utils.js'

export const setResolverTests = () => {
  describe('setResolver', () => {
    const label = 'setresolver'
    const name = `${label}.eth`

    async function setResolverFixture() {
      const initial = await loadFixture(fixture)
      const { actions } = initial

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      return initial
    }

    it('Can be called by the owner', async () => {
      const { nameWrapper, accounts } = await loadFixture(setResolverFixture)

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      await nameWrapper.write.setResolver([namehash(name), accounts[1].address])
    })

    it('Performs the appropriate function on the ENS registry.', async () => {
      const { ensRegistry, nameWrapper, accounts } = await loadFixture(
        setResolverFixture,
      )

      await expect(
        ensRegistry.read.resolver([namehash(name)]),
      ).resolves.toEqualAddress(zeroAddress)

      await nameWrapper.write.setResolver([namehash(name), accounts[1].address])

      await expect(
        ensRegistry.read.resolver([namehash(name)]),
      ).resolves.toEqualAddress(accounts[1].address)
    })

    it('Can be called by an account authorised by the owner.', async () => {
      const { nameWrapper, accounts } = await loadFixture(setResolverFixture)

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
      const { nameWrapper, accounts } = await loadFixture(setResolverFixture)

      await expect(nameWrapper)
        .write('setResolver', [namehash(name), accounts[1].address], {
          account: accounts[1],
        })
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[1].address))
    })

    it('Cannot be called if CANNOT_SET_RESOLVER is burned', async () => {
      const { nameWrapper, accounts } = await loadFixture(setResolverFixture)

      await nameWrapper.write.setFuses([namehash(name), CANNOT_SET_RESOLVER])

      await expect(nameWrapper)
        .write('setResolver', [namehash(name), accounts[1].address])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(name))
    })
  })
}
