import { arbitrum, arbitrumSepolia, mainnet, sepolia } from 'viem/chains'
import { createChainReverseResolverDeployer } from '../../../test/fixtures/createChainReverseResolverDeployment.js'
import { safeConfig } from '../../l2/00_deploy_l2_reverse_registrar.js'

export default createChainReverseResolverDeployer({
  chainName: 'Arbitrum',
  targets: {
    [sepolia.id]: {
      chain: arbitrumSepolia.id,
      verifier: '0x5e2a4f6c4cc16b27424249eedb15326207c9ee44',
      registrar: safeConfig.testnet.expectedDeploymentAddress,
      gateways: [
        'https://lb.drpc.org/gateway/unruggable?network=arbitrum-sepolia',
        'https://arbitrum-sepolia.3668.io',
      ],
    },
    [mainnet.id]: {
      chain: arbitrum.id,
      verifier: '0x547af78b28290D4158c1064FF092ABBcc4cbfD97',
      registrar: safeConfig.mainnet.expectedDeploymentAddress,
      gateways: [
        'https://lb.drpc.org/gateway/unruggable?network=arbitrum',
        'https://arbitrum.3668.io',
      ],
    },
  },
})
