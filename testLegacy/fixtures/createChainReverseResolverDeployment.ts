import type { DeployFunction } from 'hardhat-deploy/types.js'
import type { Address } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { coinTypeFromChain } from './ensip19.js'

const owners = {
  [sepolia.id]: '0x343431e9CEb7C19cC8d3eA0EE231bfF82B584910',
  // dao address
  [mainnet.id]: '0xFe89cc7aBB2C4183683ab71653C4cdc9B02D44b7',
} as const

type ResolverDeployment = {
  chain: number
  verifier: Address
  registrar: Address
  gateways: string[]
}

export function createChainReverseResolverDeployer({
  chainName,
  targets,
}: {
  chainName: string
  targets: Record<number, ResolverDeployment>
}) {
  const func: DeployFunction = async function (hre) {
    const { deployer } = await hre.viem.getNamedClients()
    const publicClient = await hre.viem.getPublicClient()

    const defaultReverseRegistrar = await hre.viem
      .getContract('DefaultReverseRegistrar')
      .then((c) => c.address)

    const target = targets[publicClient.chain.id]
    if (!target) {
      console.log(`No target for chain ${publicClient.chain.id}`)
      return
    }
    const { chain, registrar, verifier, gateways } = target

    const owner = owners[publicClient.chain.id as keyof typeof owners]
    // there should always be an owner specified when there are targets
    if (!owner) throw new Error(`No owner for chain ${publicClient.chain.id}`)

    await hre.viem.deploy(
      'ChainReverseResolver',
      [
        owner,
        coinTypeFromChain(chain),
        defaultReverseRegistrar,
        registrar,
        verifier,
        gateways,
      ],
      {
        alias: `${chainName}ReverseResolver`,
        client: deployer,
      },
    )

    return true
  }
  func.id = `ChainReverseResolver:${chainName} v1.0.0`
  func.tags = [
    'category:reverseregistrar',
    'ChainReverseResolver',
    `ChainReverseResolver:${chainName}`,
  ]
  func.dependencies = ['DefaultReverseRegistrar']

  return func
}
