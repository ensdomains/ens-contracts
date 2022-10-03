import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deploy, run } = deployments
  const { deployer, owner } = await getNamedAccounts()

  const registrar = await ethers.getContract(
    'BaseRegistrarImplementation',
    owner,
  )
  const priceOracle = await ethers.getContract('ExponentialPremiumPriceOracle')
  const reverseRegistrar = await ethers.getContract('ReverseRegistrar', owner)

  await deploy('LegacyETHRegistrarController', {
    from: deployer,
    args: [registrar.address, priceOracle.address, 60, 86400],
    log: true,
    contract: await deployments.getArtifact(
      'ETHRegistrarController_mainnet_9380471',
    ),
  })

  const controller = await ethers.getContract(
    'LegacyETHRegistrarController',
    owner,
  )

  const tx1 = await registrar.addController(controller.address)
  console.log(
    `Adding controller as controller on registrar (tx: ${tx1.hash})...`,
  )
  await tx1.wait()

  const tx3 = await reverseRegistrar.setController(controller.address, {
    from: deployer,
  })
  console.log(
    `Setting controller of ReverseRegistrar to controller (tx: ${tx3.hash})...`,
  )
  await tx3.wait()

  console.log('Running unwrapped name registrations...')
  await run('register-unwrapped-names', {
    deletePreviousDeployments: false,
    resetMemory: false,
  })

  return true
}

func.id = 'legacy-controller'
func.tags = ['LegacyETHRegistrarController']
func.dependencies = [
  'registry',
  'wrapper',
  'LegacyPublicResolver',
  'ReverseRegistrar',
]

export default func
