import type hre from 'hardhat'

export const nonceManager =
  <T extends object>(
    allNamedClients: Awaited<ReturnType<(typeof hre)['viem']['getNamedClients']>>,
    allNameData: Array<T>,
  ) =>
  async (
    property: keyof T,
    func: (nonce: number) => (data: T, index: number) => Promise<number>,
    filter?: (data: T) => boolean,
    nonceMap?: Record<string, number>,
  ) => {
    const newNonceMap = nonceMap || {}
    for (const client of Object.values(allNamedClients)) {
      const account = client.account
      const address = account.address
      const namesWithAccount = allNameData.filter((data) => {
        const propertyValue = data[property]
        if (typeof propertyValue === 'string') {
          if (propertyValue !== address) return false
        } else if (typeof propertyValue === 'object') {
          if (propertyValue === null) return false
          if (!('address' in propertyValue)) return false
          if (propertyValue.address !== address) return false
        } else {
          return false
        }
        if (filter) return filter(data)
        return true
      })
      if (!newNonceMap[address]) {
        const nonce = await client.public.getTransactionCount({ address })
        newNonceMap[address] = nonce
      }
      let usedNonces = 0

      for (let i = 0; i < namesWithAccount.length; i += 1) {
        const data = namesWithAccount[i]
        usedNonces += await func(newNonceMap[address])(data, usedNonces)
      }
      newNonceMap[address] += usedNonces
    }
    return newNonceMap
  }
