import fs from 'fs'

import type { NewTaskActionFunction } from 'hardhat/types/tasks'
import { archivedDeploymentPath } from '../hardhat.config.js'

const taskArchiveScan: NewTaskActionFunction = async (_, hre) => {
  const { networkName } = await hre.network.connect()
  const network = networkName

  const deployments = await hre.artifacts.getAllBuildInfoIds()

  for (const deploymentName in deployments) {
    const deployment = (deployments as any)[deploymentName]
    if (!deployment.receipt || !deployment.bytecode) continue

    const archiveName = `${deploymentName}_${network}_${deployment.receipt.blockNumber}`
    const archivePath = `${archivedDeploymentPath}/${archiveName}.sol`

    if (fs.existsSync(archivePath)) {
      continue
    }

    let fullName: string
    try {
      await hre.artifacts.readArtifact(deploymentName)
      fullName = `${deploymentName}.sol:${deploymentName}`
    } catch (e: any) {
      if (e._isHardhatError && e.number === 701) {
        fullName = e.messageArguments.candidates.split('\n')[1]
      } else {
        throw e
      }
    }
    hre.tasks.getTask('save').run({
      contract: deploymentName,
      block: String(deployment.receipt.blockNumber),
      fullName,
    })
  }
}

export default taskArchiveScan
