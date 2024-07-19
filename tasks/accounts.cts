import { task } from 'hardhat/config.js'

task('accounts', 'Prints the list of accounts', async (_, hre) => {
  const accounts = await hre.viem.getWalletClients()

  for (const { account } of accounts) {
    console.log(account.address)
  }
})
