import hre from 'hardhat'
import {
  type Address,
  formatEther,
  hexToBigInt,
  labelhash,
  namehash,
  padHex,
  parseEther,
} from 'viem'

import { DAY } from '../fixtures/constants.js'
import { GRACE_PERIOD } from '../wrapper/fixtures/utils.js'

const renderTimestamp = (timestamp: bigint) =>
  `${new Date(Number(timestamp) * 1000).toISOString()} (${timestamp})`
const makeReferrer = (address: Address) =>
  padHex(address, { dir: 'left', size: 32 })

// Mainnet contract addresses
const MAINNET_CONTRACTS = {
  ensRegistry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as Address,
  unwrappedEthRegistrarController:
    '0x59E16fcCd424Cc24e280Be16E11Bcd56fb0CE547' as Address,
  wrappedEthRegistrarController:
    '0x253553366Da8546fC250F225fe3d25d0C782303b' as Address,
  baseRegistrar: '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85' as Address,
  nameWrapper: '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401' as Address,
} as const

const TEST_LABEL = 'scotttaylor'
const TEST_NAME = `${TEST_LABEL}.eth`
const LABEL_TOKEN_ID = hexToBigInt(labelhash(TEST_LABEL), { size: 32 })
const TEST_NODE = namehash(TEST_NAME)
const NAME_TOKEN_ID = hexToBigInt(TEST_NODE, { size: 32 })
const RENEWAL_DURATION = DAY * 365n // 1 year

const connection = await hre.network.connect('hardhat')
const publicClient = await connection.viem.getPublicClient()

const [renewerClient, referrerClient] = await connection.viem.getWalletClients()
const renewerAccount = renewerClient.account
const referrer = makeReferrer(referrerClient.account.address)

async function fixture() {
  const wrappedEthRegistrarController = await connection.viem.getContractAt(
    'contracts/ethregistrar/WrappedEthRegistrarControllerWithRenewalReferrals.sol:IWrappedEthRegistrarController',
    MAINNET_CONTRACTS.wrappedEthRegistrarController,
  )

  const unwrappedEthRegistrarController = await connection.viem.getContractAt(
    'ETHRegistrarController',
    MAINNET_CONTRACTS.unwrappedEthRegistrarController,
  )

  const baseRegistrar = await connection.viem.getContractAt(
    'BaseRegistrarImplementation',
    MAINNET_CONTRACTS.baseRegistrar,
  )

  const nameWrapper = await connection.viem.getContractAt(
    'NameWrapper',
    MAINNET_CONTRACTS.nameWrapper,
  )

  // deploy WrappedEthRegistrarControllerWithRenewalReferrals
  const wrappedControllerWithReferrals = await connection.viem.deployContract(
    'WrappedEthRegistrarControllerWithRenewalReferrals',
    [
      wrappedEthRegistrarController.address,
      unwrappedEthRegistrarController.address,
    ],
  )

  return {
    wrappedEthRegistrarController,
    unwrappedEthRegistrarController,
    baseRegistrar,
    nameWrapper,
    wrappedControllerWithReferrals,
  }
}

const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

