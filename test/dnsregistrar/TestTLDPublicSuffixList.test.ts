import hre from 'hardhat'

import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'

const connection = await hre.network.connect()

async function fixture() {
  const tldPublicSuffixList = await connection.viem.deployContract(
    'TLDPublicSuffixList',
    [],
  )

  return { tldPublicSuffixList }
}

const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

describe('TLDPublicSuffixList', () => {
  it('treats all TLDs as public suffixes', async () => {
    const { tldPublicSuffixList } = await loadFixture()

    await expect(
      tldPublicSuffixList.read.isPublicSuffix([dnsEncodeName('eth')]),
    ).resolves.toBe(true)
    await expect(
      tldPublicSuffixList.read.isPublicSuffix([dnsEncodeName('com')]),
    ).resolves.toBe(true)
  })

  it('treats all non-TLDs as non-public suffixes', async () => {
    const { tldPublicSuffixList } = await loadFixture()

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
