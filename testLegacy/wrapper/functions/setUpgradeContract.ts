import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { zeroAddress } from 'viem'
import {
  DUMMY_ADDRESS,
  deployNameWrapperWithUtils as fixture,
} from '../fixtures/utils.js'

export const setUpgradeContractTests = () =>
  describe('setUpgradeContract()', () => {
    it('Reverts if called by someone that is not the owner', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setUpgradeContract', [accounts[1].address], {
          account: accounts[1],
        })
        .toBeRevertedWithString('Ownable: caller is not the owner')
    })

    it('Will setApprovalForAll for the upgradeContract addresses in the registrar and registry to true', async () => {
      const { nameWrapper, nameWrapperUpgraded, baseRegistrar, ensRegistry } =
        await loadFixture(fixture)

      await expect(
        baseRegistrar.read.isApprovedForAll([
          nameWrapper.address,
          nameWrapperUpgraded.address,
        ]),
      ).resolves.toBe(false)
      await expect(
        ensRegistry.read.isApprovedForAll([
          nameWrapper.address,
          nameWrapperUpgraded.address,
        ]),
      ).resolves.toBe(false)

      // set the upgradeContract of the NameWrapper contract
      await nameWrapper.write.setUpgradeContract([nameWrapperUpgraded.address])

      await expect(
        baseRegistrar.read.isApprovedForAll([
          nameWrapper.address,
          nameWrapperUpgraded.address,
        ]),
      ).resolves.toBe(true)
      await expect(
        ensRegistry.read.isApprovedForAll([
          nameWrapper.address,
          nameWrapperUpgraded.address,
        ]),
      ).resolves.toBe(true)
    })

    it('Will setApprovalForAll for the old upgradeContract addresses in the registrar and registry to false', async () => {
      const { nameWrapper, nameWrapperUpgraded, baseRegistrar, ensRegistry } =
        await loadFixture(fixture)

      // set the upgradeContract of the NameWrapper contract
      await nameWrapper.write.setUpgradeContract([DUMMY_ADDRESS])

      await expect(
        baseRegistrar.read.isApprovedForAll([
          nameWrapper.address,
          DUMMY_ADDRESS,
        ]),
      ).resolves.toBe(true)
      await expect(
        ensRegistry.read.isApprovedForAll([nameWrapper.address, DUMMY_ADDRESS]),
      ).resolves.toBe(true)

      // set the upgradeContract of the NameWrapper contract
      await nameWrapper.write.setUpgradeContract([nameWrapperUpgraded.address])

      await expect(
        baseRegistrar.read.isApprovedForAll([
          nameWrapper.address,
          nameWrapperUpgraded.address,
        ]),
      ).resolves.toBe(true)
      await expect(
        ensRegistry.read.isApprovedForAll([
          nameWrapper.address,
          nameWrapperUpgraded.address,
        ]),
      ).resolves.toBe(true)

      await expect(
        baseRegistrar.read.isApprovedForAll([
          nameWrapper.address,
          DUMMY_ADDRESS,
        ]),
      ).resolves.toBe(false)
      await expect(
        ensRegistry.read.isApprovedForAll([nameWrapper.address, DUMMY_ADDRESS]),
      ).resolves.toBe(false)
    })

    it('Will not setApprovalForAll for the new upgrade address if it is the address(0)', async () => {
      const { nameWrapper, nameWrapperUpgraded, baseRegistrar, ensRegistry } =
        await loadFixture(fixture)

      // set the upgradeContract of the NameWrapper contract
      await nameWrapper.write.setUpgradeContract([nameWrapperUpgraded.address])

      await expect(
        baseRegistrar.read.isApprovedForAll([
          nameWrapper.address,
          nameWrapperUpgraded.address,
        ]),
      ).resolves.toBe(true)
      await expect(
        ensRegistry.read.isApprovedForAll([
          nameWrapper.address,
          nameWrapperUpgraded.address,
        ]),
      ).resolves.toBe(true)

      // set the upgradeContract of the NameWrapper contract
      await nameWrapper.write.setUpgradeContract([zeroAddress])

      await expect(
        baseRegistrar.read.isApprovedForAll([nameWrapper.address, zeroAddress]),
      ).resolves.toBe(false)
      await expect(
        ensRegistry.read.isApprovedForAll([nameWrapper.address, zeroAddress]),
      ).resolves.toBe(false)
    })
  })
