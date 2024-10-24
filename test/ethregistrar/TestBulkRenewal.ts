import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { labelhash, namehash, zeroAddress, zeroHash } from 'viem'
import { getInterfaceId } from '../fixtures/createInterfaceId.js'
import { toLabelId } from '../fixtures/utils.js'
import { shouldSupportInterfaces } from '../wrapper/SupportsInterface.behaviour.js'

const basePrice = 1n
const fourCharPrice = 2n
const threeCharPrice = 4n
const secondsInDay = 86400n

async function fixture() {
  const accounts = await hre.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))
  // Create a registry
  const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])
  // Create a base registrar
  const baseRegistrar = await hre.viem.deployContract(
    'BaseRegistrarImplementation',
    [ensRegistry.address, namehash('eth')],
  )

  // Setup reverse registrar
  const reverseRegistrar = await hre.viem.deployContract('ReverseRegistrar', [
    ensRegistry.address,
  ])

  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('reverse'),
    accounts[0].address,
  ])
  await ensRegistry.write.setSubnodeOwner([
    namehash('reverse'),
    labelhash('addr'),
    reverseRegistrar.address,
  ])

  // Create a name wrapper
  const nameWrapper = await hre.viem.deployContract('NameWrapper', [
    ensRegistry.address,
    baseRegistrar.address,
    accounts[0].address,
  ])
  // Create a public resolver
  const publicResolver = await hre.viem.deployContract('PublicResolver', [
    ensRegistry.address,
    nameWrapper.address,
    zeroAddress,
    zeroAddress,
  ])

  // Set up a dummy price oracle and a controller
  const dummyOracle = await hre.viem.deployContract('DummyOracle', [100000000n])
  const priceOracle = await hre.viem.deployContract('StablePriceOracle', [
    dummyOracle.address,
    [0n, 0n, threeCharPrice, fourCharPrice, basePrice],
  ])
  const controller = await hre.viem.deployContract('ETHRegistrarController', [
    baseRegistrar.address,
    priceOracle.address,
    600n,
    86400n,
    zeroAddress,
    nameWrapper.address,
    ensRegistry.address,
  ])

  await baseRegistrar.write.addController([controller.address])
  await baseRegistrar.write.addController([accounts[0].address])
  await baseRegistrar.write.addController([nameWrapper.address])
  await nameWrapper.write.setController([controller.address, true])

  // Create the bulk renewal contract
  const bulkRenewal = await hre.viem.deployContract('BulkRenewal', [
    baseRegistrar.address,
    controller.address,
  ])

  // Configure a resolver for .eth and register the controller interface
  // then transfer the .eth node to the base registrar.
  await ensRegistry.write.setSubnodeRecord([
    zeroHash,
    labelhash('eth'),
    accounts[0].address,
    publicResolver.address,
    0n,
  ])
  const interfaceId = await getInterfaceId('IETHRegistrarController')
  await publicResolver.write.setInterface([
    namehash('eth'),
    interfaceId,
    controller.address,
  ])
  await ensRegistry.write.setOwner([namehash('eth'), baseRegistrar.address])

  // Register some names
  for (const name of ['test1', 'test2', 'test3', 'abc', 'abcd']) {
    await baseRegistrar.write.register([
      toLabelId(name),
      accounts[1].address,
      31536000n,
    ])
  }

  return { ensRegistry, baseRegistrar, controller, bulkRenewal, accounts }
}

