// import { existsSync } from 'fs'
import fs = require('fs')

// import { task } from 'hardhat/config.js'
import config = require('hardhat/config')

// import { archivedDeploymentPath } from '../hardhat.config.cjs'
import ic = require('../hardhat.config.cjs')

config
  .task('archive-scan', 'Scans the deployments for unarchived deployments')
  .setAction(async (_, hre) => {
    const network = hre.network.name

    const deployments = await hre.deployments.all()

    for (const deploymentName in deployments) {
      const deployment = deployments[deploymentName]
      if (!deployment.receipt || !deployment.bytecode) continue

      const archiveName = `${deploymentName}_${network}_${deployment.receipt.blockNumber}`
      const archivePath = `${ic.archivedDeploymentPath}/${archiveName}.sol`

      if (fs.existsSync(archivePath)) {
        continue
      }

      let fullName: string
      try {
        await hre.deployments.getArtifact(deploymentName)
        fullName = `${deploymentName}.sol:${deploymentName}`
      } catch (e: any) {
        if (e._isHardhatError && e.number === 701) {
          fullName = e.messageArguments.candidates.split('\n')[1]
        } else {
          throw e
        }
      }

      await hre.run('save', {
        contract: deploymentName,
        block: String(deployment.receipt.blockNumber),
        fullName,
      })
    }
  })
