import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import {
  decodeEventLog,
  getAddress,
  namehash,
  type Address,
  type Hash,
} from 'viem'
import { createInterfaceId } from '../fixtures/createInterfaceId.js'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'

const targetNode = namehash('eth')
const encodedName = dnsEncodeName('eth')

async function fixture() {
  const publicClient = await hre.viem.getPublicClient()
  const walletClients = await hre.viem.getWalletClients()
  const accounts = walletClients.map((c) => c.account)

  const delegatableResolverImplementation = await hre.viem.deployContract(
    'DelegatableResolver',
    [],
  )
  const delegatableResolverFactory = await hre.viem.deployContract(
    'DelegatableResolverFactory',
    [delegatableResolverImplementation.address],
  )

  const getResolverAddressFromHash = async (hash: Hash) => {
    const receipt = await publicClient.getTransactionReceipt({ hash })
    const {
      args: { resolver: resolverAddress },
    } = decodeEventLog({
      abi: delegatableResolverFactory.abi,
      topics: receipt.logs[0].topics,
      data: receipt.logs[0].data,
    })
    return resolverAddress
  }

  const tx = await delegatableResolverFactory.write.create([
    accounts[1].address,
  ])
  const resolverAddress = await getResolverAddressFromHash(tx)

  const delegatableResolver = await hre.viem.getContractAt(
    'DelegatableResolver',
    resolverAddress,
    {
      client: {
        public: publicClient,
        wallet: walletClients[1],
      },
    },
  )

  return {
    walletClients,
    accounts,
    delegatableResolverImplementation,
    delegatableResolverFactory,
    delegatableResolver,
    getResolverAddressFromHash,
  }
}

