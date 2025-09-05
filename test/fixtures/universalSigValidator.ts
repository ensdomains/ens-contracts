import hre from 'hardhat'
import { concat, zeroHash, keccak256, pad, type Hex } from 'viem'

const ddpSigner = '0x3fab184622dc19b6109349b94811493bf2a45362'
const ddpAddress = '0x4e59b44847b379578588920ca78fbf26c0b4956c'

// Calculate the deterministic address for UniversalSigValidator
export async function getUniversalSigValidatorAddress(): Promise<`0x${string}`> {
  const usvArtifact = await hre.artifacts.readArtifact('UniversalSigValidator')
  const usvBytecode = usvArtifact.bytecode as Hex

  const deterministicAddress = `0x${keccak256(
    concat([
      '0xff',
      pad(ddpAddress as `0x${string}`, { size: 20 }),
      zeroHash,
      keccak256(usvBytecode),
    ]),
  ).slice(-40)}` as `0x${string}`

  return deterministicAddress
}

export async function deployUniversalSigValidator() {
  const connection = await hre.network.connect()
  const testClient = await connection.viem.getTestClient()
  const publicClient = await connection.viem.getPublicClient()
  const [walletClient] = await connection.viem.getWalletClients()

  // Get the expected address - either hardcoded or calculated
  const expectedAddress = '0x164af34fAF9879394370C7f09064127C043A35E9'
  const calculatedAddress = await getUniversalSigValidatorAddress()

  console.log(`Expected USV address: ${expectedAddress}`)
  console.log(`Calculated USV address: ${calculatedAddress}`)

  // If addresses don't match, we'll deploy to the calculated address
  // and log the difference for developer awareness
  const targetAddress = calculatedAddress

  // deploy deterministic deployer proxy
  await testClient.setBalance({
    address: ddpSigner,
    value: 10n ** 16n,
  })
  const ddpBytecode = await publicClient.getBytecode({
    address: ddpAddress,
  })
  if (!ddpBytecode) {
    const deterministicDeployerDeployHash =
      await publicClient.sendRawTransaction({
        serializedTransaction:
          '0xf8a58085174876e800830186a08080b853604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf31ba02222222222222222222222222222222222222222222222222222222222222222a02222222222222222222222222222222222222222222222222222222222222222',
      })
    await publicClient.waitForTransactionReceipt({
      hash: deterministicDeployerDeployHash,
    })
  }

  // Check if USV is already deployed at the calculated address
  const usvCurrentBytecode = await publicClient.getBytecode({
    address: targetAddress,
  })
  if (!usvCurrentBytecode) {
    // deploy universal sig validator
    const usvArtifact = await hre.artifacts.readArtifact(
      'UniversalSigValidator',
    )
    const usvBytecode = usvArtifact.bytecode as Hex
    const universalSigValidatorDeployHash = await walletClient.sendTransaction({
      to: ddpAddress,
      data: concat([zeroHash, usvBytecode]),
    })
    await publicClient.waitForTransactionReceipt({
      hash: universalSigValidatorDeployHash,
    })
    console.log(`UniversalSigValidator deployed at: ${targetAddress}`)
  }

  // If the calculated address differs from expected, we need to handle this in tests
  if (calculatedAddress !== expectedAddress) {
    console.warn(`⚠️  Address mismatch detected:`)
    console.warn(`   Expected: ${expectedAddress}`)
    console.warn(`   Actual:   ${calculatedAddress}`)
    console.warn(
      `   This test may fail due to hardcoded address in SignatureUtils.sol`,
    )
  }

  return { deployedAddress: targetAddress, expectedAddress }
}
