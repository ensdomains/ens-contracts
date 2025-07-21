import packet from 'dns-packet'
import { execute, artifacts } from '@rocketh'
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
  async ({ deploy, get, namedAccounts, network, viem }) => {
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

    const transactions: Hash[] = []
    for (const [id, alg] of Object.entries(algorithms)) {
      const deployedAlgorithm = await get(alg)
      // Note: using 'as any' because rocketh's dynamic proxy doesn't have full type safety
      const currentAlgorithmAddress = await (dnssec as any).read.algorithms([
        parseInt(id),
      ])

      if (deployedAlgorithm.address !== currentAlgorithmAddress) {
        const hash = await (dnssec as any).write.setAlgorithm(
          [parseInt(id), deployedAlgorithm.address],
          {
            account: deployer,
          },
        )
        transactions.push(hash)
      }
    }

    for (const [id, digest] of Object.entries(digests)) {
      const deployedDigest = await get(digest)
      // Note: using 'as any' because rocketh's dynamic proxy doesn't have full type safety
      const currentDigestAddress = await (dnssec as any).read.digests([
        parseInt(id),
      ])

      if (deployedDigest.address !== currentDigestAddress) {
        const hash = await (dnssec as any).write.setDigest(
          [parseInt(id), deployedDigest.address],
          {
            account: deployer,
          },
        )
        transactions.push(hash)
      }
    }

    console.log(
      `Waiting on ${transactions.length} transactions setting DNSSEC parameters`,
    )
    await Promise.all(
      transactions.map(async (hash) => viem.waitForTransactionSuccess(hash)),
    )
  },
  {
    id: 'DNSSECImpl v1.0.0',
    tags: ['category:dnssec-oracle', 'DNSSECImpl'],
    dependencies: ['dnssec-algorithms', 'dnssec-digests'],
  },
)
