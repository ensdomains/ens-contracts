import hre from 'hardhat'
import { labelhash, namehash, zeroHash, getAddress, keccak256, toHex } from 'viem'
import { describe, it, expect } from 'vitest'

import { DAY } from '../fixtures/constants.js'

const connection = await hre.network.connect()
const publicClient = await connection.viem.getPublicClient()
const [ownerClient, aliceClient, bobClient, relayerClient] =
  await connection.viem.getWalletClients()
const ownerAccount = ownerClient.account
const aliceAccount = aliceClient.account
const bobAccount = bobClient.account

const DURATION = 365n * DAY
const FAR_FUTURE = 4102444800n // 2100-01-01

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
  await baseRegistrar.write.registerWithLabel([
    'alicechat',
    aliceAccount.address,
    DURATION,
  ])
  return { ensRegistry, baseRegistrar }
}

const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

const TOKEN_ID = BigInt(labelhash('alicechat'))

const types = {
  TransferName: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

async function signTransfer(
  client: typeof aliceClient,
  verifyingContract: `0x${string}`,
  message: {
    from: `0x${string}`
    to: `0x${string}`
    tokenId: bigint
    nonce: bigint
    deadline: bigint
  },
) {
  const chainId = await publicClient.getChainId()
  return client.signTypedData({
    account: client.account,
    domain: {
      name: 'SimplexNames',
      version: '1',
      chainId,
      verifyingContract,
    },
    types,
    primaryType: 'TransferName',
    message,
  })
}

// A plausible compressed secp256k1 point and its view tag. The contract treats
// these as opaque - it stores nothing and checks nothing beyond emptiness.
const EPH =
  '0x029ac20335eb38768d2052be1dbbc3c8f6178407458e51e6b4ad22f1d91758895b' as const
const VIEW_TAG = '0xe0' as const

describe('transferWithSig', () => {
  it('pins the EIP-712 type hash', async () => {
    // The client signs against this string. A change here silently invalidates
    // every signature the app produces, so it is pinned rather than derived.
    const { baseRegistrar } = await loadFixture()
    expect(await baseRegistrar.read.TRANSFER_TYPEHASH()).toBe(
      keccak256(
        toHex(
          'TransferName(address from,address to,uint256 tokenId,uint256 nonce,uint256 deadline)',
        ),
      ),
    )
  })

  it('moves the name when a relayer submits the owner signature', async () => {
    const { baseRegistrar, ensRegistry } = await loadFixture()
    const message = {
      from: getAddress(aliceAccount.address),
      to: getAddress(bobAccount.address),
      tokenId: TOKEN_ID,
      nonce: 0n,
      deadline: FAR_FUTURE,
    }
    const sig = await signTransfer(aliceClient, baseRegistrar.address, message)
    // Submitted by the relayer, who signed nothing and pays only gas.
    await baseRegistrar.write.transferWithSig(
      [
        message.from,
        message.to,
        message.tokenId,
        message.nonce,
        message.deadline,
        sig,
        '0x',
        '0x00',
      ],
      { account: relayerClient.account },
    )
    expect(await baseRegistrar.read.ownerOf([TOKEN_ID])).toBe(
      getAddress(bobAccount.address),
    )
    // Auto-reclaim: the registry node follows the token, so the previous owner
    // can no longer manage the name or its subnames.
    expect(
      await ensRegistry.read.owner([namehash('alicechat.simplex')]),
    ).toBe(getAddress(bobAccount.address))
    expect(await baseRegistrar.read.nonces([message.from])).toBe(1n)
  })

  it('emits the announcement only when an ephemeral key is supplied', async () => {
    const { baseRegistrar } = await loadFixture()
    const message = {
      from: getAddress(aliceAccount.address),
      to: getAddress(bobAccount.address),
      tokenId: TOKEN_ID,
      nonce: 0n,
      deadline: FAR_FUTURE,
    }
    const sig = await signTransfer(aliceClient, baseRegistrar.address, message)
    const hash = await baseRegistrar.write.transferWithSig(
      [
        message.from,
        message.to,
        message.tokenId,
        message.nonce,
        message.deadline,
        sig,
        EPH,
        VIEW_TAG,
      ],
      { account: relayerClient.account },
    )
    await publicClient.waitForTransactionReceipt({ hash })
    const logs = await publicClient.getContractEvents({
      address: baseRegistrar.address,
      abi: baseRegistrar.abi,
      eventName: 'StealthNameTransfer',
    })
    expect(logs.length).toBe(1)
    expect(logs[0].args.ephemeralPubKey).toBe(EPH)
    expect(logs[0].args.viewTag).toBe(VIEW_TAG)
    expect(logs[0].args.to).toBe(getAddress(bobAccount.address))
  })

  it('emits nothing for a plain transfer', async () => {
    const { baseRegistrar } = await loadFixture()
    const message = {
      from: getAddress(aliceAccount.address),
      to: getAddress(bobAccount.address),
      tokenId: TOKEN_ID,
      nonce: 0n,
      deadline: FAR_FUTURE,
    }
    const sig = await signTransfer(aliceClient, baseRegistrar.address, message)
    await baseRegistrar.write.transferWithSig(
      [
        message.from,
        message.to,
        message.tokenId,
        message.nonce,
        message.deadline,
        sig,
        '0x',
        '0x00',
      ],
      { account: relayerClient.account },
    )
    const logs = await publicClient.getContractEvents({
      address: baseRegistrar.address,
      abi: baseRegistrar.abi,
      eventName: 'StealthNameTransfer',
    })
    expect(logs.length).toBe(0)
  })

  it('rejects a self-transfer, so announcements cost a real gift', async () => {
    const { baseRegistrar } = await loadFixture()
    const message = {
      from: getAddress(aliceAccount.address),
      to: getAddress(aliceAccount.address),
      tokenId: TOKEN_ID,
      nonce: 0n,
      deadline: FAR_FUTURE,
    }
    const sig = await signTransfer(aliceClient, baseRegistrar.address, message)
    await expect(
      baseRegistrar.write.transferWithSig(
        [
          message.from,
          message.to,
          message.tokenId,
          message.nonce,
          message.deadline,
          sig,
          EPH,
          VIEW_TAG,
        ],
        { account: relayerClient.account },
      ),
    ).rejects.toThrow('TransferToSelf')
  })

  it('rejects a signature from anyone but the owner', async () => {
    const { baseRegistrar } = await loadFixture()
    const message = {
      from: getAddress(aliceAccount.address),
      to: getAddress(bobAccount.address),
      tokenId: TOKEN_ID,
      nonce: 0n,
      deadline: FAR_FUTURE,
    }
    // Bob signs a transfer of Alice's name to himself.
    const sig = await signTransfer(bobClient, baseRegistrar.address, message)
    await expect(
      baseRegistrar.write.transferWithSig(
        [
          message.from,
          message.to,
          message.tokenId,
          message.nonce,
          message.deadline,
          sig,
          '0x',
          '0x00',
        ],
        { account: relayerClient.account },
      ),
    ).rejects.toThrow('InvalidSignature')
  })

  it('rejects a replayed signature', async () => {
    const { baseRegistrar } = await loadFixture()
    const message = {
      from: getAddress(aliceAccount.address),
      to: getAddress(bobAccount.address),
      tokenId: TOKEN_ID,
      nonce: 0n,
      deadline: FAR_FUTURE,
    }
    const sig = await signTransfer(aliceClient, baseRegistrar.address, message)
    const args = [
      message.from,
      message.to,
      message.tokenId,
      message.nonce,
      message.deadline,
      sig,
      '0x',
      '0x00',
    ] as const
    await baseRegistrar.write.transferWithSig(args, {
      account: relayerClient.account,
    })
    // Bob sends it back so Alice owns it again; the old signature must still
    // be dead, which is what the nonce is for.
    await baseRegistrar.write.transferFrom(
      [getAddress(bobAccount.address), getAddress(aliceAccount.address), TOKEN_ID],
      { account: bobClient.account },
    )
    await expect(
      baseRegistrar.write.transferWithSig(args, {
        account: relayerClient.account,
      }),
    ).rejects.toThrow('InvalidNonce')
  })

  it('rejects an expired signature', async () => {
    const { baseRegistrar } = await loadFixture()
    const message = {
      from: getAddress(aliceAccount.address),
      to: getAddress(bobAccount.address),
      tokenId: TOKEN_ID,
      nonce: 0n,
      deadline: 1n,
    }
    const sig = await signTransfer(aliceClient, baseRegistrar.address, message)
    await expect(
      baseRegistrar.write.transferWithSig(
        [
          message.from,
          message.to,
          message.tokenId,
          message.nonce,
          message.deadline,
          sig,
          '0x',
          '0x00',
        ],
        { account: relayerClient.account },
      ),
    ).rejects.toThrow('SignatureExpired')
  })

  it('rejects a transfer of an expired name', async () => {
    const { baseRegistrar } = await loadFixture()
    const message = {
      from: getAddress(aliceAccount.address),
      to: getAddress(bobAccount.address),
      tokenId: TOKEN_ID,
      nonce: 0n,
      deadline: FAR_FUTURE,
    }
    const sig = await signTransfer(aliceClient, baseRegistrar.address, message)
    // Past expiry, ownerOf reverts - a lapsed name must not move out from under
    // whoever is about to re-register it.
    await connection.networkHelpers.time.increase(DURATION + 1n)
    await expect(
      baseRegistrar.write.transferWithSig(
        [
          message.from,
          message.to,
          message.tokenId,
          message.nonce,
          message.deadline,
          sig,
          '0x',
          '0x00',
        ],
        { account: relayerClient.account },
      ),
    ).rejects.toThrow()
  })
})
