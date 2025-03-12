import { Address } from 'viem'
import type { KnownResolution, KnownReverse } from './testUtils.js'

export const ENS_REGISTRY: Address =
  '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'

export const KNOWN_RESOLUTIONS: KnownResolution[] = [
  {
    style: 'PublicResolverV2',
    name: 'nick.eth',
    addresses: [
      {
        coinType: 60n,
        encodedAddress: '0xb8c2C29ee19D8307cb7255e1Cd9CbDE883A267d5',
        origin: 'on',
      },
    ],
    texts: [{ key: 'com.github', value: 'arachnid', origin: 'on' }],
  },
  {
    style: 'PublicResolverV3',
    name: 'vitalik.eth',
    addresses: [
      {
        coinType: 60n,
        encodedAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        origin: 'on',
      },
    ],
    texts: [{ key: 'url', value: 'https://vitalik.ca', origin: 'on' }],
  },
  {
    style: 'Hybrid Onchain',
    name: 'raffy.eth',
    addresses: [
      {
        coinType: 60n,
        encodedAddress: '0x51050ec063d393217b436747617ad1c2285aeeee',
        origin: 'on',
      },
    ],
    texts: [
      { key: 'url', value: 'https://raffy.antistupid.com', origin: 'on' },
    ],
  },
  {
    style: 'Hybrid Offchain',
    name: 'raffy.eth',
    texts: [
      { key: 'url', value: 'https://raffy.antistupid.com', origin: 'on' },
      {
        key: 'location',
        value: 'Hello from TheOffchainGateway.js!',
        origin: 'off',
      },
    ],
  },
  {
    style: 'Coinbase Offchain',
    name: 'raffy.base.eth',
    wildcard: true,
    texts: [
      { key: 'url', value: 'https://raffy.xyz', origin: 'batched' },
      { key: 'com.github', value: 'adraffy', origin: 'batched' },
    ],
  },
  {
    style: 'Coinbase Offchain',
    name: 'adraffy.cb.id',
    wildcard: true,
    addresses: [
      {
        coinType: 0n,
        encodedAddress: '0x00142e6414903e4b24d05132352f71b75c165932a381',
        origin: 'batched',
      },
      {
        coinType: 2n,
        encodedAddress: '0x00142016d413f40444a390ca68cd604e39c6ca94ecf4',
        origin: 'batched',
      },
      {
        coinType: 60n,
        encodedAddress: '0xC973b97c1F8f9E3b150E2C12d4856A24b3d563cb',
        origin: 'batched',
      },
    ],
  },
  {
    style: 'Unruggable Gateway',
    name: 'raffy.teamnick.eth',
    wildcard: true,
    addresses: [
      {
        coinType: 60n,
        encodedAddress: '0x51050ec063d393217b436747617ad1c2285aeeee',
        origin: 'batched',
      },
    ],
    texts: [
      {
        key: 'avatar',
        value: 'https://raffy.antistupid.com/ens.jpg',
        origin: 'batched',
      },
    ],
  },
  {
    style: 'EVMGateway',
    name: 'raffy.linea.eth',
    wildcard: true,
    addresses: [
      {
        coinType: 60n,
        encodedAddress: '0x51050ec063d393217b436747617ad1c2285aeeee',
        origin: 'batched',
      },
    ],
  },
  {
    style: 'NFTResolver',
    name: 'moo331.nft-owner.eth',
    wildcard: true,
    addresses: [
      {
        coinType: 60n,
        encodedAddress: '0x51050ec063d393217b436747617ad1c2285aeeee',
        origin: 'on',
      },
    ],
    texts: [{ key: 'description', value: 'Good Morning Cafe', origin: 'on' }],
  },
  {
    style: 'OffchainDNS',
    name: 'brantly.rocks',
    wildcard: true,
    addresses: [
      {
        coinType: 60n,
        encodedAddress: '0x983110309620d911731ac0932219af06091b6744',
        origin: 'batched',
      },
    ],
  },
  {
    style: 'OffchainDNS',
    name: 'ezccip.raffy.xyz',
    wildcard: true,
    addresses: [
      {
        coinType: 60n,
        encodedAddress: '0x51050ec063d393217b436747617ad1c2285aeeee',
        origin: 'batched',
      },
    ],
    texts: [
      {
        key: 'avatar',
        value: 'https://raffy.antistupid.com/ens.jpg',
        origin: 'batched',
      },
    ],
  },
]

export const KNOWN_PRIMARIES: KnownReverse[] = [
  {
    encodedAddress: '0x51050ec063d393217b436747617ad1c2285aeeee',
    coinType: 60n,
    expectPrimary: true,
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
