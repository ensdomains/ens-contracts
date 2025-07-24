import { SignedSet } from '@ensdomains/dnsprovejs'
import { bytesToHex } from 'viem'
export const hexEncodeSignedSet = ({ rrs, sig }) => {
  const ss = new SignedSet(rrs, sig)
  return {
    rrset: bytesToHex(ss.toWire()),
    sig: bytesToHex(ss.signature.data.signature),
  }
}
export const validityPeriod = 2419200
export const expiration = Date.now() / 1000 - 15 * 60 + validityPeriod
export const inception = Date.now() / 1000 - 15 * 60
export const rrsetWithTexts = ({ name, texts }) => ({
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
  rrs: texts.map((text) => ({
    name: typeof text === 'string' ? name : text.name,
    type: 'TXT',
    class: 'IN',
    ttl: 3600,
    data: [Buffer.from(typeof text === 'string' ? text : text.value, 'ascii')],
  })),
})
export const testRrset = ({ name, address }) => ({
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
      data: [Buffer.from(`a=${address}`, 'ascii')],
    },
  ],
})
export const rootKeys = ({ expiration, inception }) => {
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
  }
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
  ]
  return { name, sig, rrs }
}
