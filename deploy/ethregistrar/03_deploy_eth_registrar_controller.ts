import { Interface } from 'ethers'
import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { makeInterfaceId } from '../utils/solidity'

function computeInterfaceId(iface: Interface) {
  return makeInterfaceId(
    Object.values(iface.fragments).map((frag) => frag.format('sighash')),
  )
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, network } = hre
  const { deploy } = deployments
  const { deployer, owner } = await getNamedAccounts()

  const registry = await ethers.getContractAt('ENSRegistry', owner)

  const registrar = await ethers.getContractAt(
    'BaseRegistrarImplementation',
    owner,
  )
  const priceOracle = await ethers.getContractAt(
    'ExponentialPremiumPriceOracle',
    owner,
  )
  const reverseRegistrar = await ethers.getContractAt('ReverseRegistrar', owner)
  const nameWrapper = await ethers.getContractAt('NameWrapper', owner)
  const ethOwnedResolver = await ethers.getContractAt('OwnedResolver', owner)

  const deployArgs = {
    from: deployer,
    args: [
      registrar.address,
      priceOracle.address,
      60,
      86400,
      reverseRegistrar.address,
      nameWrapper.address,
      registry.address,
    ],
    log: true,
  }
  const controller = await deploy('ETHRegistrarController', deployArgs)
  if (!controller.newlyDeployed) return

  if (owner !== deployer) {
    const c = await ethers.getContractAt('ETHRegistrarController', deployer)
    const tx = await c.transferOwnership(owner)
    console.log(
      `Transferring ownership of ETHRegistrarController to ${owner} (tx: ${tx.hash})...`,
    )
    await tx.wait()
  }

  // Only attempt to make controller etc changes directly on testnets
  if (network.name === 'mainnet') return

  console.log(
    'WRAPPER OWNER',
    await nameWrapper.owner(),
    await nameWrapper.signer.getAddress(),
  )
  const tx1 = await nameWrapper.setController(controller.address, true)
  console.log(
    `Adding ETHRegistrarController as a controller of NameWrapper (tx: ${tx1.hash})...`,
  )
  await tx1.wait()

  const tx2 = await reverseRegistrar.setController(controller.address, true)
  console.log(
    `Adding ETHRegistrarController as a controller of ReverseRegistrar (tx: ${tx2.hash})...`,
  )
  await tx2.wait()

  const artifact = await deployments.getArtifact('IETHRegistrarController')
  const interfaceId = computeInterfaceId(new Interface(artifact.abi))

  const resolver = await registry.resolver(ethers.utils.namehash('eth'))
  if (resolver === ethers.constants.AddressZero) {
    console.log(
      `No resolver set for .eth; not setting interface ${interfaceId} for ETH Registrar Controller`,
    )
    return
  }
  const resolverContract = await ethers.getContractAt('OwnedResolver', resolver)
  const tx3 = await resolverContract.setInterface(
    ethers.utils.namehash('eth'),
    interfaceId,
    controller.address,
  )
  console.log(
    `Setting ETHRegistrarController interface ID ${interfaceId} on .eth resolver (tx: ${tx3.hash})...`,
  )
  await tx3.wait()
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
