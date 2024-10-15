import type { DeployContractConfig } from '@nomicfoundation/hardhat-viem/types'
import { extendEnvironment } from 'hardhat/config'
import { lazyObject } from 'hardhat/plugins'
import 'hardhat/types/config.js'
import 'hardhat/types/runtime.js'
import type { Chain, PublicClientConfig } from 'viem'
import '../hardhat.config.cjs'

const isDevelopmentNetwork = (chainId: number) => chainId === 31337

function getParameters<TConfig extends {} | undefined>(
  chain: Chain,
  config: TConfig,
) {
  const defaultParameters = isDevelopmentNetwork(chain.id)
    ? { pollingInterval: 50, cacheTime: 0, ccipRead: false }
    : { ccipRead: false }

  const transportParameters = isDevelopmentNetwork(chain.id)
    ? { retryCount: 0 }
    : {}

  return {
    clientParameters: { ...defaultParameters, ...config },
    transportParameters,
  }
}

extendEnvironment((hre) => {
  const { provider } = hre.network
  const prevViem = hre.viem
  const prevGetPublicClient = prevViem.getPublicClient
  const prevDeployContract = prevViem.deployContract
  hre.viem = lazyObject(() => {
    prevViem.getPublicClient = async (
      publicClientConfig?: Partial<PublicClientConfig>,
    ) => {
      const viem = await import('viem')
      const { chain } = await prevGetPublicClient()
      const { clientParameters, transportParameters } = getParameters(
        chain,
        publicClientConfig,
      )
      const publicClient = viem.createPublicClient({
        chain,
        transport: viem.custom(provider, transportParameters),
        ...clientParameters,
      })
      return publicClient
    }
    prevViem.deployContract = (async (
      contractName: string,
      constructorArgs: any[] = [],
      config: DeployContractConfig = {},
    ) => {
      if (config.client?.public)
        return prevDeployContract(contractName, constructorArgs, config)
      const publicClient = await prevViem.getPublicClient()
      return prevDeployContract(contractName, constructorArgs, {
        ...config,
        client: {
          ...config.client,
          public: publicClient,
        },
      })
    }) as typeof prevViem.deployContract
    return prevViem
  })
})
