import { evmChainIdToCoinType } from '@ensdomains/address-encoder/utils'
import hre from 'hardhat'
import { getAddress, namehash, type Address } from 'viem'
import { base } from 'viem/chains'
import { getReverseNamespace } from '../fixtures/ensip19.js'

const coinType = evmChainIdToCoinType(base.id)
const reverseNamespace = getReverseNamespace(coinType)

function getReverseNodeHash(addr: Address) {
  return namehash(`${addr.slice(2).toLowerCase()}.${reverseNamespace}`)
}

const connection = await hre.network.connect()

async function fixture() {
  const accounts = await connection.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))

  const oldReverseResolver = await connection.viem.deployContract(
    'OwnedResolver',
    [],
  )

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i]
    await oldReverseResolver.write.setName([
      getReverseNodeHash(account.address),
      `name-${i}.eth`,
    ])
  }

  const l2ReverseRegistrar = await connection.viem.deployContract(
    'L2ReverseRegistrarWithMigration',
    [
      coinType,
      accounts[0].address,
      namehash(reverseNamespace),
      oldReverseResolver.address,
    ],
  )

  return {
    l2ReverseRegistrar,
    oldReverseResolver,
    accounts,
  }
}

const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

describe('L2ReverseRegistrarWithMigration', () => {
  it('should migrate names', async () => {
    const { l2ReverseRegistrar, oldReverseResolver, accounts } =
      await loadFixture()

    await l2ReverseRegistrar.write.batchSetName([
      accounts.map((a) => a.address),
    ])

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i]
      const name = await oldReverseResolver.read.name([
        getReverseNodeHash(account.address),
      ])
      expect(name).toBe(`name-${i}.eth`)
      const newName = await l2ReverseRegistrar.read.nameForAddr([
        account.address,
      ])
      expect(newName).toBe(`name-${i}.eth`)
    }
  })

  it('should revert if not owner', async () => {
    const { l2ReverseRegistrar, accounts } = await loadFixture()

    await expect(
      l2ReverseRegistrar.write.batchSetName([[accounts[0].address]], {
        account: accounts[1],
      }),
    ).toBeRevertedWithCustomError('OwnableUnauthorizedAccount')
    // .withArgs(getAddress(accounts[1].address))
  })
})
