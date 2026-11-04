import { SignedSet } from '@ensdomains/dnsprovejs'
import { toType } from 'dns-packet/types'
import packet from 'dns-packet'
import type { Answer, Dnskey, Rrsig } from 'dns-packet'
import {
  bytesToHex,
  type Hex,
  type Address,
  encodePacked,
  keccak256,
  toHex,
  slice,
  namehash,
} from 'viem'
import { dnsEncodeName } from './dnsEncodeName.js'

export type RRSet = {
  rrs: Answer[]
  sig: Rrsig
}

/// see: RRUtils.sol
export const DNS_TYPES = {
  TXT: 16,
  DS: 43,
  DNSKEY: 48,
} as const

for (const [k, x] of Object.entries(DNS_TYPES)) {
  if (toType(k) !== x) {
    throw new Error(`DNS_TYPES: ${k} != ${x}`)
  }
}

// see: RRUtils.sol
export const DNSKEY_FLAGS = {
  SEP: 1, /////////// 1 << (15 - 15)
  REVOKE: 0x80, ///// 1 << (15 - 8)
  ZONE_KEY: 0x100, // 1 << (15 - 7)
} as const

export const hexEncodeSignedSet = ({ rrs, sig }: RRSet) => {
  const ss = new SignedSet(rrs, sig)
  let { name } = ss.records[0] // valid rrs have same name
  if (name === '.') name = ''
  return {
    rrset: bytesToHex(ss.toWire()),
    sig: bytesToHex(ss.signature.data.signature),
    event: {
      node: namehash(name),
      name: dnsEncodeName(name),
      typeCovered: toType(sig.data.typeCovered),
      inception: sig.data.inception,
      hash: slice(getDataHashFromSignedSet(ss.records), 0, 28), // truncated
    },
  }
}

export function leafName(name: string) {
  return `_ens.${name}`
}

// see: DNSClaimChecker.getDataHash()
export function getDataHashFromSignedSet(records: Answer[]): Hex {
  return toHex(
    records.reduce((a, x) => {
      const v = packet.record(x.type).encode(x.data).subarray(2)
      return (
        a ^
        BigInt(
          keccak256(
            encodePacked(
              ['uint16', 'uint16', 'bytes32'],
              [toType(x.type), v.length, keccak256(v)],
            ),
          ),
        )
      )
    }, 0n),
    { size: 32 },
  )
}

// see: RRUtils.computeKeytag()
export function computeKeyTag(key: Dnskey['data']) {
  const v = packet.dnskey.encode(key).subarray(2)
  let keytag = 0
  for (let i = 0; i < v.length; i++) {
    keytag += i & 1 ? v[i] : (v[i] << 8)
  }
  return (keytag + (keytag >> 16)) & 0xffff
}

export const validityPeriod = 2419200
export const INCEPTION = Math.floor(Date.now() / 1000 - 15 * 60)
export const EXPIRATION = INCEPTION + validityPeriod
export const rrsetWithTexts = ({
  name,
  texts,
}: {
  name: string
  texts: (string | { name: string; value: string })[]
}): RRSet => ({
  sig: {
    name,
    type: 'RRSIG',
    ttl: 0,
    class: 'IN',
    flush: false,
    data: {
      typeCovered: 'TXT',
      algorithm: 253,
      labels: name.split('.').length,
      originalTTL: 3600,
      expiration: EXPIRATION,
      inception: INCEPTION,
      keyTag: 1278,
      signersName: '.',
      signature: Buffer.from([]),
    },
  },
  rrs: texts.map<Answer>((text) => ({
    name: typeof text === 'string' ? name : text.name,
    type: 'TXT',
    class: 'IN',
    ttl: 3600,
    data: [Buffer.from(typeof text === 'string' ? text : text.value, 'ascii')],
  })),
})
export const testRrset = ({
  name,
  address,
  inception = INCEPTION,
}: {
  name: string
  address: Address
  inception?: number
}): RRSet => ({
  sig: {
    name: 'test',
    type: 'RRSIG',
    ttl: 0,
    class: 'IN',
    flush: false,
    data: {
      typeCovered: 'TXT',
      algorithm: 253,
      labels: name.split('.').length + 1,
      originalTTL: 3600,
      expiration: EXPIRATION,
      inception,
      keyTag: 1278,
      signersName: '.',
      signature: Buffer.from([]),
    },
  },
  rrs: [
    {
      name: leafName(name),
      type: 'TXT',
      class: 'IN',
      ttl: 3600,
      data: [Buffer.from(`a=${address}`, 'ascii')],
    },
  ],
})

export const rootKeys = ({
  expiration = EXPIRATION,
  inception = INCEPTION,
}: {
  expiration?: number
  inception?: number
  flags?: number
  keyData?: Hex
} = {}) => {
  const name = '.'
  const sig: Rrsig = {
    name,
    type: 'RRSIG',
    ttl: 0,
    class: 'IN',
    flush: false,
    data: {
      typeCovered: 'DNSKEY',
      algorithm: 253,
      labels: 0,
      originalTTL: 3600,
      expiration,
      inception,
      keyTag: 1278,
      signersName: name,
      signature: Buffer.from([]),
    },
  }
  const rrs = [
    {
      name,
      type: 'DNSKEY',
      class: 'IN',
      ttl: 3600,
      data: {
        flags: DNSKEY_FLAGS.SEP | DNSKEY_FLAGS.ZONE_KEY,
        algorithm: 253, 
        key: Buffer.from('0000', 'hex'),
      },
    },
  ] as const satisfies Answer[]
  return { name, sig, rrs }
}
