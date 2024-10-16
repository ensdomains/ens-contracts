import chalk from 'chalk'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import hre from 'hardhat'
import { encodeFunctionData, type Abi } from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import '../../hardhat.config.cjs'

export const withGasReportPublicClient = () => {
  if (!process.env.READ_GAS_REPORT) return hre.viem.getPublicClient
  let _currentTest: string = ''
  const gasMap: Record<string, number> = {}
  const previousGasMap: Record<string, number> | null = existsSync(
    './cache/gas-map.json',
  )
    ? JSON.parse(readFileSync('./cache/gas-map.json', 'utf-8'))
    : null

  const getMessage = (currentTest: Mocha.Test) => {
    const currentTestGas = gasMap[_currentTest]
    const getParentCount = (
      t: Mocha.Suite | Mocha.Test,
      v: number = 0,
    ): number => {
      if (t.parent) return getParentCount(t.parent, v + 1)
      return v
    }
    if (!currentTestGas) return null
    const parentCount = getParentCount(currentTest)
    const indent = '  '.repeat(parentCount + 1)
    const info = chalk.italic.hex('#003547')
    const baseMessage = `${indent}${info('Call used')} ${chalk.blue(
      currentTestGas,
    )} ${info('gas')}`

    if (!previousGasMap?.[_currentTest])
      return `${baseMessage} (${info('new')})`

    const previousValue = previousGasMap[_currentTest]
    const diff = currentTestGas - previousValue
    const diffWithColour = (() => {
      if (diff < 0) return chalk.green(`(${diff})`)
      if (diff > 0) return chalk.red(`(+${diff})`)
      return info('(unchanged)')
    })()
    return `${baseMessage} ${diffWithColour}`
  }

  beforeEach(function () {
    _currentTest = this.currentTest?.fullTitle() ?? ''
  })

  afterEach(function () {
    const message = getMessage(this.currentTest!)
    if (message) console.log(message)
  })

  after(() => {
    writeFileSync('./cache/gas-map.json', JSON.stringify(gasMap))
  })

  return async () => {
    const localAccount = mnemonicToAccount(
      'test test test test test test test test test test test junk',
    )
    const publicClient = await hre.viem.getPublicClient()
    const originalReadContract = publicClient.readContract
    publicClient.readContract = async (parameters) => {
      const serializedTransaction = await localAccount.signTransaction({
        to: parameters.address,
        data: encodeFunctionData({
          abi: parameters.abi as Abi,
          functionName: parameters.functionName as string,
          args: parameters.args as readonly unknown[],
        }),
        gas: 10000000n,
        gasPrice: await publicClient.getGasPrice(),
        nonce: await publicClient.getTransactionCount({
          address: localAccount.address,
        }),
      })
      await publicClient
        .sendRawTransaction({ serializedTransaction })
        .catch(() => {})
      const latestBlock = await publicClient.getBlock()
      const receipt = await publicClient.getTransactionReceipt({
        hash: latestBlock.transactions[0],
      })
      if (gasMap[_currentTest])
        throw new Error('transaction already created for this test')
      gasMap[_currentTest] = Number(receipt!.gasUsed)
      return originalReadContract(parameters)
    }
    return publicClient
  }
}
