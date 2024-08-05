import hre from 'hardhat'
import { encodedAnchors } from './anchors.js'

export async function dnssecFixture() {
  const accounts = await hre.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))

  const dnssec = await hre.viem.deployContract('DNSSECImpl', [encodedAnchors])

  const rsasha256Algorithm = await hre.viem.deployContract(
    'RSASHA256Algorithm',
    [],
  )
  const rsasha1Algorithm = await hre.viem.deployContract('RSASHA1Algorithm', [])
  const sha256Digest = await hre.viem.deployContract('SHA256Digest', [])
  const sha1Digest = await hre.viem.deployContract('SHA1Digest', [])
  const p256Sha256Algorithm = await hre.viem.deployContract(
    'P256SHA256Algorithm',
    [],
  )
  const dummyAlgorithm = await hre.viem.deployContract('DummyAlgorithm', [])
  const dummyDigest = await hre.viem.deployContract('DummyDigest', [])

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

  return { dnssec, accounts }
}
