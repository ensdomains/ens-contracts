import { exec as _exec } from 'child_process'
import { existsSync } from 'fs'
import fs from 'fs/promises'
import { promisify } from 'util'

import { task } from 'hardhat/config'
import { Artifact } from 'hardhat/types'

import { archivedDeploymentPath } from '../hardhat.config.cts'

const exec = promisify(_exec)

task('save', 'Saves a specified contract as a deployed contract')
  .addPositionalParam('contract', 'The contract to save')
  .addPositionalParam('block', 'The block number the contract was deployed at')
  .addOptionalParam(
    'fullName',
    '(Optional) The fully qualified name of the contract (e.g. contracts/resolvers/PublicResolver.sol:PublicResolver)',
  )
  .setAction(
    async (
      {
        contract,
        block,
        fullName,
      }: { contract: string; block: string; fullName?: string },
      hre,
    ) => {
      const network = hre.network.name

      const artifactReference = fullName || contract
      const artifact = await hre.deployments.getArtifact(artifactReference)

      const archiveName = `${contract}_${network}_${block}`
      const archivePath = `${archivedDeploymentPath}/${archiveName}.sol`

      if (existsSync(archivePath)) {
        throw new Error('Archive already exists')
      }

      const newArtifact: Artifact & {
        commitHash: string
        treeHash: string
      } = {
        ...artifact,
        contractName: archiveName,
        sourceName: archivePath.substring(2),
        commitHash: (await exec('git rev-parse HEAD')).stdout.trim(),
        treeHash: (
          await exec(`git rev-parse HEAD:${artifact.sourceName}`)
        ).stdout.trim(),
      }

      await fs.mkdir(archivePath)
      await fs.writeFile(
        `${archivePath}/${archiveName}.json`,
        JSON.stringify(newArtifact, null, 2),
      )
      console.log("Archived contract to '" + archivePath + "'")
    },
  )
