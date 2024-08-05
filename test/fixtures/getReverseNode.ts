import { namehash, type Address } from 'viem'

export const getReverseNode = (address: Address) =>
  `${address.slice(2)}.addr.reverse`

export const getReverseNodeHash = (address: Address) =>
  namehash(getReverseNode(address))
