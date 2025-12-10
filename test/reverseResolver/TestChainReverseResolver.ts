import { shouldSupportInterfaces } from '@ensdomains/hardhat-chai-matchers-viem/behaviour'
import { serve } from '@namestone/ezccip/serve'
import { Gateway, UncheckedRollup } from '@unruggable/gateways'
import { BrowserProvider } from 'ethers/providers'
import hre from 'hardhat'
import { namehash, toHex, zeroAddress } from 'viem'
import { deployArtifact } from '../fixtures/deployArtifact.js'
import { deployDefaultReverseFixture } from '../fixtures/deployDefaultReverseFixture.js'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import {
  chainFromCoinType,
  COIN_TYPE_DEFAULT,
  getReverseName,
  getReverseNamespace,
} from '../fixtures/ensip19.js'
import { urgArtifact } from '../fixtures/externalArtifacts.js'
import { type KnownProfile, makeResolutions } from '../utils/resolutions.js'

const testName = 'test.eth'
const l2CoinType = COIN_TYPE_DEFAULT | 12345n // any evm chain

const connection = await hre.network.connect()
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

async function fixture() {
  const F = await deployDefaultReverseFixture(connection)
  const gateway = new Gateway(
    new UncheckedRollup(new BrowserProvider(connection.provider)),
  )
  gateway.disableCache()
  const ccip = await serve(gateway, { protocol: 'raw', log: false })
  afterAll(ccip.shutdown)
  const GatewayVM = await deployArtifact(F.walletClient, {
    file: urgArtifact('GatewayVM'),
  })
  const hooksAddress = await deployArtifact(F.walletClient, {
    file: urgArtifact('UncheckedVerifierHooks'),
  })
  const verifierGateways = [ccip.endpoint]
  const verifierAddress = await deployArtifact(F.walletClient, {
    file: urgArtifact('UncheckedVerifier'),
    args: [verifierGateways, 0, hooksAddress],
    libs: { GatewayVM },
  })
  const reverseRegistrar = await connection.viem.deployContract(
    'L2ReverseRegistrar',
    [l2CoinType],
  )
  const reverseResolver = await connection.viem.deployContract(
    'ChainReverseResolver',
    [
      F.owner,
      l2CoinType,
      F.defaultReverseRegistrar.address,
      reverseRegistrar.address,
      verifierAddress,
      [ccip.endpoint],
    ],
    {
      client: {
        public: await connection.viem.getPublicClient({ ccipRead: undefined }),
      },
    },
  )
  const reverseNamespace = getReverseNamespace(l2CoinType)
  await F.takeControl(reverseNamespace)
  await F.ensRegistry.write.setResolver([
    namehash(reverseNamespace),
    reverseResolver.address,
  ])
  return {
    ...F,
    reverseNamespace,
    reverseRegistrar,
    reverseResolver,
    gateway,
    verifierAddress,
    verifierGateways,
  }
}

