import hre from 'hardhat'

const contracts = [
  'contracts/test/TestBytesUtils.sol:TestBytesUtils',
  'contracts/test/TestRRUtils.sol:TestRRUtils',
] as const

contracts.forEach((contract) => {
  async function fixture() {
    const publicClient = await hre.viem.getPublicClient()
    const testContract = await hre.viem.deployContract(
      contract as (typeof contracts)[0],
      [],
    )
    return { publicClient, testContract }
  }

  const testContract = hre.artifacts.readArtifactSync(
    contract as (typeof contracts)[0],
  )
  type Contract = typeof testContract
  type TestFunction = Extract<
    Contract['abi'][number],
    { name: `test${string}` }
  >
  const tests = testContract.abi.filter((a): a is TestFunction =>
    a.name.startsWith('test'),
  )

  describe(contract.split(':')[1], () => {
    tests.forEach((a) => {
      it(a.name, async () => {
        const { publicClient, testContract } = await fixture()
        await publicClient.readContract({
          abi: testContract.abi,
          address: testContract.address,
          args: [],
          functionName: a.name,
        })
      })
    })
  })
})
