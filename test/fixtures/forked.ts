import hre from 'hardhat'

export function isHardhatFork() {
  return (
    (hre.network as any).name === 'hardhat' &&
    'forking' in (hre.network as any).config &&
    !!(hre.network as any).config.forking?.enabled
  )
}
