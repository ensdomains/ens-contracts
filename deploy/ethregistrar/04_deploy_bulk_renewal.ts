import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { keccak256 } from 'js-sha3'
import { namehash } from 'ethers/lib/utils';


const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deploy } = deployments
  const { deployer, owner } = await getNamedAccounts()

  const root = await ethers.getContract('Root', await ethers.getSigner(owner))
  const registry = await ethers.getContract('ENSRegistry', await ethers.getSigner(owner))
  const resolver = await ethers.getContract('PublicResolver', await ethers.getSigner(owner))
  const registrar = await ethers.getContract('BaseRegistrarImplementation')
  const controller = await ethers.getContract('ETHRegistrarController')

  const bulkRenewal = await deploy('BulkRenewal', {
    from: deployer,
    args: [registry.address],
    log: true,
  })

  console.log('Temporarily setting owner of eth tld to owner ');
  const tx = await root.setSubnodeOwner('0x' + keccak256('eth'), owner)
  await tx.wait()

  console.log('Set default resolver for eth tld to public resolver');
  const tx111 = await registry.setResolver(namehash('eth'), resolver.address)
  await tx111.wait()

  console.log('Set interface implementor of eth tld for bulk renewal');
  const tx2 = await resolver.setInterface(ethers.utils.namehash('eth'), '0x3150bfba', bulkRenewal.address)
  await tx2.wait()

  console.log('Set interface implementor of eth tld for registrar controller');
  const tx3  = await resolver.setInterface(ethers.utils.namehash('eth'), '0xdf7ed181', controller.address)
  await tx3.wait()

  console.log('Set owner of eth tld back to registrar');
  const tx11 = await root.setSubnodeOwner('0x' + keccak256('eth'), registrar.address)
  await tx11.wait()

  return true
}

func.id = 'bulk-renewal'
func.tags = ['ethregistrar', 'BulkRenewal']
func.dependencies = ['root', 'registry', 'BaseRegistrarImplementation', 'PublicResolver', 'ETHRegistrarController']

export default func