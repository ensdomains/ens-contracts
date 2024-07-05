import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { labelhash, namehash, zeroAddress, zeroHash, type Address } from 'viem'
import {
  expiration,
  hexEncodeSignedSet,
  inception,
  rootKeys,
  testRrset,
} from '../fixtures/dns.js'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { dnssecFixture } from '../fixtures/dnssecFixture.js'

async function fixture() {
  const { accounts, dnssec } = await loadFixture(dnssecFixture)
  const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])
  const reverseRegistrar = await hre.viem.deployContract('ReverseRegistrar', [
    ensRegistry.address,
  ])

  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('reverse'),
    accounts[0].address,
  ])
  await ensRegistry.write.setSubnodeOwner([
    namehash('reverse'),
    labelhash('addr'),
    reverseRegistrar.address,
  ])

  const root = await hre.viem.deployContract('Root', [ensRegistry.address])

  await ensRegistry.write.setOwner([zeroHash, root.address])

  const suffixes = await hre.viem.deployContract('SimplePublicSuffixList', [])

  await suffixes.write.addPublicSuffixes([
    [dnsEncodeName('test'), dnsEncodeName('co.nz')],
  ])

  const dnsRegistrar = await hre.viem.deployContract('DNSRegistrar', [
    zeroAddress, // Previous registrar
    zeroAddress, // Resolver
    dnssec.address,
    suffixes.address,
    ensRegistry.address,
  ])

  await root.write.setController([dnsRegistrar.address, true])

  return {
    ensRegistry,
    reverseRegistrar,
    root,
    suffixes,
    dnsRegistrar,
    dnssec,
    accounts,
  }
}

