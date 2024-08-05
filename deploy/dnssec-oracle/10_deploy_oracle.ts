import packet from 'dns-packet'
import type { DeployFunction } from 'hardhat-deploy/types.js'
import type { Address, Hash, Hex } from 'viem'

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
      digest: new Buffer(
        '49AAC11D7B6F6446702E54A1607371607A1A41855200FD2CE1CDDE32F24E8FB5',
        'hex',
      ),
    },
  },
  {
    name: '.',
    type: 'DS',
    klass: 'IN',
    ttl: 3600,
    data: {
      keyTag: 20326,
      algorithm: 8,
      digestType: 2,
      digest: new Buffer(
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
    digest: new Buffer('', 'hex'),
  },
}

function encodeAnchors(anchors: any[]): Hex {
  return `0x${anchors
    .map((anchor) => {
      return packet.answer.encode(anchor).toString('hex')
    })
    .join('')}`
}

const func: DeployFunction = async function (hre) {
  const { deployments, network, viem } = hre

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

  if (network.tags.test) {
    anchors.push(dummyAnchor)
    algorithms[253] = 'DummyAlgorithm'
    algorithms[254] = 'DummyAlgorithm'
    digests[253] = 'DummyDigest'
  }

  await viem.deploy('DNSSECImpl', [encodeAnchors(anchors)])
  const dnssec = await viem.getContract('DNSSECImpl')

  const transactions: Hash[] = []
  for (const [id, alg] of Object.entries(algorithms)) {
    const deployedAlgorithmAddress = await deployments
      .get(alg)
      .then((d) => d.address as Address)
    const currentAlgorithmAddress = await dnssec.read.algorithms([parseInt(id)])

    if (deployedAlgorithmAddress != currentAlgorithmAddress) {
      const hash = await dnssec.write.setAlgorithm([
        parseInt(id),
        deployedAlgorithmAddress,
      ])
      transactions.push(hash)
    }
  }

  for (const [id, digest] of Object.entries(digests)) {
    const deployedDigestAddress = await deployments
      .get(digest)
      .then((d) => d.address as Address)
    const currentDigestAddress = await dnssec.read.digests([parseInt(id)])

    if (deployedDigestAddress != currentDigestAddress) {
      const hash = await dnssec.write.setDigest([
        parseInt(id),
        deployedDigestAddress,
      ])
      transactions.push(hash)
    }
  }

  console.log(
    `Waiting on ${transactions.length} transactions setting DNSSEC parameters`,
  )
  await Promise.all(
    transactions.map(async (hash) => viem.waitForTransactionSuccess(hash)),
  )
}

func.tags = ['dnssec-oracle']
func.dependencies = ['dnssec-algorithms', 'dnssec-digests']

export default func
