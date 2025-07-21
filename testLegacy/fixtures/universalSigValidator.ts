import hre from 'hardhat'
import { concat, zeroHash, type Hex } from 'viem'

const ddpSigner = '0x3fab184622dc19b6109349b94811493bf2a45362'
const ddpAddress = '0x4e59b44847b379578588920ca78fbf26c0b4956c'

export async function deployUniversalSigValidator() {
  const testClient = await hre.viem.getTestClient()
  const publicClient = await hre.viem.getPublicClient()
  const [walletClient] = await hre.viem.getWalletClients()

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
    await hre.viem.waitForTransactionSuccess(deterministicDeployerDeployHash)
  }

  const usvCurrentBytecode = await publicClient.getBytecode({
    address: '0x164af34fAF9879394370C7f09064127C043A35E9',
  })
  if (!usvCurrentBytecode) {
    // deploy universal sig validator
    const usvArtifact = await hre.deployments.getArtifact(
      'UniversalSigValidator',
    )
    const usvBytecode = usvArtifact.bytecode as Hex
    const universalSigValidatorDeployHash = await walletClient.sendTransaction({
      to: ddpAddress,
      data: concat([zeroHash, usvBytecode]),
    })
    await hre.viem.waitForTransactionSuccess(universalSigValidatorDeployHash)
  }
}
