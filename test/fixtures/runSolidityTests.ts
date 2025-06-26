import hre from 'hardhat'
import type { Abi, AbiFunction } from 'abitype'
import type { Artifact, ArtifactsMap } from 'hardhat/types/index.js'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'

export function runSolidityTests<N extends keyof ArtifactsMap>(name: N) {
  const artifact: Artifact = hre.artifacts.readArtifactSync(name)
  const abi: Abi = artifact.abi
  const tests = abi.filter(
    (x): x is AbiFunction => x.type === 'function' && x.name.startsWith('test'),
  )
  if (!tests.length) throw new Error(`no tests: ${name}`)

  async function fixture() {
    const publicClient = await hre.viem.getPublicClient()
    const contract = await hre.viem.deployContract(artifact.contractName)
    return { publicClient, contract }
  }

  describe(name, () => {
    tests.forEach((fn) => {
      it(fn.name, async () => {
        const F = await loadFixture(fixture)
        if (fn.name.startsWith('testFail')) {
          await expect(
            F.publicClient.readContract({
              abi,
              address: F.contract.address,
              functionName: fn.name,
            }),
          ).rejects.toThrow()
        } else {
          await F.publicClient.readContract({
            abi,
            address: F.contract.address,
            functionName: fn.name,
          })
        }
      })
    })
  })
}
