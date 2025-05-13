/* eslint-disable import/no-extraneous-dependencies */

/* eslint-disable no-await-in-loop */
import cbor from 'cbor'
import { DeployFunction } from 'hardhat-deploy/types.js'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import pako from 'pako'
import { bytesToHex, labelhash, namehash, stringToBytes, type Address, type Hash } from 'viem'

const dummyABI = [
  {
    type: 'event',
    anonymous: false,
    name: 'ABIChanged',
    inputs: [
      {
        type: 'bytes32',
        indexed: true,
      },
      {
        type: 'uint256',
        indexed: true,
      },
    ],
  },
  {
    type: 'event',
    anonymous: false,
    name: 'VersionChanged',
    inputs: [
      {
        type: 'bytes32',
        indexed: true,
      },
      {
        type: 'uint64',
      },
    ],
  },
  {
    type: 'function',
    name: 'ABI',
    constant: true,
    stateMutability: 'view',
    payable: false,
    inputs: [
      {
        type: 'bytes32',
      },
      {
        type: 'uint256',
      },
    ],
    outputs: [
      {
        type: 'uint256',
      },
      {
        type: 'bytes',
      },
    ],
  },
  {
    type: 'function',
    name: 'clearRecords',
    constant: false,
    payable: false,
    inputs: [
      {
        type: 'bytes32',
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'recordVersions',
    constant: true,
    stateMutability: 'view',
    payable: false,
    inputs: [
      {
        type: 'bytes32',
      },
    ],
    outputs: [
      {
        type: 'uint64',
      },
    ],
  },
  {
    type: 'function',
    name: 'setABI',
    constant: false,
    payable: false,
    inputs: [
      {
        type: 'bytes32',
      },
      {
        type: 'uint256',
      },
      {
        type: 'bytes',
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'supportsInterface',
    constant: true,
    stateMutability: 'view',
    payable: false,
    inputs: [
      {
        type: 'bytes4',
      },
    ],
    outputs: [
      {
        type: 'bool',
      },
    ],
  },
]

type Name = {
  label: string
  namedOwner: string
  namedAddr: string
  subname?: string
  namedController?: string
  resolver?: Address
  records?: {
    text?: {
      key: string
      value: string
    }[]
    addr?: {
      key: bigint
      value: Hash
    }[]
    contenthash?: Hash
    abi?:
      | {
          contentType: bigint
          data: any
        }
      | {
          contentType: bigint
          data: any
        }[]
  }
  subnames?: {
    label: string
    namedOwner: string
  }[]
  customDuration?: bigint
}

const names: Name[] = [
  {
    label: 'test123',
    namedOwner: 'owner',
    namedAddr: 'owner',
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
  {
    label: 'to-be-wrapped',
    namedOwner: 'owner',
    namedAddr: 'owner',
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
  {
    label: 'resume-and-wrap',
    namedOwner: 'owner',
    namedAddr: 'owner',
  },
  {
    label: 'other-registrant',
    namedOwner: 'deployer',
    namedAddr: 'deployer',
  },
  {
    label: 'other-eth-record',
    namedOwner: 'owner',
    namedAddr: 'deployer',
  },
  {
    label: 'from-settings',
    namedOwner: 'owner',
    namedAddr: 'owner',
  },
  {
    label: 'other-controller',
    namedOwner: 'owner',
    namedAddr: 'owner',
    namedController: 'deployer',
  },
  {
    label: 'other-registrant-2',
    namedOwner: 'deployer',
    namedAddr: 'deployer',
    namedController: 'owner',
  },
  {
    label: 'almost-latest-resolver',
    namedOwner: 'owner',
    namedAddr: 'owner',
    namedController: 'owner',
  },
  {
    label: 'migrated-resolver-to-be-updated',
    namedOwner: 'owner',
    namedAddr: 'owner',
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
  {
    label: 'with-subnames',
    namedOwner: 'owner',
    namedAddr: 'owner',
    subnames: [
      { label: 'test', namedOwner: 'owner' },
      { label: 'legacy', namedOwner: 'deployer' },
      { label: 'xyz', namedOwner: 'owner' },
      { label: 'addr', namedOwner: 'owner' },
    ],
  },
  {
    label: 'unwrapped-to-delete',
    namedOwner: 'owner',
    namedAddr: 'owner',
    subnames: [
      { label: 'parent-not-child', namedOwner: 'deployer' },
      { label: 'parent-child', namedOwner: 'owner' },
      { label: 'not-parent-child', namedOwner: 'deployer' },
    ],
  },
  {
    label: 'name-with-premium',
    namedOwner: 'owner',
    namedAddr: 'owner',
    customDuration: 3283200n,
  },
  {
    label: 'expired',
    namedOwner: 'owner',
    namedAddr: 'owner',
    customDuration: 2419200n,
  },
  {
    label: 'grace-period',
    namedOwner: 'owner',
    namedAddr: 'owner',
    customDuration: 5011200n,
  },
  {
    label: 'grace-period-in-list',
    namedOwner: 'owner',
    namedAddr: 'owner',
    customDuration: 5011200n,
  },
  {
    label: 'grace-period-starting-soon',
    namedOwner: 'owner',
    namedAddr: 'owner',
    customDuration: 12900600n,
  },
  {
    label: 'unwrapped-with-wrapped-subnames',
    namedOwner: 'owner',
    namedAddr: 'owner',
    subnames: [{ label: 'sub', namedOwner: 'owner' }],
  },
  {
    label: 'unknown-labels',
    namedOwner: 'owner',
    namedAddr: 'owner',
    subnames: [
      { label: 'aaa123xyz000', namedOwner: 'owner2' },
      { label: 'aaa123', namedOwner: 'owner' },
    ],
  },
  {
    label: 'aaa123',
    namedOwner: 'owner',
    namedAddr: 'owner',
  },
  {
    label: 'with-abi',
    namedOwner: 'owner',
    namedAddr: 'owner',
    records: {
      abi: {
        contentType: 1n,
        data: dummyABI,
      },
    },
  },
  {
    label: 'with-all-abis',
    namedOwner: 'owner',
    namedAddr: 'owner',
    records: {
      abi: [
        {
          contentType: 1n,
          data: dummyABI,
        },
        {
          contentType: 2n,
          data: dummyABI,
        },
        {
          contentType: 4n,
          data: dummyABI,
        },
        {
          contentType: 8n,
          data: 'https://example.com',
        },
      ],
    },
  },
] as const

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network, viem } = hre

  const allNamedClients = await viem.getNamedClients()
  const publicClient = await viem.getPublicClient()

  const registry = await viem.getContract('ENSRegistry')
  const controller = await viem.getContract('LegacyETHRegistrarController')
  const publicResolver = await viem.getContract('LegacyPublicResolver')

  const makeData = ({
    namedOwner,
    namedController,
    namedAddr,
    customDuration,
    subnames,
    ...rest
  }: Name) => {
    // eslint-disable-next-line no-restricted-syntax
    const secret = '0x0000000000000000000000000000000000000000000000000000000000000000'
    const registrant = allNamedClients[namedOwner as 'owner'].account
    const owner = namedController ? allNamedClients[namedController as 'owner'].account : undefined
    const addr = allNamedClients[namedAddr as 'owner'].account
    const resolver = rest.resolver ?? publicResolver.address
    const duration = customDuration || 31536000n

    return {
      ...rest,
      secret,
      registrant,
      owner,
      addr,
      resolver,
      duration,
      subnames,
    } as const
  }

  const makeCommitment =
    (nonce: number) =>
    async (
      { label, registrant, secret, resolver, addr }: ReturnType<typeof makeData>,
      index: number,
    ) => {
      const commitment = await controller.read.makeCommitmentWithConfig([
        label,
        registrant.address,
        secret,
        resolver,
        addr.address,
      ])

      const commitTxHash = await controller.write.commit([commitment], {
        account: registrant,
        nonce: nonce + index,
      })
      console.log(`Commiting commitment for ${label}.eth (tx: ${commitTxHash})...`)

      return 1
    }

  const makeRegistration =
    (nonce: number) =>
    async (
      { label, registrant, secret, resolver, addr, duration }: ReturnType<typeof makeData>,
      index: number,
    ) => {
      const price = await controller.read.rentPrice([label, duration])

      const registerTxHash = await controller.write.registerWithConfig(
        [label, registrant.address, duration, secret, resolver, addr.address],
        {
          account: registrant,
          value: price,
          nonce: nonce + index,
        },
      )
      console.log(`Registering name ${label}.eth (tx: ${registerTxHash})...`)

      return 1
    }

  const makeRecords =
    (nonce: number) =>
    async (
      { label, records: _records, registrant }: ReturnType<typeof makeData>,
      index: number,
    ) => {
      const records = _records!
      let nonceRef = nonce + index

      const hash = namehash(`${label}.eth`)
      console.log(`Setting records for ${label}.eth...`)
      if (records.text) {
        console.log('TEXT')
        for (const { key, value } of records.text) {
          const setTextHash = await publicResolver.write.setText([hash, key, value], {
            account: registrant,
            nonce: nonceRef,
          })
          console.log(` - ${key} ${value} (tx: ${setTextHash})...`)
          nonceRef += 1
        }
      }
      if (records.addr) {
        console.log('ADDR')
        for (const { key, value } of records.addr) {
          const setAddrHash = await publicResolver.write.setAddr([hash, key, value], {
            account: registrant,
            nonce: nonceRef,
          })
          console.log(` - ${key} ${value} (tx: ${setAddrHash})...`)
          nonceRef += 1
        }
      }
      if (records.contenthash) {
        console.log('CONTENTHASH')
        const setContenthashHash = await publicResolver.write.setContenthash(
          [hash, records.contenthash],
          { account: registrant, nonce: nonceRef },
        )
        console.log(` - ${records.contenthash} (tx: ${setContenthashHash})...`)
        nonceRef += 1
      }
      if (records.abi) {
        const abis = Array.isArray(records.abi) ? records.abi : [records.abi]
        for (const abi of abis) {
          console.log('ABI')
          const { contentType, data } = abi
          let data_
          if (contentType === 1n) data_ = stringToBytes(JSON.stringify(data))
          else if (contentType === 2n) data_ = pako.deflate(JSON.stringify(abi.data))
          else if (contentType === 4n) data_ = cbor.encode(abi.data)
          else data_ = stringToBytes(data)
          const setAbiHash = await publicResolver.write.setABI(
            [hash, contentType, bytesToHex(data_)],
            { account: registrant, nonce: nonceRef },
          )
          console.log(` - ${records.abi} (tx: ${setAbiHash})...`)
          nonceRef += 1
        }
      }
      return nonceRef - nonce - index
    }

  const makeSubnames =
    (nonce: number) =>
    async (
      { label, subnames, registrant, resolver }: ReturnType<typeof makeData>,
      index: number,
    ) => {
      if (!subnames) return 0
      for (let i = 0; i < subnames.length; i += 1) {
        const { label: subnameLabel, namedOwner: namedSubOwner } = subnames[i]
        const subOwner = allNamedClients[namedSubOwner as 'owner'].account
        const subnameTxHash = await registry.write.setSubnodeRecord(
          [namehash(`${label}.eth`), labelhash(subnameLabel), subOwner.address, resolver, 0n],
          {
            account: registrant,
            nonce: nonce + index + i,
          },
        )
        console.log(`Creating subname ${subnameLabel}.${label}.eth (tx: ${subnameTxHash})...`)
      }
      return subnames.length
    }

  const makeController =
    (nonce: number) =>
    async ({ label, owner, registrant }: ReturnType<typeof makeData>, index: number) => {
      const setControllerTxHash = await registry.write.setOwner(
        [namehash(`${label}.eth`), owner!.address],
        {
          account: registrant,
          nonce: nonce + index,
        },
      )
      console.log(`Setting controller for ${label}.eth to ${owner} (tx: ${setControllerTxHash})...`)

      return 1
    }

  const allNameData = names.map(makeData)

  const getNonceAndApply = async (
    property: keyof ReturnType<typeof makeData>,
    _func: typeof makeCommitment,
    filter?: (data: ReturnType<typeof makeData>) => boolean,
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
          if (!('address' in propertyValue)) return false
          if (propertyValue.address !== address) return false
        } else {
          return false
        }
        if (filter) return filter(data)
        return true
      })
      if (!newNonceMap[address]) {
        const nonce = await publicClient.getTransactionCount({ address })
        newNonceMap[address] = nonce
      }
      let usedNonces = 0

      for (let i = 0; i < namesWithAccount.length; i += 1) {
        const data = namesWithAccount[i]
        usedNonces += await _func(newNonceMap[address])(data, usedNonces)
      }
      newNonceMap[address] += usedNonces
    }
    return newNonceMap
  }

  await network.provider.send('evm_setAutomine', [false])
  await getNonceAndApply('registrant', makeCommitment)
  await network.provider.send('evm_mine')
  const oldTimestamp = await publicClient.getBlock().then((b) => Number(b.timestamp))
  await network.provider.send('evm_setNextBlockTimestamp', [oldTimestamp + 60])
  await network.provider.send('evm_mine')
  await getNonceAndApply('registrant', makeRegistration)
  await network.provider.send('evm_mine')
  const tempNonces = await getNonceAndApply('registrant', makeRecords, (data) => !!data.records)
  const tempNonces2 = await getNonceAndApply(
    'registrant',
    makeController,
    (data) => !!data.owner,
    tempNonces,
  )
  await getNonceAndApply('registrant', makeSubnames, (data) => !!data.subnames, tempNonces2)
  await network.provider.send('evm_mine')

  // Skip forward 28 + 90 days so that minimum exp names go into premium
  await network.provider.send('anvil_setBlockTimestampInterval', [2419200 + 7776000])
  await network.provider.send('evm_mine')

  await network.provider.send('evm_setAutomine', [true])
  await network.provider.send('anvil_setBlockTimestampInterval', [1])
  await network.provider.send('evm_mine')

  // register subname
  const resolver = publicResolver.address
  const registrant = allNamedClients.owner.account
  const subnameTxHash = await registry.write.setSubnodeRecord(
    [namehash('test123.eth'), labelhash('sub'), registrant.address, resolver, 0n],
    {
      account: registrant,
    },
  )
  await viem.waitForTransactionSuccess(subnameTxHash)

  return true
}

func.id = 'register-unwrapped-names'
func.tags = ['register-unwrapped-names']
func.dependencies = ['LegacyETHRegistrarController']
func.runAtTheEnd = true

export default func
