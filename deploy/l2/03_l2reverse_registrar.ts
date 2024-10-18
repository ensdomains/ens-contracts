import { evmChainIdToCoinType } from '@ensdomains/address-encoder/utils'
import type { DeployFunction } from 'hardhat-deploy/types.js'
import { namehash } from 'viem'

const func: DeployFunction = async function (hre) {
  const { viem } = hre

  const chainId = hre.network.config.chainId!
  const coinType = evmChainIdToCoinType(chainId) as bigint
  const coinTypeHex = coinType.toString(16)

  const REVERSE_NAMESPACE = `${coinTypeHex}.reverse`
  const REVERSENODE = namehash(REVERSE_NAMESPACE)

  console.log(
    `REVERSE_NAMESPACE for chainId ${chainId} is ${REVERSE_NAMESPACE}`,
  )
  console.log(
    `Deploying L2ReverseResolver with REVERSENODE ${REVERSENODE} and coinType ${coinTypeHex}`,
  )

  await viem.deploy('L2ReverseResolver', [REVERSENODE, coinType])
}

func.tags = ['L2ReverseResolver', 'l2']

export default func
