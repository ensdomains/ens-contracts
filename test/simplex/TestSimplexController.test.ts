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
      await controller.write.addReservedNames([['simplex']], {
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
      await controller.write.addReservedNames([['testname']], {
        account: ownerAccount,
      })
      await controller.write.removeReservedNames([['testname']], {
        account: ownerAccount,
      })
      await commitAndRegister(controller, 'testname', registrantAccount)
    })

    it('admin can register reserved name via registerReserved', async () => {
      const { controller, baseRegistrar } = await loadFixture()
      await controller.write.addReservedNames([['simplex']], {
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
        controller.write.addReservedNames([['simplex']], {
          account: registrantAccount,
        }),
      ).toBeRevertedWithString('Ownable: caller is not the owner')
    })

    it('reserves and unreserves many names in a single transaction', async () => {
      const { controller } = await loadFixture()
      const labels = ['alpha', 'bravo', 'charlie', 'delta', 'echo']
      const { keccak256, toBytes } = await import('viem')
      await controller.write.addReservedNames([labels], {
        account: ownerAccount,
      })
      for (const l of labels) {
        expect(
          await controller.read.reservedNames([keccak256(toBytes(l))]),
        ).toBe(true)
      }
      await controller.write.removeReservedNames([labels], {
        account: ownerAccount,
      })
      for (const l of labels) {
        expect(
          await controller.read.reservedNames([keccak256(toBytes(l))]),
        ).toBe(false)
      }
    })

    it('empty bulk-add is a no-op (does not revert)', async () => {
      const { controller } = await loadFixture()
      await controller.write.addReservedNames([[]], {
        account: ownerAccount,
      })
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
      await controller.write.addReservedNames([['preserveme']], {
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
      await controller.write.addReservedNames([['shortdur']], {
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
      await controller.write.addReservedNames([['acl']], { account: ownerAccount })
      await expect(
        controller.write.registerReserved(
          ['acl', registrantAccount.address, REGISTRATION_TIME],
          { account: registrantAccount },
        ),
      ).toBeRevertedWithString('Ownable: caller is not the owner')
    })
  })

  describe('Two-step ownership transfer (L-1)', () => {
    it('transferOwnership sets pendingOwner without changing owner', async () => {
      const { controller } = await loadFixture()
      await controller.write.transferOwnership([registrantAccount.address], {
        account: ownerAccount,
      })
      expect((await controller.read.owner()).toLowerCase()).toBe(
        ownerAccount.address.toLowerCase(),
      )
      expect((await controller.read.pendingOwner()).toLowerCase()).toBe(
        registrantAccount.address.toLowerCase(),
      )
    })

    it('acceptOwnership by pending owner completes the transfer', async () => {
      const { controller } = await loadFixture()
      await controller.write.transferOwnership([registrantAccount.address], {
        account: ownerAccount,
      })
      await controller.write.acceptOwnership([], { account: registrantAccount })
      expect((await controller.read.owner()).toLowerCase()).toBe(
        registrantAccount.address.toLowerCase(),
      )
    })

    it('acceptOwnership reverts when called by a non-pending account', async () => {
      const { controller } = await loadFixture()
      await controller.write.transferOwnership([registrantAccount.address], {
        account: ownerAccount,
      })
      await expect(
        controller.write.acceptOwnership([], { account: otherAccount }),
      ).toBeRevertedWithString('Ownable2Step: caller is not the new owner')
    })

    it('old owner loses admin rights after handover is accepted', async () => {
      const { controller } = await loadFixture()
      await controller.write.transferOwnership([registrantAccount.address], {
        account: ownerAccount,
      })
      await controller.write.acceptOwnership([], { account: registrantAccount })
      await expect(
        controller.write.setMinCharLength([5], { account: ownerAccount }),
      ).toBeRevertedWithString('Ownable: caller is not the owner')
    })

    it('a typo in transferOwnership does not lose admin: original owner stays', async () => {
      const { controller } = await loadFixture()
      // simulate a fat-fingered transferOwnership: the wrong address
      // never calls acceptOwnership, so the original owner is preserved.
      await controller.write.transferOwnership([otherAccount.address], {
        account: ownerAccount,
      })
      // original owner can still administer
      await controller.write.setMinCharLength([5], { account: ownerAccount })
      expect(await controller.read.minCharLength()).toBe(5)
    })
  })

  describe('Initializer config bounds (L-3)', () => {
    it('reverts when _maxCommitmentAge exceeds 30 days', async () => {
      // 30 days + 1 second
      const tooHigh = 30n * 86400n + 1n
      const { baseRegistrar, priceOracle, reverseRegistrar, defaultReverseRegistrar, ensRegistry, mockNft } =
        await loadFixture()
      await expect(
        deploySimplexControllerProxy({
          base: baseRegistrar.address,
          prices: priceOracle.address,
          minCommitmentAge: 600n,
          maxCommitmentAge: tooHigh,
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
        }),
      ).rejects.toThrow(/MaxCommitmentAgeTooHigh/)
    })

    it('accepts _maxCommitmentAge at exactly 30 days', async () => {
      const exact = 30n * 86400n
      const { baseRegistrar, priceOracle, reverseRegistrar, defaultReverseRegistrar, ensRegistry, mockNft } =
        await loadFixture()
      const { controller } = await deploySimplexControllerProxy({
        base: baseRegistrar.address,
        prices: priceOracle.address,
        minCommitmentAge: 600n,
        maxCommitmentAge: exact,
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
      expect(await controller.read.maxCommitmentAge()).toBe(exact)
    })
  })

  describe('Price oracle admin (setPriceOracle / freezePriceOracle)', () => {
    it('owner can swap the price oracle', async () => {
      const { controller, dummyOracle } = await loadFixture()
      // Deploy a second oracle (different prices) to swap to.
      const newStable = await connection.viem.deployContract(
        'StablePriceOracle',
        [dummyOracle.address, [0n, 0n, 0n, 0n, 0n]],
      )
      await controller.write.setPriceOracle([newStable.address], {
        account: ownerAccount,
      })
      expect((await controller.read.prices()).toLowerCase()).toBe(
        newStable.address.toLowerCase(),
      )
    })

    it('rejects non-owner setPriceOracle', async () => {
      const { controller, dummyOracle } = await loadFixture()
      const newStable = await connection.viem.deployContract(
        'StablePriceOracle',
        [dummyOracle.address, [0n, 0n, 0n, 0n, 0n]],
      )
      await expect(
        controller.write.setPriceOracle([newStable.address], {
          account: registrantAccount,
        }),
      ).toBeRevertedWithString('Ownable: caller is not the owner')
    })

    it('rejects setPriceOracle with the zero address', async () => {
      const { controller } = await loadFixture()
      await expect(
        controller.write.setPriceOracle([zeroAddress], {
          account: ownerAccount,
        }),
      ).toBeRevertedWithCustomError('ZeroAddress')
    })

    it('owner can freeze the price oracle (one-way)', async () => {
      const { controller } = await loadFixture()
      expect(await controller.read.priceOracleFrozen()).toBe(false)
      await controller.write.freezePriceOracle([], { account: ownerAccount })
      expect(await controller.read.priceOracleFrozen()).toBe(true)
    })

    it('rejects non-owner freezePriceOracle', async () => {
      const { controller } = await loadFixture()
      await expect(
        controller.write.freezePriceOracle([], { account: registrantAccount }),
      ).toBeRevertedWithString('Ownable: caller is not the owner')
    })

    it('setPriceOracle reverts after freeze', async () => {
      const { controller, dummyOracle } = await loadFixture()
      await controller.write.freezePriceOracle([], { account: ownerAccount })
      const newStable = await connection.viem.deployContract(
        'StablePriceOracle',
        [dummyOracle.address, [0n, 0n, 0n, 0n, 0n]],
      )
      await expect(
        controller.write.setPriceOracle([newStable.address], {
          account: ownerAccount,
        }),
      ).toBeRevertedWithCustomError('PriceOracleAlreadyFrozen')
    })

    it('double-freeze reverts', async () => {
      const { controller } = await loadFixture()
      await controller.write.freezePriceOracle([], { account: ownerAccount })
      await expect(
        controller.write.freezePriceOracle([], { account: ownerAccount }),
      ).toBeRevertedWithCustomError('PriceOracleAlreadyFrozen')
    })

    it('registration uses the new oracle after a swap', async () => {
      const { controller, dummyOracle } = await loadFixture()
      // Swap to a zero-price oracle. Registration should then succeed with
      // value=0 (the controller refuses msg.value < totalPrice; totalPrice=0
      // means anything passes).
      const freeOracle = await connection.viem.deployContract(
        'StablePriceOracle',
        [dummyOracle.address, [0n, 0n, 0n, 0n, 0n]],
      )
      await controller.write.setPriceOracle([freeOracle.address], {
        account: ownerAccount,
      })

      const registration = {
        label: 'freelb',
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
      await controller.write.register([registration], {
        account: registrantAccount,
        value: 0n,
      })
    })
  })

  describe('Reentrancy guard', () => {
    // A registration whose resolver is the malicious contract and whose `data`
    // is non-empty, so `register` invokes `multicallWithNodeCheck` (the re-entry
    // point) while the nonReentrant lock is held.
    const attackRegistration = (resolver: `0x${string}`) => ({
      label: 'reentrancytest',
      owner: registrantAccount.address,
      duration: REGISTRATION_TIME,
      secret: zeroHash,
      resolver,
      data: ['0x12345678' as `0x${string}`],
      reverseRecord: 0,
      referrer: zeroHash,
    })

    for (const [name, mode] of [
      ['register', 0],
      ['commit', 1],
      ['withdraw', 2],
    ] as const) {
      it(`reverts when the resolver re-enters ${name} during register`, async () => {
        const { controller } = await loadFixture()
        const attacker = await connection.viem.deployContract(
          'ReentrantResolver',
          [controller.address],
        )
        await attacker.write.setMode([mode])

        const registration = attackRegistration(attacker.address)
        const commitment = await controller.read.makeCommitment([registration])
        await controller.write.commit([commitment], { account: registrantAccount })
        await testClient.increaseTime({ seconds: 601 })
        await testClient.mine({ blocks: 1 })
        const price = await controller.read.rentPrice([
          registration.label,
          REGISTRATION_TIME,
        ])

        await expect(
          controller.write.register([registration], {
            account: registrantAccount,
            value: price.base + price.premium,
          }),
        ).toBeRevertedWithCustomError('ReentrantCall')
      })
    }

    it('still allows a normal (non-reentrant) registration', async () => {
      const { controller } = await loadFixture()
      await commitAndRegister(controller, 'normalname', registrantAccount)
      expect(
        await controller.read.makeCommitment([
          {
            label: 'normalname',
            owner: registrantAccount.address,
            duration: REGISTRATION_TIME,
            secret: zeroHash,
            resolver: zeroAddress,
            data: [],
            reverseRecord: 0,
            referrer: zeroHash,
          },
        ]),
      ).toBeDefined()
    })
  })

  // ------------------------------------------------------------------
  // Issue #9: expanded branch / lifecycle coverage.
  // ------------------------------------------------------------------

  const mkReg = (over: Record<string, any> = {}) => ({
    label: 'coveragename',
    owner: registrantAccount.address,
    duration: REGISTRATION_TIME,
    secret: zeroHash,
    resolver: zeroAddress as `0x${string}`,
    data: [] as `0x${string}`[],
    reverseRecord: 0,
    referrer: zeroHash,
    ...over,
  })

  const commitWait = async (
    controller: any,
    registration: any,
    account = registrantAccount,
  ) => {
    const commitment = await controller.read.makeCommitment([registration])
    await controller.write.commit([commitment], { account })
    await testClient.increaseTime({ seconds: 601 })
    await testClient.mine({ blocks: 1 })
    return commitment
  }

  const totalPrice = async (
    controller: any,
    label: string,
    duration = REGISTRATION_TIME,
  ) => {
    const p = await controller.read.rentPrice([label, duration])
    return p.base + p.premium
  }

  const deployPublicResolver = async (
    controller: any,
    ensRegistry: any,
    reverseRegistrar: any,
  ) =>
    connection.viem.deployContract('PublicResolver', [
      ensRegistry.address,
      zeroAddress,
      controller.address, // trustedETHController — lets the controller write records
      reverseRegistrar.address,
    ])

  describe('Commit-reveal error branches', () => {
    it('register reverts CommitmentNotFound when no commitment exists', async () => {
      const { controller } = await loadFixture()
      const registration = mkReg({ label: 'nocommit' })
      await expect(
        controller.write.register([registration], {
          account: registrantAccount,
          value: await totalPrice(controller, 'nocommit'),
        }),
      ).toBeRevertedWithCustomError('CommitmentNotFound')
    })

    it('register reverts CommitmentTooNew before minCommitmentAge', async () => {
      const { controller } = await loadFixture()
      const registration = mkReg({ label: 'toonew' })
      const commitment = await controller.read.makeCommitment([registration])
      await controller.write.commit([commitment], { account: registrantAccount })
      await expect(
        controller.write.register([registration], {
          account: registrantAccount,
          value: await totalPrice(controller, 'toonew'),
        }),
      ).toBeRevertedWithCustomError('CommitmentTooNew')
    })

    it('register reverts CommitmentTooOld after maxCommitmentAge', async () => {
      const { controller } = await loadFixture()
      const registration = mkReg({ label: 'tooold' })
      const commitment = await controller.read.makeCommitment([registration])
      await controller.write.commit([commitment], { account: registrantAccount })
      await testClient.increaseTime({ seconds: 86401 }) // > maxCommitmentAge (86400)
      await testClient.mine({ blocks: 1 })
      await expect(
        controller.write.register([registration], {
          account: registrantAccount,
          value: await totalPrice(controller, 'tooold'),
        }),
      ).toBeRevertedWithCustomError('CommitmentTooOld')
    })

    it('commit reverts UnexpiredCommitmentExists on a duplicate commit', async () => {
      const { controller } = await loadFixture()
      const commitment = await controller.read.makeCommitment([mkReg({ label: 'dup' })])
      await controller.write.commit([commitment], { account: registrantAccount })
      await expect(
        controller.write.commit([commitment], { account: registrantAccount }),
      ).toBeRevertedWithCustomError('UnexpiredCommitmentExists')
    })

    it('deletes the commitment after a successful register (replay protection)', async () => {
      const { controller } = await loadFixture()
      const registration = mkReg({ label: 'deleted' })
      const commitment = await commitWait(controller, registration)
      await controller.write.register([registration], {
        account: registrantAccount,
        value: await totalPrice(controller, 'deleted'),
      })
      expect(await controller.read.commitments([commitment])).toBe(0n)
    })
  })

  describe('Resolver / record-write branch', () => {
    it('makeCommitment reverts ResolverRequiredWhenDataSupplied (data, no resolver)', async () => {
      const { controller } = await loadFixture()
      await expect(
        controller.read.makeCommitment([mkReg({ data: ['0x12345678'] })]),
      ).toBeRevertedWithCustomError('ResolverRequiredWhenDataSupplied')
    })

    it('makeCommitment reverts ResolverRequiredForReverseRecord (reverseRecord, no resolver)', async () => {
      const { controller } = await loadFixture()
      await expect(
        controller.read.makeCommitment([mkReg({ reverseRecord: 1 })]),
      ).toBeRevertedWithCustomError('ResolverRequiredForReverseRecord')
    })

    it('registers with a resolver and empty data (sets the resolver in the registry)', async () => {
      const { controller, ensRegistry, reverseRegistrar } = await loadFixture()
      const resolver = await deployPublicResolver(controller, ensRegistry, reverseRegistrar)
      const registration = mkReg({ label: 'resolvonly', resolver: resolver.address })
      await commitWait(controller, registration)
      await controller.write.register([registration], {
        account: registrantAccount,
        value: await totalPrice(controller, 'resolvonly'),
      })
      const node = namehash('resolvonly.testing')
      expect((await ensRegistry.read.resolver([node])).toLowerCase()).toBe(
        resolver.address.toLowerCase(),
      )
      expect((await ensRegistry.read.owner([node])).toLowerCase()).toBe(
        registrantAccount.address.toLowerCase(),
      )
    })

    it('registers with a resolver and writes a record via multicallWithNodeCheck', async () => {
      const { controller, ensRegistry, reverseRegistrar } = await loadFixture()
      const resolver = await deployPublicResolver(controller, ensRegistry, reverseRegistrar)
      const node = namehash('resolvdata.testing')
      const { encodeFunctionData } = await import('viem')
      const setAddrAbi = [
        {
          type: 'function',
          name: 'setAddr',
          stateMutability: 'nonpayable',
          inputs: [{ type: 'bytes32' }, { type: 'address' }],
          outputs: [],
        },
      ] as const
      const addrAbi = [
        {
          type: 'function',
          name: 'addr',
          stateMutability: 'view',
          inputs: [{ type: 'bytes32' }],
          outputs: [{ type: 'address' }],
        },
      ] as const
      const data = encodeFunctionData({
        abi: setAddrAbi,
        functionName: 'setAddr',
        args: [node, registrantAccount.address],
      })
      const registration = mkReg({ label: 'resolvdata', resolver: resolver.address, data: [data] })
      await commitWait(controller, registration)
      await controller.write.register([registration], {
        account: registrantAccount,
        value: await totalPrice(controller, 'resolvdata'),
      })
      const stored = (await publicClient.readContract({
        address: resolver.address,
        abi: addrAbi,
        functionName: 'addr',
        args: [node],
      })) as string
      expect(stored.toLowerCase()).toBe(registrantAccount.address.toLowerCase())
    })

    for (const [name, bit] of [
      ['ETHEREUM', 1],
      ['DEFAULT', 2],
      ['both', 3],
    ] as const) {
      it(`registers with reverseRecord ${name} bit set`, async () => {
        const { controller, ensRegistry, reverseRegistrar } = await loadFixture()
        const resolver = await deployPublicResolver(controller, ensRegistry, reverseRegistrar)
        const label = `rev${bit}name`
        const registration = mkReg({
          label,
          resolver: resolver.address,
          reverseRecord: bit,
        })
        await commitWait(controller, registration)
        await controller.write.register([registration], {
          account: registrantAccount,
          value: await totalPrice(controller, label),
        })
        // Register completed past the reverse-record branch → forward record set.
        expect((await ensRegistry.read.owner([namehash(`${label}.testing`)])).toLowerCase()).toBe(
          registrantAccount.address.toLowerCase(),
        )
      })
    }
  })

  describe('Renew', () => {
    it('renews a name and extends its expiry', async () => {
      const { controller, baseRegistrar } = await loadFixture()
      await commitAndRegister(controller, 'renewme', registrantAccount)
      const id = BigInt(labelhash('renewme'))
      const before = await baseRegistrar.read.nameExpires([id])
      const price = await controller.read.rentPrice(['renewme', REGISTRATION_TIME])
      await controller.write.renew(['renewme', REGISTRATION_TIME, zeroHash], {
        account: registrantAccount,
        value: price.base,
      })
      expect((await baseRegistrar.read.nameExpires([id])) > before).toBe(true)
    })

    it('renew reverts InsufficientValue when underpaid', async () => {
      const { controller } = await loadFixture()
      await commitAndRegister(controller, 'renewpoor', registrantAccount)
      const price = await controller.read.rentPrice(['renewpoor', REGISTRATION_TIME])
      await expect(
        controller.write.renew(['renewpoor', REGISTRATION_TIME, zeroHash], {
          account: registrantAccount,
          value: price.base > 0n ? price.base - 1n : 0n,
        }),
      ).toBeRevertedWithCustomError('InsufficientValue')
    })

    it('renews a name during the grace period', async () => {
      const { controller, baseRegistrar } = await loadFixture()
      await commitAndRegister(controller, 'graceful', registrantAccount)
      const id = BigInt(labelhash('graceful'))
      const before = await baseRegistrar.read.nameExpires([id])
      await testClient.increaseTime({ seconds: Number(REGISTRATION_TIME) + Number(DAY) })
      await testClient.mine({ blocks: 1 })
      const price = await controller.read.rentPrice(['graceful', REGISTRATION_TIME])
      await controller.write.renew(['graceful', REGISTRATION_TIME, zeroHash], {
        account: registrantAccount,
        value: price.base,
      })
      expect((await baseRegistrar.read.nameExpires([id])) > before).toBe(true)
    })

    it('refunds excess value on renew', async () => {
      const { controller } = await loadFixture()
      await commitAndRegister(controller, 'renewexcess', registrantAccount)
      const balBefore = await publicClient.getBalance({ address: controller.address })
      const price = await controller.read.rentPrice(['renewexcess', REGISTRATION_TIME])
      await controller.write.renew(['renewexcess', REGISTRATION_TIME, zeroHash], {
        account: registrantAccount,
        value: price.base + 12345n,
      })
      const balAfter = await publicClient.getBalance({ address: controller.address })
      expect(balAfter - balBefore).toBe(price.base)
    })

    it('renew bypasses the gates (works on a now-reserved name)', async () => {
      const { controller, baseRegistrar } = await loadFixture()
      await commitAndRegister(controller, 'reservedrenew', registrantAccount)
      await controller.write.addReservedNames([['reservedrenew']], { account: ownerAccount })
      const id = BigInt(labelhash('reservedrenew'))
      const before = await baseRegistrar.read.nameExpires([id])
      const price = await controller.read.rentPrice(['reservedrenew', REGISTRATION_TIME])
      await controller.write.renew(['reservedrenew', REGISTRATION_TIME, zeroHash], {
        account: registrantAccount,
        value: price.base,
      })
      expect((await baseRegistrar.read.nameExpires([id])) > before).toBe(true)
    })
  })

  describe('Misc branch coverage', () => {
    it('refunds excess value on register', async () => {
      const { controller } = await loadFixture()
      const registration = mkReg({ label: 'regexcess' })
      await commitWait(controller, registration)
      const total = await totalPrice(controller, 'regexcess')
      await controller.write.register([registration], {
        account: registrantAccount,
        value: total + 99999n,
      })
      expect(await publicClient.getBalance({ address: controller.address })).toBe(total)
    })

    it('withdraw succeeds with a zero balance', async () => {
      const { controller } = await loadFixture()
      expect(await publicClient.getBalance({ address: controller.address })).toBe(0n)
      await controller.write.withdraw({ account: ownerAccount })
      expect(await publicClient.getBalance({ address: controller.address })).toBe(0n)
    })

    it('rejects non-owner removeReservedNames', async () => {
      const { controller } = await loadFixture()
      await expect(
        controller.write.removeReservedNames([['simplex']], { account: registrantAccount }),
      ).toBeRevertedWithString('Ownable: caller is not the owner')
    })

    it('renounceOwnership leaves no owner and locks admin functions', async () => {
      const { controller } = await loadFixture()
      await controller.write.renounceOwnership({ account: ownerAccount })
      expect((await controller.read.owner()).toLowerCase()).toBe(zeroAddress)
      await expect(
        controller.write.setMinCharLength([5], { account: ownerAccount }),
      ).toBeRevertedWithString('Ownable: caller is not the owner')
    })

    it('supportsInterface: ERC-165 + IETHRegistrarController true, unknown false', async () => {
      const { controller } = await loadFixture()
      const { toFunctionSelector } = await import('viem')
      const sigs = [
        'rentPrice(string,uint256)',
        'available(string)',
        'makeCommitment((string,address,uint256,bytes32,address,bytes[],uint8,bytes32))',
        'commit(bytes32)',
        'register((string,address,uint256,bytes32,address,bytes[],uint8,bytes32))',
        'renew(string,uint256,bytes32)',
      ]
      let acc = 0n
      for (const s of sigs) acc ^= BigInt(toFunctionSelector(s))
      const controllerId = ('0x' + acc.toString(16).padStart(8, '0')) as `0x${string}`
      expect(await controller.read.supportsInterface([controllerId])).toBe(true)
      expect(await controller.read.supportsInterface(['0x01ffc9a7'])).toBe(true) // ERC-165
      expect(await controller.read.supportsInterface(['0xffffffff'])).toBe(false)
    })
  })

  describe('Premium pricing (ExponentialPremiumPriceOracle)', () => {
    it('charges a premium for a recently-expired name', async () => {
      const { controller, dummyOracle } = await loadFixture()
      const premiumOracle = await connection.viem.deployContract(
        'ExponentialPremiumPriceOracle',
        [dummyOracle.address, [0n, 0n, 4n, 2n, 1n], 100000000000000000000000000n, 21n],
      )
      await controller.write.setPriceOracle([premiumOracle.address], { account: ownerAccount })
      await commitAndRegister(controller, 'premiumname', registrantAccount)
      await testClient.increaseTime({
        seconds: Number(REGISTRATION_TIME) + Number(GRACE_PERIOD) + 60,
      })
      await testClient.mine({ blocks: 1 })
      const price = await controller.read.rentPrice(['premiumname', REGISTRATION_TIME])
      expect(price.premium > 0n).toBe(true)
    })
  })

  // NameWrapper integration. FINDING: the verbatim ENS NameWrapper hardcodes
  // ETH_NODE = namehash('eth'); `wrapETH2LD` / `_wrapETH2LD` always derive the
  // wrapped node from ETH_NODE and DNS-encode "\x03eth\x00". The SNRC
  // BaseRegistrar keys tokens by labelhash (TLD-agnostic), so a `.testing` 2LD
  // CAN be fed into wrapETH2LD — but it is wrapped under the WRONG node
  // (`label.eth`), not `label.testing`. These tests pin that broken behaviour
  // so a future TLD-parameterised NameWrapper can flip them. See the issue.
  describe('Branch gap-fill (full coverage)', () => {
    const depsFrom = (f: any) => ({
      base: f.baseRegistrar.address,
      prices: f.priceOracle.address,
      minCommitmentAge: 600n,
      maxCommitmentAge: 86400n,
      reverseRegistrar: f.reverseRegistrar.address,
      defaultReverseRegistrar: f.defaultReverseRegistrar.address,
      ens: f.ensRegistry.address,
      config: {
        tldNode: namehash('testing'),
        tldSuffix: '.testing',
        minCharLength: 6,
        smpxNft: f.mockNft.address,
        nftGateEnabled: true,
      },
      ownerAddress: ownerAccount.address,
    })

    it('initialize reverts MaxCommitmentAgeTooLow when max <= min', async () => {
      const f = await loadFixture()
      await expect(
        deploySimplexControllerProxy({
          ...depsFrom(f),
          minCommitmentAge: 600n,
          maxCommitmentAge: 600n, // max <= min
        }),
      ).rejects.toThrow()
    })

    it('makeCommitment reverts DurationTooShort below MIN_REGISTRATION_DURATION', async () => {
      const { controller } = await loadFixture()
      await expect(
        controller.read.makeCommitment([mkReg({ duration: 1n })]),
      ).toBeRevertedWithCustomError('DurationTooShort')
    })

    it('register reverts NameNotAvailable for an already-registered name', async () => {
      const { controller } = await loadFixture()
      await commitAndRegister(controller, 'takenname', registrantAccount)
      const registration = mkReg({ label: 'takenname' })
      await commitWait(controller, registration)
      await expect(
        controller.write.register([registration], {
          account: registrantAccount,
          value: await totalPrice(controller, 'takenname'),
        }),
      ).toBeRevertedWithCustomError('NameNotAvailable')
    })

    it('owner can recover ERC-20 tokens sent to the contract by mistake', async () => {
      const { controller } = await loadFixture()
      const token = await connection.viem.deployContract('MockERC20', [
        'Token',
        'TKN',
        [controller.address],
      ])
      const bal = await token.read.balanceOf([controller.address])
      expect(bal > 0n).toBe(true)
      await controller.write.recoverFunds([token.address, registrantAccount.address, bal], {
        account: ownerAccount,
      })
      expect(await token.read.balanceOf([registrantAccount.address])).toBe(bal)
      expect(await token.read.balanceOf([controller.address])).toBe(0n)
    })

    it('rejects non-owner recoverFunds', async () => {
      const { controller } = await loadFixture()
      const token = await connection.viem.deployContract('MockERC20', ['Token', 'TKN', []])
      await expect(
        controller.write.recoverFunds([token.address, registrantAccount.address, 1n], {
          account: registrantAccount,
        }),
      ).toBeRevertedWithString('Ownable: caller is not the owner')
    })

    it('withdraw reverts TransferFailed when the owner rejects ETH', async () => {
      const f = await loadFixture()
      const rejecter = await connection.viem.deployContract('RejectEther', [])
      const { controller } = await deploySimplexControllerProxy({
        ...depsFrom(f),
        ownerAddress: rejecter.address,
      })
      await testClient.setBalance({
        address: controller.address,
        value: 1_000_000_000_000_000_000n,
      })
      await expect(
        controller.write.withdraw({ account: registrantAccount }),
      ).toBeRevertedWithCustomError('TransferFailed')
    })

    it('register reverts TransferFailed when the refund recipient rejects ETH', async () => {
      const { controller, mockNft } = await loadFixture()
      const rejecter = await connection.viem.deployContract('RejectEther', [])
      await mockNft.write.mint([rejecter.address])
      await testClient.impersonateAccount({ address: rejecter.address })
      await testClient.setBalance({
        address: rejecter.address,
        value: 10_000_000_000_000_000_000n,
      })
      const registration = mkReg({ label: 'refundfail', owner: rejecter.address })
      const commitment = await controller.read.makeCommitment([registration])
      await controller.write.commit([commitment], { account: rejecter.address })
      await testClient.increaseTime({ seconds: 601 })
      await testClient.mine({ blocks: 1 })
      const total = await totalPrice(controller, 'refundfail')
      await expect(
        controller.write.register([registration], {
          account: rejecter.address,
          value: total + 1_000_000n, // excess → refund fails
        }),
      ).toBeRevertedWithCustomError('TransferFailed')
    })

    it('renew reverts TransferFailed when the refund recipient rejects ETH', async () => {
      const { controller, mockNft } = await loadFixture()
      const rejecter = await connection.viem.deployContract('RejectEther', [])
      await mockNft.write.mint([rejecter.address])
      await testClient.impersonateAccount({ address: rejecter.address })
      await testClient.setBalance({
        address: rejecter.address,
        value: 10_000_000_000_000_000_000n,
      })
      const registration = mkReg({ label: 'renewfail', owner: rejecter.address })
      const commitment = await controller.read.makeCommitment([registration])
      await controller.write.commit([commitment], { account: rejecter.address })
      await testClient.increaseTime({ seconds: 601 })
      await testClient.mine({ blocks: 1 })
      const total = await totalPrice(controller, 'renewfail')
      await controller.write.register([registration], {
        account: rejecter.address,
        value: total, // exact — no refund, so register succeeds
      })
      const price = await controller.read.rentPrice(['renewfail', REGISTRATION_TIME])
      await expect(
        controller.write.renew(['renewfail', REGISTRATION_TIME, zeroHash], {
          account: rejecter.address,
          value: price.base + 1_000_000n, // excess → refund fails
        }),
      ).toBeRevertedWithCustomError('TransferFailed')
    })
  })

  describe('NameWrapper integration (verbatim — ETH_NODE hardcoded)', () => {
    const deployWrapper = async (ensRegistry: any, baseRegistrar: any) => {
      const metadata = await connection.viem.deployContract('StaticMetadataService', [
        'https://example.com/',
      ])
      return connection.viem.deployContract('NameWrapper', [
        ensRegistry.address,
        baseRegistrar.address,
        metadata.address,
      ])
    }

    it('mis-wraps a .testing name under the .eth node (resolver omitted)', async () => {
      const { controller, ensRegistry, baseRegistrar } = await loadFixture()
      const wrapper = await deployWrapper(ensRegistry, baseRegistrar)
      await commitAndRegister(controller, 'wrapme', registrantAccount)
      await baseRegistrar.write.setApprovalForAll([wrapper.address, true], {
        account: registrantAccount,
      })
      await wrapper.write.wrapETH2LD(['wrapme', registrantAccount.address, 0, zeroAddress], {
        account: registrantAccount,
      })

      const ethNode = BigInt(namehash('wrapme.eth'))
      const testingNode = namehash('wrapme.testing')
      // The ERC-1155 was minted for `wrapme.eth`, NOT `wrapme.testing`.
      expect((await wrapper.read.ownerOf([ethNode])).toLowerCase()).toBe(
        registrantAccount.address.toLowerCase(),
      )
      expect(await wrapper.read.ownerOf([BigInt(testingNode)])).toBe(zeroAddress)
      // Meanwhile the real registry node is orphaned: owned by the wrapper but
      // with no corresponding wrapped token.
      expect((await ensRegistry.read.owner([testingNode])).toLowerCase()).toBe(
        wrapper.address.toLowerCase(),
      )
    })

    it('reverts when a resolver is supplied (wrapper not authorised for the .eth node)', async () => {
      const { controller, ensRegistry, baseRegistrar, reverseRegistrar } = await loadFixture()
      const wrapper = await deployWrapper(ensRegistry, baseRegistrar)
      const resolver = await deployPublicResolver(controller, ensRegistry, reverseRegistrar)
      await commitAndRegister(controller, 'wrapme2', registrantAccount)
      await baseRegistrar.write.setApprovalForAll([wrapper.address, true], {
        account: registrantAccount,
      })
      await expect(
        wrapper.write.wrapETH2LD(['wrapme2', registrantAccount.address, 0, resolver.address], {
          account: registrantAccount,
        }),
      ).rejects.toThrow()
    })
  })
})
