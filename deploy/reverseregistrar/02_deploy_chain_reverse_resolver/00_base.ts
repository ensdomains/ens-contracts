import { base, baseSepolia, mainnet, sepolia } from 'viem/chains'
import { createChainReverseResolverDeployer } from '../../../test/fixtures/createChainReverseResolverDeployment.js'
import { safeConfig } from '../../l2/00_deploy_l2_reverse_registrar.js'

export default createChainReverseResolverDeployer({
  chainName: 'Base',
  targets: {
    [sepolia.id]: {
      chain: baseSepolia.id,
      verifier: '0x2a5c43a0aa33c6ca184ac0eadf0a117109c9d6ae',
      registrar: safeConfig.testnet.expectedDeploymentAddress,
      gateways: [
        'https://lb.drpc.org/gateway/unruggable?network=base-sepolia',
        'https://base-sepolia.3668.io',
      ],
    },
    [mainnet.id]: {
      chain: base.id,
      verifier: '0x074c93cd956b0dd2cac0f9f11dda4d3893a88149',
      registrar: safeConfig.mainnet.expectedDeploymentAddress,
      gateways: [
        'https://lb.drpc.org/gateway/unruggable?network=base',
        'https://base.3668.io',
      ],
    },
  },
})
