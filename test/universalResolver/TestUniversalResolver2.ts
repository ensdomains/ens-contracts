import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { namehash } from 'viem'
import { ownedEnsFixture } from './ownedEnsFixture.js'

async function fixture() {
  const ens = await ownedEnsFixture()
  const UniversalResolver = await hre.viem.deployContract(
    'UniversalResolver2',
    [ens.ForwardResolution.address],
  )
  return { UniversalResolver, ...ens }
}

const testName = 'a.bb.ccc.nick.eth'

describe('TestUniversalResolver2', () => {
  it('ResolverNotFound', async () => {
    const F = await loadFixture(fixture)
    await expect(
      F.UniversalResolver.read.resolve([dnsEncodeName(testName), '0x12345678']),
    ).rejects.toThrow(/ResolverNotFound/)
  })

  it('ResolverNotContract', async () => {
    const F = await loadFixture(fixture)
    await F.takeControl(testName)
    await F.ENSRegistry.write.setResolver([namehash(testName), F.owner])
    await expect(
      F.UniversalResolver.read.resolve([dnsEncodeName(testName), '0x12345678']),
    ).rejects.toThrow(/ResolverNotContract/)
  })
})
