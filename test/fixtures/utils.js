import { hexToBigInt, labelhash, namehash } from 'viem'
export const toTokenId = (hash) => hexToBigInt(hash)
export const toLabelId = (label) => toTokenId(labelhash(label))
export const toNameId = (name) => toTokenId(namehash(name))
export const getAccounts = async (connection) =>
  connection.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))
