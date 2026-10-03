import {
  ccipRequest,
  decodeFunctionResult,
  encodeFunctionData,
  zeroAddress,
} from 'viem'
import { dnsEncodeName } from './dnsEncodeName.js'

export const DNSSEC_ORACLE_URL = 'https://dnssec-oracle.ens.domains/'

const abi = [
  {
    type: 'function',
    name: 'resolve',
    inputs: [
      { name: 'name', type: 'bytes' },
      { name: 'qtype', type: 'uint16' },
    ],
    outputs: [
      {
        type: 'tuple[]',
        components: [
          { name: 'rrset', type: 'bytes' },
          { name: 'sig', type: 'bytes' },
        ],
      },
    ],
    stateMutability: 'nonpayable',
  },
] as const

export async function fetchDNSSECOracleRRSets(name: string) {
  const DNSTYPE_TXT = 16
  const functionName = 'resolve'
  return decodeFunctionResult({
    abi,
    functionName,
    data: await ccipRequest({
      sender: zeroAddress,
      urls: [DNSSEC_ORACLE_URL],
      data: encodeFunctionData({
        abi,
        functionName,
        args: [dnsEncodeName(name), DNSTYPE_TXT],
      }),
    }),
  })
}
