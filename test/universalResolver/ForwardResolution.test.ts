import { describe, afterAll } from 'bun:test'
import { Foundry } from '@adraffy/blocksmith'
import { ethers } from 'ethers'

const tests = [
	{
		name: 'raffy.eth',
		records: [
			[60n, '0x51050ec063d393217B436747617aD1C2285Aeeee']
		]
	}
];


describe('ForwardResolution', async () => {
  const foundry = await Foundry.launch({
    fork: 'https://rpc.ankr.com/eth',
  })
  afterAll(foundry.shutdown)

  
  const { abi: IAddrResolver } = await foundry.resolveArtifact({ file: 'IAddrResolver' })
  const { abi: IAddressResolver } = await foundry.resolveArtifact({ file: 'IAddressResolver' })
  const { abi: ITextResolver } = await foundry.resolveArtifact({ file: 'ITextResolver' })
  const { abi: IContenthashResolver } = await foundry.resolveArtifact({ file: 'IContenthashResolver' })

  describe('deploy', async function () {
    const ForwardResolution = await foundry.deploy({
      file: 'ForwardResolution',
      args: [
        '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
        ['https://ccip-v2.ens.xyz'],
      ],
    })

    const answer = await ForwardResolution.resolve(
      ethers.dnsEncode('raffy.eth'),
      [IAddrResolver.encodeFunctionData('addr', [ethers.namehash('raffy.eth')])],
      [],
      { enableCcipRead: true },
    )
    console.log(answer)



})
})



// import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
// import { expect } from 'chai'
// import hre from 'hardhat'
// import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
// import { reverseName } from '../fixtures/reverseName.js'
// import { encodeFunctionData, namehash, parseAbi } from 'viem'
// //import { } from '../fixtures/deployEnsFixture.js';

// const RESOLVER_ABI = parseAbi(['function addr(bytes32) external view returns (string)'])

// async function fixture() {
//   const ForwardResolution = await hre.viem.deployContract('ForwardResolution', [
//     '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
//     ['https://ccip-v2.ens.xyz'],
//   ])
//   return { ForwardResolution }
// }

// describe('ForwardResolution', () => {
//   const name = 'raffy.eth'
//   it(`resolve: raffy.eth`, async () => {
//     const { ForwardResolution } = await loadFixture(fixture)

//     console.log(
//       await ForwardResolution.read.resolve([
//         dnsEncodeName(name),
//         [encodeFunctionData({
//           abi: RESOLVER_ABI,
//           functionName: 'addr',
//           args: [namehash(name)],
//         })],
// 		[],
// 	  ])
//     )
//   })
// })
