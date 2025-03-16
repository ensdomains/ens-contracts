import { bytesToString, type Hex, toBytes } from 'viem'

export function dnsDecodeName(dns: Hex) {
  const v = toBytes(dns)
  const labels = []
  let i = 0
  while (i < v.length) {
    let n = v[i++]
    if (n == 0 || i + n > v.length) break
    labels.push(bytesToString(v.subarray(i, (i += n))))
  }
  if (i != v.length) throw new Error(`malformed DNS-encoding: ${dns}`)
  return labels.join('.')
}
