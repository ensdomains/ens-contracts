import { artifacts, deployScript } from '@rocketh'
import { isAddressEqual } from 'viem'
import {
  encodeAnchors,
  REAL_ANCHORS,
  DUMMY_ANCHORS,
} from '../../test/fixtures/anchors.js'

export default deployScript(
  async ({ deploy, get, execute: write, read, namedAccounts, network }) => {
    const { deployer, owner } = namedAccounts

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

    const dnssec = await deploy('DNSSECImpl', {
      account: deployer,
      artifact: artifacts.DNSSECImpl,
      args: [encodeAnchors(anchors)],
    })

    // enable algorithms (if needed)
    for (const x of await Promise.all(
      Object.entries(algorithms).map(async ([key, name]) => {
        const id = parseInt(key)
        const address = await read(dnssec, {
          functionName: 'algorithms',
          args: [id],
        })
        return { id, name, address }
      }),
    )) {
      const deploy = get(x.name)
      if (isAddressEqual(x.address, deploy.address)) {
        console.log(` -- Skipping algorithm ${x.id}: ${x.name}; already set`)
      } else {
        console.log(
          `  - Setting algorithm ${x.id}: ${x.name} <${deploy.address}>`,
        )
        await write(dnssec, {
          functionName: 'setAlgorithm',
          args: [x.id, deploy.address],
          account: deployer,
        })
      }
    }

    // enable digests (if needed)
    for (const x of await Promise.all(
      Object.entries(digests).map(async ([key, name]) => {
        const id = parseInt(key)
        const address = await read(dnssec, {
          functionName: 'digests',
          args: [id],
        })
        return { id, name, address }
      }),
    )) {
      const deploy = get(x.name)
      if (isAddressEqual(x.address, deploy.address)) {
        console.log(` -- Skipping digest ${x.id}: ${x.name}; already set`)
      } else {
        console.log(`  - Setting digest ${x.id}: ${x.name} <${deploy.address}>`)
        await write(dnssec, {
          functionName: 'setDigest',
          args: [x.id, deploy.address],
          account: deployer,
        })
      }
    }

    if (!isAddressEqual(owner, deployer)) {
      console.log('  - Transferring ownership to owner account')
      await write(dnssec, {
        functionName: 'transferOwnership',
        args: [owner],
        account: deployer,
      })
    } else {
      console.warn('  - WARN: DNSSEC should be transferred to DAO')
    }

    console.log('  - DNSSEC Oracle deployment completed successfully')
  },
  {
    id: 'DNSSECImpl v1.1.0',
    tags: ['category:dnssec-oracle', 'DNSSECImpl'],
    dependencies: ['dnssec-algorithms', 'dnssec-digests'],
  },
)
