import { Interface } from 'ethers/lib/utils'
import { task } from 'hardhat/config'

const { makeInterfaceId } = require('@openzeppelin/test-helpers')

function computeInterfaceId(iface: Interface) {
  return makeInterfaceId.ERC165(
    Object.values(iface.functions).map((frag) => frag.format('sighash')),
  )
}

task('interface', 'Prints the EIP165 interface ID of a contract')
  .addPositionalParam('contract', 'The contract to print the interface ID of')
  .setAction(async ({ contract }, hre) => {
    const artifact = await hre.artifacts.readArtifact(contract)
    console.log(computeInterfaceId(new Interface(artifact.abi)))
  })
