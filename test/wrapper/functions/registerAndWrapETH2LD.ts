import type { NetworkConnection } from 'hardhat/types/network'
import {
  encodeFunctionData,
  getAddress,
  namehash,
  zeroAddress,
  type Hex,
} from 'viem'

import { dnsEncodeName } from '../../fixtures/dnsEncodeName.js'
import { toLabelId, toNameId } from '../../fixtures/utils.js'
import {
  CANNOT_SET_RESOLVER,
  CANNOT_UNWRAP,
  CAN_DO_EVERYTHING,
  GRACE_PERIOD,
  IS_DOT_ETH,
  PARENT_CANNOT_CONTROL,
  expectOwnerOf,
  type LoadNameWrapperFixture,
} from '../fixtures/utils.js'

export const registerAndWrapETH2LDTests = (
  connection: NetworkConnection,
  loadNameWrapperFixture: LoadNameWrapperFixture,
) => {
  describe('registerAndWrapETH2LD()', () => {
    const label = 'register'
    const name = `${label}.eth`

    async function fixture() {
      const initial = await loadNameWrapperFixture()
      const { baseRegistrar, nameWrapper, accounts } = initial

      await baseRegistrar.write.addController([nameWrapper.address])
      await nameWrapper.write.setController([accounts[0].address, true])

      return initial
    }
    const loadFixture = async () =>
      connection.networkHelpers.loadFixture(fixture)

    it('should register and wrap names', async () => {
      const { ensRegistry, baseRegistrar, nameWrapper, accounts } =
        await loadFixture()

      await nameWrapper.write.registerAndWrapETH2LD([
        label,
        accounts[0].address,
        86400n,
        zeroAddress,
        CAN_DO_EVERYTHING,
      ])

      await expectOwnerOf(label).on(baseRegistrar).toBe(nameWrapper)
      await expectOwnerOf(name).on(ensRegistry).toBe(nameWrapper)
      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])
    })

    it('allows specifying a resolver address', async () => {
      const { ensRegistry, nameWrapper, accounts } = await loadFixture()

      await nameWrapper.write.registerAndWrapETH2LD([
        label,
        accounts[0].address,
        86400n,
        accounts[1].address,
        CAN_DO_EVERYTHING,
      ])

      await expect(
        ensRegistry.read.resolver([namehash(name)]),
      ).resolves.toEqualAddress(accounts[1].address)
    })

    it('does not allow non controllers to register names', async () => {
      const { nameWrapper, accounts } = await loadFixture()

      await nameWrapper.write.setController([accounts[0].address, false])

      await expect(
        nameWrapper.write.registerAndWrapETH2LD([
          label,
          accounts[0].address,
          86400n,
          zeroAddress,
          CAN_DO_EVERYTHING,
        ]),
      ).toBeRevertedWithString('Controllable: Caller is not a controller')
    })

    it('Transfers the wrapped token to the target address.', async () => {
      const { nameWrapper, accounts } = await loadFixture()

      await nameWrapper.write.registerAndWrapETH2LD([
        label,
        accounts[1].address,
        86400n,
        zeroAddress,
        CAN_DO_EVERYTHING,
      ])

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[1])
    })

    it('Does not allow wrapping with a target address of 0x0', async () => {
      const { nameWrapper } = await loadFixture()

      await expect(
        nameWrapper.write.registerAndWrapETH2LD([
          label,
          zeroAddress,
          86400n,
          zeroAddress,
          CAN_DO_EVERYTHING,
        ]),
      ).toBeRevertedWithString('ERC1155: mint to the zero address')
    })

    it('Does not allow wrapping with a target address of the wrapper contract address.', async () => {
      const { nameWrapper } = await loadFixture()

      await expect(
        nameWrapper.write.registerAndWrapETH2LD([
          label,
          nameWrapper.address,
          86400n,
          zeroAddress,
          CAN_DO_EVERYTHING,
        ]),
      ).toBeRevertedWithString(
        'ERC1155: newOwner cannot be the NameWrapper contract',
      )
    })

    it('Does not allows fuse to be burned if CANNOT_UNWRAP has not been burned.', async () => {
      const { nameWrapper, accounts } = await loadFixture()

      await expect(
        nameWrapper.write.registerAndWrapETH2LD([
          label,
          accounts[0].address,
          86400n,
          zeroAddress,
          CANNOT_SET_RESOLVER,
        ]),
      )
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs([namehash(name)])
    })

    it('Allows fuse to be burned if CANNOT_UNWRAP has been burned and expiry set', async () => {
      const { nameWrapper, accounts } = await loadFixture()

      const initialFuses = CANNOT_UNWRAP | CANNOT_SET_RESOLVER

      await nameWrapper.write.registerAndWrapETH2LD([
        label,
        accounts[0].address,
        86400n,
        zeroAddress,
        initialFuses,
      ])

      const [, fuses] = await nameWrapper.read.getData([toNameId(name)])

      expect(fuses).toEqual(initialFuses | PARENT_CANNOT_CONTROL | IS_DOT_ETH)
    })

    it('automatically sets PARENT_CANNOT_CONTROL and IS_DOT_ETH', async () => {
      const { nameWrapper, accounts } = await loadFixture()

      await nameWrapper.write.registerAndWrapETH2LD([
        label,
        accounts[0].address,
        86400n,
        zeroAddress,
        CAN_DO_EVERYTHING,
      ])

      const [, fuses] = await nameWrapper.read.getData([toNameId(name)])

      expect(fuses).toEqual(PARENT_CANNOT_CONTROL | IS_DOT_ETH)
    })

    it('Errors when adding a number greater than uint16 for fuses', async () => {
      const { nameWrapper, accounts } = await loadFixture()

      let data = encodeFunctionData({
        abi: nameWrapper.abi,
        functionName: 'registerAndWrapETH2LD',
        args: [label, accounts[0].address, 86400n, zeroAddress, 273],
      })
      const rogueFuse = '40000' // 2 ** 18 in hex
      data = data.replace('00111', rogueFuse) as Hex

      const tx = {
        to: nameWrapper.address,
        data,
      }

      await expect(
        nameWrapper.arbitrary({ ...tx, account: accounts[0] }),
      ).toBeRevertedWithoutReason()
    })

    it.skip('Errors when passing a parent-controlled fuse', async () => {
      const { nameWrapper, accounts } = await loadFixture()

      for (let i = 0; i < 7; i++) {
        await expect(
          nameWrapper.write.registerAndWrapETH2LD([
            label,
            accounts[0].address,
            86400n,
            zeroAddress,
            IS_DOT_ETH * 2 ** i,
          ]),
        ).toBeRevertedWithoutReason()
      }
    })

    it('Will not wrap a name with an empty label', async () => {
      const { nameWrapper, accounts } = await loadFixture()

      await expect(
        nameWrapper.write.registerAndWrapETH2LD([
          '',
          accounts[0].address,
          86400n,
          zeroAddress,
          CAN_DO_EVERYTHING,
        ]),
      ).toBeRevertedWithCustomError('LabelTooShort')
    })

    it('Will not wrap a name with a label more than 255 characters', async () => {
      const { nameWrapper, accounts } = await loadFixture()

      const longString =
        'yutaioxtcsbzrqhdjmltsdfkgomogohhcchjoslfhqgkuhduhxqsldnurwrrtoicvthwxytonpcidtnkbrhccaozdtoznedgkfkifsvjukxxpkcmgcjprankyzerzqpnuteuegtfhqgzcxqwttyfewbazhyilqhyffufxrookxrnjkmjniqpmntcbrowglgdpkslzechimsaonlcvjkhhvdvkvvuztihobmivifuqtvtwinljslusvhhbwhuhzty'
      expect(longString.length).toEqual(256)

      await expect(
        nameWrapper.write.registerAndWrapETH2LD([
          longString,
          accounts[0].address,
          86400n,
          zeroAddress,
          CAN_DO_EVERYTHING,
        ]),
      )
        .toBeRevertedWithCustomError('LabelTooLong')
        .withArgs([longString])
    })

    it('emits Wrap event', async () => {
      const { baseRegistrar, nameWrapper, accounts } = await loadFixture()

      const tx = nameWrapper.write.registerAndWrapETH2LD([
        label,
        accounts[0].address,
        86400n,
        zeroAddress,
        CAN_DO_EVERYTHING,
      ])
      await tx
      const expiry = await baseRegistrar.read.nameExpires([toLabelId(label)])

      await expect(tx)
        .toEmitEvent('NameWrapped')
        .withArgs({
          node: namehash(name),
          name: dnsEncodeName(name),
          owner: getAddress(accounts[0].address),
          fuses: PARENT_CANNOT_CONTROL | IS_DOT_ETH,
          expiry: expiry + GRACE_PERIOD,
        })
    })

    it('Emits TransferSingle event', async () => {
      const { nameWrapper, accounts } = await loadFixture()

      await expect(
        nameWrapper.write.registerAndWrapETH2LD([
          label,
          accounts[0].address,
          86400n,
          zeroAddress,
          CAN_DO_EVERYTHING,
        ]),
      )
        .toEmitEvent('TransferSingle')
        .withArgs({
          operator: getAddress(accounts[0].address),
          from: zeroAddress,
          to: getAddress(accounts[0].address),
          id: toNameId(name),
          value: 1n,
        })
    })
  })
}
