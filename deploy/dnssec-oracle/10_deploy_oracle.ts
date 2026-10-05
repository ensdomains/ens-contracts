import { artifacts, deployScript } from '@rocketh'
import {
  encodeAnchors,
  REAL_ANCHORS,
  DUMMY_ANCHORS,
} from '../../test/fixtures/anchors.js'

export default deployScript(
  async ({ deploy, get, execute: write, namedAccounts, network }) => {
    const { deployer } = namedAccounts

    const anchors = REAL_ANCHORS.slice()
    const algorithms: Record<number, string> = {
      5: 'RSASHA1Algorithm',
      7: 'RSASHA1Algorithm',
      8: 'RSASHA256Algorithm',
      13: 'P256SHA256Algorithm',
    }
    const digests: Record<number, string> = {
      1: 'SHA1Digest',
      2: 'SHA256Digest',
    }

    if (network.tags?.test) {
      anchors.push(DUMMY_ANCHORS)
      algorithms[253] = 'DummyAlgorithm'
      algorithms[254] = 'DummyAlgorithm'
      digests[253] = 'DummyDigest'
    }

    await deploy('DNSSECImpl', {
      account: deployer,
      artifact: artifacts.DNSSECImpl,
      args: [encodeAnchors(anchors)],
    })

    const dnssec = get('DNSSECImpl')

    for (const [id, contractName] of Object.entries(algorithms)) {
      const algorithm = get(contractName)
      console.log(`  - Setting algorithm ${id}: ${contractName}`)
      await write(dnssec, {
        functionName: 'setAlgorithm',
        args: [parseInt(id), algorithm.address],
        account: deployer,
      })
    }

    // Set up digests
    for (const [id, contractName] of Object.entries(digests)) {
      const digest = get(contractName)
      console.log(`  - Setting digest ${id}: ${contractName}`)
      await write(dnssec, {
        functionName: 'setDigest',
        args: [parseInt(id), digest.address],
        account: deployer,
      })
    }

    console.log('  - DNSSEC Oracle deployment completed successfully')
  },
  {
    id: 'DNSSECImpl v1.0.0',
    tags: ['category:dnssec-oracle', 'DNSSECImpl'],
    dependencies: ['dnssec-algorithms', 'dnssec-digests'],
  },
)
