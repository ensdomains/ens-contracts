import { execute, artifacts } from '@rocketh'
import { concat, zeroHash, type Hex } from 'viem'

const usvAddress = '0x164af34fAF9879394370C7f09064127C043A35E9'

export default execute(
  async ({ namedAccounts, viem, deployments }) => {
    const { deployer } = namedAccounts

    const publicClient = await viem.getPublicClient()

    // ensure Deterministic Deployment Proxy is deployed
    const ddpAddress = '0x4e59b44847b379578588920ca78fbf26c0b4956c'
    const ddpBytecode = await publicClient.getBytecode({
      address: ddpAddress,
    })
    if (!ddpBytecode) {
      // 100k gas @ 100 gwei
      const minBalance = 10n ** 16n // 0.01 ETH
      const balanceTransferHash = await deployer.wallet.sendTransaction({
        // signer address for ddp deployment tx
        to: '0x3fab184622dc19b6109349b94811493bf2a45362',
        value: minBalance,
      })
      await viem.waitForTransactionSuccess(balanceTransferHash)

      const ddpDeployHash = await publicClient.sendRawTransaction({
        serializedTransaction:
          '0xf8a58085174876e800830186a08080b853604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf31ba02222222222222222222222222222222222222222222222222222222222222222a02222222222222222222222222222222222222222222222222222222222222222',
      })
      await viem.waitForTransactionSuccess(ddpDeployHash)
      console.log(`Deterministic Deployment Proxy deployed at ${ddpAddress}`)
    }

    const usvArtifact = await (deployments as any).getArtifact(
      'UniversalSigValidator',
    )
    const usvBytecode = usvArtifact.bytecode as Hex
    const usvDeployHash = await deployer.wallet.sendTransaction({
      to: ddpAddress,
      data: concat([zeroHash, usvBytecode]),
    })
    await viem.waitForTransactionSuccess(usvDeployHash)

    const usvDeployedBytecode = await publicClient.getBytecode({
      address: usvAddress,
    })
    if (!usvDeployedBytecode)
      throw new Error('UniversalSigValidator not deployed')

    console.log(`UniversalSigValidator deployed at ${usvAddress}`)
  },
  {
    id: 'UniversalSigValidator v1.0.0',
    tags: ['category:utils', 'UniversalSigValidator'],
    dependencies: [],
    skip: async ({ viem }: any) => {
      const publicClient = await viem.getPublicClient()
      const usvDeployedBytecode = await publicClient.getBytecode({
        address: usvAddress,
      })
      return !!usvDeployedBytecode
    },
  } as any,
)
