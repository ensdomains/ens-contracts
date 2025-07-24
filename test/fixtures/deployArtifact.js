import hre from 'hardhat'
import { readFile } from 'node:fs/promises'
import { sliceHex, concat, getContractAddress } from 'viem'
export async function deployArtifact(options) {
  const artifact = JSON.parse(await readFile(options.file, 'utf8'))
  let bytecode
  let linkReferences
  if ('linkReferences' in artifact) {
    bytecode = artifact.bytecode
    linkReferences = artifact.linkReferences
  } else {
    bytecode = artifact.bytecode.object
    linkReferences = artifact.bytecode.linkReferences
  }
  for (const ref of Object.values(linkReferences)) {
    for (const [name, places] of Object.entries(ref)) {
      const lib = options.libs?.[name]
      if (!lib) throw new Error(`expected library: ${name}`)
      for (const { start, length } of places) {
        bytecode = concat([
          sliceHex(bytecode, 0, start),
          lib,
          sliceHex(bytecode, start + length),
        ])
      }
    }
  }
  const connection = options.connection || (await hre.network.connect())
  const walletClient = options.from
    ? await connection.viem.getWalletClient(options.from)
    : await connection.viem.getWalletClients().then((x) => x[0])
  const publicClient = await connection.viem.getPublicClient()
  const nonce = BigInt(
    await publicClient.getTransactionCount(walletClient.account),
  )
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode,
    args: options.args,
  })
  await publicClient.waitForTransactionReceipt({ hash })
  return getContractAddress({
    from: walletClient.account.address,
    nonce,
  })
}
