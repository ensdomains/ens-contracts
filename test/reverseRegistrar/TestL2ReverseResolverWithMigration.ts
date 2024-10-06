import { evmChainIdToCoinType } from '@ensdomains/address-encoder/utils'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { namehash } from 'viem'
import { base } from 'viem/chains'
import {
  getReverseNamespace,
  getReverseNodeHash,
} from '../fixtures/getReverseNode.js'

const coinType = evmChainIdToCoinType(base.id)
const reverseNamespace = getReverseNamespace({ chainId: base.id })

async function fixture() {
  const accounts = await hre.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))

  const oldReverseResolver = await hre.viem.deployContract('OwnedResolver', [])

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i]
    await oldReverseResolver.write.setName([
      getReverseNodeHash(account.address, { chainId: base.id }),
      `name-${i}.eth`,
    ])
  }

  const l2ReverseResolver = await hre.viem.deployContract(
    'L2ReverseResolverWithMigration',
    [namehash(reverseNamespace), coinType, oldReverseResolver.address],
  )

  return {
    l2ReverseResolver,
    oldReverseResolver,
    accounts,
  }
}

describe('L2ReverseResolverWithMigration', () => {
  it('should migrate names wahoo', async () => {
    const { l2ReverseResolver, oldReverseResolver, accounts } =
      await loadFixture(fixture)

    await l2ReverseResolver.write.batchSetName([accounts.map((a) => a.address)])

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i]
      const name = await oldReverseResolver.read.name([
        getReverseNodeHash(account.address, { chainId: base.id }),
      ])
      expect(name).toBe(`name-${i}.eth`)
      const newName = await l2ReverseResolver.read.name([
        getReverseNodeHash(account.address, { chainId: base.id }),
      ])
      expect(newName).toBe(`name-${i}.eth`)
    }
  })
})
