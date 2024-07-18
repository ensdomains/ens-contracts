import { expect } from 'chai'
import hre from 'hardhat'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'

async function fixture() {
  const tldPublicSuffixList = await hre.viem.deployContract(
    'TLDPublicSuffixList',
    [],
  )

  return { tldPublicSuffixList }
}

describe('TLDPublicSuffixList', () => {
  it('treats all TLDs as public suffixes', async () => {
    const { tldPublicSuffixList } = await fixture()

    await expect(
      tldPublicSuffixList.read.isPublicSuffix([dnsEncodeName('eth')]),
    ).resolves.toBe(true)
    await expect(
      tldPublicSuffixList.read.isPublicSuffix([dnsEncodeName('com')]),
    ).resolves.toBe(true)
  })

  it('treats all non-TLDs as non-public suffixes', async () => {
    const { tldPublicSuffixList } = await fixture()

    await expect(
      tldPublicSuffixList.read.isPublicSuffix([dnsEncodeName('')]),
    ).resolves.toBe(false)
    await expect(
      tldPublicSuffixList.read.isPublicSuffix([dnsEncodeName('foo.eth')]),
    ).resolves.toBe(false)
    await expect(
      tldPublicSuffixList.read.isPublicSuffix([dnsEncodeName('a.b.foo.eth')]),
    ).resolves.toBe(false)
  })
})
