import { ethers } from 'hardhat'

async function main(hre) {
  console.log({ hre })
  const lock = await ethers.deployContract('OwnedResolver')
  //   hre.storageLayout.export();

  await lock.waitForDeployment()

  console.log(`Deployed to ${lock.target}`)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
