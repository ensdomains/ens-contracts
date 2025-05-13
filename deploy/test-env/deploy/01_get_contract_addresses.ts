/* eslint-disable import/no-extraneous-dependencies */
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { getAddress } from 'viem'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const allDeployments = await hre.deployments.all()
  const deploymentAddressArray = [
    ...Object.keys(allDeployments).map((dkey) => [dkey, allDeployments[dkey].address]),
    ['Multicall', '0xca11bde05977b3631167028862be2a173976ca11'],
  ].map(([name, address]) => [name, getAddress(address)])
  const deploymentAddressMap = Object.fromEntries(deploymentAddressArray)

  await writeFile(
    resolve(__dirname, '../.env.local'),
    `NEXT_PUBLIC_DEPLOYMENT_ADDRESSES='${JSON.stringify(deploymentAddressMap)}'`,
  )
  if (!existsSync(resolve(__dirname, '../typings-custom/generated'))) {
    await mkdir(resolve(__dirname, '../typings-custom/generated'))
  }
  await writeFile(
    resolve(__dirname, '../typings-custom/generated/local-contracts-generated.d.ts'),
    `declare module '@app/local-contracts' {
  interface Register {
    deploymentAddresses: {
      ${deploymentAddressArray.map(([name, address]) => `${name}: '${address}'`).join('\n      ')}
    }
  }
}
`,
  )
  console.log('Wrote contract addresses to .env.local')
}

func.runAtTheEnd = true

export default func
