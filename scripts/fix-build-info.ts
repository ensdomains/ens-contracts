import { COPYFILE_EXCL } from 'node:constants'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { parseArgs } from 'node:util'
import { artifacts } from 'hardhat'

// to deploy:
// 1.) `bun run compile`
// 2.) `bun hardhat deploy --network <network> ...`
// 3.) `bun run script/fix-build-info.ts --network <network>`

const { values } = parseArgs({
  options: {
    network: { type: 'string', default: 'mainnet' },
    unknown: { type: 'boolean' },
    dryrun: { type: 'boolean' },
  },
})

const rootDir = new URL('../', import.meta.url)
const deploymentDir = new URL(`./deployments/${values.network}/`, rootDir)
const buildInfoSrcDir = new URL('./artifacts/build-info/', rootDir)
const buildInfoDstDir = new URL('./build-info/', deploymentDir)
for (const name of readdirSync(deploymentDir)) {
  if (name.startsWith('.')) continue
  if (!name.endsWith('.json')) continue
  const file = new URL(name, deploymentDir)
  const raw = readFileSync(file, 'utf8')
  const deploy = JSON.parse(raw) as {
    contractName: string
    solcInputHash?: string
    buildInfoId?: string
  }
  if (!deploy.contractName) continue;
  if (deploy.solcInputHash) continue
  if (deploy.buildInfoId) continue
  if (values.unknown) {
    // use this flag to mark all existing deployments as "unknown"
    // (this only needs run once, ever)
    deploy.buildInfoId = 'unknown'
    console.log(`Unknown Build Info: ${name}`)
  } else {
    const { buildInfoId } = await artifacts.readArtifact(deploy.contractName)
    if (!buildInfoId) {
      throw new Error(`expected build info: ${name}`)
    }
    const buildName = `./${buildInfoId}.json`
    const buildFile = new URL(buildName, buildInfoSrcDir)
    if (!existsSync(buildFile)) {
      throw new Error(`expected build info file: ${buildFile}`)
    }
    if (!values.dryrun) {
      mkdirSync(buildInfoDstDir, { recursive: true })
      copyFileSync(
        buildFile,
        new URL(buildName, buildInfoDstDir),
        COPYFILE_EXCL,
      )
    }
    deploy.buildInfoId = buildInfoId
    console.log(`Found Build Info: ${name} => ${buildInfoId}`)
  }
  const indent = raw.match(/^\s+/m)?.[0]
  if (!indent) {
    throw new Error(`unknown indent: ${name}`)
  }
  if (values.dryrun) continue
  writeFileSync(file, JSON.stringify(deploy, undefined, indent))
}
