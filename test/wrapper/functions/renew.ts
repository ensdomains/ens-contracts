import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { zeroAddress } from 'viem'
import { DAY } from '../../fixtures/constants.js'
import { toLabelId, toNameId } from '../../fixtures/utils.js'
import {
  CANNOT_SET_RESOLVER,
  CANNOT_UNWRAP,
  CAN_DO_EVERYTHING,
  GRACE_PERIOD,
  IS_DOT_ETH,
  PARENT_CANNOT_CONTROL,
  deployNameWrapperWithUtils as fixture,
} from '../fixtures/utils.js'

export const renewTests = () => {
  describe('renew', () => {
    const label = 'register'
    const name = `${label}.eth`

    async function renewFixture() {
      const initial = await loadFixture(fixture)
      const { baseRegistrar, nameWrapper, accounts } = initial

      await baseRegistrar.write.addController([nameWrapper.address])
      await nameWrapper.write.setController([accounts[0].address, true])

      return initial
    }

    it('Renews names', async () => {
      const { baseRegistrar, nameWrapper, accounts } = await loadFixture(
        renewFixture,
      )

      await nameWrapper.write.registerAndWrapETH2LD([
        label,
        accounts[0].address,
        86400n,
        zeroAddress,
        CAN_DO_EVERYTHING,
      ])

      const expires = await baseRegistrar.read.nameExpires([toLabelId(label)])

      await nameWrapper.write.renew([toLabelId(label), 86400n])

      const newExpires = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])

      expect(newExpires).toEqual(expires + 86400n)
    })

    it('Renews names and can extend wrapper expiry', async () => {
      const { baseRegistrar, nameWrapper, accounts } = await loadFixture(
        renewFixture,
      )

      await nameWrapper.write.registerAndWrapETH2LD([
        label,
        accounts[0].address,
        86400n,
        zeroAddress,
        CAN_DO_EVERYTHING,
      ])

      const expires = await baseRegistrar.read.nameExpires([toLabelId(label)])
      const expectedExpiry = expires + 86400n

      await nameWrapper.write.renew([toLabelId(label), 86400n])

      const [owner, , expiry] = await nameWrapper.read.getData([toNameId(name)])

      expect(expiry).toEqual(expectedExpiry + GRACE_PERIOD)
      expect(owner).toEqualAddress(accounts[0].address)
    })

    it('Renewing name less than required to unexpire it still has original owner/fuses', async () => {
      const { nameWrapper, accounts, testClient, publicClient } =
        await loadFixture(renewFixture)

      await nameWrapper.write.registerAndWrapETH2LD([
        label,
        accounts[0].address,
        DAY,
        zeroAddress,
        CANNOT_UNWRAP | CANNOT_SET_RESOLVER,
      ])

      await testClient.increaseTime({ seconds: Number(DAY * 2n) })
      await testClient.mine({ blocks: 1 })

      const [, , expiryBefore] = await nameWrapper.read.getData([
        toNameId(name),
      ])
      const timestamp = await publicClient.getBlock().then((b) => b.timestamp)

      // confirm expired
      expect(expiryBefore).toBeLessThanOrEqual(timestamp + GRACE_PERIOD)

      // renew for less than the grace period
      await nameWrapper.write.renew([toLabelId(label), 1n * DAY])

      const [ownerAfter, fusesAfter, expiryAfter] =
        await nameWrapper.read.getData([toNameId(name)])

      expect(ownerAfter).toEqualAddress(accounts[0].address)
      // fuses remain the same
      expect(fusesAfter).toEqual(
        CANNOT_UNWRAP |
          CANNOT_SET_RESOLVER |
          IS_DOT_ETH |
          PARENT_CANNOT_CONTROL,
      )
      // still expired
      expect(expiryAfter).toBeLessThanOrEqual(timestamp + GRACE_PERIOD)
    })
  })
}
