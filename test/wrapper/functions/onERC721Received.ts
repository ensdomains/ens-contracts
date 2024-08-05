import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  labelhash,
  namehash,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem'
import { DAY } from '../../fixtures/constants.js'
import { dnsEncodeName } from '../../fixtures/dnsEncodeName.js'
import { toLabelId, toNameId, toTokenId } from '../../fixtures/utils.js'
import {
  CANNOT_TRANSFER,
  CANNOT_UNWRAP,
  GRACE_PERIOD,
  IS_DOT_ETH,
  PARENT_CANNOT_CONTROL,
  expectOwnerOf,
  deployNameWrapperWithUtils as fixture,
  zeroAccount,
} from '../fixtures/utils.js'

export const onERC721ReceivedTests = () => {
  describe('onERC721Received', () => {
    const label = 'send2contract'
    const name = `${label}.eth`

    const encodeExtraData = ({
      label,
      owner,
      ownerControlledFuses,
      resolver,
    }: {
      label: string
      owner: Address
      ownerControlledFuses: number
      resolver: Address
    }) =>
      encodeAbiParameters(
        [
          { type: 'string' },
          { type: 'address' },
          { type: 'uint16' },
          { type: 'address' },
        ],
        [label, owner, ownerControlledFuses, resolver],
      )

    async function onERC721ReceivedFixture() {
      const initial = await loadFixture(fixture)
      const { actions, accounts } = initial

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })

      return initial
    }

    it('Wraps a name transferred to it and sets the owner to the provided address', async () => {
      const { baseRegistrar, nameWrapper, accounts } = await loadFixture(
        onERC721ReceivedFixture,
      )

      await baseRegistrar.write.safeTransferFrom([
        accounts[0].address,
        nameWrapper.address,
        toLabelId(label),
        encodeExtraData({
          label,
          owner: accounts[1].address,
          ownerControlledFuses: 0,
          resolver: zeroAddress,
        }),
      ])

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[1])
      await expectOwnerOf(label).on(baseRegistrar).toBe(nameWrapper)
    })

    it('Reverts if called by anything other than the ENS registrar address', async () => {
      const { nameWrapper, accounts } = await loadFixture(
        onERC721ReceivedFixture,
      )

      await expect(nameWrapper)
        .write('onERC721Received', [
          accounts[0].address,
          accounts[0].address,
          toLabelId(label),
          encodeExtraData({
            label,
            owner: accounts[0].address,
            ownerControlledFuses: 1,
            resolver: zeroAddress,
          }),
        ])
        .toBeRevertedWithCustomError('IncorrectTokenType')
    })

    it('Accepts fuse values from the data field', async () => {
      const { baseRegistrar, nameWrapper, accounts } = await loadFixture(
        onERC721ReceivedFixture,
      )

      await baseRegistrar.write.safeTransferFrom([
        accounts[0].address,
        nameWrapper.address,
        toLabelId(label),
        encodeExtraData({
          label,
          owner: accounts[0].address,
          ownerControlledFuses: 1,
          resolver: zeroAddress,
        }),
      ])

      const [, fuses] = await nameWrapper.read.getData([toNameId(name)])

      expect(fuses).toEqual(CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | IS_DOT_ETH)
      await expect(
        nameWrapper.read.allFusesBurned([namehash(name), CANNOT_UNWRAP]),
      ).resolves.toEqual(true)
    })

    it('Allows specifiying resolver address', async () => {
      const { baseRegistrar, nameWrapper, ensRegistry, accounts } =
        await loadFixture(onERC721ReceivedFixture)

      await baseRegistrar.write.safeTransferFrom([
        accounts[0].address,
        nameWrapper.address,
        toLabelId(label),
        encodeExtraData({
          label,
          owner: accounts[0].address,
          ownerControlledFuses: 1,
          resolver: accounts[1].address,
        }),
      ])

      await expect(
        ensRegistry.read.resolver([namehash(name)]),
      ).resolves.toEqualAddress(accounts[1].address)
    })

    it('Reverts if transferred without data', async () => {
      const { baseRegistrar, nameWrapper, accounts } = await loadFixture(
        onERC721ReceivedFixture,
      )

      await expect(baseRegistrar)
        .write('safeTransferFrom', [
          accounts[0].address,
          nameWrapper.address,
          toLabelId(label),
          '0x',
        ])
        .toBeRevertedWithString(
          'ERC721: transfer to non ERC721Receiver implementer',
        )
    })

    it('Rejects transfers where the data field label does not match the tokenId', async () => {
      const { baseRegistrar, nameWrapper, accounts } = await loadFixture(
        onERC721ReceivedFixture,
      )

      const tx = baseRegistrar.write.safeTransferFrom([
        accounts[0].address,
        nameWrapper.address,
        toLabelId(label),
        encodeExtraData({
          label: 'incorrectlabel',
          owner: accounts[0].address,
          ownerControlledFuses: 0,
          resolver: zeroAddress,
        }),
      ])

      await expect(nameWrapper)
        .transaction(tx)
        .toBeRevertedWithCustomError('LabelMismatch')
        .withArgs(labelhash('incorrectlabel'), labelhash(label))
    })

    it('Reverts if CANNOT_UNWRAP is not burned and attempts to burn other fuses', async () => {
      const { baseRegistrar, ensRegistry, nameWrapper, accounts } =
        await loadFixture(onERC721ReceivedFixture)

      await ensRegistry.write.setOwner([namehash(name), accounts[1].address])

      const tx = baseRegistrar.write.safeTransferFrom([
        accounts[0].address,
        nameWrapper.address,
        toLabelId(label),
        encodeExtraData({
          label,
          owner: accounts[0].address,
          ownerControlledFuses: 2,
          resolver: zeroAddress,
        }),
      ])

      await expect(nameWrapper)
        .transaction(tx)
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(name))
    })

    it('Reverts when manually changing fuse calldata to incorrect type', async () => {
      const { baseRegistrar, nameWrapper, accounts } = await loadFixture(
        onERC721ReceivedFixture,
      )

      const [walletClient] = await hre.viem.getWalletClients()

      let data = encodeFunctionData({
        abi: baseRegistrar.abi,
        functionName: 'safeTransferFrom',
        args: [
          accounts[0].address,
          nameWrapper.address,
          toLabelId(label),
          encodeExtraData({
            label,
            owner: accounts[0].address,
            ownerControlledFuses: 273,
            resolver: zeroAddress,
          }),
        ],
      })
      const rogueFuse = '40000' // 2 ** 18 in hex
      data = data.replace('00111', rogueFuse) as Hex

      const tx = {
        to: baseRegistrar.address,
        data,
      }

      await expect(baseRegistrar)
        .transaction(walletClient.sendTransaction(tx))
        .toBeRevertedWithString(
          'ERC721: transfer to non ERC721Receiver implementer',
        )
    })

    it('Allows burning other fuses if CAN_UNWRAP has been burnt', async () => {
      const { baseRegistrar, ensRegistry, nameWrapper, accounts } =
        await loadFixture(onERC721ReceivedFixture)

      await ensRegistry.write.setOwner([namehash(name), accounts[1].address])

      await baseRegistrar.write.safeTransferFrom([
        accounts[0].address,
        nameWrapper.address,
        toLabelId(label),
        encodeExtraData({
          label,
          owner: accounts[0].address,
          ownerControlledFuses: CANNOT_UNWRAP | CANNOT_TRANSFER,
          resolver: zeroAddress,
        }),
      ])

      await expectOwnerOf(name).on(ensRegistry).toBe(nameWrapper)
      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      const [, fuses] = await nameWrapper.read.getData([toNameId(name)])

      expect(fuses).toEqual(
        CANNOT_UNWRAP | CANNOT_TRANSFER | PARENT_CANNOT_CONTROL | IS_DOT_ETH,
      )
      await expect(
        nameWrapper.read.allFusesBurned([
          namehash(name),
          CANNOT_UNWRAP | CANNOT_TRANSFER | PARENT_CANNOT_CONTROL,
        ]),
      ).resolves.toEqual(true)
    })

    it('Allows burning other fuses if CAN_UNWRAP has been burnt, but resets fuses if expired', async () => {
      const { baseRegistrar, ensRegistry, nameWrapper, accounts, testClient } =
        await loadFixture(onERC721ReceivedFixture)

      await ensRegistry.write.setOwner([namehash(name), accounts[1].address])

      await baseRegistrar.write.safeTransferFrom([
        accounts[0].address,
        nameWrapper.address,
        toLabelId(label),
        encodeExtraData({
          label,
          owner: accounts[0].address,
          ownerControlledFuses: CANNOT_UNWRAP | CANNOT_TRANSFER,
          resolver: zeroAddress,
        }),
      ])

      await testClient.increaseTime({
        seconds: Number(GRACE_PERIOD + 1n * DAY),
      })
      await testClient.mine({ blocks: 1 })

      await expectOwnerOf(name).on(ensRegistry).toBe(nameWrapper)

      const [, fuses] = await nameWrapper.read.getData([toNameId(name)])
      // owner should be 0 as expired
      await expectOwnerOf(name).on(nameWrapper).toBe(zeroAccount)
      expect(fuses).toEqual(0)

      await expect(
        nameWrapper.read.allFusesBurned([
          namehash(name),
          CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_TRANSFER,
        ]),
      ).resolves.toEqual(false)
    })

    it('Sets the controller in the ENS registry to the wrapper contract', async () => {
      const { baseRegistrar, ensRegistry, nameWrapper, accounts } =
        await loadFixture(onERC721ReceivedFixture)

      await baseRegistrar.write.safeTransferFrom([
        accounts[0].address,
        nameWrapper.address,
        toLabelId(label),
        encodeExtraData({
          label,
          owner: accounts[0].address,
          ownerControlledFuses: 0,
          resolver: zeroAddress,
        }),
      ])

      await expectOwnerOf(name).on(ensRegistry).toBe(nameWrapper)
    })

    it('Can wrap a name even if the controller address is different to the registrant address', async () => {
      const { baseRegistrar, ensRegistry, nameWrapper, accounts } =
        await loadFixture(onERC721ReceivedFixture)

      await ensRegistry.write.setOwner([namehash(name), accounts[1].address])

      await baseRegistrar.write.safeTransferFrom([
        accounts[0].address,
        nameWrapper.address,
        toLabelId(label),
        encodeExtraData({
          label,
          owner: accounts[0].address,
          ownerControlledFuses: 0,
          resolver: zeroAddress,
        }),
      ])

      await expectOwnerOf(name).on(ensRegistry).toBe(nameWrapper)
      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])
    })

    it('emits NameWrapped Event', async () => {
      const { baseRegistrar, nameWrapper, accounts } = await loadFixture(
        onERC721ReceivedFixture,
      )

      const expectedExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])

      const tx = baseRegistrar.write.safeTransferFrom([
        accounts[0].address,
        nameWrapper.address,
        toLabelId(label),
        encodeExtraData({
          label,
          owner: accounts[0].address,
          ownerControlledFuses: CANNOT_UNWRAP | CANNOT_TRANSFER,
          resolver: zeroAddress,
        }),
      ])

      await expect(nameWrapper)
        .transaction(tx)
        .toEmitEvent('NameWrapped')
        .withArgs(
          namehash(name),
          dnsEncodeName(name),
          accounts[0].address,
          CANNOT_UNWRAP | CANNOT_TRANSFER | PARENT_CANNOT_CONTROL | IS_DOT_ETH,
          expectedExpiry + GRACE_PERIOD,
        )
    })

    it('emits TransferSingle Event', async () => {
      const { baseRegistrar, nameWrapper, accounts } = await loadFixture(
        onERC721ReceivedFixture,
      )

      const tx = baseRegistrar.write.safeTransferFrom([
        accounts[0].address,
        nameWrapper.address,
        toLabelId(label),
        encodeExtraData({
          label,
          owner: accounts[0].address,
          ownerControlledFuses: CANNOT_UNWRAP | CANNOT_TRANSFER,
          resolver: zeroAddress,
        }),
      ])

      await expect(nameWrapper)
        .transaction(tx)
        .toEmitEvent('TransferSingle')
        .withArgs(
          baseRegistrar.address,
          zeroAddress,
          accounts[0].address,
          toNameId(name),
          1n,
        )
    })

    it('will not wrap a name with an empty label', async () => {
      const { baseRegistrar, nameWrapper, accounts } = await loadFixture(
        fixture,
      )

      const emptyLabelId = toTokenId(keccak256(new Uint8Array(0)))

      await baseRegistrar.write.register([
        emptyLabelId,
        accounts[0].address,
        1n * DAY,
      ])

      const tx = baseRegistrar.write.safeTransferFrom([
        accounts[0].address,
        nameWrapper.address,
        emptyLabelId,
        encodeExtraData({
          label: '',
          owner: accounts[0].address,
          ownerControlledFuses: 0,
          resolver: zeroAddress,
        }),
      ])

      await expect(nameWrapper)
        .transaction(tx)
        .toBeRevertedWithCustomError('LabelTooShort')
    })
  })
}
