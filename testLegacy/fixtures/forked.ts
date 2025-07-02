import hre from 'hardhat'

export function isHardhatFork() {
  return (
    hre.network.name === 'hardhat' &&
    'forking' in hre.network.config &&
    !!hre.network.config.forking?.enabled
  )
}
