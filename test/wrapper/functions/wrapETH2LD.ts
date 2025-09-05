import {
  getAddress,
  keccak256,
  namehash,
  stringToBytes,
  zeroAddress,
} from 'viem'

import { DAY } from '../../fixtures/constants.js'
import { dnsEncodeName } from '../../fixtures/dnsEncodeName.js'
import { toLabelId, toNameId, toTokenId } from '../../fixtures/utils.js'
import {
  CANNOT_SET_RESOLVER,
  CANNOT_TRANSFER,
  CANNOT_UNWRAP,
  CAN_DO_EVERYTHING,
  GRACE_PERIOD,
  IS_DOT_ETH,
  MAX_EXPIRY,
  PARENT_CANNOT_CONTROL,
  expectOwnerOf,
  zeroAccount,
  type LoadNameWrapperFixture,
} from '../fixtures/utils.js'

export const wrapETH2LDTests = (loadFixture: LoadNameWrapperFixture) =>
  describe('wrapETH2LD()', () => {
    const label = 'wrapped2'
    const name = `${label}.eth`

    it('wraps a name if sender is owner', async () => {
      const { ensRegistry, baseRegistrar, nameWrapper, accounts, actions } =
        await loadFixture()

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })

      // allow the restricted name wrappper to transfer the name to itself and reclaim it
      await actions.setBaseRegistrarApprovalForWrapper()

      await expectOwnerOf(name).on(nameWrapper).toBe(zeroAccount)

      await actions.wrapEth2ld({
        label,
        owner: accounts[0].address,
        fuses: CAN_DO_EVERYTHING,
        resolver: zeroAddress,
      })

      // make sure reclaim claimed ownership for the wrapper in registry
      await expectOwnerOf(name).on(ensRegistry).toBe(nameWrapper)

      // make sure owner in the wrapper is the user
      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      // make sure registrar ERC721 is owned by Wrapper
      await expectOwnerOf(label).on(baseRegistrar).toBe(nameWrapper)
    })

    it('Cannot wrap a name if the owner has not authorised the wrapper with the .eth registrar.', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture()

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })

      await expect(
        nameWrapper.write.wrapETH2LD([
          label,
          accounts[0].address,
          CAN_DO_EVERYTHING,
          zeroAddress,
        ]),
      ).toBeRevertedWithString('ERC721: caller is not token owner or approved')
    })

    it('Allows specifying resolver', async () => {
      const { ensRegistry, accounts, actions } = await loadFixture()

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })
      await actions.setBaseRegistrarApprovalForWrapper()
      await actions.wrapEth2ld({
        label,
        owner: accounts[0].address,
        fuses: CAN_DO_EVERYTHING,
        resolver: accounts[1].address,
      })

      await expect(
        ensRegistry.read.resolver([namehash(name)]),
      ).resolves.toEqualAddress(accounts[1].address)
    })

    it('Can re-wrap a name that was wrapped has already expired on the .eth registrar', async () => {
      const { baseRegistrar, nameWrapper, accounts, testClient, actions } =
        await loadFixture()

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })
      await actions.setBaseRegistrarApprovalForWrapper()
      await actions.wrapEth2ld({
        label,
        owner: accounts[0].address,
        fuses: CAN_DO_EVERYTHING,
        resolver: zeroAddress,
      })

      await testClient.increaseTime({
        seconds: Number(DAY * GRACE_PERIOD + DAY + 1n),
      })
      await testClient.mine({ blocks: 1 })

      await expect(
        baseRegistrar.read.available([toLabelId(label)]),
      ).resolves.toBe(true)

      await actions.register({
        label,
        owner: accounts[1].address,
        duration: 1n * DAY,
        account: 1,
      })
      await expectOwnerOf(label).on(baseRegistrar).toBe(accounts[1])

      await actions.setBaseRegistrarApprovalForWrapper({ account: 1 })

      const expectedExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])

      const tx = actions.wrapEth2ld({
        label,
        owner: accounts[1].address,
        fuses: CAN_DO_EVERYTHING,
        resolver: zeroAddress,
        account: 1,
      })

      // Check the 4 events
      // UnwrapETH2LD of the original owner
      // TransferSingle burn of the original token
      // WrapETH2LD to the new owner with fuses
      // TransferSingle to mint the new token

      await expect(tx)
        .toEmitEvent('NameUnwrapped')
        .withArgs({ node: namehash(name), owner: zeroAddress })
      await expect(tx)
        .toEmitEvent('TransferSingle')
        .withArgs({
          operator: getAddress(accounts[1].address),
          from: getAddress(accounts[0].address),
          to: zeroAddress,
          id: toNameId(name),
          value: 1n,
        })
      await expect(tx)
        .toEmitEvent('NameWrapped')
        .withArgs({
          node: namehash(name),
          name: dnsEncodeName(name),
          owner: getAddress(accounts[1].address),
          fuses: PARENT_CANNOT_CONTROL | IS_DOT_ETH,
          expiry: expectedExpiry + GRACE_PERIOD,
        })
      await expect(tx)
        .toEmitEvent('TransferSingle')
        .withArgs({
          operator: getAddress(accounts[1].address),
          from: zeroAddress,
          to: getAddress(accounts[1].address),
          id: toNameId(name),
          value: 1n,
        })

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[1])
      await expectOwnerOf(label).on(baseRegistrar).toBe(nameWrapper)
    })

    it('Can re-wrap a name that was wrapped has already expired even if CANNOT_TRANSFER was burned', async () => {
      const { baseRegistrar, nameWrapper, accounts, testClient, actions } =
        await loadFixture()

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })
      await actions.setBaseRegistrarApprovalForWrapper()
      await actions.wrapEth2ld({
        label,
        owner: accounts[0].address,
        fuses: CANNOT_UNWRAP | CANNOT_TRANSFER,
        resolver: zeroAddress,
      })

      await testClient.increaseTime({
        seconds: Number(DAY * GRACE_PERIOD + DAY + 1n),
      })
      await testClient.mine({ blocks: 1 })

      await expect(
        baseRegistrar.read.available([toLabelId(label)]),
      ).resolves.toBe(true)

      await actions.register({
        label,
        owner: accounts[1].address,
        duration: 1n * DAY,
        account: 1,
      })

      await expectOwnerOf(label).on(baseRegistrar).toBe(accounts[1])
      const expectedExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])

      await actions.setBaseRegistrarApprovalForWrapper({ account: 1 })
      const tx = actions.wrapEth2ld({
        label,
        owner: accounts[1].address,
        fuses: CAN_DO_EVERYTHING,
        resolver: zeroAddress,
        account: 1,
      })

      await expect(tx)
        .toEmitEvent('NameUnwrapped')
        .withArgs({ node: namehash(name), owner: zeroAddress })
      await expect(tx)
        .toEmitEvent('TransferSingle')
        .withArgs({
          operator: getAddress(accounts[1].address),
          from: getAddress(accounts[0].address),
          to: zeroAddress,
          id: toNameId(name),
          value: 1n,
        })
      await expect(tx)
        .toEmitEvent('NameWrapped')
        .withArgs({
          node: namehash(name),
          name: dnsEncodeName(name),
          owner: getAddress(accounts[1].address),
          fuses: PARENT_CANNOT_CONTROL | IS_DOT_ETH,
          expiry: expectedExpiry + GRACE_PERIOD,
        })

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[1])
      await expectOwnerOf(label).on(baseRegistrar).toBe(nameWrapper)
    })

    it('correctly reports fuses for a name that has expired and been rewrapped more permissively', async () => {
      const { baseRegistrar, nameWrapper, accounts, testClient, actions } =
        await loadFixture()

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const [, initialFuses] = await nameWrapper.read.getData([toNameId(name)])
      expect(initialFuses).toEqual(
        CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | IS_DOT_ETH,
      )

      // Create a subdomain that can't be unwrapped
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: 'sub',
        owner: accounts[0].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
        expiry: MAX_EXPIRY,
      })

      const [, subFuses] = await nameWrapper.read.getData([
        toNameId('sub.' + name),
      ])
      expect(subFuses).toEqual(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP)

      // Fast forward until the 2LD expires
      await testClient.increaseTime({
        seconds: Number(DAY * GRACE_PERIOD + DAY + 1n),
      })
      await testClient.mine({ blocks: 1 })

      // Register from another address
      await actions.registerSetupAndWrapName({
        label,
        duration: 1n * DAY,
        account: 1,
        fuses: CAN_DO_EVERYTHING,
      })

      const expectedExpiry = await baseRegistrar.read
        .nameExpires([toLabelId(label)])
        .then((e) => e + GRACE_PERIOD)
      const [, newFuses, newExpiry] = await nameWrapper.read.getData([
        toNameId(name),
      ])
      expect(newFuses).toEqual(PARENT_CANNOT_CONTROL | IS_DOT_ETH)
      expect(newExpiry).toEqual(expectedExpiry)

      // subdomain fuses get reset
      const [, newSubFuses] = await nameWrapper.read.getData([
        toNameId('sub.' + name),
      ])
      expect(newSubFuses).toEqual(0)
    })

    it('correctly reports fuses for a name that has expired and been rewrapped more permissively with registerAndWrap()', async () => {
      const { baseRegistrar, nameWrapper, accounts, testClient, actions } =
        await loadFixture()

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const [, initialFuses] = await nameWrapper.read.getData([toNameId(name)])
      expect(initialFuses).toEqual(
        CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | IS_DOT_ETH,
      )

      // Create a subdomain that can't be unwrapped
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: 'sub',
        owner: accounts[0].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
        expiry: MAX_EXPIRY,
      })

      const [, subFuses] = await nameWrapper.read.getData([
        toNameId('sub.' + name),
      ])
      expect(subFuses).toEqual(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP)

      // Fast forward until the 2LD expires
      await testClient.increaseTime({
        seconds: Number(DAY * GRACE_PERIOD + DAY + 1n),
      })
      await testClient.mine({ blocks: 1 })

      // Register from another address with registerAndWrap()
      await baseRegistrar.write.addController([nameWrapper.address])
      await nameWrapper.write.setController([accounts[0].address, true])
      await nameWrapper.write.registerAndWrapETH2LD([
        label,
        accounts[1].address,
        1n * DAY,
        zeroAddress,
        0,
      ])

      const expectedExpiry = await baseRegistrar.read
        .nameExpires([toLabelId(label)])
        .then((e) => e + GRACE_PERIOD)
      const [, newFuses, newExpiry] = await nameWrapper.read.getData([
        toNameId(name),
      ])
      expect(newFuses).toEqual(PARENT_CANNOT_CONTROL | IS_DOT_ETH)
      expect(newExpiry).toEqual(expectedExpiry)

      // subdomain fuses get reset
      const [, newSubFuses] = await nameWrapper.read.getData([
        toNameId('sub.' + name),
      ])
      expect(newSubFuses).toEqual(0)
    })

    it('emits Wrap event', async () => {
      const { baseRegistrar, nameWrapper, accounts, actions } =
        await loadFixture()

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })
      await actions.setBaseRegistrarApprovalForWrapper()
      const tx = actions.wrapEth2ld({
        label,
        owner: accounts[0].address,
        fuses: CAN_DO_EVERYTHING,
        resolver: zeroAddress,
      })
      await tx

      const expiry = await baseRegistrar.read.nameExpires([toLabelId(label)])
      await expect(tx)
        .toEmitEvent('NameWrapped')
        .withArgs({
          node: namehash(name),
          name: dnsEncodeName(name),
          owner: getAddress(accounts[0].address),
          fuses: CAN_DO_EVERYTHING | IS_DOT_ETH | PARENT_CANNOT_CONTROL,
          expiry: expiry + GRACE_PERIOD,
        })
    })

    it('emits TransferSingle event', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture()

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })
      await actions.setBaseRegistrarApprovalForWrapper()
      const tx = actions.wrapEth2ld({
        label,
        owner: accounts[0].address,
        fuses: CAN_DO_EVERYTHING,
        resolver: zeroAddress,
      })

      await expect(tx)
        .toEmitEvent('TransferSingle')
        .withArgs({
          operator: getAddress(accounts[0].address),
          from: zeroAddress,
          to: getAddress(accounts[0].address),
          id: toNameId(name),
          value: 1n,
        })
    })

    it('Transfers the wrapped token to the target address.', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture()

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })
      await actions.setBaseRegistrarApprovalForWrapper()
      await actions.wrapEth2ld({
        label,
        owner: accounts[1].address,
        fuses: CAN_DO_EVERYTHING,
        resolver: zeroAddress,
      })

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[1])
    })

    it('Does not allow wrapping with a target address of 0x0', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture()

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })
      await actions.setBaseRegistrarApprovalForWrapper()

      await expect(
        nameWrapper.write.wrapETH2LD([
          label,
          zeroAddress,
          CAN_DO_EVERYTHING,
          zeroAddress,
        ]),
      ).toBeRevertedWithString('ERC1155: mint to the zero address')
    })

    it('Does not allow wrapping with a target address of the wrapper contract address.', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture()

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })
      await actions.setBaseRegistrarApprovalForWrapper()

      await expect(
        nameWrapper.write.wrapETH2LD([
          label,
          nameWrapper.address,
          CAN_DO_EVERYTHING,
          zeroAddress,
        ]),
      ).toBeRevertedWithString(
        'ERC1155: newOwner cannot be the NameWrapper contract',
      )
    })

    it('Allows an account approved by the owner on the .eth registrar to wrap a name.', async () => {
      const { baseRegistrar, nameWrapper, accounts, actions } =
        await loadFixture()

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })
      await actions.setBaseRegistrarApprovalForWrapper()
      await baseRegistrar.write.setApprovalForAll([accounts[1].address, true])

      await actions.wrapEth2ld({
        label,
        owner: accounts[1].address,
        fuses: 0,
        resolver: zeroAddress,
        account: 1,
      })

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[1])
    })

    it('Does not allow anyone else to wrap a name even if the owner has authorised the wrapper with the ENS registry.', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture()

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })

      await actions.setRegistryApprovalForWrapper()
      await actions.setBaseRegistrarApprovalForWrapper()

      await expect(
        nameWrapper.write.wrapETH2LD(
          [label, accounts[1].address, 0, zeroAddress],
          {
            account: accounts[1],
          },
        ),
      )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs([namehash(name), getAddress(accounts[1].address)])
    })

    it('Can wrap a name even if the controller address is different to the registrant address.', async () => {
      const { ensRegistry, nameWrapper, accounts, actions } =
        await loadFixture()

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })
      await ensRegistry.write.setOwner([namehash(name), accounts[1].address])
      await actions.setBaseRegistrarApprovalForWrapper()

      await actions.wrapEth2ld({
        label,
        owner: accounts[0].address,
        fuses: 0,
        resolver: zeroAddress,
      })

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])
    })

    it('Does not allow the controller of a name to wrap it if they are not also the registrant.', async () => {
      const { ensRegistry, nameWrapper, accounts, actions } =
        await loadFixture()

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })
      await ensRegistry.write.setOwner([namehash(name), accounts[1].address])
      await actions.setBaseRegistrarApprovalForWrapper()

      await expect(
        nameWrapper.write.wrapETH2LD(
          [label, accounts[1].address, 0, zeroAddress],
          {
            account: accounts[1],
          },
        ),
      )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs([namehash(name), getAddress(accounts[1].address)])
    })

    it('Does not allows fuse to be burned if CANNOT_UNWRAP has not been burned.', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture()

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })
      await actions.setBaseRegistrarApprovalForWrapper()

      await expect(
        nameWrapper.write.wrapETH2LD([
          label,
          accounts[0].address,
          CANNOT_SET_RESOLVER,
          zeroAddress,
        ]),
      )
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs([namehash(name)])
    })

    // it('cannot burn any parent controlled fuse', async () => {
    //   const { nameWrapper, accounts, actions } = await loadFixture()

    //   await actions.register({
    //     label,
    //     owner: accounts[0].address,
    //     duration: 1n * DAY,
    //   })
    //   await actions.setBaseRegistrarApprovalForWrapper()

    //   for (let i = 0; i < 7; i++) {
    //     await expect(
    //       nameWrapper.write.wrapETH2LD([
    //         label,
    //         accounts[0].address,
    //         IS_DOT_ETH * 2 ** i, // next undefined fuse
    //         zeroAddress,
    //       ]),
    //     ).toBeRevertedWithoutReason()
    //   }
    // })

    it('Allows fuse to be burned if CANNOT_UNWRAP has been burned', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture()

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })
      await actions.setBaseRegistrarApprovalForWrapper()

      const initialFuses = CANNOT_UNWRAP | CANNOT_SET_RESOLVER
      await actions.wrapEth2ld({
        label,
        owner: accounts[0].address,
        fuses: initialFuses,
        resolver: zeroAddress,
      })

      const [, fuses] = await nameWrapper.read.getData([toNameId(name)])
      expect(fuses).toEqual(initialFuses | PARENT_CANNOT_CONTROL | IS_DOT_ETH)
    })

    it('Allows fuse to be burned if CANNOT_UNWRAP has been burned, but resets to 0 if expired', async () => {
      const { nameWrapper, accounts, testClient, actions } = await loadFixture()

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })
      await actions.setBaseRegistrarApprovalForWrapper()

      const initialFuses = CANNOT_UNWRAP | CANNOT_SET_RESOLVER
      await actions.wrapEth2ld({
        label,
        owner: accounts[0].address,
        fuses: initialFuses,
        resolver: zeroAddress,
      })

      await testClient.increaseTime({
        seconds: Number(DAY + 1n + GRACE_PERIOD),
      })
      await testClient.mine({ blocks: 1 })

      const [, fuses] = await nameWrapper.read.getData([toNameId(name)])
      expect(fuses).toEqual(0)
    })

    it('Will not wrap an empty name', async () => {
      const { baseRegistrar, nameWrapper, accounts, actions } =
        await loadFixture()

      const emptyLabelhash = keccak256(new Uint8Array(0))

      await baseRegistrar.write.register([
        toTokenId(emptyLabelhash),
        accounts[0].address,
        1n * DAY,
      ])
      await actions.setBaseRegistrarApprovalForWrapper()

      await expect(
        nameWrapper.write.wrapETH2LD([
          '',
          accounts[0].address,
          CAN_DO_EVERYTHING,
          zeroAddress,
        ]),
      ).toBeRevertedWithCustomError('LabelTooShort')
    })

    it('Will not wrap a label greater than 255 characters', async () => {
      const { baseRegistrar, nameWrapper, accounts, actions } =
        await loadFixture()

      const longString =
        'yutaioxtcsbzrqhdjmltsdfkgomogohhcchjoslfhqgkuhduhxqsldnurwrrtoicvthwxytonpcidtnkbrhccaozdtoznedgkfkifsvjukxxpkcmgcjprankyzerzqpnuteuegtfhqgzcxqwttyfewbazhyilqhyffufxrookxrnjkmjniqpmntcbrowglgdpkslzechimsaonlcvjkhhvdvkvvuztihobmivifuqtvtwinljslusvhhbwhuhzty'
      expect(longString.length).toEqual(256)

      await baseRegistrar.write.register([
        toTokenId(keccak256(stringToBytes(longString))),
        accounts[0].address,
        1n * DAY,
      ])
      await actions.setBaseRegistrarApprovalForWrapper()

      await expect(
        nameWrapper.write.wrapETH2LD([
          longString,
          accounts[0].address,
          CAN_DO_EVERYTHING,
          zeroAddress,
        ]),
      )
        .toBeRevertedWithCustomError('LabelTooLong')
        .withArgs([longString])
    })

    it('Rewrapping a previously wrapped unexpired name retains PCC and expiry', async () => {
      const { baseRegistrar, nameWrapper, accounts, actions } =
        await loadFixture()

      // register and wrap a name with PCC
      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })
      const parentExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])

      // unwrap it
      await actions.unwrapEth2ld({
        label,
        controller: accounts[0].address,
        registrant: accounts[0].address,
      })

      // rewrap it without PCC being burned
      await actions.wrapEth2ld({
        label,
        owner: accounts[0].address,
        fuses: CAN_DO_EVERYTHING,
        resolver: zeroAddress,
      })

      // check that the PCC is still there
      const [, fuses, expiry] = await nameWrapper.read.getData([toNameId(name)])
      expect(fuses).toEqual(PARENT_CANNOT_CONTROL | IS_DOT_ETH)
      expect(expiry).toEqual(parentExpiry + GRACE_PERIOD)
    })
  })
