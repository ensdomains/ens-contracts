import packet from 'dns-packet'

// https://data.iana.org/root-anchors/root-anchors.xml
export const realAnchors: packet.Ds[] = [
  {
    // <KeyDigest id="Klajeyz" validFrom="2017-02-02T00:00:00+00:00">
    name: '.',
    type: 'DS',
    class: 'IN',
    ttl: 3600,
    data: {
      keyTag: 20326,
      algorithm: 8,
      digestType: 2,
      digest: Buffer.from(
        'E06D44B80B8F1D39A95C0B0D7C65D08458E880409BBC683457104237C7F8EC8D',
        'hex',
      ),
    },
  },
  {
    // KeyDigest id="Kmyv6jo" validFrom="2024-07-18T00:00:00+00:00"
    name: '.',
    type: 'DS',
    class: 'in',
    ttl: 3600,
    data: {
      keyTag: 38696,
      algorithm: 8,
      digestType: 2,
      digest: Buffer.from(
        '683D2D0ACB8C9B712A1948B27F741219298D0A450D612C483AF444A4C0FB2B16',
        'hex',
      ),
    },
  },
]

export const dummyAnchor: packet.Ds = {
  name: '.',
  type: 'DS',
  class: 'IN',
  ttl: 3600,
  data: {
    keyTag: 1278, // Empty body, flags == 0x0101, algorithm = 253, body = 0x0000
    algorithm: 253,
    digestType: 253,
    digest: Buffer.from('', 'hex'),
  },
}

export function encodeAnchors(anchors: packet.Ds[]) {
  return `0x${Buffer.concat(
    anchors.map((x) => packet.answer.encode(x)),
  ).toString('hex')}` as const
}
