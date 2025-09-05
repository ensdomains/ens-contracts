import hre from 'hardhat'
import { labelhash, namehash, zeroAddress, zeroHash } from 'viem'

import { DAY, FUSES } from '../fixtures/constants.js'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { getAccounts, toTokenId } from '../fixtures/utils.js'

const connection = await hre.network.connect()
const accounts = await getAccounts(connection)

async function fixture() {
  const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])
  const baseRegistrar = await connection.viem.deployContract(
    'BaseRegistrarImplementation',
    [ensRegistry.address, namehash('eth')],
  )

  await baseRegistrar.write.addController([accounts[0].address])
  await baseRegistrar.write.addController([accounts[1].address])

  const reverseRegistrar = await connection.viem.deployContract(
    'ReverseRegistrar',
    [ensRegistry.address],
  )

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

  const metadataService = await connection.viem.deployContract(
    'StaticMetadataService',
    ['https://ens.domains/'],
  )
  const nameWrapper = await connection.viem.deployContract('NameWrapper', [
    ensRegistry.address,
    baseRegistrar.address,
    metadataService.address,
  ])
  const testUnwrap = await connection.viem.deployContract('TestUnwrap', [
    ensRegistry.address,
    baseRegistrar.address,
  ])

  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('eth'),
    baseRegistrar.address,
  ])

  // set the upgradeContract of the NameWrapper contract
  await nameWrapper.write.setUpgradeContract([testUnwrap.address])

  return {
    ensRegistry,
    baseRegistrar,
    reverseRegistrar,
    metadataService,
    nameWrapper,
    testUnwrap,
  }
}
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

describe('TestUnwrap', () => {
  describe('wrapFromUpgrade()', () => {
    describe('.eth', () => {
      const encodedName = dnsEncodeName('wrapped.eth')
      const label = 'wrapped'
      const labelHash = labelhash(label)
      const nameHash = namehash('wrapped.eth')

      async function fixtureWithTestEthRegistered() {
        const initial = await loadFixture()
        const { ensRegistry, baseRegistrar, nameWrapper } = initial

        await baseRegistrar.write.register([
          toTokenId(labelHash),
          accounts[0].address,
          1n * DAY,
        ])
        await baseRegistrar.write.setApprovalForAll([nameWrapper.address, true])

        await expect(
          nameWrapper.read.ownerOf([toTokenId(nameHash)]),
        ).resolves.toEqual(zeroAddress)

        await nameWrapper.write.wrapETH2LD([
          label,
          accounts[0].address,
          FUSES.CAN_DO_EVERYTHING,
          zeroAddress,
        ])

        // make sure reclaim claimed ownership for the wrapper in registry

        await expect(
          ensRegistry.read.owner([nameHash]),
        ).resolves.toEqualAddress(nameWrapper.address)
        await expect(
          baseRegistrar.read.ownerOf([toTokenId(labelHash)]),
        ).resolves.toEqualAddress(nameWrapper.address)
        await expect(
          nameWrapper.read.ownerOf([toTokenId(nameHash)]),
        ).resolves.toEqualAddress(accounts[0].address)

        return initial
      }
      const loadFixtureWithTestEthRegistered = async () =>
        connection.networkHelpers.loadFixture(fixtureWithTestEthRegistered)

      it('allows unwrapping from an approved NameWrapper', async () => {
        const { ensRegistry, baseRegistrar, nameWrapper, testUnwrap } =
          await loadFixtureWithTestEthRegistered()

        await testUnwrap.write.setWrapperApproval([nameWrapper.address, true])

        await nameWrapper.write.upgrade([encodedName, '0x'])

        await expect(
          ensRegistry.read.owner([nameHash]),
        ).resolves.toEqualAddress(accounts[0].address)
        await expect(
          baseRegistrar.read.ownerOf([toTokenId(labelHash)]),
        ).resolves.toEqualAddress(accounts[0].address)
        await expect(
          nameWrapper.read.ownerOf([toTokenId(nameHash)]),
        ).resolves.toEqualAddress(zeroAddress)
      })

      it('does not allow unwrapping from an unapproved NameWrapper', async () => {
        const { nameWrapper } = await loadFixtureWithTestEthRegistered()

        await expect(
          nameWrapper.write.upgrade([encodedName, '0x']),
        ).toBeRevertedWithString('Unauthorised')
      })

      it('does not allow unwrapping from an unapproved sender', async () => {
        const { nameWrapper, testUnwrap } =
          await loadFixtureWithTestEthRegistered()

        await testUnwrap.write.setWrapperApproval([nameWrapper.address, true])

        await expect(
          testUnwrap.write.wrapFromUpgrade([
            encodedName,
            accounts[0].address,
            0,
            0n,
            zeroAddress,
            '0x',
          ]),
        ).toBeRevertedWithString('Unauthorised')
      })
    })

    describe('other', () => {
      const label = 'to-upgrade'
      const parentLabel = 'wrapped2'
      const name = `${label}.${parentLabel}.eth`
      const parentLabelHash = labelhash(parentLabel)
      const parentHash = namehash(`${parentLabel}.eth`)
      const nameHash = namehash(name)
      const encodedName = dnsEncodeName(name)

      async function fixtureWithSubWrapped() {
        const initial = await loadFixture()
        const { ensRegistry, baseRegistrar, nameWrapper } = initial

        await ensRegistry.write.setApprovalForAll([nameWrapper.address, true])
        await baseRegistrar.write.setApprovalForAll([nameWrapper.address, true])
        await baseRegistrar.write.register([
          toTokenId(parentLabelHash),
          accounts[0].address,
          1n * DAY,
        ])
        await nameWrapper.write.wrapETH2LD([
          parentLabel,
          accounts[0].address,
          FUSES.CANNOT_UNWRAP,
          zeroAddress,
        ])
        await nameWrapper.write.setSubnodeOwner([
          parentHash,
          'to-upgrade',
          accounts[0].address,
          0,
          0n,
        ])

        await expect(
          nameWrapper.read.ownerOf([toTokenId(nameHash)]),
        ).resolves.toEqualAddress(accounts[0].address)

        return initial
      }
      const loadFixtureWithSubWrapped = async () =>
        connection.networkHelpers.loadFixture(fixtureWithSubWrapped)

      it('allows unwrapping from an approved NameWrapper', async () => {
        const { ensRegistry, nameWrapper, testUnwrap } =
          await loadFixtureWithSubWrapped()

        await testUnwrap.write.setWrapperApproval([nameWrapper.address, true])

        await nameWrapper.write.upgrade([encodedName, '0x'])

        await expect(
          ensRegistry.read.owner([nameHash]),
        ).resolves.toEqualAddress(accounts[0].address)
      })

      it('does not allow unwrapping from an unapproved NameWrapper', async () => {
        const { nameWrapper } = await loadFixtureWithSubWrapped()

        await expect(
          nameWrapper.write.upgrade([encodedName, '0x']),
        ).toBeRevertedWithString('Unauthorised')
      })

      it('does not allow unwrapping from an unapproved sender', async () => {
        const { nameWrapper, testUnwrap } = await loadFixtureWithSubWrapped()

        await testUnwrap.write.setWrapperApproval([nameWrapper.address, true])

        await expect(
          testUnwrap.write.wrapFromUpgrade([
            encodedName,
            accounts[0].address,
            0,
            0n,
            zeroAddress,
            '0x',
          ]),
        ).toBeRevertedWithString('Unauthorised')
      })
    })
  })
})
