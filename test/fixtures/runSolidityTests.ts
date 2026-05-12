import type { Abi, AbiFunction } from 'abitype'
import hre from 'hardhat'
import type { Artifact, ArtifactMap } from 'hardhat/types/artifacts'

const connection = await hre.network.connect()

export async function runSolidityTests<N extends keyof ArtifactMap>(name: N) {
  const artifact: Artifact = await hre.artifacts.readArtifact(name)
  const abi: Abi = artifact.abi
  const tests = abi.filter(
    (x): x is AbiFunction => x.type === 'function' && x.name.startsWith('test'),
  )
  if (!tests.length) throw new Error(`no tests: ${name}`)

  async function fixture() {
    const publicClient = await connection.viem.getPublicClient()
    const contract = await connection.viem.deployContract(name)
    return { publicClient, contract }
  }

  describe(name, () => {
    tests.forEach((fn) => {
      it(fn.name, async () => {
        const F = await connection.networkHelpers.loadFixture(fixture)
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
