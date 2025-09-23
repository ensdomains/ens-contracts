import hre from 'hardhat'
import {
  type Address,
  hexToBigInt,
  labelhash,
  namehash,
  padHex,
  parseEther,
} from 'viem'

import { isHardhatFork } from '../fixtures/forked.js'

// Mainnet contract addresses
const MAINNET_CONTRACTS = {
  ensRegistry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as Address,
  ethRegistrarController:
    '0x59E16fcCd424Cc24e280Be16E11Bcd56fb0CE547' as Address,
  wrappedETHRegistrarController:
    '0x253553366Da8546fC250F225fe3d25d0C782303b' as Address,
  baseRegistrar: '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85' as Address,
  nameWrapper: '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401' as Address,
} as const

const TEST_LABEL = 'isitai'
const RENEWAL_DURATION = 86400n // 1 day

const labelId = (label: string) => hexToBigInt(labelhash(label))
const makeReferrer = (address: Address) =>
  padHex(address, { dir: 'left', size: 32 })

const connection = await hre.network.connect()
const publicClient = await connection.viem.getPublicClient()
const [ownerClient, referrerClient] = await connection.viem.getWalletClients()
const ownerAccount = ownerClient.account
const referrer = makeReferrer(referrerClient.account.address)

async function fixture() {
  // Deploy our mock wrapped controller
  const mockWrappedController = await connection.viem.deployContract(
    'MockWrappedEthRegistrarController',
    [],
  )

  // Deploy our contract under test using real mainnet contracts
  const wrappedControllerWithReferrals = await connection.viem.deployContract(
    'WrappedEthRegistrarControllerWithRenewalReferrals',
    [MAINNET_CONTRACTS.ethRegistrarController, mockWrappedController.address],
  )

  // Get contract instances for the real mainnet contracts
  const ethRegistrarController = await connection.viem.getContractAt(
    'ETHRegistrarController',
    MAINNET_CONTRACTS.ethRegistrarController,
  )

  const baseRegistrar = await connection.viem.getContractAt(
    'BaseRegistrarImplementation',
    MAINNET_CONTRACTS.baseRegistrar,
  )

  const nameWrapper = await connection.viem.getContractAt(
    'NameWrapper',
    MAINNET_CONTRACTS.nameWrapper,
  )

  return {
    ethRegistrarController,
    baseRegistrar,
    nameWrapper,
    mockWrappedController,
    wrappedControllerWithReferrals,
  }
}

const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)
// Only run these tests when forking mainnet
;(isHardhatFork() ? describe : describe.skip)(
  'WrappedEthRegistrarControllerWithRenewalReferrals @ mainnet',
  () => {
    it('should get current state of isitai.eth', async () => {
      const { baseRegistrar, nameWrapper } = await loadFixture()

      // Check if the name exists and get its current expiry
      const tokenId = labelId(TEST_LABEL)
      const expires = await baseRegistrar.read.nameExpires([tokenId])

      console.log(
        `${TEST_LABEL}.eth expires at:`,
        new Date(Number(expires) * 1000),
      )
      expect(expires).toBeGreaterThan(0n)

      // Check NameWrapper state
      const nodehash = namehash(`${TEST_LABEL}.eth`)
      const [owner, , wrapperExpiry] = await nameWrapper.read.getData([
        hexToBigInt(nodehash),
      ])

      console.log(`NameWrapper owner:`, owner)
      console.log(`NameWrapper expiry:`, new Date(Number(wrapperExpiry) * 1000))
      console.log(`Current block timestamp:`, new Date(Date.now()))
    })

    it('should renew isitai.eth with referrer using wrapped controller', async () => {
      const {
        baseRegistrar,
        ethRegistrarController,
        nameWrapper,
        wrappedControllerWithReferrals,
        mockWrappedController,
      } = await loadFixture()

      // Get current state
      const tokenId = labelId(TEST_LABEL)
      const expiresBefore = await baseRegistrar.read.nameExpires([tokenId])

      // Get NameWrapper expiry before renewal
      const nodehash = namehash(`${TEST_LABEL}.eth`)
      const [, , wrapperExpiryBefore] = await nameWrapper.read.getData([
        hexToBigInt(nodehash),
      ])
      expect(wrapperExpiryBefore).toEqual(expiresBefore)

      // Calculate renewal price
      const { base: price } = await ethRegistrarController.read.rentPrice([
        TEST_LABEL,
        RENEWAL_DURATION,
      ])

      console.log(`Renewal price for ${RENEWAL_DURATION}s:`, price.toString())

      const balanceBefore = await publicClient.getBalance({
        address: ethRegistrarController.address,
      })

      // Perform renewal through our wrapped controller
      await wrappedControllerWithReferrals.write.renew(
        [TEST_LABEL, RENEWAL_DURATION, referrer],
        {
          value: price + parseEther('0.01'), // Add some extra for testing refund
          account: ownerAccount,
        },
      )

      // Verify the name was renewed in the base registrar
      const expiresAfter = await baseRegistrar.read.nameExpires([tokenId])
      expect(expiresAfter - expiresBefore).toEqual(RENEWAL_DURATION)

      console.log(
        `Name renewed! New expiry:`,
        new Date(Number(expiresAfter) * 1000),
      )

      // Note: In a real scenario, the wrapped controller would sync the expiry,
      // but since we're using a mock, we just verify it was called
      await expect(mockWrappedController.read.renewCalled()).resolves.toEqual(
        true,
      )
      await expect(
        mockWrappedController.read.lastRenewedLabel(),
      ).resolves.toEqual(TEST_LABEL)
      await expect(
        mockWrappedController.read.lastRenewedDuration(),
      ).resolves.toEqual(0n) // Called with 0 duration to sync expiry

      // Verify payment was processed
      const balanceAfter = await publicClient.getBalance({
        address: ethRegistrarController.address,
      })
      expect(balanceAfter - balanceBefore).toEqual(price)

      console.log(`Payment processed: ${price.toString()} wei`)
    })

    it('should handle insufficient payment correctly', async () => {
      const { ethRegistrarController, wrappedControllerWithReferrals } =
        await loadFixture()

      // Get renewal price
      const { base: price } = await ethRegistrarController.read.rentPrice([
        TEST_LABEL,
        RENEWAL_DURATION,
      ])

      // Try to renew with insufficient payment
      await expect(
        wrappedControllerWithReferrals.write.renew(
          [TEST_LABEL, RENEWAL_DURATION, referrer],
          {
            value: price - 1n, // 1 wei less than required
            account: ownerAccount,
          },
        ),
      ).toBeRevertedWithCustomError('InsufficientValue')
    })

    it('should get real name owner and ensure test validity', async () => {
      const { baseRegistrar } = await loadFixture()

      // Verify the name exists and get owner
      const tokenId = labelId(TEST_LABEL)
      const owner = await baseRegistrar.read.ownerOf([tokenId])

      console.log(`${TEST_LABEL}.eth is owned by:`, owner)
      expect(owner).not.toEqual('0x0000000000000000000000000000000000000000')

      // Check if name is not expired
      const expires = await baseRegistrar.read.nameExpires([tokenId])
      const now = BigInt(Math.floor(Date.now() / 1000))

      if (expires <= now) {
        console.warn(
          `Warning: ${TEST_LABEL}.eth is expired! Expiry:`,
          new Date(Number(expires) * 1000),
        )
      } else {
        console.log(
          `${TEST_LABEL}.eth is valid until:`,
          new Date(Number(expires) * 1000),
        )
      }
    })
  },
)
