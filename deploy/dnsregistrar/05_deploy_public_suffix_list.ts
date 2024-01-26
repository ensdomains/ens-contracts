import { ethers } from 'hardhat'
import packet from 'dns-packet'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

function encodeName(name: string) {
  return '0x' + packet.name.encode(name).toString('hex')
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deploy } = deployments
  const { deployer, owner } = await getNamedAccounts()

  await deploy('SimplePublicSuffixList', {
    from: deployer,
    gasLimit: 10000000,
    args: [],
    log: true,
  })
  const psl = await ethers.getContract('SimplePublicSuffixList')
  const listOwner = await psl.owner()

  if (owner !== undefined && owner !== deployer && listOwner !== owner) {
    console.log('Transferring ownership to owner account')
    await psl.transferOwnership(owner)
  }
  const publicSuffixList = psl.connect(await ethers.getSigner(owner))

  const suffixList = await (
    await fetch('https://publicsuffix.org/list/public_suffix_list.dat')
  ).text()
  let suffixes = suffixList
    .split('\n')
    .filter((suffix) => !suffix.startsWith('//') && suffix.trim() != '')
  // Right now we're only going to support top-level, non-idna suffixes
  suffixes = suffixes.filter((suffix) => suffix.match(/^[a-z0-9]+$/))
  const txes = []
  console.log('Starting suffix transactions')
  for (let i = 0; i < suffixes.length; i += 100) {
    const batch = suffixes.slice(i, i + 100).map((suffix) => encodeName(suffix))
    const tx = await publicSuffixList.addPublicSuffixes(batch)
    console.log('Setting suffixes ' + tx.hash)
    txes.push(tx)
  }
  console.log(
    `Waiting on ${txes.length} suffix-setting transactions to complete...`,
  )
  await Promise.all(txes.map((tx) => tx.wait()))
}

func.tags = ['SimplePublicSuffixList']
func.dependencies = []

export default func
