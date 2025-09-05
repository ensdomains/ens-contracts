import type { NetworkConnection } from 'hardhat/types/network'
import { Address, getAddress, Hex, zeroAddress, zeroHash } from 'viem'
import { EnsStack } from './deployEnsFixture.js'

export type Mutable<T> = {
  -readonly [K in keyof T]: Mutable<T[K]>
}

type RegisterNameOptions = {
  label: string
  ownerAddress?: Address
  duration?: bigint
  secret?: Hex
  resolverAddress?: Address
  data?: Hex[]
  reverseRecord?: ('ethereum' | 'default')[]
  referrer?: Hex
}

const ReverseRecord = {
  ethereum: 1,
  default: 2,
}

export const getDefaultRegistrationOptionsWithConnection =
  (connection: NetworkConnection) =>
  async ({
    label,
    ownerAddress,
    duration,
    secret,
    resolverAddress,
    data,
    reverseRecord,
    referrer,
  }: RegisterNameOptions) => ({
    label,
    ownerAddress: await (async () => {
      if (ownerAddress) return getAddress(ownerAddress)
      const [deployer] = await connection.viem.getWalletClients()
      return getAddress(deployer.account.address)
    })(),
    duration: duration ?? BigInt(60 * 60 * 24 * 365),
    secret:
      secret ??
      '0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    resolverAddress: resolverAddress ?? zeroAddress,
    data: data ?? [],
    reverseRecord: reverseRecord ?? [],
    referrer: referrer ?? zeroHash,
  })

export const getRegisterNameParameters = ({
  label,
  ownerAddress,
  duration,
  secret,
  resolverAddress,
  data,
  reverseRecord,
  referrer,
}: Required<RegisterNameOptions>) => {
  const immutable = {
    label,
    owner: ownerAddress,
    duration,
    secret,
    resolver: resolverAddress,
    data,
    reverseRecord: reverseRecord.reduce(
      (acc, record) => acc | ReverseRecord[record],
      0,
    ),
    referrer,
  } as const
  return immutable as Mutable<typeof immutable>
}

export const commitNameWithConnection =
  (connection: NetworkConnection) =>
  async (
    { ethRegistrarController }: Pick<EnsStack, 'ethRegistrarController'>,
    params_: RegisterNameOptions,
  ) => {
    const params = await getDefaultRegistrationOptionsWithConnection(
      connection,
    )(params_)
    const args = getRegisterNameParameters(params)

    const testClient = await connection.viem.getTestClient()
    const [deployer] = await connection.viem.getWalletClients()

    const commitmentHash = await ethRegistrarController.read.makeCommitment([
      args,
    ])
    await ethRegistrarController.write.commit([commitmentHash], {
      account: deployer.account,
    })
    const minCommitmentAge =
      await ethRegistrarController.read.minCommitmentAge()
    await testClient.increaseTime({ seconds: Number(minCommitmentAge) })
    await testClient.mine({ blocks: 1 })

    return {
      params,
      args,
      hash: commitmentHash,
    }
  }

export const registerNameWithConnection =
  (connection: NetworkConnection) =>
  async (
    { ethRegistrarController }: Pick<EnsStack, 'ethRegistrarController'>,
    params_: RegisterNameOptions,
  ) => {
    const params = await getDefaultRegistrationOptionsWithConnection(
      connection,
    )(params_)
    const args = getRegisterNameParameters(params)
    const { label, duration } = params

    const testClient = await connection.viem.getTestClient()
    const [deployer] = await connection.viem.getWalletClients()
    const commitmentHash = await ethRegistrarController.read.makeCommitment([
      args,
    ])
    await ethRegistrarController.write.commit([commitmentHash], {
      account: deployer.account,
    })
    const minCommitmentAge =
      await ethRegistrarController.read.minCommitmentAge()
    await testClient.increaseTime({ seconds: Number(minCommitmentAge) })
    await testClient.mine({ blocks: 1 })

    const price = (await ethRegistrarController.read.rentPrice([
      label,
      duration,
    ])) as { base: bigint; premium: bigint }

    const value = price.base + price.premium

    await ethRegistrarController.write.register([args], {
      value,
      account: deployer.account,
    })
  }
