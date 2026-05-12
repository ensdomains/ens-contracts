import hre from 'hardhat'

import { getAccounts } from '../fixtures/utils.js'

const connection = await hre.network.connect()
const accounts = await getAccounts(connection)

async function fixture() {
  const erc20Recoverable = await connection.viem.deployContract(
    'ERC20Recoverable',
    [],
  )
  const erc20Token = await connection.viem.deployContract('MockERC20', [
    'Ethereum Name Service Token',
    'ENS',
    [],
  ])

  return { erc20Recoverable, erc20Token }
}
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

describe('ERC20Recoverable', () => {
  it('should recover ERC20 token', async () => {
    const { erc20Recoverable, erc20Token } = await loadFixture()

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
    const { erc20Recoverable, erc20Token } = await loadFixture()

    await erc20Token.write.transfer([erc20Recoverable.address, 1000n])
    await expect(
      erc20Token.read.balanceOf([erc20Recoverable.address]),
    ).resolves.toEqual(1000n)

    await expect(
      erc20Recoverable.write.recoverFunds(
        [erc20Token.address, accounts[1].address, 1000n],
        {
          account: accounts[1],
        },
      ),
    ).toBeRevertedWithString('Ownable: caller is not the owner')
  })
})
