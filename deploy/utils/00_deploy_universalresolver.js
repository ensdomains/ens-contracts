const { ethers } = require('hardhat')

async function main() {
  const [deployer] = await ethers.getSigners()

  console.log('Deploying contracts with the account:', deployer.address)

  console.log('Account balance:', (await deployer.getBalance()).toString())

  const UniversalResolver = await ethers.getContractFactory('UniversalResolver')
  const UniversalResolverContract = await UniversalResolver.deploy(
    '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' //ENS Registry
  )

  console.log('UniversalResolver address:', UniversalResolverContract.address)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
