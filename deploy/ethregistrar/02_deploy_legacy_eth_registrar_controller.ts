import type { DeployFunction } from 'hardhat-deploy/types.js'
import type { Address } from 'viem'

const func: DeployFunction = async function (hre) {
  const { deployments, viem } = hre
  const { run } = deployments

  const { owner } = await viem.getNamedClients()

  const registrar = await viem.getContract('BaseRegistrarImplementation') // as owner
  const priceOracle = await viem.getContract('ExponentialPremiumPriceOracle')
  const reverseRegistrar = await viem.getContract('ReverseRegistrar') // as owner

  const controller = await viem.deploy(
    'LegacyETHRegistrarController',
    [registrar.address, priceOracle.address, 60n, 86400n],
    {
      artifact: await deployments.getArtifact(
        'ETHRegistrarController_mainnet_9380471',
      ),
    },
  )

  const registrarAddControllerHash = await registrar.write.addController(
    [controller.address as Address],
    { account: owner.account },
  )
  console.log(
    `Adding controller as controller on registrar (tx: ${registrarAddControllerHash})...`,
  )
  await viem.waitForTransactionSuccess(registrarAddControllerHash)

  const reverseRegistrarSetControllerHash =
    await reverseRegistrar.write.setController(
      [controller.address as Address, true],
      { account: owner.account },
    )
  console.log(
    `Setting controller of ReverseRegistrar to controller (tx: ${reverseRegistrarSetControllerHash})...`,
  )
  await viem.waitForTransactionSuccess(reverseRegistrarSetControllerHash)

  if (process.env.npm_package_name !== '@ensdomains/ens-contracts') {
    console.log('Running unwrapped name registrations...')
    await run('register-unwrapped-names', {
      deletePreviousDeployments: false,
      resetMemory: false,
    })
  }

  return true
}

func.id = 'legacy-controller'
func.tags = ['LegacyETHRegistrarController']
func.dependencies = [
  'registry',
  'wrapper',
  'LegacyPublicResolver',
  'ExponentialPremiumPriceOracle',
  'ReverseRegistrar',
]

export default func
