import hre from 'hardhat'
import { labelhash, namehash, zeroHash, zeroAddress, keccak256, toHex } from 'viem'
import { describe, it, expect } from 'vitest'

import { DAY } from '../fixtures/constants.js'

const connection = await hre.network.connect()
const publicClient = await connection.viem.getPublicClient()
const [ownerClient, aliceClient, bobClient, relayerClient] =
  await connection.viem.getWalletClients()
const ownerAccount = ownerClient.account
const aliceAccount = aliceClient.account

const DURATION = 365n * DAY
const FAR_FUTURE = 4102444800n
const NODE = namehash('alicechat.simplex')

async function fixture() {
  const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])
  const baseRegistrar = await connection.viem.deployContract(
    'BaseRegistrarImplementation',
    [ensRegistry.address, namehash('simplex')],
  )
  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('simplex'),
    baseRegistrar.address,
  ])
  await baseRegistrar.write.addController([ownerAccount.address])
  // PublicResolver's ReverseClaimer constructor calls into the reverse
  // registrar, so it must exist before the resolver is deployed.
  const reverseRegistrar = await connection.viem.deployContract(
    'ReverseRegistrar',
    [ensRegistry.address],
  )
  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('reverse'),
    ownerAccount.address,
  ])
  await ensRegistry.write.setSubnodeOwner([
    namehash('reverse'),
    labelhash('addr'),
    reverseRegistrar.address,
  ])
  // ownerAccount stands in for the controller: it is what may grant credits.
  const resolver = await connection.viem.deployContract('SimplexResolver', [
    ensRegistry.address,
    zeroAddress,
    ownerAccount.address,
    zeroAddress,
    ownerAccount.address,
  ])
  await baseRegistrar.write.registerWithLabel([
    'alicechat',
    aliceAccount.address,
    DURATION,
  ])
  return { ensRegistry, baseRegistrar, resolver }
}

const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

