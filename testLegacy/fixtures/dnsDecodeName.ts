import { type Hex, toBytes, bytesToString } from 'viem'

export function dnsDecodeName(dns: Hex) {
  const v = toBytes(dns)
  const labels = []
  let pos = 0
  while (pos < v.length) {
    const size = v[pos++]
    if (size == 0 || pos + size > v.length) break
    labels.push(bytesToString(v.subarray(pos, (pos += size))))
  }
  if (pos != v.length)
    throw new Error(`malformed DNS-encoding: ${dns} @ ${pos}`)
  return labels.join('.')
}
