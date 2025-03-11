import { describe, afterAll } from 'bun:test'
import { Foundry } from '@adraffy/blocksmith'
import { ethers } from 'ethers'

describe('ForwardResolution', async () => {
  const foundry = await Foundry.launch({
    fork: 'https://rpc.ankr.com/eth',
  })
  afterAll(foundry.shutdown)

  const { abi: IAddrResolver } = await foundry.resolveArtifact({
    file: 'IAddrResolver',
  })
  const { abi: IAddressResolver } = await foundry.resolveArtifact({
    file: 'IAddressResolver',
  })
  const { abi: ITextResolver } = await foundry.resolveArtifact({
    file: 'ITextResolver',
  })
  const { abi: IContenthashResolver } = await foundry.resolveArtifact({
    file: 'IContentHashResolver',
  })

  describe('deploy', async function () {
    const ForwardResolution = await foundry.deploy({
      file: 'ForwardResolution',
      args: [
        '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
        ['https://ccip-v2.ens.xyz'],
      ],
    })

    const name = 'raffy.teamnick.eth'
    const answer = await ForwardResolution.resolve(
      ethers.dnsEncode(name),
      [IAddrResolver.encodeFunctionData('addr', [ethers.namehash(name)])],
      [],
      { enableCcipRead: true },
    )
    console.log(answer)
  })
})
