import hre from 'hardhat'
import {
  getAddress,
  keccak256,
  namehash,
  stringToHex,
  type Address,
} from 'viem'

import { getAccounts } from '../fixtures/utils.js'

const targetNode = namehash('eth')
const textKey = 'url'
const textValue = 'https://ens.domains'

const connection = await hre.network.connect()
const accounts = await getAccounts(connection)

async function fixture() {
  const ownedResolver = await connection.viem.deployContract(
    'OwnedResolver',
    [],
  )

  return { ownedResolver, accounts }
}

const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

describe('OwnedResolver', () => {
  it('permits the owner to change records', async () => {
    const { ownedResolver } = await loadFixture()

    const setAddr = ownedResolver.write.setAddr([
      targetNode,
      accounts[1].address,
    ])

    await expect(setAddr).toEmitEvent('AddressChanged').withArgs({
      node: targetNode,
      coinType: 60n,
      newAddress: accounts[1].address,
    })

    await expect(setAddr)
      .toEmitEvent('AddrChanged')
      .withArgs({
        node: targetNode,
        a: getAddress(accounts[1].address),
      })

    await expect(
      ownedResolver.read.addr([targetNode]) as Promise<Address>,
    ).resolves.toEqualAddress(accounts[1].address)

    await expect(ownedResolver.write.setText([targetNode, textKey, textValue]))
      .toEmitEvent('TextChanged')
      .withArgs({
        node: targetNode,
        indexedKey: keccak256(stringToHex(textKey)),
        key: textKey,
        value: textValue,
      })

    await expect(
      ownedResolver.read.text([targetNode, textKey]),
    ).resolves.toEqual(textValue)
  })

  it('forbids non-owners from changing records', async () => {
    const { ownedResolver } = await loadFixture()

    await ownedResolver.write.setAddr([targetNode, accounts[1].address])
    await ownedResolver.write.setText([targetNode, textKey, textValue])

    await expect(
      ownedResolver.write.setAddr([targetNode, accounts[2].address], {
        account: accounts[2],
      }),
    ).toBeRevertedWithoutReason()

    await expect(
      ownedResolver.write.setText(
        [targetNode, textKey, 'https://example.com'],
        {
          account: accounts[2],
        },
      ),
    ).toBeRevertedWithoutReason()

    await expect(
      ownedResolver.read.addr([targetNode]) as Promise<Address>,
    ).resolves.toEqualAddress(accounts[1].address)

    await expect(
      ownedResolver.read.text([targetNode, textKey]),
    ).resolves.toEqual(textValue)
  })

  it('forbids non-owners from clearing records', async () => {
    const { ownedResolver } = await loadFixture()

    await ownedResolver.write.setAddr([targetNode, accounts[1].address])

    await expect(
      ownedResolver.write.clearRecords([targetNode], { account: accounts[2] }),
    ).toBeRevertedWithoutReason()

    await expect(
      ownedResolver.read.addr([targetNode]) as Promise<Address>,
    ).resolves.toEqualAddress(accounts[1].address)
  })
})
