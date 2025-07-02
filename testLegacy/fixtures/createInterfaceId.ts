import hre from 'hardhat'
import type { ArtifactsMap } from 'hardhat/types/artifacts.js'
import {
  bytesToHex,
  hexToBytes,
  toFunctionHash,
  type Abi,
  type AbiFunction,
} from 'viem'

/**
 * @description Gets the interface ABI that would be used in Solidity
 *
 * - This function is required since `type(INameWrapper).interfaceId` in Solidity uses **only the function signatures explicitly defined in the interface**. The value for it however can't be derived from any Solidity output?!?!
 *
 * @param interfaceName - The name of the interface to get the ABI for
 * @returns The explicitly defined ABI for the interface
 */
const getSolidityReferenceInterfaceAbi = async (
  interfaceName: keyof ArtifactsMap,
) => {
  const artifact = await hre.artifacts.readArtifact(interfaceName as string)

  // For interfaces, the artifact ABI contains only the functions explicitly defined in the interface
  // This is exactly what we need for calculating the interface ID
  return artifact.abi.filter(
    (item): item is AbiFunction => item.type === 'function',
  )
}

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

export const getInterfaceId = async (interfaceName: keyof ArtifactsMap) => {
  const abi = await getSolidityReferenceInterfaceAbi(interfaceName)
  return createInterfaceId(abi)
}
