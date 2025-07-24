import hre from 'hardhat'
import { expect } from 'chai'
const connection = await hre.network.connect()
export async function runSolidityTests(name) {
  const artifact = await hre.artifacts.readArtifact(name)
  const abi = artifact.abi
  const tests = abi.filter(
    (x) => x.type === 'function' && x.name.startsWith('test'),
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
          ).to.be.throws()
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
