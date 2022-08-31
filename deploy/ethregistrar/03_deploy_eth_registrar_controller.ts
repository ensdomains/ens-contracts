import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, network } = hre
  const { deploy, fetchIfDifferent } = deployments
  const { deployer } = await getNamedAccounts()

  const registrar = await ethers.getContract('BaseRegistrarImplementation')
  const priceOracle = await ethers.getContract('StablePriceOracle')
  const reverseRegistrar = await ethers.getContract('ReverseRegistrar')
  const nameWrapper = await ethers.getContract('NameWrapper')

  const deployArgs = {
    from: deployer,
    args: [
      registrar.address,
      priceOracle.address,
      60,
      86400,
      reverseRegistrar.address,
      nameWrapper.address,
    ],
    log: true,
  };
  const { differences } = await fetchIfDifferent('ETHRegistrarController', deployArgs);
  if(!differences) return;

  const controller = await deploy('ETHRegistrarController', deployArgs)

  const tx1 = await registrar.addController(controller.address, {
    from: deployer,
  })
  console.log(
    `Adding ETHRegistrarController as controller on BaseRegistrarImplementation (tx: ${tx1.hash})...`,
  )
  await tx1.wait()

  const tx2 = await nameWrapper.setController(controller.address, {
    from: deployer,
  })
  console.log(
    `Adding ETHRegistrarController as a controller of NameWrapper (tx: ${tx2.hash})...`,
  )
  await tx2.wait()

  const tx3 = await reverseRegistrar.setController(controller.address, {
    from: deployer,
  })
  console.log(
    `Adding ETHRegistrarController as a controller of ReverseRegistrar (tx: ${tx3.hash})...`,
  )
  await tx3.wait()
}

func.tags = ['ethregistrar', 'ETHRegistrarController']
func.dependencies = ['ENSRegistry', 'BaseRegistrarImplementation', 'StablePriceOracle', 'ReverseRegistrar', 'NameWrapper']

export default func