const types = {
  SetText: [
    { name: 'node', type: 'bytes32' },
    { name: 'key', type: 'string' },
    { name: 'value', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

async function signSetText(
  client: typeof aliceClient,
  verifyingContract: `0x${string}`,
  message: {
    node: `0x${string}`
    key: string
    value: string
    nonce: bigint
    deadline: bigint
  },
) {
  const chainId = await publicClient.getChainId()
  return client.signTypedData({
    account: client.account,
    domain: { name: 'SimplexResolver', version: '1', chainId, verifyingContract },
    types,
    primaryType: 'SetText',
    message,
  })
}

const KEY = 'simplex.contact'
const VALUE = 'https://smp11.simplex.im/a#alice'

describe('SimplexResolver', () => {
  it('pins the EIP-712 type hash', async () => {
    const { resolver } = await loadFixture()
    expect(await resolver.read.SET_TEXT_TYPEHASH()).toBe(
      keccak256(
        toHex(
          'SetText(bytes32 node,string key,string value,uint256 nonce,uint256 deadline)',
        ),
      ),
    )
  })

  it('lets a relayer write a record the owner signed, spending one credit', async () => {
    const { resolver } = await loadFixture()
    await resolver.write.grantEditCredits([NODE, 10n])
    expect(await resolver.read.editCredits([NODE])).toBe(10n)

    const message = {
      node: NODE,
      key: KEY,
      value: VALUE,
      nonce: 0n,
      deadline: FAR_FUTURE,
    }
    const sig = await signSetText(aliceClient, resolver.address, message)
    await resolver.write.setTextWithSig(
      [message.node, message.key, message.value, message.nonce, message.deadline, sig],
      { account: relayerClient.account },
    )
    expect(await resolver.read.text([NODE, KEY])).toBe(VALUE)
    expect(await resolver.read.editCredits([NODE])).toBe(9n)
  })

  it('refuses when the allowance is exhausted', async () => {
    const { resolver } = await loadFixture()
    await resolver.write.grantEditCredits([NODE, 1n])
    for (const nonce of [0n, 1n]) {
      const message = {
        node: NODE,
        key: KEY,
        value: `${VALUE}${nonce}`,
        nonce,
        deadline: FAR_FUTURE,
      }
      const sig = await signSetText(aliceClient, resolver.address, message)
      const call = resolver.write.setTextWithSig(
        [message.node, message.key, message.value, message.nonce, message.deadline, sig],
        { account: relayerClient.account },
      )
      if (nonce === 0n) await call
      else await expect(call).rejects.toThrow('NoEditCredits')
    }
  })

  it('does not meter a direct setText by the owner', async () => {
    const { resolver } = await loadFixture()
    // No credits granted at all.
    expect(await resolver.read.editCredits([NODE])).toBe(0n)
    await resolver.write.setText([NODE, KEY, VALUE], {
      account: aliceClient.account,
    })
    expect(await resolver.read.text([NODE, KEY])).toBe(VALUE)
  })

  it('adds credits rather than replacing them, so a hostile renewal cannot shrink the allowance', async () => {
    const { resolver } = await loadFixture()
    await resolver.write.grantEditCredits([NODE, 100n])
    // A stranger renews for the minimum term; the controller grants 10 more.
    // With set semantics this would collapse 100 to 10.
    await resolver.write.grantEditCredits([NODE, 10n])
    expect(await resolver.read.editCredits([NODE])).toBe(110n)
  })

  it('rejects a grant from anyone but the controller', async () => {
    const { resolver } = await loadFixture()
    await expect(
      resolver.write.grantEditCredits([NODE, 10n], {
        account: bobClient.account,
      }),
    ).rejects.toThrow('NotController')
  })

  it('rejects a signature from anyone but the name owner', async () => {
    const { resolver } = await loadFixture()
    await resolver.write.grantEditCredits([NODE, 10n])
    const message = {
      node: NODE,
      key: KEY,
      value: VALUE,
      nonce: 0n,
      deadline: FAR_FUTURE,
    }
    const sig = await signSetText(bobClient, resolver.address, message)
    await expect(
      resolver.write.setTextWithSig(
        [message.node, message.key, message.value, message.nonce, message.deadline, sig],
        { account: relayerClient.account },
      ),
    ).rejects.toThrow('InvalidSignature')
  })

  it('rejects a replayed signature', async () => {
    const { resolver } = await loadFixture()
    await resolver.write.grantEditCredits([NODE, 10n])
    const message = {
      node: NODE,
      key: KEY,
      value: VALUE,
      nonce: 0n,
      deadline: FAR_FUTURE,
    }
    const sig = await signSetText(aliceClient, resolver.address, message)
    const args = [
      message.node,
      message.key,
      message.value,
      message.nonce,
      message.deadline,
      sig,
    ] as const
    await resolver.write.setTextWithSig(args, { account: relayerClient.account })
    await expect(
      resolver.write.setTextWithSig(args, { account: relayerClient.account }),
    ).rejects.toThrow('InvalidNonce')
  })

  it('rejects an expired signature', async () => {
    const { resolver } = await loadFixture()
    await resolver.write.grantEditCredits([NODE, 10n])
    const message = {
      node: NODE,
      key: KEY,
      value: VALUE,
      nonce: 0n,
      deadline: 1n,
    }
    const sig = await signSetText(aliceClient, resolver.address, message)
    await expect(
      resolver.write.setTextWithSig(
        [message.node, message.key, message.value, message.nonce, message.deadline, sig],
        { account: relayerClient.account },
      ),
    ).rejects.toThrow('SignatureExpired')
  })

  it('rejects a signature bound to a different value', async () => {
    const { resolver } = await loadFixture()
    await resolver.write.grantEditCredits([NODE, 10n])
    const message = {
      node: NODE,
      key: KEY,
      value: VALUE,
      nonce: 0n,
      deadline: FAR_FUTURE,
    }
    const sig = await signSetText(aliceClient, resolver.address, message)
    // The relayer tries to substitute its own value.
    await expect(
      resolver.write.setTextWithSig(
        [message.node, message.key, 'https://evil.example/a#mallory', message.nonce, message.deadline, sig],
        { account: relayerClient.account },
      ),
    ).rejects.toThrow('InvalidSignature')
  })
})
