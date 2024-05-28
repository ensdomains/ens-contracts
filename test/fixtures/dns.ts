import { SignedSet } from '@ensdomains/dnsprovejs'
import type { Answer, Rrsig } from 'dns-packet'
import { bytesToHex } from 'viem'

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
