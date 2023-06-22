// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require('hardhat')

async function main() {
  const { getNamedAccounts, deployments } = hre
  const { deploy } = deployments
  const { deployer, owner } = await getNamedAccounts()

  // npx hardhat run scripts/deploy.js --network goerli
  // Goerli
  // const _ens = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
  // const wrapperAddress = '0x114D4603199df73e7D157787f8778E21fCd13066';
  // const _trustedETHController = '0xCc5e7dB10E65EED1BBD105359e7268aa660f6734';
  // const _trustedReverseRegistrar = '0x4f7A657451358a22dc397d5eE7981FfC526cd856';

  // npx hardhat run scripts/deploy.js --network mainnet
  // Mainnet
  const _ens = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
  const wrapperAddress = '0xd4416b13d2b3a9abae7acd5d6c2bbdbe25686401'
  const _trustedETHController = '0x253553366Da8546fC250F225fe3d25d0C782303b'
  const _trustedReverseRegistrar = '0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb'

  const deployArgs = {
    from: deployer,
    args: [
      _ens,
      wrapperAddress,
      _trustedETHController,
      _trustedReverseRegistrar,
    ],
    log: true,
  }

  const publicResolver = await deploy('PublicResolver', deployArgs)

  if (!publicResolver.newlyDeployed) return

  // await publicResolver.waitForDeployment();

  console.log(`Deployed to ${publicResolver.address}`)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
