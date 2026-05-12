import type { NetworkConnection } from 'hardhat/types/network'
import { encodedAnchors } from './anchors.js'

export async function dnssecFixture(connection: NetworkConnection) {
  const dnssec = await connection.viem.deployContract('DNSSECImpl', [
    encodedAnchors,
  ])

  const rsasha256Algorithm = await connection.viem.deployContract(
    'RSASHA256Algorithm',
    [],
  )
  const rsasha1Algorithm = await connection.viem.deployContract(
    'RSASHA1Algorithm',
    [],
  )
  const sha256Digest = await connection.viem.deployContract('SHA256Digest', [])
  const sha1Digest = await connection.viem.deployContract('SHA1Digest', [])
  const p256Sha256Algorithm = await connection.viem.deployContract(
    'P256SHA256Algorithm',
    [],
  )
  const dummyAlgorithm = await connection.viem.deployContract(
    'DummyAlgorithm',
    [],
  )
  const dummyDigest = await connection.viem.deployContract('DummyDigest', [])

  await dnssec.write.setAlgorithm([5, rsasha1Algorithm.address])
  await dnssec.write.setAlgorithm([7, rsasha1Algorithm.address])
  await dnssec.write.setAlgorithm([8, rsasha256Algorithm.address])
  await dnssec.write.setAlgorithm([13, p256Sha256Algorithm.address])
  // dummy
  await dnssec.write.setAlgorithm([253, dummyAlgorithm.address])
  await dnssec.write.setAlgorithm([254, dummyAlgorithm.address])

  await dnssec.write.setDigest([1, sha1Digest.address])
  await dnssec.write.setDigest([2, sha256Digest.address])
  // dummy
  await dnssec.write.setDigest([253, dummyDigest.address])

  return { dnssec }
}