describe('DNSRegistrar', () => {
  it('sets constructor variables correctly', async () => {
    const { dnsRegistrar, dnssec, ensRegistry } = await loadFixture(fixture)

    await expect(dnsRegistrar.read.oracle()).resolves.toEqualAddress(
      dnssec.address,
    )
    await expect(dnsRegistrar.read.ens()).resolves.toEqualAddress(
      ensRegistry.address,
    )
  })

  it('allows anyone to claim on behalf of the owner of an ENS name', async () => {
    const { dnsRegistrar, ensRegistry, accounts } = await loadFixture(fixture)

    const proof = [
      hexEncodeSignedSet(rootKeys({ expiration, inception })),
      hexEncodeSignedSet(
        testRrset({ name: 'foo.test', address: accounts[0].address }),
      ),
    ]

    await dnsRegistrar.write.proveAndClaim([dnsEncodeName('foo.test'), proof], {
      account: accounts[1],
    })

    await expect(
      ensRegistry.read.owner([namehash('foo.test')]),
    ).resolves.toEqualAddress(accounts[0].address)
  })

  it('allows claims on names that are not TLDs', async () => {
    const { dnsRegistrar, ensRegistry, accounts } = await loadFixture(fixture)

    const proof = [
      hexEncodeSignedSet(rootKeys({ expiration, inception })),
      hexEncodeSignedSet(
        testRrset({ name: 'foo.co.nz', address: accounts[0].address }),
      ),
    ]

    await dnsRegistrar.write.proveAndClaim([dnsEncodeName('foo.co.nz'), proof])

    await expect(
      ensRegistry.read.owner([namehash('foo.co.nz')]),
    ).resolves.toEqualAddress(accounts[0].address)
  })

  it('allows anyone to update a DNSSEC referenced name', async () => {
    const { dnsRegistrar, ensRegistry, accounts } = await loadFixture(fixture)

    const proof = [
      hexEncodeSignedSet(rootKeys({ expiration, inception })),
      hexEncodeSignedSet(
        testRrset({ name: 'foo.test', address: accounts[0].address }),
      ),
    ]

    await dnsRegistrar.write.proveAndClaim([dnsEncodeName('foo.test'), proof])

    await expect(
      ensRegistry.read.owner([namehash('foo.test')]),
    ).resolves.toEqualAddress(accounts[0].address)

    const newProof = [
      proof[0],
      hexEncodeSignedSet(
        testRrset({ name: 'foo.test', address: accounts[1].address }),
      ),
    ]

    await dnsRegistrar.write.proveAndClaim([
      dnsEncodeName('foo.test'),
      newProof,
    ])

    await expect(
      ensRegistry.read.owner([namehash('foo.test')]),
    ).resolves.toEqualAddress(accounts[1].address)
  })

  it('rejects proofs with earlier inceptions', async () => {
    const { dnsRegistrar, ensRegistry, accounts } = await loadFixture(fixture)

    const proof = [
      hexEncodeSignedSet(rootKeys({ expiration, inception })),
      hexEncodeSignedSet(
        testRrset({ name: 'foo.test', address: accounts[0].address }),
      ),
    ]

    await dnsRegistrar.write.proveAndClaim([dnsEncodeName('foo.test'), proof])

    const newRrset = testRrset({
      name: 'foo.test',
      address: accounts[1].address,
    })
    const newProof = [
      proof[0],
      hexEncodeSignedSet({
        ...newRrset,
        sig: {
          ...newRrset.sig,
          data: {
            ...newRrset.sig.data,
            inception: inception - 3600,
          },
        },
      }),
    ]

    await expect(dnsRegistrar)
      .write('proveAndClaim', [dnsEncodeName('foo.test'), newProof])
      .toBeRevertedWithCustomError('StaleProof')
  })

  it('does not allow updates with stale records', async () => {
    const { dnsRegistrar, dnssec, accounts } = await loadFixture(fixture)

    const rrset = testRrset({
      name: 'foo.test',
      address: accounts[0].address,
    })
    const newProof = [
      hexEncodeSignedSet(rootKeys({ expiration, inception })),
      hexEncodeSignedSet({
        ...rrset,
        sig: {
          ...rrset.sig,
          data: {
            ...rrset.sig.data,
            inception: Date.now() / 1000 - 120,
            expiration: Date.now() / 1000 - 60,
          },
        },
      }),
    ]

    const tx = dnsRegistrar.write.proveAndClaim([
      dnsEncodeName('foo.test'),
      newProof,
    ])

    await expect(dnssec)
      .transaction(tx)
      .toBeRevertedWithCustomError('SignatureExpired')
  })

  it('allows the owner to claim and set a resolver', async () => {
    const { dnsRegistrar, ensRegistry, accounts } = await loadFixture(fixture)

    const proof = [
      hexEncodeSignedSet(rootKeys({ expiration, inception })),
      hexEncodeSignedSet(
        testRrset({ name: 'foo.test', address: accounts[0].address }),
      ),
    ]

    await dnsRegistrar.write.proveAndClaimWithResolver([
      dnsEncodeName('foo.test'),
      proof,
      accounts[1].address,
      zeroAddress,
    ])

    await expect(
      ensRegistry.read.owner([namehash('foo.test')]),
    ).resolves.toEqualAddress(accounts[0].address)
    await expect(
      ensRegistry.read.resolver([namehash('foo.test')]),
    ).resolves.toEqualAddress(accounts[1].address)
  })

  it('does not allow anyone else to claim and set a resolver', async () => {
    const { dnsRegistrar, accounts } = await loadFixture(fixture)

    const proof = [
      hexEncodeSignedSet(rootKeys({ expiration, inception })),
      hexEncodeSignedSet(
        testRrset({ name: 'foo.test', address: accounts[1].address }),
      ),
    ]

    await expect(dnsRegistrar)
      .write('proveAndClaimWithResolver', [
        dnsEncodeName('foo.test'),
        proof,
        accounts[1].address,
        zeroAddress,
      ])
      .toBeRevertedWithCustomError('PermissionDenied')
  })

  it('sets an address on the resolver if provided', async () => {
    const { dnsRegistrar, ensRegistry, accounts } = await loadFixture(fixture)

    const publicResolver = await hre.viem.deployContract('PublicResolver', [
      ensRegistry.address,
      zeroAddress,
      zeroAddress,
      zeroAddress,
    ])
    await publicResolver.write.setApprovalForAll([dnsRegistrar.address, true])

    const proof = [
      hexEncodeSignedSet(rootKeys({ expiration, inception })),
      hexEncodeSignedSet(
        testRrset({ name: 'foo.test', address: accounts[0].address }),
      ),
    ]

    await dnsRegistrar.write.proveAndClaimWithResolver([
      dnsEncodeName('foo.test'),
      proof,
      publicResolver.address,
      accounts[0].address,
    ])

    await expect(
      publicResolver.read.addr([namehash('foo.test')]) as Promise<Address>,
    ).resolves.toEqualAddress(accounts[0].address)
  })

  it('forbids setting an address if the resolver is not also set', async () => {
    const { dnsRegistrar, accounts } = await loadFixture(fixture)

    const proof = [
      hexEncodeSignedSet(rootKeys({ expiration, inception })),
      hexEncodeSignedSet(
        testRrset({ name: 'foo.test', address: accounts[0].address }),
      ),
    ]

    await expect(dnsRegistrar)
      .write('proveAndClaimWithResolver', [
        dnsEncodeName('foo.test'),
        proof,
        zeroAddress,
        accounts[0].address,
      ])
      .toBeRevertedWithCustomError('PreconditionNotMet')
  })

  it('does not allow setting the owner to 0 with an empty record', async () => {
    const { dnsRegistrar } = await loadFixture(fixture)

    await expect(dnsRegistrar)
      .write('proveAndClaim', [dnsEncodeName('foo.test'), []])
      .toBeRevertedWithCustomError('NoOwnerRecordFound')
  })

  describe('unrelated proof', () => {
    async function fixtureWithTestTld() {
      const { dnssec, accounts } = await loadFixture(dnssecFixture)
      const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])
      const root = await hre.viem.deployContract('Root', [ensRegistry.address])

      await ensRegistry.write.setOwner([zeroHash, root.address])

      const suffixes = await hre.viem.deployContract(
        'SimplePublicSuffixList',
        [],
      )

      await suffixes.write.addPublicSuffixes([[dnsEncodeName('test')]])

      const dnsRegistrar = await hre.viem.deployContract('DNSRegistrar', [
        zeroAddress, // Previous registrar
        zeroAddress, // Resolver
        dnssec.address,
        suffixes.address,
        ensRegistry.address,
      ])

      await root.write.setController([dnsRegistrar.address, true])

      return { dnssec, accounts, ensRegistry, root, suffixes, dnsRegistrar }
    }

    it('cannot claim multiple names using single unrelated proof', async () => {
      const { ensRegistry, dnsRegistrar, accounts } = await loadFixture(
        fixtureWithTestTld,
      )

      const alice = accounts[1]

      // Build sample proof for a DNS record with name `alice.test` that alice owns
      const proofForAliceDotTest = [
        hexEncodeSignedSet(rootKeys({ expiration, inception })),
        hexEncodeSignedSet(
          testRrset({ name: 'alice.test', address: alice.address }),
        ),
      ]

      // This is the expected use case.
      // Using the proof for `alice.test`, can claim `alice.test`
      await dnsRegistrar.write.proveAndClaim([
        dnsEncodeName('alice.test'),
        proofForAliceDotTest,
      ])
      await expect(
        ensRegistry.read.owner([namehash('alice.test')]),
      ).resolves.toEqualAddress(alice.address)

      // Now using the same proof for `alice.test`, alice cannot also claim `foo.test`
      await expect(dnsRegistrar)
        .write('proveAndClaim', [
          dnsEncodeName('foo.test'),
          proofForAliceDotTest,
        ])
        .toBeRevertedWithCustomError('NoOwnerRecordFound')
    })

    it('cannot takeover claimed DNS domains using unrelated proof', async () => {
      const { ensRegistry, dnsRegistrar, accounts } = await loadFixture(
        fixtureWithTestTld,
      )

      const alice = accounts[1]
      const bob = accounts[2]

      // Build sample proof for a DNS record with name `alice.test` that alice owns
      const proofForAliceDotTest = [
        hexEncodeSignedSet(rootKeys({ expiration, inception })),
        hexEncodeSignedSet(
          testRrset({ name: 'alice.test', address: alice.address }),
        ),
      ]

      // Alice claims her domain
      await dnsRegistrar.write.proveAndClaim([
        dnsEncodeName('alice.test'),
        proofForAliceDotTest,
      ])
      await expect(
        ensRegistry.read.owner([namehash('alice.test')]),
      ).resolves.toEqualAddress(alice.address)

      // Build sample proof for a DNS record with name `bob.test` that bob owns
      const proofForBobDotTest = [
        hexEncodeSignedSet(rootKeys({ expiration, inception })),
        hexEncodeSignedSet(
          testRrset({ name: 'bob.test', address: bob.address }),
        ),
      ]

      // Bob cannot claim alice's domain
      await expect(dnsRegistrar)
        .write('proveAndClaim', [
          dnsEncodeName('alice.test'),
          proofForBobDotTest,
        ])
        .toBeRevertedWithCustomError('NoOwnerRecordFound')
    })
  })
})
