import hre from 'hardhat'
import { labelhash, namehash, zeroHash } from 'viem'

import { getAccounts } from '../fixtures/utils.js'

const connection = await hre.network.connect()
const accounts = await getAccounts(connection)

async function fixture() {
  const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])
  const root = await connection.viem.deployContract('Root', [
    ensRegistry.address,
  ])

  await root.write.setController([accounts[0].address, true])
  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('eth'),
    root.address,
  ])
  await ensRegistry.write.setOwner([zeroHash, root.address])

  return { ensRegistry, root, accounts }
}
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

describe('Root', () => {
  describe('setSubnodeOwner', () => {
    it('should allow controllers to set subnodes', async () => {
      const { ensRegistry, root, accounts } = await loadFixture()

      await root.write.setSubnodeOwner([labelhash('eth'), accounts[1].address])

      await expect(
        ensRegistry.read.owner([namehash('eth')]),
      ).resolves.toEqualAddress(accounts[1].address)
    })

    it('should fail when non-controller tries to set subnode', async () => {
      const { root, accounts } = await loadFixture()

      await expect(
        root.write.setSubnodeOwner([labelhash('eth'), accounts[1].address], {
          account: accounts[1],
        }),
      ).toBeRevertedWithString('Controllable: Caller is not a controller')
    })

    it('should not allow setting a locked TLD', async () => {
      const { root, accounts } = await loadFixture()

      await root.write.lock([labelhash('eth')])

      await expect(
        root.write.setSubnodeOwner([labelhash('eth'), accounts[1].address]),
      ).toBeRevertedWithoutReason()
    })
  })
})
