import { Interface } from 'ethers/lib/utils';
import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const { makeInterfaceId } = require('@openzeppelin/test-helpers')

function computeInterfaceId(iface: Interface) {
  return makeInterfaceId.ERC165(Object.values(iface.functions).map((frag) => frag.format("sighash")));
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, network } = hre
  const { deploy, fetchIfDifferent } = deployments
  const { deployer } = await getNamedAccounts()

  const registrar = await ethers.getContract('BaseRegistrarImplementation')
  const priceOracle = await ethers.getContract('ExponentialPremiumPriceOracle')
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
  const controller = await deploy('ETHRegistrarController', deployArgs)
  if(!controller.newlyDeployed) return;

  // Only attempt to make controller etc changes directly on testnets
  if(network.name === 'mainnet') return;

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

  const artifact = await deployments.getArtifact("IETHRegistrarController");
  const interfaceId = computeInterfaceId(new Interface(artifact.abi));
  const provider = await ethers.getDefaultProvider();
  const resolver = await provider.getResolver("eth");
  if(resolver === null) {
    console.log("No resolver set for .eth; not setting interface for ETH Registrar Controller");
    return;
  }
  const resolverContract = await ethers.getContractAt('PublicResolver', resolver.address);
  const tx4 = await resolverContract.setInterface(ethers.utils.namehash('eth'), interfaceId, controller.address);
  console.log(
    `Setting ETHRegistrarController interface ID ${interfaceId} on .eth resolver (tx: ${tx4.hash})...`
  )
  await tx4.wait()
}

func.tags = ['ethregistrar', 'ETHRegistrarController']
func.dependencies = [
  'ENSRegistry',
  'BaseRegistrarImplementation',
  'ExponentialPremiumPriceOracle',
  'ReverseRegistrar',
  'NameWrapper',
]

export default func
