import { shouldSupportInterfaces } from '@ensdomains/hardhat-chai-matchers-viem/behaviour'
import hre from 'hardhat'
import { type Account, type Address, labelhash, namehash } from 'viem'
import {
  chainFromCoinType,
  COIN_TYPE_ETH,
  getReverseName,
  getReverseNamespace,
} from '../fixtures/ensip19.js'
import { KnownProfile, makeResolutions } from '../utils/resolutions.js'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { deployDefaultReverseFixture } from '../fixtures/deployDefaultReverseFixture.js'

const connection = await hre.network.connect()
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

async function fixture() {
  const F = await deployDefaultReverseFixture(connection)
  const reverseRegistrar = await connection.viem.deployContract(
    'DefaultReverseRegistrar',
  )
  const reverseResolver = await connection.viem.deployContract(
    'ETHReverseResolver',
    [
      F.ensRegistry.address,
      reverseRegistrar.address,
      F.defaultReverseRegistrar.address,
    ],
  )
  const reverseNamespace = getReverseNamespace(COIN_TYPE_ETH)
  await F.takeControl(reverseNamespace)
  await F.ensRegistry.write.setResolver([
    namehash(reverseNamespace),
    reverseResolver.address,
  ])
  const shapeshift = await connection.viem.deployContract(
    'DummyShapeshiftResolver',
  )
  return {
    ...F,
    shapeshift,
    reverseNamespace,
    reverseRegistrar,
    reverseResolver,
    claimV1,
  }
  async function claimV1(owner: Address, resolver = shapeshift.address) {
    await F.ensRegistry.write.setSubnodeRecord([
      namehash(reverseNamespace),
      labelhash(owner.slice(2).toLowerCase()),
      owner,
      resolver,
      0n,
    ])
  }
}

function nthName(i: number) {
  return String.fromCodePoint(65 + i) // A, B, C, ...
}

type SetterFn = (
  F: Awaited<ReturnType<typeof fixture>>,
  name: string,
  account: Account,
) => Promise<void>

const sources = {
  // IStandaloneReverseRegistrar for "addr.reverse"
  addr: {
    set: async (F, name, account) => {
      await F.reverseRegistrar.write.setName([name], { account })
    },
  },
  // "{addr}.addr.reverse" in V1 Registry
  V1: {
    set: async (F, name, account) => {
      const [res] = makeResolutions({
        name: getReverseName(account.address),
        primary: { value: name },
      })
      await F.shapeshift.write.setResponse([res.call, res.answer])
      await F.claimV1(account.address)
    },
    setOld: async (F, name, account) => {
      const [res] = makeResolutions({
        name: getReverseName(account.address),
        primary: { value: name },
      })
      await F.shapeshift.write.setOld()
      await F.shapeshift.write.setResponse([res.call, res.answer])
      await F.claimV1(account.address)
    },
    empty: async (F, _, account) => {
      const [res] = makeResolutions({
        name: getReverseName(account.address),
        primary: { value: '' },
      })
      await F.shapeshift.write.setResponse([res.call, res.answer])
      await F.claimV1(account.address)
    },
    unset: async () => {},
    revert: async (F, _, account) => {
      await F.shapeshift.write.setRevertEmpty([true])
      await F.claimV1(account.address)
    },
    noCode: async (F, _, account) => {
      await F.claimV1(
        account.address,
        `0x000000000000000000000000000000000000dEaD`,
      )
    },
  },
  // IStandaloneReverseRegistrar for "default.reverse"
  default: {
    set: async (F, name, account) => {
      await F.defaultReverseRegistrar.write.setName([name], { account })
    },
  },
} as const satisfies Record<string, Record<string, SetterFn>>

// generate all of the permutations of setters
const permutations: {
  source: string
  setter: string
  fn: SetterFn
  name: string
}[][] = [[]]
Object.entries(sources).forEach(([source, setters], i) => {
  permutations.push(
    ...Object.entries(setters).flatMap(([setter, fn]) =>
      permutations.map((v) => [
        ...v,
        {
          source,
          setter,
          fn,
          name: setter.startsWith('set') ? nthName(i) : '', // convention
        },
      ]),
    ),
  )
})

describe('ETHReverseResolver', () => {
  shouldSupportInterfaces({
    contract: () => loadFixture().then((F) => F.reverseResolver),
    interfaces: ['IERC165', 'IExtendedResolver', 'INameReverser'],
  })

  it('coinType()', async () => {
    const F = await loadFixture()
    await expect(F.reverseResolver.read.coinType()).resolves.toStrictEqual(
      COIN_TYPE_ETH,
    )
  })

  it('chainId()', async () => {
    const F = await loadFixture()
    await expect(F.reverseResolver.read.chainId()).resolves.toStrictEqual(
      chainFromCoinType(COIN_TYPE_ETH),
    )
  })

  describe('resolve()', () => {
    it('unsupported profile', async () => {
      const F = await loadFixture()
      const kp: KnownProfile = {
        name: 'any',
        texts: [{ key: 'dne', value: 'abc' }],
      }
      const [res] = makeResolutions(kp)
      await expect(
        F.reverseResolver.read.resolve([dnsEncodeName(kp.name), res.call]),
      ).toBeRevertedWithCustomError('UnsupportedResolverProfile')
      // .withArgs(slice(res.call, 0, 4))
    })

    it('addr("addr.reverse") = registrar', async () => {
      const F = await loadFixture()
      const kp: KnownProfile = {
        name: F.reverseNamespace,
        addresses: [
          { coinType: COIN_TYPE_ETH, value: F.reverseRegistrar.address },
          { coinType: COIN_TYPE_ETH + 1n, value: '0x' },
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

    for (const setters of permutations.sort((a, b) => a.length - b.length)) {
      const name = setters.find((x) => x.name)?.name ?? ''
      const desc = setters
        .map((x) => `${x.source}(${x.setter}${x.name ? `:"${name}"` : ''})`)
        .join(' + ')
      it(`${desc || 'unset'} = ${name ? `"${name}"` : '<empty>'}`, async () => {
        const F = await loadFixture()
        const [wallet] = await connection.viem.getWalletClients()
        for (const { fn, name } of setters) {
          await fn(F, name, wallet.account)
        }
        const kp: KnownProfile = {
          name: getReverseName(wallet.account.address),
          primary: { value: name },
        }
        const [res] = makeResolutions(kp)
        await expect(
          F.reverseResolver.read.resolve([dnsEncodeName(kp.name), res.call]),
        ).resolves.toStrictEqual(res.answer)
      })
    }
  })

  describe('resolveNames()', () => {
    it('empty', async () => {
      const F = await loadFixture()
      await expect(
        F.reverseResolver.read.resolveNames([[]]),
      ).resolves.toStrictEqual([])
    })

    it(
      [...Object.keys(sources).map((x) => `1 ${x}`), '1 unset'].join(' + '),
      async () => {
        const F = await loadFixture()
        const wallets = await connection.viem.getWalletClients()
        const setters = Object.values(sources).map((x) => x.set)
        for (let i = 0; i < setters.length; i++) {
          await setters[i](F, nthName(i), wallets[i].account)
        }
        await expect(
          F.reverseResolver.read.resolveNames([
            wallets.slice(0, setters.length + 1).map((x) => x.account.address),
          ]),
        ).resolves.toStrictEqual([nthName(0), nthName(1), nthName(2), ''])
      },
    )
  })
})
