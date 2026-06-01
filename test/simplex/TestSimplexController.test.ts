import hre from 'hardhat'
import {
  encodeFunctionData,
  labelhash,
  namehash,
  zeroAddress,
  zeroHash,
} from 'viem'

import { DAY } from '../fixtures/constants.js'

/**
 * Deploy SimplexController behind an ERC1967 proxy. The implementation's
 * constructor calls _disableInitializers(); initialize() is invoked
 * atomically as the proxy's constructor data. Tests interact with the
 * proxy address using the implementation ABI.
 */
async function deploySimplexControllerProxy(args: {
  base: `0x${string}`
  prices: `0x${string}`
  minCommitmentAge: bigint
  maxCommitmentAge: bigint
  reverseRegistrar: `0x${string}`
  defaultReverseRegistrar: `0x${string}`
  ens: `0x${string}`
  config: {
    tldNode: `0x${string}`
    tldSuffix: string
    minCharLength: number
    smpxNft: `0x${string}`
    nftGateEnabled: boolean
  }
  ownerAddress: `0x${string}`
}) {
  const implementation = await connection.viem.deployContract(
    'SimplexController',
    [],
  )
  const initData = encodeFunctionData({
    abi: implementation.abi,
    functionName: 'initialize',
    args: [
      args.base,
      args.prices,
      args.minCommitmentAge,
      args.maxCommitmentAge,
      args.reverseRegistrar,
      args.defaultReverseRegistrar,
      args.ens,
      args.config,
      args.ownerAddress,
    ],
  })
  const proxy = await connection.viem.deployContract('SimplexControllerProxy', [
    implementation.address,
    initData,
  ])
  const controller = await connection.viem.getContractAt(
    'SimplexController',
    proxy.address,
  )
  return { controller, implementation, proxyAddress: proxy.address }
}

const REGISTRATION_TIME = 28n * DAY
const GRACE_PERIOD = 90n * DAY

const connection = await hre.network.connect()
const publicClient = await connection.viem.getPublicClient()
const testClient = await connection.viem.getTestClient()
const [ownerClient, registrantClient, otherClient] =
  await connection.viem.getWalletClients()
const ownerAccount = ownerClient.account
const registrantAccount = registrantClient.account
const otherAccount = otherClient.account

async function fixture() {
  const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])
  const baseRegistrar = await connection.viem.deployContract(
    'BaseRegistrarImplementation',
    [ensRegistry.address, namehash('testing')],
  )
  const reverseRegistrar = await connection.viem.deployContract(
    'ReverseRegistrar',
    [ensRegistry.address],
  )
  const defaultReverseRegistrar = await connection.viem.deployContract(
    'DefaultReverseRegistrar',
    [],
  )

  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('reverse'),
    ownerAccount.address,
  ])
  await ensRegistry.write.setSubnodeOwner([
    namehash('reverse'),
    labelhash('addr'),
    reverseRegistrar.address,
  ])
  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('testing'),
    baseRegistrar.address,
  ])

  const mockNft = await connection.viem.deployContract('MockSMPXNFT', [])
  await mockNft.write.mint([registrantAccount.address])

  const dummyOracle = await connection.viem.deployContract('DummyOracle', [
    100000000n,
  ])
  const priceOracle = await connection.viem.deployContract(
    'StablePriceOracle',
    [dummyOracle.address, [0n, 0n, 4n, 2n, 1n]],
  )

  const { controller, implementation, proxyAddress } =
    await deploySimplexControllerProxy({
      base: baseRegistrar.address,
      prices: priceOracle.address,
      minCommitmentAge: 600n,
      maxCommitmentAge: 86400n,
      reverseRegistrar: reverseRegistrar.address,
      defaultReverseRegistrar: defaultReverseRegistrar.address,
      ens: ensRegistry.address,
      config: {
        tldNode: namehash('testing'),
        tldSuffix: '.testing',
        minCharLength: 6,
        smpxNft: mockNft.address,
        nftGateEnabled: true,
      },
      ownerAddress: ownerAccount.address,
    })

  await baseRegistrar.write.addController([controller.address])
  await reverseRegistrar.write.setController([controller.address, true])
  await defaultReverseRegistrar.write.setController([
    controller.address,
    true,
  ])

  return {
    ensRegistry,
    baseRegistrar,
    reverseRegistrar,
    defaultReverseRegistrar,
    dummyOracle,
    priceOracle,
    controller,
    implementation,
    proxyAddress,
    mockNft,
  }
}