describe('WrappedEthRegistrarControllerWithRenewalReferrals @ mainnet', () => {
  describe('wrapped name', () => {
    it('should get current state of name', async () => {
      const { baseRegistrar, nameWrapper } = await loadFixture()

      const isWrapped = await nameWrapper.read.isWrapped([TEST_NODE])
      expect(isWrapped).toEqual(true)

      const registrarExpiry = await baseRegistrar.read.nameExpires([
        LABEL_TOKEN_ID,
      ])
      expect(registrarExpiry).toBeGreaterThan(0n)

      const [, , wrapperExpiry] = await nameWrapper.read.getData([
        NAME_TOKEN_ID,
      ])
      expect(wrapperExpiry).toBeGreaterThan(0n)

      expect(wrapperExpiry - GRACE_PERIOD).toEqual(registrarExpiry)

      console.log(`BaseRegistrar expiry: ${renderTimestamp(registrarExpiry)}`)
      console.log(`  NameWrapper expiry: ${renderTimestamp(wrapperExpiry)}`)
    })

    it('should renew name with referrer using wrapped controller', async () => {
      const {
        baseRegistrar,
        nameWrapper,
        wrappedControllerWithReferrals,
        unwrappedEthRegistrarController,
      } = await loadFixture()

      const expiresBefore = await baseRegistrar.read.nameExpires([
        LABEL_TOKEN_ID,
      ])

      // Calculate renewal price
      const { base: price } =
        await unwrappedEthRegistrarController.read.rentPrice([
          TEST_LABEL,
          RENEWAL_DURATION,
        ])

      console.log(
        `Renewal price for ${RENEWAL_DURATION}s: ${formatEther(price)} ETH`,
      )

      // Perform renewal through our wrapped controller
      await wrappedControllerWithReferrals.write.renew(
        [TEST_LABEL, RENEWAL_DURATION, referrer],
        { value: price, account: renewerAccount },
      )

      // Verify the name was renewed in the base registrar
      const expiresAfter = await baseRegistrar.read.nameExpires([
        LABEL_TOKEN_ID,
      ])
      expect(expiresAfter - expiresBefore).toEqual(RENEWAL_DURATION)

      console.log(`Name renewed! New expiry: ${renderTimestamp(expiresAfter)}`)

      // Verify that the NameWrapper has the updated expiry
      const [, , wrapperExpiryAfter] = await nameWrapper.read.getData([
        NAME_TOKEN_ID,
      ])
      expect(wrapperExpiryAfter - GRACE_PERIOD).toEqual(expiresAfter)

      console.log(`Payment processed: ${price.toString()} wei`)
    })

    it('should handle overpayment correctly', async () => {
      const {
        baseRegistrar,
        wrappedControllerWithReferrals,
        unwrappedEthRegistrarController,
      } = await loadFixture()

      // Check wrapper contract balance before (should be 0)
      await expect(
        publicClient.getBalance({
          address: wrappedControllerWithReferrals.address,
        }),
      ).resolves.toEqual(0n)

      // Get owner's balance before
      const ownerBalanceBefore = await publicClient.getBalance({
        address: renewerAccount.address,
      })

      // Calculate exact renewal price
      const { base: exactPrice } =
        await unwrappedEthRegistrarController.read.rentPrice([
          TEST_LABEL,
          RENEWAL_DURATION,
        ])

      const expiresBefore = await baseRegistrar.read.nameExpires([
        LABEL_TOKEN_ID,
      ])

      // Perform renewal with overpayment
      const txHash = await wrappedControllerWithReferrals.write.renew(
        [TEST_LABEL, RENEWAL_DURATION, referrer],
        { value: exactPrice + parseEther('0.1'), account: renewerAccount },
      )

      // Get transaction receipt to calculate gas costs
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash })
      const gasCost = receipt.gasUsed * receipt.effectiveGasPrice

      // Verify the name was renewed
      const expiresAfter = await baseRegistrar.read.nameExpires([
        LABEL_TOKEN_ID,
      ])
      expect(expiresAfter - expiresBefore).toEqual(RENEWAL_DURATION)

      // Check wrapper contract balance after (should still be 0 due to refund)
      await expect(
        publicClient.getBalance({
          address: wrappedControllerWithReferrals.address,
        }),
      ).resolves.toEqual(0n)

      // Check owner's balance - should have been refunded the overpayment
      const ownerBalanceAfter = await publicClient.getBalance({
        address: renewerAccount.address,
      })

      // Owner should have paid only the exact price + gas, not the overpayment
      const expectedBalance = ownerBalanceBefore - exactPrice - gasCost
      expect(ownerBalanceAfter).toEqual(expectedBalance)
    })

    it('should handle underpayment correctly', async () => {
      const {
        wrappedControllerWithReferrals,
        unwrappedEthRegistrarController,
      } = await loadFixture()

      // Calculate exact renewal price
      const { base: exactPrice } =
        await unwrappedEthRegistrarController.read.rentPrice([
          TEST_LABEL,
          RENEWAL_DURATION,
        ])

      // Attempt renewal with underpayment - should revert
      await expect(
        wrappedControllerWithReferrals.write.renew(
          [TEST_LABEL, RENEWAL_DURATION, referrer],
          { value: exactPrice - 1n, account: renewerAccount },
        ),
      ).rejects.toThrow()
    })
  })

  describe('unwrapped name', () => {
    it('should renew name with referrer using wrapped controller', async () => {
      const {
        baseRegistrar,
        wrappedControllerWithReferrals,
        unwrappedEthRegistrarController,
      } = await loadFixture()

      const testUnwrappedLabel = 'testnewunwrapped'
      const testUnwrappedTokenId = hexToBigInt(labelhash(testUnwrappedLabel), {
        size: 32,
      })

      // Check if the name is available for registration
      const isAvailable = await unwrappedEthRegistrarController.read.available([
        testUnwrappedLabel,
      ])

      if (!isAvailable) {
        console.log(
          `Name ${testUnwrappedLabel}.eth is not available, skipping unwrapped domain test`,
        )
        return
      }

      // Calculate registration price for 1 year
      const registrationDuration = DAY * 365n
      const { base: registrationPrice } =
        await unwrappedEthRegistrarController.read.rentPrice([
          testUnwrappedLabel,
          registrationDuration,
        ])

      // Prepare registration data
      const secret = padHex('0x1234', { size: 32 })
      const registration = {
        label: testUnwrappedLabel,
        owner: renewerAccount.address,
        duration: registrationDuration,
        secret,
        resolver: '0x0000000000000000000000000000000000000000' as Address,
        data: [],
        reverseRecord: 0,
        referrer: padHex('0x0', { size: 32 }),
      }

      // Make commitment
      const commitment =
        await unwrappedEthRegistrarController.read.makeCommitment([
          registration,
        ])

      // Commit
      await unwrappedEthRegistrarController.write.commit([commitment], {
        account: renewerAccount,
      })

      // Wait for commitment age (hardhat doesn't require waiting in tests)
      // Register the name
      await unwrappedEthRegistrarController.write.register([registration], {
        value: registrationPrice,
        account: renewerAccount,
      })

      // Verify the name was registered
      const initialExpiry = await baseRegistrar.read.nameExpires([
        testUnwrappedTokenId,
      ])
      expect(initialExpiry).toBeGreaterThan(0n)

      // Now test renewal via our wrapper
      const renewalDuration = DAY * 90n // 3 months
      const { base: renewalPrice } =
        await unwrappedEthRegistrarController.read.rentPrice([
          testUnwrappedLabel,
          renewalDuration,
        ])

      // Renew the unwrapped domain via our wrapper contract
      await wrappedControllerWithReferrals.write.renew(
        [testUnwrappedLabel, renewalDuration, referrer],
        { value: renewalPrice, account: renewerAccount },
      )

      // Verify the domain was renewed
      const finalExpiry = await baseRegistrar.read.nameExpires([
        testUnwrappedTokenId,
      ])
      expect(finalExpiry - initialExpiry).toEqual(renewalDuration)

      console.log(
        `Unwrapped domain ${testUnwrappedLabel}.eth renewed successfully. Initial expiry: ${renderTimestamp(
          initialExpiry,
        )}, Final expiry: ${renderTimestamp(finalExpiry)}`,
      )
    })
  })
})
