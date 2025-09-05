import hre from 'hardhat'

import { algorithms } from './fixtures/algorithms.js'

const connection = await hre.network.connect()

algorithms.forEach(([algo, vector]) => {
  async function fixture() {
    const algorithm = await connection.viem.deployContract(
      algo as 'RSASHA1Algorithm',
      [],
    )
    return { algorithm }
  }
  const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

  describe(algo, () => {
    it('should return true for valid signatures', async () => {
      const { algorithm } = await loadFixture()

      await expect(
        algorithm.read.verify([vector[0], vector[1], vector[2]]),
      ).resolves.toBe(true)
    })

    it('should return false for invalid signatures', async () => {
      const { algorithm } = await loadFixture()

      const invalidVector1 = `${vector[1]}00` as const

      await expect(
        algorithm.read.verify([vector[0], invalidVector1, vector[2]]),
      ).resolves.toBe(false)
    })
  })
})
