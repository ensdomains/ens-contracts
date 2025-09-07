import { type Abi, isHex, toFunctionSelector, toHex } from 'viem'
import artifacts from '../generated/artifacts.js'

// $ bun interfaces                  # all
// $ bun interfaces Ens              # by name (ignores case)
// $ bun interfaces 0x9061b923       # by selector
// $ bun interfaces Ens 0x9061b923   # mixture of names/selectors
// $ bun interfaces ... --json       # export as JSON

const ifaces = Object.values(artifacts)
  .filter((x) => x.bytecode === '0x')
  .map((x) => ({
    interfaceId: getInterfaceId(x.abi),
    name: x.contractName,
    file: x.sourceName,
  }))
  .sort((a, b) => a.file.localeCompare(b.file))

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

function getInterfaceId(abi: Abi) {
  return toHex(
    abi
      .filter((item) => item.type === 'function')
      .reduce((a, x) => a ^ BigInt(toFunctionSelector(x)), 0n),
    { size: 4 },
  )
}
