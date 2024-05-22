import {
  bytesToHex,
  hexToBytes,
  toFunctionHash,
  type Abi,
  type AbiFunction,
} from 'viem'

export const createInterfaceId = <iface extends Abi>(iface: iface) => {
  const bytesId = iface
    .filter((item): item is AbiFunction => item.type === 'function')
    .map((f) => toFunctionHash(f))
    .map((h) => hexToBytes(h).slice(0, 4))
    .reduce((memo, bytes) => {
      for (let i = 0; i < 4; i++) {
        memo[i] = memo[i] ^ bytes[i] // xor
      }
      return memo
    }, new Uint8Array(4))

  return bytesToHex(bytesId)
}
