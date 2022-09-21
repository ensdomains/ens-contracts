import { Interface } from 'ethers/lib/utils'
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
  const { deployer, owner } = await getNamedAccounts()

  const registry = await ethers.getContract('ENSRegistry')
  const registrar = await ethers.getContract('BaseRegistrarImplementation')
  const metadata = await ethers.getContract('StaticMetadataService')

  const deployArgs = {
    from: deployer,
    args: [registry.address, registrar.address, metadata.address],
    log: true,
  };

  const nameWrapper = await deploy('NameWrapper', deployArgs)
  if(!nameWrapper.newlyDeployed) return;

  // Only attempt to make controller etc changes directly on testnets
  if(network.name === 'mainnet') return;

  const tx = await registrar.addController(nameWrapper.address, {
    from: owner,
  })
  console.log(
    `Adding NameWrapper as controller on registrar (tx: ${tx.hash})...`,
  )
  await tx.wait()

  const artifact = await deployments.getArtifact("NameWrapper");
  const interfaceId = computeInterfaceId(new Interface(artifact.abi));
  const provider = await ethers.getDefaultProvider();
  const resolver = await provider.getResolver("eth");
  if(resolver === null) {
    console.log("No resolver set for .eth; not setting interface for NameWrapper");
    return;
  }
  const resolverContract = await ethers.getContractAt('PublicResolver', resolver.address);
  const tx2 = await resolverContract.setInterface(ethers.utils.namehash('eth'), interfaceId, nameWrapper.address);
  console.log(
    `Setting NameWrapper interface ID ${interfaceId} on .eth resolver (tx: ${tx2.hash})...`
  )
  await tx2.wait()
}

func.id = 'name-wrapper'
func.tags = ['wrapper', 'NameWrapper']
func.dependencies = ['BaseRegistrarImplementation', 'StaticMetadataService', 'registry']

export default func
