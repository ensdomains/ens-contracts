import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import {
  getAbiItem,
  labelhash,
  namehash,
  padHex,
  zeroAddress,
  type Address,
} from 'viem'
import { DAY, FUSES } from '../../fixtures/constants.js'
import { dnsEncodeName } from '../../fixtures/dnsEncodeName.js'
import { toLabelId, toNameId } from '../../fixtures/utils.js'
import {
  deployNameWrapperFixture as baseFixture,
  type DeployNameWrapperFixtureResult as Fixture,
} from './deploy.js'

export const zeroAccount = { address: zeroAddress }

export const {
  CANNOT_UNWRAP,
  CANNOT_BURN_FUSES,
  CANNOT_TRANSFER,
  CANNOT_SET_RESOLVER,
  CANNOT_SET_TTL,
  CANNOT_CREATE_SUBDOMAIN,
  PARENT_CANNOT_CONTROL,
  CAN_DO_EVERYTHING,
  IS_DOT_ETH,
  CAN_EXTEND_EXPIRY,
  CANNOT_APPROVE,
} = FUSES
export const MAX_EXPIRY = 2n ** 64n - 1n
export const GRACE_PERIOD = 90n * DAY
export const DUMMY_ADDRESS = padHex('0x01', { size: 20 })

export async function deployNameWrapperWithUtils() {
  const initial = await loadFixture(baseFixture)
  const { publicClient, ensRegistry, baseRegistrar, nameWrapper, accounts } =
    initial

  const setSubnodeOwner = {
    onEnsRegistry: async ({
      parentName,
      label,
      owner,
      account = 0,
    }: {
      parentName: string
      label: string
      owner: Address
      account?: number
    }) =>
      ensRegistry.write.setSubnodeOwner(
        [namehash(parentName), labelhash(label), owner],
        { account: accounts[account] },
      ),
    onNameWrapper: async ({
      parentName,
      label,
      owner,
      fuses,
      expiry,
      account = 0,
    }: {
      parentName: string
      label: string
      owner: Address
      fuses: number
      expiry: bigint
      account?: number
    }) =>
      nameWrapper.write.setSubnodeOwner(
        [namehash(parentName), label, owner, fuses, expiry],
        { account: accounts[account] },
      ),
  }
  const setSubnodeRecord = {
    onEnsRegistry: async ({
      parentName,
      label,
      owner,
      resolver,
      ttl,
      account = 0,
    }: {
      parentName: string
      label: string
      owner: Address
      resolver: Address
      ttl: bigint
      account?: number
    }) =>
      ensRegistry.write.setSubnodeRecord(
        [namehash(parentName), labelhash(label), owner, resolver, ttl],
        { account: accounts[account] },
      ),
    onNameWrapper: async ({
      parentName,
      label,
      owner,
      resolver,
      ttl,
      fuses,
      expiry,
      account = 0,
    }: {
      parentName: string
      label: string
      owner: Address
      resolver: Address
      ttl: bigint
      fuses: number
      expiry: bigint
      account?: number
    }) =>
      nameWrapper.write.setSubnodeRecord(
        [namehash(parentName), label, owner, resolver, ttl, fuses, expiry],
        { account: accounts[account] },
      ),
  }
  const register = async ({
    label,
    owner,
    duration,
    account = 0,
  }: {
    label: string
    owner: Address
    duration: bigint
    account?: number
  }) =>
    baseRegistrar.write.register([toLabelId(label), owner, duration], {
      account: accounts[account],
    })
  const wrapName = async ({
    name,
    owner,
    resolver,
    account = 0,
  }: {
    name: string
    owner: Address
    resolver: Address
    account?: number
  }) =>
    nameWrapper.write.wrap([dnsEncodeName(name), owner, resolver], {
      account: accounts[account],
    })
  const wrapEth2ld = async ({
    label,
    owner,
    fuses,
    resolver,
    account = 0,
  }: {
    label: string
    owner: Address
    fuses: number
    resolver: Address
    account?: number
  }) =>
    nameWrapper.write.wrapETH2LD([label, owner, fuses, resolver], {
      account: accounts[account],
    })
  const unwrapName = async ({
    parentName,
    label,
    controller,
    account = 0,
  }: {
    parentName: string
    label: string
    controller: Address
    account?: number
  }) =>
    nameWrapper.write.unwrap(
      [namehash(parentName), labelhash(label), controller],
      { account: accounts[account] },
    )
  const unwrapEth2ld = async ({
    label,
    registrant,
    controller,
    account = 0,
  }: {
    label: string
    registrant: Address
    controller: Address
    account?: number
  }) =>
    nameWrapper.write.unwrapETH2LD([labelhash(label), registrant, controller], {
      account: accounts[account],
    })
  const setRegistryApprovalForWrapper = async ({
    account = 0,
  }: { account?: number } = {}) =>
    ensRegistry.write.setApprovalForAll([nameWrapper.address, true], {
      account: accounts[account],
    })
  const setBaseRegistrarApprovalForWrapper = async ({
    account = 0,
  }: { account?: number } = {}) =>
    baseRegistrar.write.setApprovalForAll([nameWrapper.address, true], {
      account: accounts[account],
    })
  const registerSetupAndWrapName = async ({
    label,
    fuses,
    resolver = zeroAddress,
    duration = 1n * DAY,
    account = 0,
  }: {
    label: string
    fuses: number
    resolver?: Address
    duration?: bigint
    account?: number
  }) => {
    const owner = accounts[account]

    await register({ label, owner: owner.address, duration, account })
    await setBaseRegistrarApprovalForWrapper({ account })
    await wrapEth2ld({
      label,
      owner: owner.address,
      fuses,
      resolver,
      account,
    })
  }
  const getBlockTimestamp = async () =>
    publicClient.getBlock().then((b) => b.timestamp)

  const actions = {
    setSubnodeOwner,
    setSubnodeRecord,
    register,
    wrapName,
    wrapEth2ld,
    unwrapName,
    unwrapEth2ld,
    setRegistryApprovalForWrapper,
    setBaseRegistrarApprovalForWrapper,
    registerSetupAndWrapName,
    getBlockTimestamp,
  }

  return {
    ...initial,
    actions,
  }
}

