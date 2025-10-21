import { type Hex, isHex } from 'viem'
import {
  createInterfaceId,
  getSolidityReferenceInterfaceAbi,
} from '@ensdomains/hardhat-chai-matchers-viem/utils'
import hre from 'hardhat'
import type { ArtifactMap } from 'hardhat/types/artifacts'

// $ bun interfaces                  # all
// $ bun interfaces Ens              # by name (ignores case)
// $ bun interfaces 0x9061b923       # by selector
// $ bun interfaces Ens 0x9061b923   # mixture of names/selectors
// $ bun interfaces ... --json       # export as JSON

const ifaces: {
  interfaceId: Hex
  name: string
  file: string
}[] = []

for (const name of await hre.artifacts.getAllFullyQualifiedNames()) {
  try {
    const abi = await getSolidityReferenceInterfaceAbi(
      name as keyof ArtifactMap,
    )
    const artifact = await hre.artifacts.readArtifact(name)
    ifaces.push({
      interfaceId: createInterfaceId(abi),
      name: artifact.contractName,
      file: artifact.sourceName,
    })
  } catch (err) {}
}

ifaces.sort((a, b) => a.file.localeCompare(b.file))

const UNKNOWN = '???'

let output: (x: any) => void = console.table
const qs = process.argv.slice(2).filter((x) => {
  if (x === '--json') {
    output = (x) => {
      console.log()
      console.log(JSON.stringify(x, null, '  '))
    }
  } else {
    return true
  }
})
if (qs.length) {
  output(
    qs.map((q) => {
      if (isHex(q) && q.length === 10) {
        return (
          ifaces.find((x) => same(x.interfaceId, q)) ?? {
            interfaceId: q,
            name: UNKNOWN,
          }
        )
      } else {
        return (
          ifaces.find((x) => same(x.name, q)) ?? {
            interfaceId: UNKNOWN,
            name: q,
          }
        )
      }
    }),
  )
} else {
  output(ifaces)
}

function same(a: string, b: string) {
  return !a.localeCompare(b, undefined, { sensitivity: 'base' })
}