describe('DelegatableResolver', () => {
  describe('supportsInterface function', () => {
    it('supports known interfaces', async () => {
      const { delegatableResolver } = await loadFixture(fixture)

      const expectedArtifactSupport = [
        await hre.artifacts.readArtifact('IAddrResolver'),
        await hre.artifacts.readArtifact('IAddressResolver'),
        await hre.artifacts.readArtifact('INameResolver'),
        await hre.artifacts.readArtifact('IABIResolver'),
        await hre.artifacts.readArtifact('IPubkeyResolver'),
        await hre.artifacts.readArtifact('ITextResolver'),
        await hre.artifacts.readArtifact('IContentHashResolver'),
        await hre.artifacts.readArtifact('IDNSRecordResolver'),
        await hre.artifacts.readArtifact('IDNSZoneResolver'),
        await hre.artifacts.readArtifact('IInterfaceResolver'),
        await hre.artifacts.readArtifact('IMulticallable'),
        await hre.artifacts.readArtifact('IDelegatableResolver'),
      ] as const

      const interfaceIds = expectedArtifactSupport.map((a) =>
        createInterfaceId(a.abi),
      )

      for (const interfaceId of interfaceIds) {
        await expect(
          delegatableResolver.read.supportsInterface([interfaceId]),
        ).resolves.toEqual(true)
      }
    })

    it('does not support a random interface', async () => {
      const { delegatableResolver } = await loadFixture(fixture)

      await expect(
        delegatableResolver.read.supportsInterface(['0x3b3b57df']),
      ).resolves.toEqual(false)
    })
  })

  describe('factory', () => {
    it('predicts address', async () => {
      const {
        delegatableResolverFactory,
        getResolverAddressFromHash,
        accounts,
      } = await loadFixture(fixture)

      const tx = await delegatableResolverFactory.write.create([
        accounts[2].address,
      ])
      const result = await getResolverAddressFromHash(tx)
      const { result: predicted } =
        await delegatableResolverFactory.simulate.predictAddress([
          accounts[2].address,
        ])
      expect(predicted).toBe(result)
    })

    it('emits an event', async () => {
      const { delegatableResolverFactory, accounts } = await loadFixture(
        fixture,
      )

      await expect(delegatableResolverFactory)
        .write('create', [accounts[2].address])
        .toEmitEvent('NewDelegatableResolver')
        .withArgs(expect.anyValue, getAddress(accounts[2].address))
    })

    it('does not allow duplicate contracts', async () => {
      const { delegatableResolverFactory, accounts } = await loadFixture(
        fixture,
      )

      await expect(delegatableResolverFactory)
        .write('create', [accounts[1].address])
        .toBeRevertedWithCustomError('CreateFail')
    })
  })

  describe('addr', () => {
    it('permits setting address by owner', async () => {
      const { delegatableResolver, accounts } = await loadFixture(fixture)

      await delegatableResolver.write.setAddr([targetNode, accounts[2].address])

      await expect(
        delegatableResolver.read.addr([targetNode]) as Promise<Address>,
      ).resolves.toEqualAddress(accounts[2].address)
    })

    it('forbids setting new address by non-owners', async () => {
      const { delegatableResolver, accounts } = await loadFixture(fixture)

      await expect(delegatableResolver)
        .write('setAddr', [targetNode, accounts[2].address], {
          account: accounts[2],
        })
        .toBeRevertedWithoutReason()
    })

    it('forbids approving wrong node', async () => {
      const { delegatableResolver, accounts } = await loadFixture(fixture)

      const encodedName = dnsEncodeName('a.b.c.eth')
      const wrongNode = namehash('d.b.c.eth')

      await delegatableResolver.write.approve([
        encodedName,
        accounts[2].address,
        true,
      ])

      await expect(delegatableResolver)
        .write('setAddr', [wrongNode, accounts[2].address], {
          account: accounts[2],
        })
        .toBeRevertedWithoutReason()
    })
  })

  describe('authorisations', () => {
    it('owner is the owner', async () => {
      const { delegatableResolver, accounts } = await loadFixture(fixture)

      await expect(delegatableResolver.read.owner()).resolves.toEqualAddress(
        accounts[1].address,
      )
    })

    it('owner is authorised to update any names', async () => {
      const { delegatableResolver, accounts } = await loadFixture(fixture)

      await expect(
        delegatableResolver.read.getAuthorisedNode([
          dnsEncodeName('a.b.c'),
          0n,
          accounts[1].address,
        ]),
      ).resolves.toEqual([namehash('a.b.c'), true])
      await expect(
        delegatableResolver.read.getAuthorisedNode([
          dnsEncodeName('x.y.z'),
          0n,
          accounts[1].address,
        ]),
      ).resolves.toEqual([namehash('x.y.z'), true])
    })

    it('approves multiple users', async () => {
      const { delegatableResolver, accounts } = await loadFixture(fixture)

      await delegatableResolver.write.approve([
        encodedName,
        accounts[2].address,
        true,
      ])
      await delegatableResolver.write.approve([
        encodedName,
        accounts[3].address,
        true,
      ])

      await expect(
        delegatableResolver.read.getAuthorisedNode([
          encodedName,
          0n,
          accounts[2].address,
        ]),
      ).resolves.toEqual([targetNode, true])
      await expect(
        delegatableResolver.read.getAuthorisedNode([
          encodedName,
          0n,
          accounts[3].address,
        ]),
      ).resolves.toEqual([targetNode, true])
    })

    it('approves subnames', async () => {
      const { delegatableResolver, accounts } = await loadFixture(fixture)

      const subname = 'a.b.c.eth'

      await delegatableResolver.write.approve([
        dnsEncodeName(subname),
        accounts[2].address,
        true,
      ])

      await delegatableResolver.write.setAddr(
        [namehash(subname), accounts[2].address],
        { account: accounts[2] },
      )
    })

    it('only approves the subname and not its parent', async () => {
      const { delegatableResolver, accounts } = await loadFixture(fixture)

      const subname = '1234.123'
      const parentName = 'b.c.eth'

      await delegatableResolver.write.approve([
        dnsEncodeName(subname),
        accounts[2].address,
        true,
      ])
      await expect(
        delegatableResolver.read.getAuthorisedNode([
          dnsEncodeName(subname),
          0n,
          accounts[2].address,
        ]),
      ).resolves.toEqual([namehash(subname), true])

      await expect(
        delegatableResolver.read.getAuthorisedNode([
          dnsEncodeName(parentName),
          0n,
          accounts[2].address,
        ]),
      ).resolves.toEqual([namehash(parentName), false])
    })

    it('approves users to make changes', async () => {
      const { delegatableResolver, accounts } = await loadFixture(fixture)

      await delegatableResolver.write.approve([
        encodedName,
        accounts[2].address,
        true,
      ])

      await delegatableResolver.write.setAddr(
        [targetNode, accounts[2].address],
        { account: accounts[2] },
      )

      await expect(
        delegatableResolver.read.addr([targetNode]) as Promise<Address>,
      ).resolves.toEqualAddress(accounts[2].address)
    })

    it('approves to be revoked', async () => {
      const { delegatableResolver, accounts } = await loadFixture(fixture)

      await delegatableResolver.write.approve([
        encodedName,
        accounts[2].address,
        true,
      ])

      await delegatableResolver.write.setAddr(
        [targetNode, accounts[2].address],
        { account: accounts[2] },
      )

      await delegatableResolver.write.approve([
        encodedName,
        accounts[2].address,
        false,
      ])

      await expect(delegatableResolver)
        .write('setAddr', [targetNode, accounts[2].address], {
          account: accounts[2],
        })
        .toBeRevertedWithoutReason()
    })

    it('does not allow non-owner to approve', async () => {
      const { delegatableResolver, accounts } = await loadFixture(fixture)

      await expect(delegatableResolver)
        .write('approve', [encodedName, accounts[2].address, true], {
          account: accounts[2],
        })
        .toBeRevertedWithCustomError('NotAuthorized')
    })

    it('emits an Approval log', async () => {
      const { delegatableResolver, accounts } = await loadFixture(fixture)

      await expect(delegatableResolver)
        .write('approve', [encodedName, accounts[2].address, true])
        .toEmitEvent('Approval')
        .withArgs(targetNode, accounts[2].address, encodedName, true)
    })
  })
})
