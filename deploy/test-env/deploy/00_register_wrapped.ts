/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-await-in-loop */
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { namehash, type Account } from 'viem'

import {
  encodeFuses,
  makeCommitment as generateCommitment,
  makeRegistrationTuple,
  RecordOptions,
  RegistrationParameters,
} from '@ensdomains/ensjs/utils'

import { nonceManager } from './utils/nonceManager'

type Name = {
  name: string
  namedOwner: string
  reverseRecord?: boolean
  records?: RecordOptions
  fuses?: RegistrationParameters['fuses']
  customDuration?: number
  subnames?: {
    label: string
    namedOwner: string
    fuses?: number
    expiry?: number
  }[]
}

type ProcessedSubname = {
  label: string
  owner: Account
  expiry: number
  fuses: number
}

type ProcessedNameData = Omit<RegistrationParameters, 'owner'> & {
  label: string
  subnames: ProcessedSubname[]
  resolverAddress: string
  secret: string
  duration: number
  owner: Account
  name: string
  fuses?: RegistrationParameters['fuses']
}

const names: Name[] = [
  {
    name: 'wrapped.eth',
    namedOwner: 'owner',
    subnames: [
      { label: 'sub', namedOwner: 'deployer' },
      { label: 'test', namedOwner: 'deployer' },
      { label: 'legacy', namedOwner: 'deployer' },
      { label: 'xyz', namedOwner: 'deployer' },
    ],
  },
  {
    name: 'wrapped-expired-subnames.eth',
    namedOwner: 'owner',
    fuses: {
      named: ['CANNOT_UNWRAP'],
    },
    subnames: [
      {
        label: 'day-expired',
        namedOwner: 'owner',
        // set expiry to 24 hours ago
        expiry: Math.floor(Date.now() / 1000) - 86400,
        fuses: encodeFuses({ input: { parent: { named: ['PARENT_CANNOT_CONTROL'] } } }),
      },
      {
        label: 'hour-expired',
        namedOwner: 'owner',
        // set expiry to 24 hours ago
        expiry: Math.floor(Date.now() / 1000) - 3600,
        fuses: encodeFuses({ input: { parent: { named: ['PARENT_CANNOT_CONTROL'] } } }),
      },
      {
        label: 'two-minute-expired',
        namedOwner: 'owner',
        expiry: Math.floor(Date.now() / 1000) - 120,
        fuses: encodeFuses({ input: { parent: { named: ['PARENT_CANNOT_CONTROL'] } } }),
      },
      {
        label: 'two-minute-expiring',
        namedOwner: 'owner',
        expiry: Math.floor(Date.now() / 1000) + 120,
        fuses: encodeFuses({ input: { parent: { named: ['PARENT_CANNOT_CONTROL'] } } }),
      },
      {
        label: 'hour-expiring',
        namedOwner: 'owner',
        // set expiry to 24 hours ago
        expiry: Math.floor(Date.now() / 1000) + 3600,
        fuses: encodeFuses({ input: { parent: { named: ['PARENT_CANNOT_CONTROL'] } } }),
      },
      {
        label: 'no-pcc',
        namedOwner: 'owner',
        expiry: Math.floor(Date.now() / 1000) - 86400,
      },
      {
        label: 'not-expired',
        namedOwner: 'owner',
        fuses: encodeFuses({ input: { parent: { named: ['PARENT_CANNOT_CONTROL'] } } }),
      },
    ],
  },
  {
    name: 'wrapped-to-delete.eth',
    namedOwner: 'owner',
    subnames: [
      { label: 'parent-not-child', namedOwner: 'deployer' },
      { label: 'parent-child', namedOwner: 'owner' },
      { label: 'not-parent-child', namedOwner: 'deployer' },
    ],
  },
  {
    name: 'emancipated-to-delete.eth',
    namedOwner: 'owner',
    fuses: {
      named: ['CANNOT_UNWRAP'],
    },
    subnames: [
      {
        label: 'parent-not-child',
        namedOwner: 'deployer',
        expiry: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
        fuses: encodeFuses({ input: { parent: { named: ['PARENT_CANNOT_CONTROL'] } } }),
      },
      {
        label: 'parent-child',
        namedOwner: 'owner',
        expiry: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
        fuses: encodeFuses({ input: { parent: { named: ['PARENT_CANNOT_CONTROL'] } } }),
      },
      {
        label: 'not-parent-child',
        namedOwner: 'deployer',
        expiry: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
        fuses: encodeFuses({ input: { parent: { named: ['PARENT_CANNOT_CONTROL'] } } }),
      },
    ],
  },
]

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network, viem } = hre
  const allNamedClients = await viem.getNamedClients()
  const publicClient = await viem.getPublicClient()

  const controller = await viem.getContract('ETHRegistrarController')
  const publicResolver = await viem.getContract('PublicResolver')
  const nameWrapper = await viem.getContract('NameWrapper')

  const makeData = ({ namedOwner, customDuration, fuses, name, subnames, ...rest }: Name) => {
    const resolverAddress = publicResolver.address
    const secret = '0x0000000000000000000000000000000000000000000000000000000000000000' as const
    const duration = customDuration || 31536000
    // 1659467455 is an approximate base timestamp; adding duration to it gives the wrapper expiry
    const wrapperExpiry = 1659467455 + duration
    const owner = allNamedClients[namedOwner as 'owner'].account

    const processedSubnames: ProcessedSubname[] =
      subnames?.map(
        ({ label, namedOwner: subNamedOwner, fuses: subnameFuses, expiry: subnameExpiry }) => ({
          label,
          owner: allNamedClients[subNamedOwner as 'owner'].account,
          expiry: subnameExpiry || wrapperExpiry,
          fuses: subnameFuses || 0,
        }),
      ) || []

    return {
      resolverAddress,
      secret,
      duration,
      owner,
      name,
      label: name.split('.')[0],
      subnames: processedSubnames,
      fuses: fuses || undefined,
      ...rest,
    }
  }

  const makeCommitment =
    (nonce: number) =>
    async ({ owner, name, ...rest }: ProcessedNameData, index: number) => {
      const commitment = generateCommitment({ owner: owner.address, name, ...rest })
      const commitTxHash = await controller.write.commit([commitment], {
        nonce: nonce + index,
        account: owner,
      })
      console.log(`Commiting commitment for ${name} (tx: ${commitTxHash})...`)
      return 1
    }

  const makeRegistration =
    (nonce: number) =>
    async ({ owner, name, duration, label, ...rest }: ProcessedNameData, index: number) => {
      const { base: price } = await controller.read.rentPrice([label, BigInt(duration)])
      const registerTxHash = await controller.write.register(
        makeRegistrationTuple({ owner: owner.address, name, duration, ...rest }),
        {
          account: owner,
          value: price,
          nonce: nonce + index,
        },
      )
      console.log(`Registering name ${name} (tx: ${registerTxHash})...`)
      return 1
    }

  const makeSubname =
    (nonce: number) =>
    async ({ name, subnames, owner }: ProcessedNameData, index: number) => {
      for (let i = 0; i < subnames.length; i += 1) {
        const { label, owner: subOwner, fuses, expiry } = subnames[i]
        const subnameTxHash = await nameWrapper.write.setSubnodeOwner(
          [namehash(name), label, subOwner.address, fuses, BigInt(expiry)],
          {
            account: owner,
            nonce: nonce + index + i,
          },
        )
        console.log(`Creating subname ${label}.${name} (tx: ${subnameTxHash})...`)
      }
      return subnames.length
    }

  const allNameData = names.map(makeData)

  const getNonceAndApply = nonceManager(allNamedClients, allNameData)

  await network.provider.send('evm_setAutomine', [false])
  await getNonceAndApply('owner', makeCommitment)
  await network.provider.send('evm_mine')
  const oldTimestamp = await publicClient.getBlock().then((b) => Number(b.timestamp))
  await network.provider.send('evm_setNextBlockTimestamp', [oldTimestamp + 60])
  await network.provider.send('evm_mine')
  await getNonceAndApply('owner', makeRegistration)
  await network.provider.send('evm_mine')
  await getNonceAndApply('owner', makeSubname)
  await network.provider.send('evm_mine')

  await network.provider.send('evm_setAutomine', [true])
  await network.provider.send('anvil_setBlockTimestampInterval', [1])
  await network.provider.send('evm_mine')

  return true
}

func.id = 'register-wrapped-names'
func.tags = ['register-wrapped-names']
func.dependencies = ['ETHRegistrarController']
func.runAtTheEnd = true

export default func
