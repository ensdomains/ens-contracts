import { linea, lineaSepolia, mainnet, sepolia } from 'viem/chains'
import { createChainReverseResolverDeployer } from '../../../test/fixtures/createChainReverseResolverDeployment.js'
import { safeConfig } from '../../l2/00_deploy_l2_reverse_registrar.js'

export default createChainReverseResolverDeployer({
  chainName: 'Linea',
  targets: {
    [sepolia.id]: {
      chain: lineaSepolia.id,
      verifier: '0x6AD2BbEE28e780717dF146F59c2213E0EB9CA573',
      registrar: safeConfig.testnet.expectedDeploymentAddress,
      gateways: [
        'https://lb.drpc.org/gateway/unruggable?network=linea-sepolia',
        'https://linea-sepolia.3668.io',
      ],
    },
    [mainnet.id]: {
      chain: linea.id,
      verifier: '0x37041498CF4eE07476d2EDeAdcf82d524Aa22ce4',
      registrar: safeConfig.mainnet.expectedDeploymentAddress,
      gateways: [
        'https://lb.drpc.org/gateway/unruggable?network=linea',
        'https://linea.3668.io',
      ],
    },
  },
})
