import { artifacts, deployScript } from '@rocketh'
import { mainnet, sepolia } from 'viem/chains'
import { coinTypeFromChain } from './ensip19.js'

const owners = {
  [sepolia.id]: '0x343431e9CEb7C19cC8d3eA0EE231bfF82B584910',
  // dao address
  [mainnet.id]: '0xFe89cc7aBB2C4183683ab71653C4cdc9B02D44b7',
}

export function createChainReverseResolverDeployer({
  chainName,
  targets,
}: {
  chainName: string
  targets: Record<number, any>
}) {
  const func = deployScript(
    async ({ deploy, get, namedAccounts, network }) => {
      const { deployer } = namedAccounts

      const defaultReverseRegistrar = await get('DefaultReverseRegistrar')
      const chainId =
        network.chain?.id || (network as any).config?.chainId || 31337
      const target = targets[chainId]

      if (!target) {
        console.log(`No target for chain ${chainId}`)
        return
      }

      const { chain, registrar, verifier, gateways } = target
      const owner = owners[chainId as keyof typeof owners]

      // there should always be an owner specified when there are targets
      if (!owner) throw new Error(`No owner for chain ${chainId}`)

      await deploy(`${chainName}ReverseResolver`, {
        account: deployer,
        artifact: artifacts.ChainReverseResolver,
        args: [
          owner as `0x${string}`,
          coinTypeFromChain(chain),
          defaultReverseRegistrar.address,
          registrar,
          verifier,
          gateways,
        ],
      })
    },
    {
      id: `ChainReverseResolver:${chainName} v1.0.0`,
      tags: [
        'category:reverseregistrar',
        'ChainReverseResolver',
        `ChainReverseResolver:${chainName}`,
      ],
      dependencies: ['DefaultReverseRegistrar'],
    },
  )
  return func
}
