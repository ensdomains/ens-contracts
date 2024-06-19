import hre from 'hardhat'
import type { ArtifactsMap, CompilerInput } from 'hardhat/types/artifacts.js'
import {
  bytesToHex,
  hexToBytes,
  toFunctionHash,
  type Abi,
  type AbiFunction,
} from 'viem'

/**
 * @description Matches a function signature string to an exact ABI function.
 *
 * - Required to ensure that the ABI function is an **exact** match for the string, avoiding any potential mismatches.
 *
 * @param {Object} params
 * @param {Abi} params.artifactAbi - The ABI of the interface artifact
 * @param {string} params.fnString - The function signature string to match
 * @returns
 */
const matchStringFunctionToAbi = ({
  artifactAbi,
  fnString,
}: {
  artifactAbi: Abi
  fnString: string
}) => {
  // Extract the function name from the function signature string
  const name = fnString.match(/(?<=function ).*?(?=\()/)![0]

  // Find all functions with the same name
  let matchingFunctions = artifactAbi.filter(
    (abi): abi is AbiFunction => abi.type === 'function' && abi.name === name,
  )
  // If there is only one function with the same name, return it
  if (matchingFunctions.length === 1) return matchingFunctions[0]

  // Extract the input types as strings from the function signature string
  const inputStrings = fnString
    .match(/(?<=\().*?(?=\))/)![0]
    .split(',')
    .map((x) => x.trim())

  // Filter out functions with a different number of inputs
  matchingFunctions = matchingFunctions.filter(
    (abi) => abi.inputs.length === inputStrings.length,
  )
  // If there is only one function with the same number of inputs, return it
  if (matchingFunctions.length === 1) return matchingFunctions[0]

  // Parse the input strings into input type/name
  const parsedInputs = inputStrings.map((x) => {
    const [type, name] = x.split(' ')
    return { type, name }
  })

  // Filter out functions with different input types
  matchingFunctions = matchingFunctions.filter((abi) => {
    for (let i = 0; i < abi.inputs.length; i++) {
      const current = parsedInputs[i]
      const reference = abi.inputs[i]
      // Standard match for most cases (e.g. 'uint256' === 'uint256')
      if (reference.type === current.type) continue
      if ('internalType' in reference && reference.internalType) {
        // Internal types that are equal
        if (reference.internalType === current.type) continue
        // Internal types that are effectively equal (e.g. 'contract INameWrapperUpgrade' === 'INameWrapperUpgrade')
        // Multiple internal type aliases can't exist in the same contract, so this is safe
        const internalTypeName = reference.internalType.split(' ')[1]
        if (internalTypeName === current.type) continue
      }
      // Not matching
      return false
    }
    // 0 length input - matched by default since the filter for input length already passed
    return true
  })
  // If there is only one function with the same inputs, return it
  if (matchingFunctions.length === 1) return matchingFunctions[0]

  throw new Error(`Could not find matching function for ${fnString}`)
}

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
  const artifact = await hre.artifacts.readArtifact(interfaceName)
  const fullyQualifiedNames = await hre.artifacts.getAllFullyQualifiedNames()

  const fullyQualifiedInterfaceName = fullyQualifiedNames.find((n) =>
    n.endsWith(interfaceName),
  )

  if (!fullyQualifiedInterfaceName)
    throw new Error("Couldn't find fully qualified interface name")

  const buildInfo = await hre.artifacts.getBuildInfo(
    fullyQualifiedInterfaceName,
  )

  if (!buildInfo) throw new Error("Couldn't find build info for interface")

  const path = fullyQualifiedInterfaceName.split(':')[0]
  const buildMetadata = JSON.parse(
    (buildInfo.output.contracts[path][interfaceName] as any).metadata,
  ) as CompilerInput
  const { content } = buildMetadata.sources[path]

  return (
    content
      // Remove comments - single and multi-line
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      // Match only the interface block + nested curly braces
      .match(`interface ${interfaceName} .*?{(?:\{??[^{]*?})+`)![0]
      // Remove the interface keyword and the interface name
      .replace(/.*{/s, '')
      // Remove the closing curly brace
      .replace(/}$/s, '')
      // Match array of all function signatures
      .match(/function .*?;/gs)!
      // Remove newlines and trailing semicolons
      .map((fn) =>
        fn
          .split('\n')
          .map((l) => l.trim())
          .join('')
          .replace(/;$/, ''),
      )
      // Match the function signature string to the exact ABI function
      .map((fnString) =>
        matchStringFunctionToAbi({
          artifactAbi: artifact.abi as Abi,
          fnString,
        }),
      )
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
