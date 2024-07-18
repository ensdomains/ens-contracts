import { SignedSet } from '@ensdomains/dnsprovejs'
import type { Answer, Rrsig } from 'dns-packet'
import { bytesToHex, type Address } from 'viem'

export const hexEncodeSignedSet = ({
  rrs,
  sig,
}: {
  rrs: Answer[] | readonly Answer[]
  sig: Rrsig
}) => {
  const ss = new SignedSet(rrs as Answer[], sig)
  return {
    rrset: bytesToHex(ss.toWire()),
    sig: bytesToHex(ss.signature.data.signature),
  }
}

export const validityPeriod = 2419200
export const expiration = Date.now() / 1000 - 15 * 60 + validityPeriod
export const inception = Date.now() / 1000 - 15 * 60
export const rrsetWithTexts = ({
  name,
  texts,
}: {
  name: string
  texts: (string | { name: string; value: string })[]
}) =>
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
        expiration,
        inception,
        keyTag: 1278,
        signersName: '.',
        signature: new Buffer([]),
      },
    },
    rrs: texts.map(
      (text) =>
        ({
          name: typeof text === 'string' ? name : text.name,
          type: 'TXT',
          class: 'IN',
          ttl: 3600,
          data: [
            Buffer.from(typeof text === 'string' ? text : text.value, 'ascii'),
          ] as Buffer[],
        } as const),
    ),
  } as const)
export const testRrset = ({
  name,
  address,
}: {
  name: string
  address: Address
}) =>
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
        expiration,
        inception,
        keyTag: 1278,
        signersName: '.',
        signature: new Buffer([]),
      },
    },
    rrs: [
      {
        name: `_ens.${name}`,
        type: 'TXT',
        class: 'IN',
        ttl: 3600,
        data: [Buffer.from(`a=${address}`, 'ascii')] as Buffer[],
      },
    ],
  } as const)

export const rootKeys = ({
  expiration,
  inception,
}: {
  expiration: number
  inception: number
}) => {
  var name = '.'
  var sig = {
    name: '.',
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
      signersName: '.',
      signature: new Buffer([]),
    },
  } as const

  var rrs = [
    {
      name: '.',
      type: 'DNSKEY',
      class: 'IN',
      ttl: 3600,
      data: { flags: 0, algorithm: 253, key: Buffer.from('0000', 'hex') },
    },
    {
      name: '.',
      type: 'DNSKEY',
      class: 'IN',
      ttl: 3600,
      data: { flags: 0, algorithm: 253, key: Buffer.from('1112', 'hex') },
    },
    {
      name: '.',
      type: 'DNSKEY',
      class: 'IN',
      ttl: 3600,
      data: {
        flags: 0x0101,
        algorithm: 253,
        key: Buffer.from('0000', 'hex'),
      },
    },
  ] as const
  return { name, sig, rrs }
}
