import packet from 'dns-packet'

export const realEntries = [
  {
    name: '.',
    type: 'DS',
    class: 'IN',
    ttl: 3600,
    data: {
      keyTag: 19036,
      algorithm: 8,
      digestType: 2,
      digest: new Buffer(
        '49AAC11D7B6F6446702E54A1607371607A1A41855200FD2CE1CDDE32F24E8FB5',
        'hex',
      ),
    },
  },
  {
    name: '.',
    type: 'DS',
    klass: 'IN',
    ttl: 3600,
    data: {
      keyTag: 20326,
      algorithm: 8,
      digestType: 2,
      digest: new Buffer(
        'E06D44B80B8F1D39A95C0B0D7C65D08458E880409BBC683457104237C7F8EC8D',
        'hex',
      ),
    },
  },
] as const

export const dummyEntry = {
  name: '.',
  type: 'DS',
  class: 'IN',
  ttl: 3600,
  data: {
    keyTag: 1278, // Empty body, flags == 0x0101, algorithm = 253, body = 0x0000
    algorithm: 253,
    digestType: 253,
    digest: new Buffer('', 'hex'),
  },
} as const

export const testEntries = [...realEntries, dummyEntry] as const

export const encodedAnchors = `0x${testEntries
  .map((entry) => packet.answer.encode(entry).toString('hex'))
  .join('')}` as const

export const encodedRealAnchors = `0x${realEntries
  .map((entry) => packet.answer.encode(entry).toString('hex'))
  .join('')}` as const
