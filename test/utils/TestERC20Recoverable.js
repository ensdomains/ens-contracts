const { ethers } = require('hardhat')
const { deploy } = require('../test-utils/contracts')

contract('ERC20Recoverable', function (accounts) {
  let ERC20Recoverable
  let ERC20Token

  beforeEach(async () => {
    ERC20Recoverable = await deploy('ERC20Recoverable')
    ERC20Token = await deploy(
      'MockERC20',
      'Ethereum Name Service Token',
      'ENS',
      [],
    )
  })

  describe('recoverFunds()', () => {
    it('should recover ERC20 token', async () => {
      await ERC20Token.transfer(ERC20Recoverable.address, 1000)
      const balance = await ERC20Token.balanceOf(ERC20Recoverable.address)
      expect(balance.toNumber()).to.equal(1000)
      await ERC20Recoverable.recoverFunds(ERC20Token.address, accounts[0], 1000)
      const balanceAfter = await ERC20Token.balanceOf(ERC20Recoverable.address)
      expect(balanceAfter.toNumber()).to.equal(0)
    })

    it('should not allow non-owner to call', async () => {
      const signers = await ethers.getSigners()
      await ERC20Token.transfer(ERC20Recoverable.address, 1000)
      const balance = await ERC20Token.balanceOf(ERC20Recoverable.address)
      expect(balance.toNumber()).to.equal(1000)
      const ERC20RecoverableWithAccount2 = await ERC20Recoverable.connect(
        signers[1],
      )
      await expect(
        ERC20RecoverableWithAccount2.recoverFunds(
          ERC20Token.address,
          accounts[1],
          1000,
        ),
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })
  })
})
