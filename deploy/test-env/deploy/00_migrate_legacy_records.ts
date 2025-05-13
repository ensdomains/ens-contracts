/* eslint-disable import/no-extraneous-dependencies */

/* eslint-disable no-await-in-loop */
import { DeployFunction } from 'hardhat-deploy/types.js'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { namehash } from 'viem'

const names = [
  {
    label: 'migrated-resolver-to-be-updated',
    namedOwner: 'owner',
    records: {
      text: [
        { key: 'description', value: 'Hello2' },
        { key: 'url', value: 'https://twitter.com' },
        { key: 'blankrecord', value: '' },
        { key: 'email', value: 'fakeemail@fake.com' },
      ],
      addr: [
        { key: 61n, value: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' },
        { key: 0n, value: '0x00149010587f8364b964fcaa70687216b53bd2cbd798' },
        { key: 2n, value: '0x0000000000000000000000000000000000000000' },
      ],
      contenthash: '0xe301017012204edd2984eeaf3ddf50bac238ec95c5713fb40b5e428b508fdbe55d3b9f155ffe',
    },
  },
] as const

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network, viem } = hre
  const namedClients = await viem.getNamedClients()

  const publicResolver = await viem.getContract('PublicResolver')

  await network.provider.send('anvil_setBlockTimestampInterval', [60])

  for (const { label, namedOwner, records } of names) {
    const registrant = namedClients[namedOwner].account
    const hash = namehash(`${label}.eth`)

    console.log(`Migrating records for ${label}.eth...`)
    if (records.text) {
      console.log('TEXT')
      for (const { key, value } of records.text) {
        const setTextHash = await publicResolver.write.setText([hash, key, value], {
          account: registrant,
        })
        console.log(` - ${key} ${value} (tx: ${setTextHash})...`)
        await viem.waitForTransactionSuccess(setTextHash)
      }
    }
    if (records.addr) {
      console.log('ADDR')
      for (const { key, value } of records.addr) {
        const setAddrHash = await publicResolver.write.setAddr([hash, key, value], {
          account: registrant,
        })
        console.log(` - ${key} ${value} (tx: ${setAddrHash})...`)
        await viem.waitForTransactionSuccess(setAddrHash)
      }
    }
    if (records.contenthash) {
      console.log('CONTENTHASH')
      const setContenthashHash = await publicResolver.write.setContenthash(
        [hash, records.contenthash],
        {
          account: registrant,
        },
      )
      console.log(` - ${records.contenthash} (tx: ${setContenthashHash})...`)
      await viem.waitForTransactionSuccess(setContenthashHash)
    }
  }

  await network.provider.send('anvil_setBlockTimestampInterval', [1])

  return true
}

func.id = 'migrate-legacy-records'
func.runAtTheEnd = true

export default func
