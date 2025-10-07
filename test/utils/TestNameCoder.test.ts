import hre from 'hardhat'
import { namehash, stringToHex, size, keccak256, stringToBytes } from 'viem'
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

function fmt(name: string, short = false) {
  const max = short ? 36 : 72
  if (name.length > max) {
    const half = max >> 1
    name = `${name.slice(0, half)}…${name.slice(-half)}<${name
      .split('.')
      .map((x) => x.length)}>`
  }
  return name || '<root>'
}

function splitName(name: string): string[] {
  return name ? name.split('.') : []
}

const MIN_LABEL = '1'
const MAX_LABEL = '2'.repeat(255)
const LONG_LABEL = '3'.repeat(256)

describe('NameCoder', () => {
  describe('valid', () => {
    for (const ens of [
      '',
      'test.eth',
      MIN_LABEL,
      MAX_LABEL,
      `${MAX_LABEL}.${MAX_LABEL}`,
      'a.bb.ccc.dddd.eeeee',
    ]) {
      it(fmt(ens), async () => {
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
        await expect(
          F.read.countLabels([dns, 0n]),
          'count',
        ).resolves.toStrictEqual(BigInt(splitName(ens).length))
        await expect(F.read.namehash([dns, 0n])).resolves.toStrictEqual(
          namehash(ens),
        )
        for (let offset = 0n; offset < size(dns); ) {
          ;[, offset] = await F.read.nextLabel([dns, offset])
        }
        for (let offset = BigInt(size(dns)); offset; ) {
          offset = await F.read.prevLabel([dns, offset])
        }
      })
    }
  })

  describe('prevLabel() and nextLabel()', () => {
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
        F.read.readLabel([dns, prev]),
        'readLabel',
      ).resolves.toStrictEqual([keccak256(v), offset])
    })

    it('no next label', async () => {
      const F = await loadFixture()
      await expect(
        F.read.nextLabel([dnsEncodeName(''), 1n]),
      ).toBeRevertedWithCustomError('DNSDecodingFailed')
    })
  })

  describe('encode() failure', () => {
    for (const ens of ['.', '..', '.a', 'a.', 'a..b', LONG_LABEL]) {
      it(fmt(ens), async () => {
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
        F.read.decode([stringToHex('\x03a.b\x00')]),
      ).toBeRevertedWithCustomError('DNSDecodingFailed')
    })
  })

  describe('nextLabel() failure', async () => {
    for (const dns of ['0x', '0x02', '0x0000'] as const) {
      it(dns, async () => {
        const F = await loadFixture()
        await expect(F.read.nextLabel([dns, 0n])).toBeRevertedWithCustomError(
          'DNSDecodingFailed',
        )
      })
    }
  })

  describe('extractLabel()', () => {
    for (const [name] of [
      ['', 'test.eth', 'a.bb.ccc.dddd.eeeee', forceHashedLabel('abc')],
    ]) {
      it(fmt(name), async () => {
        const F = await loadFixture()
        const dns = dnsEncodeName(name)
        let offset = 0n
        for (const x of splitName(name)) {
          const [label, next] = await F.read.extractLabel([dns, offset])
          expect(label).toStrictEqual(x)
          offset = next
        }
        await expect(F.read.extractLabel([dns, offset])).resolves.toStrictEqual(
          ['', BigInt(size(dns))],
        )
      })
    }

    it('permits malicious labels', async () => {
      const F = await loadFixture()
      await expect(
        F.read.extractLabel([stringToHex('\x03a.b\x00'), 0n]),
      ).resolves.toStrictEqual(['a.b', 4n])
    })

    it('permits hashed labels', async () => {
      const F = await loadFixture()
      const hashed = forceHashedLabel('abc')
      await expect(
        F.read.extractLabel([dnsEncodeName(hashed), 0n]),
      ).resolves.toStrictEqual([hashed, 67n])
    })
  })

  describe('firstLabel()', () => {
    for (const label of [MIN_LABEL, MAX_LABEL]) {
      it(fmt(label), async () => {
        const F = await loadFixture()
        await expect(
          F.read.firstLabel([dnsEncodeName(`${label}.eth`)]),
        ).resolves.toStrictEqual(label)
      })
    }

    it(`${fmt('')} reverts`, async () => {
      const F = await loadFixture()
      await expect(
        F.read.firstLabel([dnsEncodeName('')]),
      ).toBeRevertedWithCustomError('LabelIsEmpty')
    })

    it(`invalid encoding does not revert`, async () => {
      const F = await loadFixture()
      await expect(F.read.firstLabel(['0x0161'])).resolves.toEqual('a')
    })
  })

  describe('matchSuffix()', () => {
    function testNoMatch(name: string, suffix: string) {
      it(`no match: ${fmt(name, true)} / ${fmt(suffix, true)}`, async () => {
        const F = await loadFixture()
        await expect(
          F.read.matchSuffix([dnsEncodeName(name), 0n, namehash(suffix)]),
        ).resolves.toStrictEqual([false, namehash(name), 0n, 0n])
      })
    }

    function testMatch(name: string, suffix = name) {
      it(`match: ${fmt(name, true)} / ${fmt(suffix, true)}`, async () => {
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

  describe('addLabel()', () => {
    it('min label', async () => {
      const F = await loadFixture()
      await expect(
        F.read.addLabel([dnsEncodeName('eth'), MIN_LABEL]),
      ).resolves.toStrictEqual(dnsEncodeName(`${MIN_LABEL}.eth`))
    })

    it('max label', async () => {
      const F = await loadFixture()
      await expect(
        F.read.addLabel([dnsEncodeName('eth'), MAX_LABEL]),
      ).resolves.toStrictEqual(dnsEncodeName(`${MAX_LABEL}.eth`))
    })

    it('empty label reverts', async () => {
      const F = await loadFixture()
      await expect(
        F.read.addLabel([dnsEncodeName('eth'), '']),
      ).toBeRevertedWithCustomError('LabelIsEmpty')
    })

    it('long label reverts', async () => {
      const F = await loadFixture()
      await expect(F.read.addLabel([dnsEncodeName('eth'), LONG_LABEL]))
        .toBeRevertedWithCustomError('LabelIsTooLong')
        .withArgs([LONG_LABEL])
    })
  })

  describe('ethName()', () => {
    it('min label', async () => {
      const F = await loadFixture()
      await expect(F.read.ethName([MIN_LABEL])).resolves.toStrictEqual(
        dnsEncodeName(`${MIN_LABEL}.eth`),
      )
    })

    it('max label', async () => {
      const F = await loadFixture()
      await expect(F.read.ethName([MAX_LABEL])).resolves.toStrictEqual(
        dnsEncodeName(`${MAX_LABEL}.eth`),
      )
    })

    it('empty label reverts', async () => {
      const F = await loadFixture()
      await expect(F.read.ethName([''])).toBeRevertedWithCustomError(
        'LabelIsEmpty',
      )
    })

    it('long label reverts', async () => {
      const F = await loadFixture()
      await expect(F.read.ethName([LONG_LABEL]))
        .toBeRevertedWithCustomError('LabelIsTooLong')
        .withArgs([LONG_LABEL])
    })
  })
})
