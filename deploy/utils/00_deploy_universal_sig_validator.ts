import { execute, artifacts } from '@rocketh'
import { concat, zeroHash, type Hex, createPublicClient, http } from 'viem'

const usvAddress = '0x164af34fAF9879394370C7f09064127C043A35E9'

export default execute(
  async ({ tx, namedAccounts, network }) => {
    const { deployer } = namedAccounts

    // Create public client for reading contract state
    const publicClient = createPublicClient({
      chain: {
        id: network.chain?.id || network.config?.chainId || 31337,
        name: network.name || 'localhost',
        rpcUrls: {
          default: {
            http: [network.config?.rpcUrl || 'http://127.0.0.1:8545'],
          },
        },
        nativeCurrency: {
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18,
        },
      },
      transport: http(network.config?.rpcUrl || 'http://127.0.0.1:8545'),
    })

    // Check if already deployed
    const usvDeployedBytecode = await publicClient.getBytecode({
      address: usvAddress,
    })
    if (usvDeployedBytecode) {
      console.log(`UniversalSigValidator already deployed at ${usvAddress}`)
      return true
    }

    // ensure Deterministic Deployment Proxy is deployed
    const ddpAddress = '0x4e59b44847b379578588920ca78fbf26c0b4956c'
    const ddpBytecode = await publicClient.getBytecode({
      address: ddpAddress,
    })
    if (!ddpBytecode) {
      // 100k gas @ 100 gwei
      const minBalance = 10n ** 16n // 0.01 ETH
      const balanceTransferHash = await tx({
        // signer address for ddp deployment tx
        to: '0x3fab184622dc19b6109349b94811493bf2a45362',
        value: minBalance,
        account: deployer,
      })
      console.log(
        `Transferred balance for DDP deployment (tx: ${balanceTransferHash})`,
      )

      const ddpDeployHash = await publicClient.sendRawTransaction({
        serializedTransaction:
          '0xf8a58085174876e800830186a08080b853604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf31ba02222222222222222222222222222222222222222222222222222222222222222a02222222222222222222222222222222222222222222222222222222222222222',
      })
      console.log(
        `Deterministic Deployment Proxy deployed at ${ddpAddress} (tx: ${ddpDeployHash})`,
      )
    }

    const usvArtifact = artifacts.UniversalSigValidator
    const usvBytecode = usvArtifact.bytecode as Hex
    const usvDeployHash = await tx({
      to: ddpAddress,
      data: concat([zeroHash, usvBytecode]),
      account: deployer,
    })
    console.log(
      `UniversalSigValidator deployed at ${usvAddress} (tx: ${usvDeployHash})`,
    )

    return true
  },
  {
    id: 'UniversalSigValidator v1.0.0',
    tags: ['category:utils', 'UniversalSigValidator'],
    dependencies: [],
  },
)
