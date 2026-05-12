import { mainnet, optimism, optimismSepolia, sepolia } from 'viem/chains'
import { createChainReverseResolverDeployer } from '../../../test/fixtures/createChainReverseResolverDeployment.js'
import { safeConfig } from '../../l2/00_deploy_l2_reverse_registrar.js'

export default createChainReverseResolverDeployer({
  chainName: 'Optimism',
  targets: {
    [sepolia.id]: {
      chain: optimismSepolia.id,
      verifier: '0x9fc09f6683ea8e8ad0fae3317e39e57582469707',
      registrar: safeConfig.testnet.expectedDeploymentAddress,
      gateways: [
        'https://lb.drpc.org/gateway/unruggable?network=optimism-sepolia',
        'https://optimism-sepolia.3668.io',
      ],
    },
    [mainnet.id]: {
      chain: optimism.id,
      verifier: '0x7f49a74d264e48e64e76e136b2a4ba1310c3604c',
      registrar: safeConfig.mainnet.expectedDeploymentAddress,
      gateways: [
        'https://lb.drpc.org/gateway/unruggable?network=optimism',
        'https://optimism.3668.io',
      ],
    },
  },
})
