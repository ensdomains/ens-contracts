import { describe, afterAll } from 'bun:test'
import { Foundry } from '@adraffy/blocksmith'
import { dnsEncode, Interface, namehash } from 'ethers'

export const RESOLVER_ABI = new Interface([
  'function addr(bytes32) external view returns (address)',
  'function addr(bytes32, uint256 coinType) external view returns (bytes)',
  'function text(bytes32, string key) external view returns (string)',
  'function contenthash(bytes32) external view returns (bytes)',
  'function name(bytes32) external view returns (string)',
  'function pubkey(bytes32) external view returns (bytes32 x, bytes32 y)',
  'function dne(bytes32) external view returns (string)', // not a real ENS profile
  'function multicall(bytes[] calls) external view returns (bytes[])',
])

export type ENSRecord =
  | ['addr', arg?: bigint]
  | ['text', arg: string]
  | ['contenthash' | 'pubkey' | 'name' | 'dne']

function fragFromRecord([type, arg]: ENSRecord) {
  const frag = RESOLVER_ABI.getFunction(
    type === 'addr'
      ? arg === undefined
        ? 'addr(bytes32)'
        : 'addr(bytes32,uint256)'
      : type,
  )
  if (!frag) throw new Error(`unknown record type: ${type}`)
  return frag
}

const tests = [
  {
    name: 'raffy.eth',
    records: [[60n, '0x51050ec063d393217B436747617aD1C2285Aeeee']],
  },
]

describe('UniversalResolver2', async () => {
  const foundry = await Foundry.launch({
    fork: 'https://rpc.ankr.com/eth',
  })
  afterAll(foundry.shutdown)

  const ForwardResolution = await foundry.deploy({
    file: 'ForwardResolution',
    args: [
      '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
      [], //['https://ccip-v2.ens.xyz'],
    ],
  })
  const UniversalResolver = await foundry.deploy({
    file: 'UniversalResolver2',
    args: [ForwardResolution],
  })

  describe('forward', async function () {
    const answer = await UniversalResolver.resolve(
      dnsEncode('raffy.eth'),
      RESOLVER_ABI.encodeFunctionData('addr(bytes32)', [namehash('raffy.eth')]),
      { enableCcipRead: true },
    )
    console.log(answer)
  })

  describe('reverse', async function () {
    const answer = await UniversalResolver.reverse(
      '0x51050ec063d393217B436747617aD1C2285Aeeee',
      60,
      { enableCcipRead: true },
    )
    console.log(answer)
  })
})

// import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
// import { expect } from 'chai'
// import hre from 'hardhat'
// import { reverseName } from '../fixtures/reverseName.js'
// import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
// import { BATCHED_GATEWAY_MAINNET } from '../fixtures/gateways.js'

// async function fixture() {

//   const ForwardResolution = await hre.viem.deployContract('ForwardResolution', [
// 	'0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
// 	[BATCHED_GATEWAY_MAINNET],
//   ])
//   const UniversalResolver = await hre.viem.deployContract('UniversalResolver', [
// 	ForwardResolution.address,
//   ])
//   return { ForwardResolution, UniversalResolver }
// }

// describe('UniversalResolver', () => {

// 	it(`reverse: vitalik.eth`, async () => {
// 		const { UniversalResolver } = await loadFixture(fixture)

// 		console.log(await UniversalResolver.read.reverse(['0x220866B1A2219f40e72f5c628B65D54268cA3A9D', 60n]));

// 	});
// })
