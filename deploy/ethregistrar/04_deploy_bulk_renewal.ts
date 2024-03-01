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
  const { deployer } = await getNamedAccounts()

  const registry = await ethers.getContractFactory('ENSRegistry')
  const controller = await ethers.getContractFactory('ETHRegistrarController')

  const bulkRenewal = await deploy('StaticBulkRenewal', {
    from: deployer,
    args: [controller.address],
    log: true,
  })

  // Only attempt to make resolver etc changes directly on testnets
  if (network.name === 'mainnet') return

  const artifact = await deployments.getArtifact('IBulkRenewal')
  const interfaceId = computeInterfaceId(new Interface(artifact.abi))
  const resolver = await registry.resolver(ethers.utils.namehash('eth'))
  if (resolver === ethers.constants.AddressZero) {
    console.log(
      `No resolver set for .eth; not setting interface ${interfaceId} for BulkRenewal`,
    )
    return
  }
  const resolverContract = await ethers.getContractAt('OwnedResolver', resolver)
  const tx = await resolverContract.setInterface(
    ethers.utils.namehash('eth'),
    interfaceId,
    bulkRenewal.address,
  )
  console.log(
    `Setting BulkRenewal interface ID ${interfaceId} on .eth resolver (tx: ${tx.hash})...`,
  )
  await tx.wait()
  return true
}

func.id = 'bulk-renewal'
func.tags = ['BulkRenewal']
func.dependencies = ['registry']

export default func
