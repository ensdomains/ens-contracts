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
import { registerNameWithConnection } from '../fixtures/registerName.js'

const renderTimestamp = (timestamp: bigint) =>
  `${new Date(Number(timestamp) * 1000).toISOString()} (${timestamp})`
const makeReferrer = (address: Address) =>
  padHex(address, { dir: 'left', size: 32 })

// Mainnet contract addresses
const MAINNET_CONTRACTS = {
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

const TEST_UNWRAPPED_LABEL = 'testnewunwrapped-blahblah'
const TEST_UNWRAPPED_LABEL_TOKEN_ID = hexToBigInt(
  labelhash(TEST_UNWRAPPED_LABEL),
  { size: 32 },
)

const connection = await hre.network.connect('mainnet-fork')
const publicClient = await connection.viem.getPublicClient()

const [renewerClient, referrerClient] = await connection.viem.getWalletClients()
const renewerAccount = renewerClient.account
const REFERRER = makeReferrer(referrerClient.account.address)

const registerName = registerNameWithConnection(connection)

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
    beforeEach(async () => {
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
      console.log(
        `  NameWrapper expiry: ${renderTimestamp(
          wrapperExpiry - GRACE_PERIOD,
        )}`,
      )
    })

    it('should renew name with referrer using wrapped controller', async () => {
      const {
        baseRegistrar,
        nameWrapper,
        unwrappedEthRegistrarController,
        wrappedControllerWithReferrals,
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
        [TEST_LABEL, RENEWAL_DURATION, REFERRER],
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
        unwrappedEthRegistrarController,
        wrappedControllerWithReferrals,
      } = await loadFixture()

      // Check wrapper contract balance before (should be 0)
      await expect(
        publicClient.getBalance({
          address: wrappedControllerWithReferrals.address,
        }),
      ).resolves.toEqual(0n)

      // Get renewer's balance before
      const renewerBalanceBefore = await publicClient.getBalance({
        address: renewerAccount.address,
      })

      // Calculate exact renewal price
      const { base: price } =
        await unwrappedEthRegistrarController.read.rentPrice([
          TEST_LABEL,
          RENEWAL_DURATION,
        ])

      const expiresBefore = await baseRegistrar.read.nameExpires([
        LABEL_TOKEN_ID,
      ])

      // TODO: setting payment > price causes:
      // Transaction reverted: function selector was not recognized and there's no fallback nor receive function
      const payment = price + 1n
      expect(renewerBalanceBefore).toBeGreaterThan(payment)

      // Perform renewal with overpayment
      const txHash = await wrappedControllerWithReferrals.write.renew(
        [TEST_LABEL, RENEWAL_DURATION, REFERRER],
        { value: payment, account: renewerAccount },
      )

      // Get transaction receipt to calculate gas costs
      const receipt = await publicClient.getTransactionReceipt({
        hash: txHash,
      })
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

      // Check renewer's balance - should have been refunded the overpayment
      const renewerBalanceAfter = await publicClient.getBalance({
        address: renewerAccount.address,
      })

      // Owner should have paid only the exact price + gas, not the overpayment
      const expectedBalance = renewerBalanceBefore - price - gasCost
      expect(renewerBalanceAfter).toEqual(expectedBalance)
    })

    it('should handle underpayment correctly', async () => {
      const {
        unwrappedEthRegistrarController,
        wrappedControllerWithReferrals,
      } = await loadFixture()

      // Calculate exact renewal price
      const { base: price } =
        await unwrappedEthRegistrarController.read.rentPrice([
          TEST_LABEL,
          RENEWAL_DURATION,
        ])

      // Attempt renewal with underpayment - should revert with InsufficientValue()
      await expect(
        wrappedControllerWithReferrals.write.renew(
          [TEST_LABEL, RENEWAL_DURATION, REFERRER],
          { value: price - 1n, account: renewerAccount },
        ),
      ).toBeRevertedWithCustomErrorFrom(
        unwrappedEthRegistrarController,
        'InsufficientValue',
      )
    })
  })

  describe('unwrapped name', () => {
    beforeEach(async () => {
      const { unwrappedEthRegistrarController } = await loadFixture()

      await registerName(
        { ethRegistrarController: unwrappedEthRegistrarController },
        { label: TEST_UNWRAPPED_LABEL },
      )
    })

    it('should renew name with referrer using wrapped controller', async () => {
      const {
        baseRegistrar,
        unwrappedEthRegistrarController,
        wrappedControllerWithReferrals,
      } = await loadFixture()

      const initialExpiry = await baseRegistrar.read.nameExpires([
        TEST_UNWRAPPED_LABEL_TOKEN_ID,
      ])

      // Now test renewal via our wrapper
      const { base: price } =
        await unwrappedEthRegistrarController.read.rentPrice([
          TEST_UNWRAPPED_LABEL,
          RENEWAL_DURATION,
        ])

      // Renew the unwrapped domain via our wrapper contract
      // TODO: Error: Transaction reverted without a reason string
      await wrappedControllerWithReferrals.write.renew(
        [TEST_UNWRAPPED_LABEL, RENEWAL_DURATION, REFERRER],
        { value: price, account: renewerAccount },
      )

      // Verify the domain was renewed
      const finalExpiry = await baseRegistrar.read.nameExpires([
        TEST_UNWRAPPED_LABEL_TOKEN_ID,
      ])
      expect(finalExpiry - initialExpiry).toEqual(RENEWAL_DURATION)
    })
  })
})
