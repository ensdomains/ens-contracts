import { deployScript } from '@rocketh'
import packet from 'dns-packet'
import type { Abi_DNSSECImpl } from 'generated/abis/DNSSECImpl.js'
import { Artifact_DNSSECImpl } from 'generated/artifacts/DNSSECImpl.js'
import { getAddress, type Hex } from 'viem'

const realAnchors = [
  {
    name: '.',
    type: 'DS',
    class: 'IN',
    ttl: 3600,
    data: {
      keyTag: 19036,
      algorithm: 8,
      digestType: 2,
      digest: Buffer.from(
        '49AAC11D7B6F6446702E54A1607371607A1A41855200FD2CE1CDDE32F24E8FB5',
        'hex',
      ),
    },
  },
  {
    name: '.',
    type: 'DS',
    class: 'IN',
    ttl: 3600,
    data: {
      keyTag: 20326,
      algorithm: 8,
      digestType: 2,
      digest: Buffer.from(
        'E06D44B80B8F1D39A95C0B0D7C65D08458E880409BBC683457104237C7F8EC8D',
        'hex',
      ),
    },
  },
]

const dummyAnchor = {
  name: '.',
  type: 'DS',
  class: 'IN',
  ttl: 3600,
  data: {
    keyTag: 1278, // Empty body, flags == 0x0101, algorithm = 253, body = 0x0000
    algorithm: 253,
    digestType: 253,
    digest: Buffer.from('', 'hex'),
  },
}

function encodeAnchors(anchors: any[]): Hex {
  return `0x${anchors
    .map((anchor) => {
      return packet.answer.encode(anchor).toString('hex')
    })
    .join('')}`
}

export default deployScript(
  async ({ deploy, get, execute: write, read, namedAccounts, tags }) => {
    const { deployer } = namedAccounts

    const anchors = realAnchors.slice()
    let algorithms: Record<number, string> = {
      5: 'RSASHA1Algorithm',
      7: 'RSASHA1Algorithm',
      8: 'RSASHA256Algorithm',
      13: 'P256SHA256Algorithm',
    }
    const digests: Record<number, string> = {
      1: 'SHA1Digest',
      2: 'SHA256Digest',
    }

    if (tags?.test) {
      anchors.push(dummyAnchor)
      algorithms[253] = 'DummyAlgorithm'
      algorithms[254] = 'DummyAlgorithm'
      digests[253] = 'DummyDigest'
    }

    await deploy('DNSSECImpl', {
      account: deployer,
      artifact: Artifact_DNSSECImpl,
      args: [encodeAnchors(anchors)],
    })

    const dnssec = get<Abi_DNSSECImpl>('DNSSECImpl')

    for (const [id, contractName] of Object.entries(algorithms)) {
      const algorithm = get(contractName)
      const currentAlgorithm = await read(dnssec, {
        functionName: 'algorithms',
        args: [parseInt(id)],
      })
      if (getAddress(currentAlgorithm) === getAddress(algorithm.address)) {
        console.log(`  - Algorithm ${id} is already set to ${contractName}`)
        continue
      }
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
      const currentDigest = await read(dnssec, {
        functionName: 'digests',
        args: [parseInt(id)],
      })
      if (getAddress(currentDigest) === getAddress(digest.address)) {
        console.log(`  - Digest ${id} is already set to ${contractName}`)
        continue
      }
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
