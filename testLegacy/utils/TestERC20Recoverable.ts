import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'

async function fixture() {
  const accounts = await hre.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))
  const erc20Recoverable = await hre.viem.deployContract('ERC20Recoverable', [])
  const erc20Token = await hre.viem.deployContract('MockERC20', [
    'Ethereum Name Service Token',
    'ENS',
    [],
  ])

  return { erc20Recoverable, erc20Token, accounts }
}

describe('ERC20Recoverable', () => {
  it('should recover ERC20 token', async () => {
    const { erc20Recoverable, erc20Token, accounts } = await loadFixture(
      fixture,
    )

    await erc20Token.write.transfer([erc20Recoverable.address, 1000n])
    await expect(
      erc20Token.read.balanceOf([erc20Recoverable.address]),
    ).resolves.toEqual(1000n)

    await erc20Recoverable.write.recoverFunds([
      erc20Token.address,
      accounts[0].address,
      1000n,
    ])
    await expect(
      erc20Token.read.balanceOf([erc20Recoverable.address]),
    ).resolves.toEqual(0n)
  })

  it('should not allow non-owner to call', async () => {
    const { erc20Recoverable, erc20Token, accounts } = await loadFixture(
      fixture,
    )

    await erc20Token.write.transfer([erc20Recoverable.address, 1000n])
    await expect(
      erc20Token.read.balanceOf([erc20Recoverable.address]),
    ).resolves.toEqual(1000n)

    await expect(erc20Recoverable)
      .write('recoverFunds', [erc20Token.address, accounts[1].address, 1000n], {
        account: accounts[1],
      })
      .toBeRevertedWithString('Ownable: caller is not the owner')
  })
})
