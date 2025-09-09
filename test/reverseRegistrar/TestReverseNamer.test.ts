import hre from 'hardhat'
import { type Address, getAddress, zeroAddress } from 'viem'
import { readdirSync, readFileSync } from 'fs'
import { coinTypeFromChain } from '../fixtures/ensip19.js'

const REVERSE_REGISTRAR_MAINNET_ROLLUP =
  '0x0000000000D8e504002cC26E3Ec46D81971C1664'

const connection = await hre.network.connect({
  override: {
    chainId: 8453, // appear like an L2
  },
})

async function fixture() {
  const [owner] = await connection.viem.getWalletClients()
  const publicClient = await connection.viem.getPublicClient()
  const reverseNamer = await connection.viem.deployContract('MockReverseNamer')
  const l2ReverseRegistrar0 = await connection.viem.deployContract(
    'L2ReverseRegistrar',
    [coinTypeFromChain(connection.networkConfig.chainId!)],
  )
  await connection.networkHelpers.setCode(
    REVERSE_REGISTRAR_MAINNET_ROLLUP,
    (await publicClient.getCode(l2ReverseRegistrar0))!,
  )
  const l2ReverseRegistrar = await connection.viem.getContractAt(
    'L2ReverseRegistrar',
    REVERSE_REGISTRAR_MAINNET_ROLLUP,
  )
  return {
    owner,
    reverseNamer,
    l2ReverseRegistrar,
  }
}

const PRIMARY = 'mycontract.eth'

describe('ReverseNamer', () => {
  describe('registryFromChain', () => {
    const dir = new URL('../../deployments/', import.meta.url)
    for (const chainName of readdirSync(dir)) {
      try {
        const chainId = BigInt(
          readFileSync(new URL(`./${chainName}/.chainId`, dir), {
            encoding: 'utf8',
          }),
        )
        const deploy = JSON.parse(
          readFileSync(new URL(`./${chainName}/L2ReverseRegistrar.json`, dir), {
            encoding: 'utf8',
          }),
        ) as { address: Address }
        it(chainName, async () => {
          const F = await connection.networkHelpers.loadFixture(fixture)
          await expect(
            F.reverseNamer.read.registrarFromChain([chainId]),
          ).resolves.toStrictEqual(deploy.address)
        })
      } catch (err) {}
    }
  })

  it('NamedOnce', async () => {
    const F = await connection.networkHelpers.loadFixture(fixture)
    const contract = await connection.viem.deployContract('NamedOnce', [
      PRIMARY,
    ])
    await expect(
      F.l2ReverseRegistrar.read.nameForAddr([contract.address]),
    ).resolves.toStrictEqual(PRIMARY)
  })

  describe('NameableBy', () => {
    it('w/o primary', async () => {
      const F = await connection.networkHelpers.loadFixture(fixture)
      const contract = await connection.viem.deployContract('NameableBy', [
        F.owner.account.address,
        '',
      ])
      await expect(
        F.l2ReverseRegistrar.read.nameForAddr([contract.address]),
        'primary',
      ).resolves.toStrictEqual('')
      await expect(contract.read.nameOwner()).resolves.toStrictEqual(
        getAddress(F.owner.account.address),
      )
    })

    it('w/primary', async () => {
      const F = await connection.networkHelpers.loadFixture(fixture)
      const contract = await connection.viem.deployContract('NameableBy', [
        F.owner.account.address,
        PRIMARY,
      ])
      await expect(
        F.l2ReverseRegistrar.read.nameForAddr([contract.address]),
        'primary',
      ).resolves.toStrictEqual(PRIMARY)
    })

    it('setName', async () => {
      const F = await connection.networkHelpers.loadFixture(fixture)
      const contract = await connection.viem.deployContract('NameableBy', [
        F.owner.account.address,
        PRIMARY,
      ])
      const primary = 'new-name'
      await contract.write.setName([primary])
      await expect(
        F.l2ReverseRegistrar.read.nameForAddr([contract.address]),
      ).resolves.toStrictEqual(primary)
    })

    it('disown', async () => {
      const F = await connection.networkHelpers.loadFixture(fixture)
      const contract = await connection.viem.deployContract('NameableBy', [
        F.owner.account.address,
        PRIMARY,
      ])
      await contract.write.setNameOwner([zeroAddress])
      await expect(contract.read.nameOwner()).resolves.toStrictEqual(
        zeroAddress,
      )
    })

    it('not owner', async () => {
      const contract = await connection.viem.deployContract('NameableBy', [
        zeroAddress,
        PRIMARY,
      ])
      await expect(contract.write.setNameOwner([zeroAddress])).rejects.toThrow(
        'reverted without a reason',
      )
      await expect(contract.write.setName([''])).rejects.toThrow(
        'reverted without a reason',
      )
    })
  })
})
