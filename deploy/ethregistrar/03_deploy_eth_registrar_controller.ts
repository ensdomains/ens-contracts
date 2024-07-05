import type { DeployFunction } from 'hardhat-deploy/types.js'
import { namehash, zeroAddress } from 'viem'
import { createInterfaceId } from '../../test/fixtures/createInterfaceId.js'

const func: DeployFunction = async function (hre) {
  const { deployments, network, viem } = hre

  const { deployer, owner } = await viem.getNamedClients()

  const registry = await viem.getContract('ENSRegistry', owner)

  const registrar = await viem.getContract('BaseRegistrarImplementation', owner)
  const priceOracle = await viem.getContract(
    'ExponentialPremiumPriceOracle',
    owner,
  )
  const reverseRegistrar = await viem.getContract('ReverseRegistrar', owner)
  const nameWrapper = await viem.getContract('NameWrapper', owner)

  const controllerDeployment = await viem.deploy('ETHRegistrarController', [
    registrar.address,
    priceOracle.address,
    60n,
    86400n,
    reverseRegistrar.address,
    nameWrapper.address,
    registry.address,
  ])
  if (!controllerDeployment.newlyDeployed) return

  const controller = await viem.getContract('ETHRegistrarController')

  if (owner.address !== deployer.address) {
    const hash = await controller.write.transferOwnership([owner.address])
    console.log(
      `Transferring ownership of ETHRegistrarController to ${owner.address} (tx: ${hash})...`,
    )
    await viem.waitForTransactionSuccess(hash)
  }

  // Only attempt to make controller etc changes directly on testnets
  if (network.name === 'mainnet') return

  const nameWrapperSetControllerHash = await nameWrapper.write.setController([
    controller.address,
    true,
  ])
  console.log(
    `Adding ETHRegistrarController as a controller of NameWrapper (tx: ${nameWrapperSetControllerHash})...`,
  )
  await viem.waitForTransactionSuccess(nameWrapperSetControllerHash)

  const reverseRegistrarSetControllerHash =
    await reverseRegistrar.write.setController([controller.address, true])
  console.log(
    `Adding ETHRegistrarController as a controller of ReverseRegistrar (tx: ${reverseRegistrarSetControllerHash})...`,
  )
  await viem.waitForTransactionSuccess(reverseRegistrarSetControllerHash)

  const artifact = await deployments.getArtifact('IETHRegistrarController')
  const interfaceId = createInterfaceId(artifact.abi)

  const resolver = await registry.read.resolver([namehash('eth')])
  if (resolver === zeroAddress) {
    console.log(
      `No resolver set for .eth; not setting interface ${interfaceId} for ETH Registrar Controller`,
    )
    return
  }

  const ethOwnedResolver = await viem.getContract('OwnedResolver')
  const setInterfaceHash = await ethOwnedResolver.write.setInterface([
    namehash('eth'),
    interfaceId,
    controller.address,
  ])
  console.log(
    `Setting ETHRegistrarController interface ID ${interfaceId} on .eth resolver (tx: ${setInterfaceHash})...`,
  )
  await viem.waitForTransactionSuccess(setInterfaceHash)
}

func.tags = ['ethregistrar', 'ETHRegistrarController']
func.dependencies = [
  'ENSRegistry',
  'BaseRegistrarImplementation',
  'ExponentialPremiumPriceOracle',
  'ReverseRegistrar',
  'NameWrapper',
  'OwnedResolver',
]

export default func