describe('ChainReverseResolver', () => {
  shouldSupportInterfaces({
    contract: () => loadFixture().then((F) => F.reverseResolver),
    interfaces: [
      'IERC165',
      'IExtendedResolver',
      'INameReverser',
      'IERC7996',
      'IVerifiableResolver',
    ],
  })

  it('coinType()', async () => {
    const F = await loadFixture()
    await expect(F.reverseResolver.read.coinType()).resolves.toStrictEqual(
      l2CoinType,
    )
  })

  it('chainId()', async () => {
    const F = await loadFixture()
    await expect(F.reverseResolver.read.chainId()).resolves.toStrictEqual(
      chainFromCoinType(l2CoinType),
    )
  })

  describe('verifierMetadata()', async () => {
    it('valid', async () => {
      const F = await loadFixture()
      await expect(
        F.reverseResolver.read.verifierMetadata([
          dnsEncodeName(getReverseName(zeroAddress, l2CoinType)),
        ]),
      ).resolves.toStrictEqual([F.verifierAddress, F.verifierGateways])
    })
    it('invalid coinType', async () => {
      const F = await loadFixture()
      await expect(
        F.reverseResolver.read.verifierMetadata([
          dnsEncodeName(getReverseName(zeroAddress, ~l2CoinType)),
        ]),
      ).resolves.toStrictEqual([zeroAddress, []])
    })
    it('invalid address', async () => {
      const F = await loadFixture()
      await expect(
        F.reverseResolver.read.verifierMetadata([
          dnsEncodeName(getReverseName('0x00', l2CoinType)),
        ]),
      ).resolves.toStrictEqual([zeroAddress, []])
    })
  })

  describe('resolve()', () => {
    it('unsupported profile', async () => {
      const F = await loadFixture()
      const kp: KnownProfile = {
        name: getReverseName(F.owner),
        texts: [{ key: 'dne', value: 'abc' }],
      }
      const [res] = makeResolutions(kp)
      await expect(
        F.reverseResolver.read.resolve([dnsEncodeName(kp.name), res.call]),
      ).toBeRevertedWithCustomError('UnsupportedResolverProfile')
    })

    it('addr("{coinType}.reverse") = registrar', async () => {
      const F = await loadFixture()
      const kp: KnownProfile = {
        name: F.reverseNamespace,
        addresses: [
          { coinType: l2CoinType, value: F.reverseRegistrar.address },
          { coinType: l2CoinType + 1n, value: '0x' },
        ],
      }
      for (const res of makeResolutions(kp)) {
        res.expect(
          await F.reverseResolver.read.resolve([
            dnsEncodeName(kp.name),
            res.call,
          ]),
        )
      }
    })

    it('unset name()', async () => {
      const F = await loadFixture()
      const kp: KnownProfile = {
        name: getReverseName(F.owner, l2CoinType),
        primary: { value: '' },
      }
      const [res] = makeResolutions(kp)
      res.expect(
        await F.reverseResolver.read.resolve([
          dnsEncodeName(kp.name),
          res.call,
        ]),
      )
    })

    it('name()', async () => {
      const F = await loadFixture()
      await F.reverseRegistrar.write.setName([testName])
      const kp: KnownProfile = {
        name: getReverseName(F.owner, l2CoinType),
        primary: { value: testName },
      }
      const [res] = makeResolutions(kp)
      res.expect(
        await F.reverseResolver.read.resolve([
          dnsEncodeName(kp.name),
          res.call,
        ]),
      )
    })

    it('name() w/fallback', async () => {
      const F = await loadFixture()
      await F.defaultReverseRegistrar.write.setName([testName])
      const kp: KnownProfile = {
        name: getReverseName(F.owner, l2CoinType),
        primary: { value: testName },
      }
      const [res] = makeResolutions(kp)
      res.expect(
        await F.reverseResolver.read.resolve([
          dnsEncodeName(kp.name),
          res.call,
        ]),
      )
    })
  })

  describe('resolveNames()', () => {
    it('empty', async () => {
      const F = await loadFixture()
      await expect(
        F.reverseResolver.read.resolveNames([[]]),
      ).resolves.toStrictEqual([])
    })

    it('1 chain + 1 default + 1 unset', async () => {
      const F = await loadFixture()
      const wallets = await connection.viem.getWalletClients()
      await F.reverseRegistrar.write.setName(['A'], {
        account: wallets[0].account,
      })
      await F.defaultReverseRegistrar.write.setName(['B'], {
        account: wallets[1].account,
      })
      await expect(
        F.reverseResolver.read.resolveNames([
          wallets.slice(0, 3).map((x) => x.account.address),
        ]),
      ).resolves.toStrictEqual(['A', 'B', ''])
    })

    it('too many proofs', async () => {
      const F = await loadFixture()
      const max = 10
      try {
        F.gateway.rollup.configure = (commit) => {
          commit.prover.maxUniqueProofs = 1 + max // +1 for account proof
        }
        await expect(
          F.reverseResolver.read.resolveNames([
            Array.from({ length: max }, (_, i) => toHex(i, { size: 20 })),
          ]),
        ).resolves.toHaveLength(max)
        await expect(
          F.reverseResolver.read.resolveNames([
            Array.from({ length: max + 1 }, (_, i) => toHex(i, { size: 20 })),
          ]),
        ).toBeRevertedWithCustomError('TooManyProofs')
      } finally {
        F.gateway.rollup.configure = undefined
      }
    })

    describe('fuzz', () => {
      for (let i = 0; i < 20; i++) {
        it(`${i}`, async () => {
          const F = await loadFixture()
          const wallets = await connection.viem.getWalletClients()
          wallets.sort(() => Math.random() - 0.5)
          const names = wallets.map((_, i) => 'x'.repeat(i + 1))
          const exists = wallets.map(() => Math.random() < 0.5)
          for (let i = 0; i < wallets.length; i++) {
            if (exists[i]) {
              if (Math.random() < 0.5) {
                await F.reverseRegistrar.write.setName([names[i]], {
                  account: wallets[i].account,
                })
              } else {
                await F.defaultReverseRegistrar.write.setName([names[i]], {
                  account: wallets[i].account,
                })
              }
            }
          }
          await expect(
            F.reverseResolver.read.resolveNames([
              wallets.map((x) => x.account.address),
            ]),
          ).resolves.toStrictEqual(names.map((x, i) => (exists[i] ? x : '')))
        })
      }
    })
  })
})
