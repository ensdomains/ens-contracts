import { describe, afterAll } from 'bun:test'
import { Foundry } from '@adraffy/blocksmith'
import { ethers } from 'ethers'

describe('a', async () => {
  const foundry = await Foundry.launch({
    fork: 'https://rpc.ankr.com/eth',
  })
  afterAll(foundry.shutdown)

  describe('deploy', async function () {
    const ForwardResolution = await foundry.deploy({
      file: 'ForwardResolution',
      args: [
        '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
        ['https://ccip-v2.ens.xyz'],
      ],
    })

    const { abi } = await foundry.resolveArtifact({ file: 'IAddrResolver' })

    const answer = await ForwardResolution.resolve(
      ethers.dnsEncode('raffy.eth'),
      [abi.encodeFunctionData('addr', [ethers.namehash('raffy.eth')])],
      [],
      { enableCcipRead: true },
    )

    console.log(answer)
  })
})
