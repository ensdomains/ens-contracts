import packet from 'dns-packet'
import { execute, artifacts } from '@rocketh'
import { encodeFunctionData } from 'viem'
import type { Address, Hash, Hex } from 'viem'

const realAnchors = [
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

export default execute(
  async ({ deploy, get, tx, namedAccounts, network }) => {
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

    if (network.tags?.test) {
      anchors.push(dummyAnchor)
      algorithms[253] = 'DummyAlgorithm'
      algorithms[254] = 'DummyAlgorithm'
      digests[253] = 'DummyDigest'
    }

    await deploy('DNSSECImpl', {
      account: deployer,
      artifact: artifacts.DNSSECImpl,
      args: [encodeAnchors(anchors)],
    })

    const dnssec = await get('DNSSECImpl')

    try {
      // Set up algorithms
      for (const [id, contractName] of Object.entries(algorithms)) {
        const algorithm = await get(contractName)
        await tx({
          to: dnssec.address,
          data: encodeFunctionData({
            abi: dnssec.abi,
            functionName: 'setAlgorithm',
            args: [parseInt(id), algorithm.address],
          }),
          account: deployer,
        })
        console.log(`Set algorithm ${id}: ${contractName}`)
      }

      // Set up digests
      for (const [id, contractName] of Object.entries(digests)) {
        const digest = await get(contractName)
        await tx({
          to: dnssec.address,
          data: encodeFunctionData({
            abi: dnssec.abi,
            functionName: 'setDigest',
            args: [parseInt(id), digest.address],
          }),
          account: deployer,
        })
        console.log(`Set digest ${id}: ${contractName}`)
      }

      console.log('DNSSEC Oracle deployment completed successfully')
    } catch (error) {
      console.log('DNSSEC setup error:', error.message)
      console.log('DNSSEC Oracle deployment completed with errors')
    }
  },
  {
    id: 'DNSSECImpl v1.0.0',
    tags: ['category:dnssec-oracle', 'DNSSECImpl'],
    dependencies: ['dnssec-algorithms', 'dnssec-digests'],
  },
)
