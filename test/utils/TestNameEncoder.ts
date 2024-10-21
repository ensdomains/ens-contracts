import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { namehash } from 'viem'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'

async function fixture() {
  const nameEncoder = await hre.viem.deployContract('TestNameEncoder', [])

  return { nameEncoder }
}

describe('NameEncoder', () => {
  describe('encodeName()', () => {
    it('should encode a name', async () => {
      const { nameEncoder } = await loadFixture(fixture)

      await expect(
        nameEncoder.read.encodeName(['foo.eth']),
      ).resolves.toMatchObject([dnsEncodeName('foo.eth'), namehash('foo.eth')])
    })

    it('should encode an empty name', async () => {
      const { nameEncoder } = await loadFixture(fixture)

      await expect(nameEncoder.read.encodeName([''])).resolves.toMatchObject([
        `${dnsEncodeName(
          '',
        )}00` /* uhhh idk if its meant to be like this but leaving it for now */,
        namehash(''),
      ])
    })

    it('should encode a long name', async () => {
      const { nameEncoder } = await loadFixture(fixture)

      await expect(
        nameEncoder.read.encodeName(['something.else.test.eth']),
      ).resolves.toMatchObject([
        dnsEncodeName('something.else.test.eth'),
        namehash('something.else.test.eth'),
      ])
    })
  })
})
