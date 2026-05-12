import type { NewTaskActionFunction } from 'hardhat/types/tasks'

const taskAccounts: NewTaskActionFunction = async (_, hre) => {
  const { viem } = await hre.network.connect()
  const accounts = await viem.getWalletClients()

  for (const { account } of accounts) {
    console.log(account.address)
  }
}

export default taskAccounts
