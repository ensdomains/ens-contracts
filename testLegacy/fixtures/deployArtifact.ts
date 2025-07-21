import hre from 'hardhat'
import { readFile } from 'node:fs/promises'
import {
  type Hex,
  type Abi,
  type Address,
  sliceHex,
  concat,
  getContractAddress,
} from 'viem'

type LinkReferences = Record<
  string,
  Record<string, { start: number; length: number }[]>
>

type ForgeArtifact = {
  abi: Abi
  bytecode: {
    object: Hex
    linkReferences: LinkReferences
  }
}
type HardhatArtifact = {
  //_format: "hh-sol-artifact-1";
  abi: Abi
  bytecode: Hex
  linkReferences: LinkReferences
}

export async function deployArtifact(options: {
  file: string | URL
  from?: Hex
  args?: any[]
  libs?: Record<string, Address>
}) {
  const artifact = JSON.parse(await readFile(options.file, 'utf8')) as
    | ForgeArtifact
    | HardhatArtifact
  let bytecode: Hex
  let linkReferences: LinkReferences
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
  const walletClient = options.from
    ? await hre.viem.getWalletClient(options.from)
    : await hre.viem.getWalletClients().then((x) => x[0])
  const publicClient = await hre.viem.getPublicClient()
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
