import { type Hex, stringToBytes, bytesToHex } from 'viem'

export function dnsEncodeName(name: string): Hex {
  if (!name) return '0x00' // root
  const v = new Uint8Array(stringToBytes(name).length + 2)
  let offset = 0
  for (const label of name.split('.')) {
    if (!label) throw new Error(`empty label: ${name}`)
    const u = stringToBytes(label)
    if (u.length > 255) throw new Error(`label too long: ${name}`)
    v[offset++] = u.length
    v.set(u, offset)
    offset += u.length
  }
  return bytesToHex(v)
}
