import { shouldSupportInterfaces } from '@ensdomains/hardhat-chai-matchers-viem/behaviour'
import hre from 'hardhat'
import { labelhash, namehash, zeroAddress, zeroHash } from 'viem'

import { getAccounts } from '../fixtures/utils.js'

const connection = await hre.network.connect()
const accounts = await getAccounts(connection)

async function fixture() {
  const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])
  const root = await connection.viem.deployContract('Root', [
    ensRegistry.address,
  ])
  const rootSecurityController = await connection.viem.deployContract(
    'RootSecurityController',
    [root.address],
  )

  await ensRegistry.write.setOwner([zeroHash, root.address])
  await root.write.setController([accounts[0].address, true])
  await root.write.setController([rootSecurityController.address, true])

  return { ensRegistry, root, rootSecurityController, accounts }
}
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

describe('RootSecurityController', () => {
  shouldSupportInterfaces({
    contract: () => loadFixture().then((F) => F.rootSecurityController),
    interfaces: ['IERC165'],
  })

  it('initializes root and ens references', async () => {
    const { ensRegistry, root, rootSecurityController } = await loadFixture()

    await expect(rootSecurityController.read.root()).resolves.toEqualAddress(
      root.address,
    )
    await expect(rootSecurityController.read.ens()).resolves.toEqualAddress(
      ensRegistry.address,
    )
  })

  describe('disableTLD', () => {
    it('should take ownership and clear resolver', async () => {
      const { ensRegistry, root, rootSecurityController } = await loadFixture()
      const label = labelhash('eth')
      const node = namehash('eth')

      await root.write.setSubnodeOwner([label, accounts[0].address])
      await ensRegistry.write.setResolver([node, accounts[1].address])

      await rootSecurityController.write.disableTLD([label])

      await expect(ensRegistry.read.owner([node])).resolves.toEqualAddress(
        rootSecurityController.address,
      )
      await expect(ensRegistry.read.resolver([node])).resolves.toEqualAddress(
        zeroAddress,
      )
    })

    it('should revert when called by non-owner', async () => {
      const { rootSecurityController } = await loadFixture()

      await expect(
        rootSecurityController.write.disableTLD([labelhash('eth')], {
          account: accounts[1],
        }),
      ).toBeRevertedWithString('Ownable: caller is not the owner')
    })
  })

})
