import hre from 'hardhat'
import { namehash, toHex, size, keccak256, stringToBytes } from 'viem'
import { dnsDecodeName } from '../fixtures/dnsDecodeName.js'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { getParentName } from '../utils/resolutions.js'

const connection = await hre.network.connect()

async function fixture() {
  return connection.viem.deployContract('TestNameCoder', [])
}
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

function forceHashedLabel(label: string) {
  return `[${keccak256(stringToBytes(label)).slice(2)}]`
}

function fmt(name: string) {
  return name || '<root>'
}

describe('NameCoder', () => {
  describe('valid', () => {
    for (const [title, ens = title] of [
      [''],
      ['a.bb.ccc.dddd.eeeee'],
      ['1x255', '1'.repeat(255)],
      ['1x300', '1'.repeat(300)],
      ['hashed("eth")', forceHashedLabel('eth')],
      ['mixed', `${'1'.repeat(300)}.${forceHashedLabel('test')}.eth`],
    ]) {
      it(fmt(title), async () => {
        const F = await loadFixture()
        const dns = dnsEncodeName(ens)
        await expect(F.read.encode([ens]), 'encode').resolves.toStrictEqual(dns)
        await expect(F.read.decode([dns]), 'decode').resolves.toStrictEqual(
          dnsDecodeName(dns),
        )
        await expect(
          F.read.namehash([dns, 0n]),
          'namehash',
        ).resolves.toStrictEqual(namehash(ens))
        for (let offset = 0n; offset < size(dns); ) {
          ;[, offset] = await F.read.nextLabel([dns, offset])
        }
        for (let offset = BigInt(size(dns)); offset; ) {
          offset = await F.read.prevLabel([dns, offset])
        }
      })
    }
  })

  it('no next label', async () => {
    const F = await loadFixture()
    await expect(
      F.read.nextLabel([dnsEncodeName(''), 1n]),
    ).toBeRevertedWithCustomError('DNSDecodingFailed')
  })

  describe('prevLabel()', () => {
    it('0 reverts', async () => {
      const F = await loadFixture()
      await expect(
        F.read.prevLabel([dnsEncodeName(''), 0n]),
      ).toBeRevertedWithCustomError('DNSDecodingFailed')
    })

    it('name.length+1 reverts', async () => {
      const F = await loadFixture()
      const dns = dnsEncodeName('')
      await expect(
        F.read.prevLabel([dns, BigInt(dns.length + 1)]),
      ).toBeRevertedWithCustomError('DNSDecodingFailed')
    })

    it('name.length is <root>', async () => {
      const F = await loadFixture()
      const dns = dnsEncodeName('eth')
      const offset = BigInt(size(dns))
      const prev = offset - 1n
      await expect(
        F.read.prevLabel([dns, offset]),
        'prevLabel',
      ).resolves.toStrictEqual(prev)
      await expect(
        F.read.nextLabel([dns, prev]),
        'nextLabel',
      ).resolves.toStrictEqual([0, offset])
    })

    it('name.length-1 is <tld>', async () => {
      const F = await loadFixture()
      const namespace = 'a.b.c.'
      const tld = 'eth'
      const dns = dnsEncodeName(namespace + tld)
      const offset = BigInt(size(dns) - 1)
      const prev = BigInt(namespace.length)
      await expect(
        F.read.prevLabel([dns, offset]),
        'prevLabel',
      ).resolves.toStrictEqual(prev)
      const v = stringToBytes(tld)
      await expect(
        F.read.readLabel([dns, prev, true]),
        'readLabel',
      ).resolves.toStrictEqual([keccak256(v), offset, v.length, false])
    })
  })

  it('null hashed label', async () => {
    const F = await loadFixture()
    await expect(
      F.read.readLabel([dnsEncodeName(`[${'0'.repeat(64)}]`), 0n, true]),
    ).toBeRevertedWithCustomError('DNSDecodingFailed')
  })

  it('disable hashed label support', async () => {
    const F = await loadFixture()
    const label = `[${'0'.repeat(64)}]`
    const v = stringToBytes(label)
    await expect(
      F.read.readLabel([dnsEncodeName(label), 0n, false]),
    ).resolves.toStrictEqual([keccak256(v), 67n, v.length, false])
  })

  it('invalid hashed label', async () => {
    const F = await loadFixture()
    await expect(
      F.read.namehash([dnsEncodeName(`[${'z'.repeat(64)}]`), 0n]),
    ).toBeRevertedWithCustomError('DNSDecodingFailed')
  })

  describe('encode() failure', () => {
    for (const ens of ['.', '..', '.a', 'a.', 'a..b']) {
      it(ens, async () => {
        const F = await loadFixture()
        await expect(F.read.encode([ens])).toBeRevertedWithCustomError(
          'DNSEncodingFailed',
        )
      })
    }
  })

  describe('decode() failure', () => {
    for (const dns of ['0x', '0x02', '0x0000', '0x0100'] as const) {
      it(dns, async () => {
        const F = await loadFixture()
        await expect(F.read.decode([dns])).toBeRevertedWithCustomError(
          'DNSDecodingFailed',
        )
        await expect(F.read.namehash([dns, 0n])).toBeRevertedWithCustomError(
          'DNSDecodingFailed',
        )
      })
    }

    it('malicious label', async () => {
      const F = await loadFixture()
      await expect(
        F.read.decode([toHex('\x03a.b\x00')]),
      ).toBeRevertedWithCustomError('DNSDecodingFailed')
    })
  })

  describe('matchSuffix()', () => {
    function testNoMatch(name: string, suffix: string) {
      it(`no match: ${fmt(name)} / ${fmt(suffix)}`, async () => {
        const F = await loadFixture()
        await expect(
          F.read.matchSuffix([dnsEncodeName(name), 0n, namehash(suffix)]),
        ).resolves.toStrictEqual([false, namehash(name), 0n, 0n])
      })
    }

    function testMatch(
      name: string,
      suffix = name,
      nameTitle = name,
      suffixTitle = suffix,
    ) {
      it(`match: ${fmt(nameTitle)} / ${fmt(suffixTitle)}`, async () => {
        const F = await loadFixture()
        const nodeSuffix = namehash(suffix)
        let prev = name
        let match = name
        while (namehash(match) !== nodeSuffix) {
          if (!match) throw new Error('expected match')
          prev = match
          match = getParentName(match)
        }
        await expect(
          F.read.matchSuffix([dnsEncodeName(name), 0n, namehash(suffix)]),
        ).resolves.toStrictEqual([
          true,
          namehash(name),
          BigInt(size(dnsEncodeName(name)) - size(dnsEncodeName(prev))),
          BigInt(size(dnsEncodeName(name)) - size(dnsEncodeName(match))),
        ])
      })
    }

    testNoMatch('test.eth', 'com')
    testNoMatch('a', 'b')
    testNoMatch('a', 'a.b')
    testNoMatch('a', 'b.a')

    testMatch('')
    testMatch('eth')
    testMatch('a.b.c')

    testMatch('test.eth', 'eth')
    testMatch('a.b.c.com', 'com')
    testMatch('test.xyz', 'xyz')

    testMatch('a.b.c.d', 'b.c.d')
    testMatch('a.b.c.d', 'c.d')
    testMatch('a.b.c.d', 'd')
    testMatch('a.b.c.d', '')

    testMatch('1'.repeat(300), undefined, '1^300', '1^300')
    testMatch('2'.repeat(300), forceHashedLabel('2'.repeat(300)), '2^300')
    testMatch('3.eth', forceHashedLabel('eth'))
    testMatch(`4.${forceHashedLabel('eth')}`, 'eth')
    testMatch(`5.${forceHashedLabel('test')}.eth`, 'test.eth')

    describe('nonzero offset', () => {
      it('no match', async () => {
        const F = await loadFixture()
        await expect(
          F.read.matchSuffix([dnsEncodeName('a.b.c.eth'), 4n, namehash('xyz')]),
        ).resolves.toStrictEqual([false, namehash('c.eth'), 0n, 0n])
      })

      it('exact exact', async () => {
        const F = await loadFixture()
        await expect(
          F.read.matchSuffix([dnsEncodeName('a.b.c.eth'), 6n, namehash('eth')]),
        ).resolves.toStrictEqual([true, namehash('eth'), 6n, 6n])
      })

      it('match', async () => {
        const F = await loadFixture()
        await expect(
          F.read.matchSuffix([dnsEncodeName('a.b.c.eth'), 2n, namehash('eth')]),
        ).resolves.toStrictEqual([true, namehash('b.c.eth'), 4n, 6n])
      })
    })
  })
})
