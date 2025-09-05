import { readFile } from 'node:fs/promises'
import {
  type Abi,
  type Account,
  type Address,
  type Chain,
  concat,
  getContractAddress,
  type Hex,
  sliceHex,
  type Transport,
  type WalletClient,
} from 'viem'
import { getTransactionCount, waitForTransactionReceipt } from 'viem/actions'

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

export async function deployArtifact(
  walletClient: WalletClient<Transport, Chain, Account>,
  options: {
    file: string | URL
    args?: any[]
    libs?: Record<string, Address>
  },
) {
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
      const address = options.libs?.[name]
      if (!address) throw new Error(`expected library: ${name}`)
      for (const { start, length } of places) {
        bytecode = concat([
          sliceHex(bytecode, 0, start),
          address,
          sliceHex(bytecode, start + length),
        ])
      }
    }
  }
  const nonce = BigInt(
    await getTransactionCount(walletClient, walletClient.account),
  )
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode,
    args: options.args,
  })
  await waitForTransactionReceipt(walletClient, { hash })
  return getContractAddress({
    from: walletClient.account.address,
    nonce,
  })
}