const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

async function commitAndRegister(
  controller: any,
  label: string,
  account: any,
  duration: bigint = REGISTRATION_TIME,
) {
  const registration = {
    label,
    owner: account.address,
    duration,
    secret: zeroHash,
    resolver: zeroAddress,
    data: [],
    reverseRecord: 0,
    referrer: zeroHash,
  }
  const commitment = await controller.read.makeCommitment([registration])
  await controller.write.commit([commitment], { account })
  await testClient.increaseTime({ seconds: 601 })
  await testClient.mine({ blocks: 1 })
  const price = await controller.read.rentPrice([label, duration])
  const value = price.base + price.premium
  await controller.write.register([registration], { account, value })
}

describe('SimplexController', () => {
  describe('Name length gate', () => {
    it('rejects names shorter than minCharLength', async () => {
      const { controller } = await loadFixture()
      const registration = {
        label: 'short',
        owner: registrantAccount.address,
        duration: REGISTRATION_TIME,
        secret: zeroHash,
        resolver: zeroAddress,
        data: [],
        reverseRecord: 0,
        referrer: zeroHash,
      }
      const commitment = await controller.read.makeCommitment([registration])
      await controller.write.commit([commitment], {
        account: registrantAccount,
      })
      await testClient.increaseTime({ seconds: 601 })
      await testClient.mine({ blocks: 1 })
      const price = await controller.read.rentPrice([
        'short',
        REGISTRATION_TIME,
      ])
      await expect(
        controller.write.register([registration], {
          account: registrantAccount,
          value: price.base + price.premium,
        }),
      ).toBeRevertedWithCustomError('NameTooShort')
    })

    it('accepts names at exactly minCharLength', async () => {
      const { controller } = await loadFixture()
      await commitAndRegister(controller, 'sixchr', registrantAccount)
    })

    it('accepts names longer than minCharLength', async () => {
      const { controller } = await loadFixture()
      await commitAndRegister(controller, 'longername', registrantAccount)
    })
  })

  describe('Admin: setMinCharLength', () => {
    it('allows owner to decrease minCharLength', async () => {
      const { controller } = await loadFixture()
      await controller.write.setMinCharLength([5], { account: ownerAccount })
      expect(await controller.read.minCharLength()).toBe(5)
    })

    it('rejects increasing minCharLength', async () => {
      const { controller } = await loadFixture()
      await controller.write.setMinCharLength([5], { account: ownerAccount })
      await expect(
        controller.write.setMinCharLength([6], { account: ownerAccount }),
      ).toBeRevertedWithCustomError('MinCharLengthCanOnlyDecrease')
    })

    it('rejects setting same minCharLength', async () => {
      const { controller } = await loadFixture()
      await expect(
        controller.write.setMinCharLength([6], { account: ownerAccount }),
      ).toBeRevertedWithCustomError('MinCharLengthCanOnlyDecrease')
    })

    it('rejects non-owner', async () => {
      const { controller } = await loadFixture()
      await expect(
        controller.write.setMinCharLength([5], {
          account: registrantAccount,
        }),
      ).toBeRevertedWithString('Ownable: caller is not the owner')
    })

    it('allows registration of shorter names after decrease', async () => {
      const { controller } = await loadFixture()
      await controller.write.setMinCharLength([3], { account: ownerAccount })
      await commitAndRegister(controller, 'abc', registrantAccount)
    })
  })

  describe('Reserved names', () => {
    it('rejects registration of reserved name', async () => {
      const { controller } = await loadFixture()
      await controller.write.addReservedName(['simplex'], {
        account: ownerAccount,
      })
      const registration = {
        label: 'simplex',
        owner: registrantAccount.address,
        duration: REGISTRATION_TIME,
        secret: zeroHash,
        resolver: zeroAddress,
        data: [],
        reverseRecord: 0,
        referrer: zeroHash,
      }
      const commitment = await controller.read.makeCommitment([registration])
      await controller.write.commit([commitment], {
        account: registrantAccount,
      })
      await testClient.increaseTime({ seconds: 601 })
      await testClient.mine({ blocks: 1 })
      const price = await controller.read.rentPrice([
        'simplex',
        REGISTRATION_TIME,
      ])
      await expect(
        controller.write.register([registration], {
          account: registrantAccount,
          value: price.base + price.premium,
        }),
      ).toBeRevertedWithCustomError('NameReserved')
    })

    it('allows registration after removing reserved name', async () => {
      const { controller } = await loadFixture()
      await controller.write.addReservedName(['testname'], {
        account: ownerAccount,
      })
      await controller.write.removeReservedName(['testname'], {
        account: ownerAccount,
      })
      await commitAndRegister(controller, 'testname', registrantAccount)
    })

    it('admin can register reserved name via registerReserved', async () => {
      const { controller, baseRegistrar } = await loadFixture()
      await controller.write.addReservedName(['simplex'], {
        account: ownerAccount,
      })
      await controller.write.registerReserved(
        ['simplex', registrantAccount.address, REGISTRATION_TIME],
        { account: ownerAccount },
      )
      const tokenOwner = await baseRegistrar.read.ownerOf([
        BigInt(labelhash('simplex')),
      ])
      expect(tokenOwner.toLowerCase()).toBe(
        registrantAccount.address.toLowerCase(),
      )
    })

    it('rejects non-owner adding reserved name', async () => {
      const { controller } = await loadFixture()
      await expect(
        controller.write.addReservedName(['simplex'], {
          account: registrantAccount,
        }),
      ).toBeRevertedWithString('Ownable: caller is not the owner')
    })
  })

  describe('NFT gate', () => {
    it('allows NFT holder to register', async () => {
      const { controller } = await loadFixture()
      await commitAndRegister(controller, 'holder', registrantAccount)
    })

    it('rejects non-NFT-holder', async () => {
      const { controller } = await loadFixture()
      const registration = {
        label: 'noholder',
        owner: otherAccount.address,
        duration: REGISTRATION_TIME,
        secret: zeroHash,
        resolver: zeroAddress,
        data: [],
        reverseRecord: 0,
        referrer: zeroHash,
      }
      const commitment = await controller.read.makeCommitment([registration])
      await controller.write.commit([commitment], { account: otherAccount })
      await testClient.increaseTime({ seconds: 601 })
      await testClient.mine({ blocks: 1 })
      const price = await controller.read.rentPrice([
        'noholder',
        REGISTRATION_TIME,
      ])
      await expect(
        controller.write.register([registration], {
          account: otherAccount,
          value: price.base + price.premium,
        }),
      ).toBeRevertedWithCustomError('NftRequired')
    })

    it('allows anyone after NFT gate is disabled', async () => {
      const { controller } = await loadFixture()
      await controller.write.disableNftGate([], { account: ownerAccount })
      await commitAndRegister(controller, 'anyone', otherAccount)
    })

    it('disableNftGate is one-way', async () => {
      const { controller } = await loadFixture()
      await controller.write.disableNftGate([], { account: ownerAccount })
      await expect(
        controller.write.disableNftGate([], { account: ownerAccount }),
      ).toBeRevertedWithCustomError('NftGateCanOnlyBeDisabled')
    })

    it('rejects non-owner disabling gate', async () => {
      const { controller } = await loadFixture()
      await expect(
        controller.write.disableNftGate([], { account: registrantAccount }),
      ).toBeRevertedWithString('Ownable: caller is not the owner')
    })
  })

  describe('Commit-reveal (unchanged from ENS)', () => {
    it('registers a name with commit-reveal flow', async () => {
      const { controller, baseRegistrar } = await loadFixture()
      await commitAndRegister(controller, 'testname', registrantAccount)
      const tokenOwner = await baseRegistrar.read.ownerOf([
        BigInt(labelhash('testname')),
      ])
      expect(tokenOwner.toLowerCase()).toBe(
        registrantAccount.address.toLowerCase(),
      )
    })

    it('rejects registration with insufficient value', async () => {
      const { controller } = await loadFixture()
      const registration = {
        label: 'testname',
        owner: registrantAccount.address,
        duration: REGISTRATION_TIME,
        secret: zeroHash,
        resolver: zeroAddress,
        data: [],
        reverseRecord: 0,
        referrer: zeroHash,
      }
      const commitment = await controller.read.makeCommitment([registration])
      await controller.write.commit([commitment], {
        account: registrantAccount,
      })
      await testClient.increaseTime({ seconds: 601 })
      await testClient.mine({ blocks: 1 })
      await expect(
        controller.write.register([registration], {
          account: registrantAccount,
          value: 0n,
        }),
      ).toBeRevertedWithCustomError('InsufficientValue')
    })
  })

  describe('SimplexController without NFT gate (.simplex config)', () => {
    async function noGateFixture() {
      const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])
      const baseRegistrar = await connection.viem.deployContract(
        'BaseRegistrarImplementation',
        [ensRegistry.address, namehash('simplex')],
      )
      const reverseRegistrar = await connection.viem.deployContract(
        'ReverseRegistrar',
        [ensRegistry.address],
      )
      const defaultReverseRegistrar = await connection.viem.deployContract(
        'DefaultReverseRegistrar',
        [],
      )

      await ensRegistry.write.setSubnodeOwner([
        zeroHash,
        labelhash('reverse'),
        ownerAccount.address,
      ])
      await ensRegistry.write.setSubnodeOwner([
        namehash('reverse'),
        labelhash('addr'),
        reverseRegistrar.address,
      ])
      await ensRegistry.write.setSubnodeOwner([
        zeroHash,
        labelhash('simplex'),
        baseRegistrar.address,
      ])

      const dummyOracle = await connection.viem.deployContract('DummyOracle', [
        100000000n,
      ])
      const priceOracle = await connection.viem.deployContract(
        'StablePriceOracle',
        [dummyOracle.address, [0n, 0n, 4n, 2n, 1n]],
      )

      const { controller } = await deploySimplexControllerProxy({
        base: baseRegistrar.address,
        prices: priceOracle.address,
        minCommitmentAge: 600n,
        maxCommitmentAge: 86400n,
        reverseRegistrar: reverseRegistrar.address,
        defaultReverseRegistrar: defaultReverseRegistrar.address,
        ens: ensRegistry.address,
        config: {
          tldNode: namehash('simplex'),
          tldSuffix: '.simplex',
          minCharLength: 6,
          smpxNft: zeroAddress,
          nftGateEnabled: false,
        },
        ownerAddress: ownerAccount.address,
      })

      await baseRegistrar.write.addController([controller.address])
      await reverseRegistrar.write.setController([controller.address, true])
      await defaultReverseRegistrar.write.setController([
        controller.address,
        true,
      ])

      return { controller, baseRegistrar }
    }

    const loadNoGateFixture = async () =>
      connection.networkHelpers.loadFixture(noGateFixture)

    it('allows anyone to register without NFT', async () => {
      const { controller } = await loadNoGateFixture()
      await commitAndRegister(controller, 'anyone', otherAccount)
    })

    it('still enforces minCharLength', async () => {
      const { controller } = await loadNoGateFixture()
      const registration = {
        label: 'short',
        owner: otherAccount.address,
        duration: REGISTRATION_TIME,
        secret: zeroHash,
        resolver: zeroAddress,
        data: [],
        reverseRecord: 0,
        referrer: zeroHash,
      }
      const commitment = await controller.read.makeCommitment([registration])
      await controller.write.commit([commitment], { account: otherAccount })
      await testClient.increaseTime({ seconds: 601 })
      await testClient.mine({ blocks: 1 })
      const price = await controller.read.rentPrice([
        'short',
        REGISTRATION_TIME,
      ])
      await expect(
        controller.write.register([registration], {
          account: otherAccount,
          value: price.base + price.premium,
        }),
      ).toBeRevertedWithCustomError('NameTooShort')
    })
  })

  describe('UUPS upgradeability', () => {
    it('re-initializing the proxy reverts', async () => {
      const { controller, baseRegistrar, priceOracle, reverseRegistrar, defaultReverseRegistrar, ensRegistry, mockNft } =
        await loadFixture()
      await expect(
        controller.write.initialize(
          [
            baseRegistrar.address,
            priceOracle.address,
            600n,
            86400n,
            reverseRegistrar.address,
            defaultReverseRegistrar.address,
            ensRegistry.address,
            {
              tldNode: namehash('testing'),
              tldSuffix: '.testing',
              minCharLength: 6,
              smpxNft: mockNft.address,
              nftGateEnabled: true,
            },
            ownerAccount.address,
          ],
          { account: otherAccount },
        ),
      ).toBeRevertedWithString('Initializable: contract is already initialized')
    })

    it('implementation contract cannot be initialized directly', async () => {
      const { implementation, baseRegistrar, priceOracle, reverseRegistrar, defaultReverseRegistrar, ensRegistry, mockNft } =
        await loadFixture()
      // The constructor of SimplexController calls _disableInitializers().
      // Anyone calling initialize() on the implementation directly must revert.
      await expect(
        implementation.write.initialize(
          [
            baseRegistrar.address,
            priceOracle.address,
            600n,
            86400n,
            reverseRegistrar.address,
            defaultReverseRegistrar.address,
            ensRegistry.address,
            {
              tldNode: namehash('testing'),
              tldSuffix: '.testing',
              minCharLength: 6,
              smpxNft: mockNft.address,
              nftGateEnabled: true,
            },
            otherAccount.address,
          ],
          { account: otherAccount },
        ),
      ).toBeRevertedWithString('Initializable: contract is already initialized')
    })

    it('non-owner cannot upgrade the proxy', async () => {
      const { controller } = await loadFixture()
      const newImpl = await connection.viem.deployContract(
        'SimplexController',
        [],
      )
      await expect(
        controller.write.upgradeTo([newImpl.address], {
          account: registrantAccount,
        }),
      ).toBeRevertedWithString('Ownable: caller is not the owner')
    })

    it('owner can upgrade and storage is preserved', async () => {
      const { controller } = await loadFixture()
      // Mutate some state through the proxy to prove it survives the upgrade.
      await controller.write.setMinCharLength([5], { account: ownerAccount })
      await controller.write.addReservedName(['preserveme'], {
        account: ownerAccount,
      })

      const newImpl = await connection.viem.deployContract(
        'SimplexController',
        [],
      )
      await controller.write.upgradeTo([newImpl.address], {
        account: ownerAccount,
      })

      expect(await controller.read.minCharLength()).toBe(5)
      expect(
        await controller.read.reservedNames([
          labelhash('preserveme'),
        ]),
      ).toBe(true)
    })

    it('upgraded controller can still register names', async () => {
      const { controller } = await loadFixture()
      const newImpl = await connection.viem.deployContract(
        'SimplexController',
        [],
      )
      await controller.write.upgradeTo([newImpl.address], {
        account: ownerAccount,
      })
      await commitAndRegister(controller, 'postupgrade', registrantAccount)
    })

    it('initial owner is the address passed to initialize, not the deployer', async () => {
      const { controller } = await loadFixture()
      expect((await controller.read.owner()).toLowerCase()).toBe(
        ownerAccount.address.toLowerCase(),
      )
    })
  })

  describe('Refund / withdraw to smart-contract receiver (M-1)', () => {
    it('withdraw succeeds when owner is a contract with a non-trivial fallback', async () => {
      const { controller, baseRegistrar, priceOracle, reverseRegistrar, defaultReverseRegistrar, ensRegistry, mockNft } =
        await loadFixture()

      // Build a fresh proxy whose owner is a contract whose receive()
      // does an SSTORE (>2300 gas). The earlier `.transfer()` would
      // have reverted; the `.call{value:}` form must succeed.
      const gasHog = await connection.viem.deployContract('GasHogReceiver', [])
      const { controller: gasHogOwnedController } = await deploySimplexControllerProxy({
        base: baseRegistrar.address,
        prices: priceOracle.address,
        minCommitmentAge: 600n,
        maxCommitmentAge: 86400n,
        reverseRegistrar: reverseRegistrar.address,
        defaultReverseRegistrar: defaultReverseRegistrar.address,
        ens: ensRegistry.address,
        config: {
          tldNode: namehash('testing'),
          tldSuffix: '.testing',
          minCharLength: 6,
          smpxNft: mockNft.address,
          nftGateEnabled: true,
        },
        ownerAddress: gasHog.address,
      })

      // Seed the controller with some balance; anyone may trigger withdraw.
      await testClient.setBalance({
        address: gasHogOwnedController.address,
        value: 1_000_000_000_000_000_000n,
      })

      await gasHogOwnedController.write.withdraw([], {
        account: registrantAccount,
      })

      expect(await gasHog.read.lastReceived()).toBeGreaterThan(0n)
    })

    it('register refund succeeds when caller is a contract with a non-trivial fallback', async () => {
      const { controller, mockNft } = await loadFixture()
      const gasHog = await connection.viem.deployContract('GasHogReceiver', [])
      // Mint NFT to the gas-hog contract so it passes the gate.
      await mockNft.write.mint([gasHog.address])

      // Have the gas-hog send a register tx by impersonating it via
      // setBalance + setCode trick — viem testClient supports impersonation.
      await testClient.impersonateAccount({ address: gasHog.address })
      await testClient.setBalance({
        address: gasHog.address,
        value: 10_000_000_000_000_000_000n,
      })

      const registration = {
        label: 'refunde',
        owner: gasHog.address,
        duration: REGISTRATION_TIME,
        secret: zeroHash,
        resolver: zeroAddress,
        data: [],
        reverseRecord: 0,
        referrer: zeroHash,
      }
      const commitment = await controller.read.makeCommitment([registration])
      await controller.write.commit([commitment], { account: gasHog.address })
      await testClient.increaseTime({ seconds: 601 })
      await testClient.mine({ blocks: 1 })
      const price = await controller.read.rentPrice(['refunde', REGISTRATION_TIME])
      // Send 10x the price; the controller must refund the excess via .call.
      await controller.write.register([registration], {
        account: gasHog.address,
        value: (price.base + price.premium) * 10n,
      })

      expect(await gasHog.read.lastReceived()).toBeGreaterThan(0n)
    })
  })

  describe('registerReserved access checks (M-2)', () => {
    it('reverts when the name is not in reservedNames', async () => {
      const { controller } = await loadFixture()
      await expect(
        controller.write.registerReserved(
          ['unreservedname', registrantAccount.address, REGISTRATION_TIME],
          { account: ownerAccount },
        ),
      ).toBeRevertedWithCustomError('NameNotReserved')
    })

    it('reverts when duration is below MIN_REGISTRATION_DURATION', async () => {
      const { controller } = await loadFixture()
      await controller.write.addReservedName(['shortdur'], {
        account: ownerAccount,
      })
      await expect(
        controller.write.registerReserved(
          ['shortdur', registrantAccount.address, 1n],
          { account: ownerAccount },
        ),
      ).toBeRevertedWithCustomError('DurationTooShort')
    })

    it('reverts for non-owner caller', async () => {
      const { controller } = await loadFixture()
      await controller.write.addReservedName(['acl'], { account: ownerAccount })
      await expect(
        controller.write.registerReserved(
          ['acl', registrantAccount.address, REGISTRATION_TIME],
          { account: registrantAccount },
        ),
      ).toBeRevertedWithString('Ownable: caller is not the owner')
    })
  })
})
