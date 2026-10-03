import {
  ccipRequest,
  decodeFunctionResult,
  encodeFunctionData,
  zeroAddress,
} from 'viem'
import { dnsEncodeName } from './dnsEncodeName.js'

export const DNSSEC_ORACLE_URL = 'https://dnssec-oracle.ens.domains/'

export async function fetchDNSSECOracleRRSets(name: string) {
  const DNSTYPE_TXT = 16
  const functionName = 'resolve'
  const abi = [
    {
      type: 'function',
      name: functionName,
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
