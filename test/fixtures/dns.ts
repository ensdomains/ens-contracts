import { SignedSet } from '@ensdomains/dnsprovejs'
import type { Answer, Rrsig } from 'dns-packet'
import { bytesToHex, type Address } from 'viem'

export type RRSet = {
  rrs: Answer[]
  sig: Rrsig
}

export const hexEncodeSignedSet = ({ rrs, sig }: RRSet) => {
  const ss = new SignedSet(rrs, sig)
  return {
    rrset: bytesToHex(ss.toWire()),
    sig: bytesToHex(ss.signature.data.signature),
  }
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
}): RRSet =>
  ({
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
    rrs: texts.map<Answer>(
      (text) =>
        ({
          name: typeof text === 'string' ? name : text.name,
          type: 'TXT',
          class: 'IN',
          ttl: 3600,
          data: [
            Buffer.from(typeof text === 'string' ? text : text.value, 'ascii'),
          ],
        }),
    ),
  })
export const testRrset = ({
  name,
  address,
  inception = INCEPTION,
}: {
  name: string
  address: Address
  inception?: number
}): RRSet =>
  ({
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
        name: `_ens.${name}`,
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
  const rrs: Answer[] = [
    {
      name,
      type: 'DNSKEY',
      class: 'IN',
      ttl: 3600,
      data: { flags: 0, algorithm: 253, key: Buffer.from('0000', 'hex') },
    },
    {
      name,
      type: 'DNSKEY',
      class: 'IN',
      ttl: 3600,
      data: { flags: 0, algorithm: 253, key: Buffer.from('1112', 'hex') },
    },
    {
      name,
      type: 'DNSKEY',
      class: 'IN',
      ttl: 3600,
      data: {
        flags: 0x0101,
        algorithm: 253,
        key: Buffer.from('0000', 'hex'),
      },
    },
  ]
  return { name, sig, rrs }
}
