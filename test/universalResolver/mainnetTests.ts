import { Hex } from 'viem'
import type { KnownResolution, KnownReverse } from './testUtils.js'

export const ENS_REGISTRY: Hex = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'

export const KNOWN_RESOLUTIONS: KnownResolution[] = [
  {
    style: 'No Resolver',
    name: 'a.b',
    expectUnreachable: true,
  },
  {
    style: 'PublicResolverV2',
    name: 'nick.eth',
    addresses: [[60n, '0xb8c2C29ee19D8307cb7255e1Cd9CbDE883A267d5']],
    texts: [['com.github', 'arachnid']],
  },
  {
    style: 'PublicResolverV3',
    name: 'vitalik.eth',
    addresses: [[60n, '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045']],
    texts: [['url', 'https://vitalik.ca']],
  },
  {
    style: 'Hybrid Onchain',
    name: 'raffy.eth',
    addresses: [[60n, '0x51050ec063d393217b436747617ad1c2285aeeee']],
    texts: [['url', 'https://raffy.antistupid.com']],
  },
  {
    style: 'Hybrid Offchain',
    name: 'raffy.eth',
    texts: [
      ['url', 'https://raffy.antistupid.com'],
      ['location', 'Hello from TheOffchainGateway.js!'],
    ],
  },
  {
    style: 'Coinbase Offchain',
    name: 'raffy.base.eth',
    expectVirtual: true,
    texts: [
      ['url', 'https://raffy.xyz'],
      ['com.github', 'adraffy'],
    ],
    expectBatched: true,
  },
  {
    style: 'Coinbase Offchain',
    name: 'adraffy.cb.id',
    expectVirtual: true,
    addresses: [
      [0n, '0x00142e6414903e4b24d05132352f71b75c165932a381'],
      [2n, '0x00142016d413f40444a390ca68cd604e39c6ca94ecf4'],
      [60n, '0xC973b97c1F8f9E3b150E2C12d4856A24b3d563cb'],
    ],
    expectBatched: true,
  },
  {
    style: 'Unruggable Gateway',
    name: 'raffy.teamnick.eth',
    expectVirtual: true,
    addresses: [[60n, '0x51050ec063d393217b436747617ad1c2285aeeee']],
    texts: [['avatar', 'https://raffy.antistupid.com/ens.jpg']],
  },
  {
    style: 'EVMGateway',
    name: 'raffy.linea.eth',
    expectVirtual: true,
    addresses: [[60n, '0x51050ec063d393217b436747617ad1c2285aeeee']],
  },
]

export const KNOWN_PRIMARIES: KnownReverse[] = [
  {
    encodedAddress: '0x51050ec063d393217b436747617ad1c2285aeeee',
    coinType: 60n,
  },
  {
    encodedAddress: '0x0000000000000000000000000000000000000001',
    coinType: 60n,
    expectError: true,
  },
  {
    encodedAddress: '0x0000000000000000000000000000000000000001',
    coinType: 0n,
    expectError: true,
  },
]
