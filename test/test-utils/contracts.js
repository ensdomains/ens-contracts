const { ethers } = require('hardhat')

async function deploy(name, _args) {
  const args = _args || []

  const contractArtifacts = await ethers.getContractFactory(name)
  const contract = await contractArtifacts.deploy(...args)
  contract.name = name
  return contract
}

module.exports = {
  deploy,
}
