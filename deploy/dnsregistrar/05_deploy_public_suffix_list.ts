import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deploy } = deployments
  const { deployer, owner } = await getNamedAccounts()

  await deploy('SimplePublicSuffixList', {
    from: deployer,
    args: [],
    log: true,
  })
  const publicSuffixList = await ethers.getContract('SimplePublicSuffixList')

  const suffixList = await (
    await fetch('https://publicsuffix.org/list/public_suffix_list.dat')
  ).text()
  let suffixes = suffixList
    .split('\n')
    .filter((suffix) => !suffix.startsWith('//') && suffix.trim() != '')
  // Right now we're only going to support top-level, non-idna suffixes
  suffixes = suffixes.filter((suffix) => suffix.match(/^[a-z0-9]+$/))
  const promises = []
  for (let i = 0; i < suffixes.length; i += 100) {
    const batch = suffixes
      .slice(i, i + 100)
      .map((suffix) => ethers.utils.toUtf8Bytes(suffix))
    promises.push(publicSuffixList.addPublicSuffixes(batch))
  }
  console.log(
    `Waiting on ${promises.length} suffix-setting transactions to complete...`,
  )
  await Promise.all(promises)

  if (owner !== undefined && owner !== deployer) {
    console.log('Transferring ownership to owner account')
    await publicSuffixList.transferOwnership(owner)
  }
}

func.tags = ['SimplePublicSuffixList']
func.dependencies = []

export default func