describe('BulkRenewal', () => {
  shouldSupportInterfaces({
    contract: () => loadFixture(fixture).then(({ bulkRenewal }) => bulkRenewal),
    interfaces: [
      'IFixedDurationBulkRenewal',
      'IFixedItemPriceBulkRenewal',
      'ITargetExpiryBulkRenewal',
    ],
  })

  describe('FixedDurationBulkRenewal', () => {
    describe('getFixedDurationPriceData', () => {
      it('should return the total and array of prices for a bulk renewal', async () => {
        const { bulkRenewal } = await loadFixture(fixture)

        await expect(
          bulkRenewal.read.getFixedDurationPriceData([
            ['abc', 'abcd', 'test1'],
            secondsInDay,
          ]),
        ).resolves.toEqual([
          secondsInDay * (threeCharPrice + fourCharPrice + basePrice),
          [
            secondsInDay * threeCharPrice,
            secondsInDay * fourCharPrice,
            secondsInDay * basePrice,
          ],
        ])
      })
      it('should revert when a name is available', async () => {
        const { bulkRenewal } = await loadFixture(fixture)

        await expect(bulkRenewal)
          .read('getFixedDurationPriceData', [
            ['abc', 'test1', 'test4-not-registered'],
            secondsInDay,
          ])
          .toBeRevertedWithCustomError('NameAvailable')
          .withArgs('test4-not-registered')
      })
    })
    describe('renewAllWithFixedDuration', () => {
      it('should renew all names with the fixed duration', async () => {
        const { bulkRenewal, baseRegistrar } = await loadFixture(fixture)
        const expiryBefore1 = await baseRegistrar.read.nameExpires([
          toLabelId('abc'),
        ])
        const expiryBefore2 = await baseRegistrar.read.nameExpires([
          toLabelId('abcd'),
        ])
        const expiryBefore3 = await baseRegistrar.read.nameExpires([
          toLabelId('test1'),
        ])

        await bulkRenewal.write.renewAllWithFixedDuration(
          [
            ['abc', 'abcd', 'test1'],
            secondsInDay,
            [
              secondsInDay * threeCharPrice,
              secondsInDay * fourCharPrice,
              secondsInDay * basePrice,
            ],
          ],
          {
            value: secondsInDay * (threeCharPrice + fourCharPrice + basePrice),
          },
        )

        await expect(
          baseRegistrar.read.nameExpires([toLabelId('abc')]),
        ).resolves.toBe(expiryBefore1 + secondsInDay)
        await expect(
          baseRegistrar.read.nameExpires([toLabelId('abcd')]),
        ).resolves.toBe(expiryBefore2 + secondsInDay)
        await expect(
          baseRegistrar.read.nameExpires([toLabelId('test1')]),
        ).resolves.toBe(expiryBefore3 + secondsInDay)
      })
      it('should send any excess funds back to the sender', async () => {
        const { bulkRenewal, accounts, baseRegistrar } = await loadFixture(
          fixture,
        )

        const expiryBefore1 = await baseRegistrar.read.nameExpires([
          toLabelId('abc'),
        ])
        const expiryBefore2 = await baseRegistrar.read.nameExpires([
          toLabelId('abcd'),
        ])
        const expiryBefore3 = await baseRegistrar.read.nameExpires([
          toLabelId('test1'),
        ])

        const publicClient = await hre.viem.getPublicClient()
        const balanceBefore = await publicClient.getBalance({
          address: accounts[0].address,
        })

        const tx = await bulkRenewal.write.renewAllWithFixedDuration(
          [
            ['abc', 'abcd', 'test1'],
            secondsInDay,
            [
              secondsInDay * threeCharPrice,
              secondsInDay * fourCharPrice,
              secondsInDay * basePrice,
            ],
          ],
          {
            value:
              secondsInDay * (threeCharPrice + fourCharPrice + basePrice) +
              basePrice,
          },
        )
        const receipt = await publicClient.getTransactionReceipt({ hash: tx })
        const balanceAfter = await publicClient.getBalance({
          address: accounts[0].address,
        })
        const gasValue = receipt.gasUsed * receipt.effectiveGasPrice
        const usedValue =
          secondsInDay * (threeCharPrice + fourCharPrice + basePrice)
        expect(balanceBefore - balanceAfter).toBe(gasValue + usedValue)
        await expect(
          publicClient.getBalance({ address: bulkRenewal.address }),
        ).resolves.toEqual(0n)
        await expect(
          baseRegistrar.read.nameExpires([toLabelId('abc')]),
        ).resolves.toBe(expiryBefore1 + secondsInDay)
        await expect(
          baseRegistrar.read.nameExpires([toLabelId('abcd')]),
        ).resolves.toBe(expiryBefore2 + secondsInDay)
        await expect(
          baseRegistrar.read.nameExpires([toLabelId('test1')]),
        ).resolves.toBe(expiryBefore3 + secondsInDay)
      })
    })
  })

  describe('FixedItemPriceBulkRenewal', () => {
    describe('getFixedItemPricePriceData', () => {
      it('should return the cost of a bulk renewal', async () => {
        const { bulkRenewal } = await loadFixture(fixture)

        await expect(
          bulkRenewal.read.getFixedItemPricePriceData([
            ['test1', 'test2'],
            secondsInDay,
          ]),
        ).resolves.toEqual([
          secondsInDay * basePrice * 2n,
          secondsInDay * basePrice,
        ])
      })
      it('should revert when name is available', async () => {
        const { bulkRenewal } = await loadFixture(fixture)

        await expect(bulkRenewal)
          .read('getFixedItemPricePriceData', [
            ['test1', 'test4-not-registered'],
            secondsInDay,
          ])
          .toBeRevertedWithCustomError('NameAvailable')
          .withArgs('test4-not-registered')
      })
      it('should revert when a name has a different price', async () => {
        const { bulkRenewal } = await loadFixture(fixture)

        await expect(bulkRenewal)
          .read('getFixedItemPricePriceData', [['abc', 'test1'], secondsInDay])
          .toBeRevertedWithCustomError('NameMismatchedPrice')
          .withArgs('test1')
      })
    })
    describe('renewAllWithFixedItemPrice', () => {
      it('should renew all names with the fixed item price', async () => {
        const { bulkRenewal, baseRegistrar } = await loadFixture(fixture)
        const expiryBefore1 = await baseRegistrar.read.nameExpires([
          toLabelId('test1'),
        ])
        const expiryBefore2 = await baseRegistrar.read.nameExpires([
          toLabelId('test2'),
        ])

        await bulkRenewal.write.renewAllWithFixedItemPrice(
          [['test1', 'test2'], secondsInDay, secondsInDay * basePrice],
          {
            value: secondsInDay * basePrice * 2n,
          },
        )

        await expect(
          baseRegistrar.read.nameExpires([toLabelId('test1')]),
        ).resolves.toBe(expiryBefore1 + secondsInDay)
        await expect(
          baseRegistrar.read.nameExpires([toLabelId('test2')]),
        ).resolves.toBe(expiryBefore2 + secondsInDay)
      })
      it('should send any excess funds back to the sender', async () => {
        const { bulkRenewal, accounts, baseRegistrar } = await loadFixture(
          fixture,
        )

        const expiryBefore1 = await baseRegistrar.read.nameExpires([
          toLabelId('test1'),
        ])
        const expiryBefore2 = await baseRegistrar.read.nameExpires([
          toLabelId('test2'),
        ])

        const publicClient = await hre.viem.getPublicClient()
        const balanceBefore = await publicClient.getBalance({
          address: accounts[0].address,
        })

        const tx = await bulkRenewal.write.renewAllWithFixedItemPrice(
          [['test1', 'test2'], secondsInDay, secondsInDay * basePrice],
          {
            value: secondsInDay * basePrice * 2n + basePrice,
          },
        )
        const receipt = await publicClient.getTransactionReceipt({ hash: tx })
        const balanceAfter = await publicClient.getBalance({
          address: accounts[0].address,
        })
        const gasValue = receipt.gasUsed * receipt.effectiveGasPrice
        const usedValue = secondsInDay * basePrice * 2n
        expect(balanceBefore - balanceAfter).toBe(gasValue + usedValue)
        await expect(
          publicClient.getBalance({ address: bulkRenewal.address }),
        ).resolves.toEqual(0n)
        await expect(
          baseRegistrar.read.nameExpires([toLabelId('test1')]),
        ).resolves.toBe(expiryBefore1 + secondsInDay)
        await expect(
          baseRegistrar.read.nameExpires([toLabelId('test2')]),
        ).resolves.toBe(expiryBefore2 + secondsInDay)
      })
    })
  })

  describe('TargetExpiryBulkRenewal', () => {
    describe('getTargetExpiryPriceData', () => {
      it('should return the total and array of durations and prices for a bulk renewal', async () => {
        const { bulkRenewal, baseRegistrar, controller } = await loadFixture(
          fixture,
        )

        await controller.write.renew(['abcd', secondsInDay], {
          value: secondsInDay * fourCharPrice,
        })
        await controller.write.renew(['test1', secondsInDay * 2n], {
          value: secondsInDay * basePrice * 2n,
        })

        const currentExpiry1 = await baseRegistrar.read.nameExpires([
          toLabelId('abc'),
        ])
        const currentExpiry2 = await baseRegistrar.read.nameExpires([
          toLabelId('abcd'),
        ])
        const currentExpiry3 = await baseRegistrar.read.nameExpires([
          toLabelId('test1'),
        ])

        const targetExpiry = currentExpiry3 + secondsInDay

        const expectedDurations = [
          targetExpiry - currentExpiry1,
          targetExpiry - currentExpiry2,
          targetExpiry - currentExpiry3,
        ]
        const expectedValues = [
          (targetExpiry - currentExpiry1) * threeCharPrice,
          (targetExpiry - currentExpiry2) * fourCharPrice,
          (targetExpiry - currentExpiry3) * basePrice,
        ]

        await expect(
          bulkRenewal.read.getTargetExpiryPriceData([
            ['abc', 'abcd', 'test1'],
            targetExpiry,
          ]),
        ).resolves.toEqual([
          expectedValues.reduce((a, b) => a + b, 0n),
          expectedDurations,
          expectedValues,
        ])
      })
      it('should revert when a name is available', async () => {
        const { bulkRenewal, baseRegistrar } = await loadFixture(fixture)

        const currentExpiry = await baseRegistrar.read.nameExpires([
          toLabelId('abc'),
        ])

        await expect(bulkRenewal)
          .read('getTargetExpiryPriceData', [
            ['abc', 'test4-not-registered'],
            currentExpiry + secondsInDay,
          ])
          .toBeRevertedWithCustomError('NameAvailable')
          .withArgs('test4-not-registered')
      })
      it('should revert when a name is beyond the target expiry', async () => {
        const { bulkRenewal, baseRegistrar } = await loadFixture(fixture)

        const currentExpiry = await baseRegistrar.read.nameExpires([
          toLabelId('abc'),
        ])

        await expect(bulkRenewal)
          .read('getTargetExpiryPriceData', [['abc'], currentExpiry - 1n])
          .toBeRevertedWithCustomError('NameBeyondWantedExpiryDate')
          .withArgs('abc')
      })
    })

    describe('renewAllWithTargetExpiry', () => {
      it('should renew all names with the target expiry', async () => {
        const { bulkRenewal, baseRegistrar, controller } = await loadFixture(
          fixture,
        )

        await controller.write.renew(['abcd', secondsInDay], {
          value: secondsInDay * fourCharPrice,
        })
        await controller.write.renew(['test1', secondsInDay * 2n], {
          value: secondsInDay * basePrice * 2n,
        })

        const currentExpiry = await baseRegistrar.read.nameExpires([
          toLabelId('test1'),
        ])

        const targetExpiry = currentExpiry + secondsInDay

        const names = ['abc', 'abcd', 'test1'] as const
        const [value, durations, prices] =
          await bulkRenewal.read.getTargetExpiryPriceData([names, targetExpiry])

        await bulkRenewal.write.renewAllWithTargetExpiry(
          [names, durations, prices],
          {
            value,
          },
        )

        await expect(
          baseRegistrar.read.nameExpires([toLabelId('abc')]),
        ).resolves.toBe(targetExpiry)
        await expect(
          baseRegistrar.read.nameExpires([toLabelId('abcd')]),
        ).resolves.toBe(targetExpiry)
        await expect(
          baseRegistrar.read.nameExpires([toLabelId('test1')]),
        ).resolves.toBe(targetExpiry)
      })
      it('should send any excess funds back to the sender', async () => {
        const { bulkRenewal, accounts, controller, baseRegistrar } =
          await loadFixture(fixture)

        await controller.write.renew(['abcd', secondsInDay], {
          value: secondsInDay * fourCharPrice,
        })
        await controller.write.renew(['test1', secondsInDay * 2n], {
          value: secondsInDay * basePrice * 2n,
        })

        const publicClient = await hre.viem.getPublicClient()
        const balanceBefore = await publicClient.getBalance({
          address: accounts[0].address,
        })

        const currentExpiry = await baseRegistrar.read.nameExpires([
          toLabelId('test1'),
        ])

        const targetExpiry = currentExpiry + secondsInDay

        const names = ['abc', 'abcd', 'test1'] as const
        const [value, durations, prices] =
          await bulkRenewal.read.getTargetExpiryPriceData([names, targetExpiry])

        const tx = await bulkRenewal.write.renewAllWithTargetExpiry(
          [names, durations, prices],
          {
            value: value + secondsInDay,
          },
        )
        const receipt = await publicClient.getTransactionReceipt({ hash: tx })

        const balanceAfter = await publicClient.getBalance({
          address: accounts[0].address,
        })
        const gasValue = receipt.gasUsed * receipt.effectiveGasPrice
        expect(balanceBefore - balanceAfter).toBe(gasValue + value)
        await expect(
          publicClient.getBalance({ address: bulkRenewal.address }),
        ).resolves.toEqual(0n)
      })
    })
  })
})