export const runForContract = ({
  contract,
  onNameWrapper,
  onBaseRegistrar,
  onEnsRegistry,
}: {
  contract:
    | Fixture['nameWrapper']
    | Fixture['ensRegistry']
    | Fixture['baseRegistrar']
  onNameWrapper?: (nameWrapper: Fixture['nameWrapper']) => Promise<void>
  onEnsRegistry?: (ensRegistry: Fixture['ensRegistry']) => Promise<void>
  onBaseRegistrar?: (baseRegistrar: Fixture['baseRegistrar']) => Promise<void>
}) => {
  if (getAbiItem({ abi: contract.abi, name: 'isWrapped' })) {
    if (!onNameWrapper) throw new Error('onNameWrapper not provided')
    return onNameWrapper(contract as Fixture['nameWrapper'])
  }

  if (getAbiItem({ abi: contract.abi, name: 'ownerOf' })) {
    if (!onBaseRegistrar) throw new Error('onBaseRegistrar not provided')
    return onBaseRegistrar(contract as Fixture['baseRegistrar'])
  }

  if (!onEnsRegistry) throw new Error('onEnsRegistry not provided')
  return onEnsRegistry(contract as Fixture['ensRegistry'])
}

export const expectOwnerOf = (name: string) => ({
  on: (
    contract:
      | Fixture['nameWrapper']
      | Fixture['baseRegistrar']
      | Fixture['ensRegistry'],
  ) => ({
    toBe: (owner: { address: Address }) =>
      runForContract({
        contract,
        onNameWrapper: async (nameWrapper) =>
          expect(
            nameWrapper.read.ownerOf([toNameId(name)]),
          ).resolves.toEqualAddress(owner.address),
        onBaseRegistrar: async (baseRegistrar) => {
          if (name.includes('.')) throw new Error('Not a label')
          return expect(
            baseRegistrar.read.ownerOf([toLabelId(name)]),
          ).resolves.toEqualAddress(owner.address)
        },
        onEnsRegistry: async (ensRegistry) =>
          expect(
            ensRegistry.read.owner([namehash(name)]),
          ).resolves.toEqualAddress(owner.address),
      }),
  }),
})
