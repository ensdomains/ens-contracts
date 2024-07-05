import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { getAddress, labelhash, namehash, zeroAddress } from 'viem'
import { DAY } from '../../fixtures/constants.js'
import { toNameId } from '../../fixtures/utils.js'
import {
  CANNOT_APPROVE,
  CANNOT_UNWRAP,
  CAN_DO_EVERYTHING,
  CAN_EXTEND_EXPIRY,
  GRACE_PERIOD,
  PARENT_CANNOT_CONTROL,
  expectOwnerOf,
  deployNameWrapperWithUtils as fixture,
} from '../fixtures/utils.js'

export const approveTests = () => {
  describe('approve()', () => {
    const label = 'subdomain'
    const sublabel = 'sub'
    const name = `${label}.eth`
    const subname = `${sublabel}.${name}`

    async function approveFixture() {
      const initial = await loadFixture(fixture)
      const { nameWrapper, actions } = initial

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })
      const [, , parentExpiry] = await nameWrapper.read.getData([
        toNameId(name),
      ])

      return { ...initial, parentExpiry }
    }

    it('Sets an approval address if owner', async () => {
      const { nameWrapper, accounts } = await loadFixture(approveFixture)

      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])

      await expect(
        nameWrapper.read.getApproved([toNameId(name)]),
      ).resolves.toEqualAddress(accounts[1].address)
    })

    it('Sets an approval address if is an operator', async () => {
      const { nameWrapper, accounts } = await loadFixture(approveFixture)

      await nameWrapper.write.setApprovalForAll([accounts[1].address, true])
      await nameWrapper.write.approve([accounts[2].address, toNameId(name)], {
        account: accounts[1],
      })

      await expect(
        nameWrapper.read.getApproved([toNameId(name)]),
      ).resolves.toEqualAddress(accounts[2].address)
    })

    it('Reverts if called by an approved address', async () => {
      const { nameWrapper, accounts } = await loadFixture(approveFixture)

      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])

      await expect(nameWrapper)
        .write('approve', [accounts[2].address, toNameId(name)], {
          account: accounts[1],
        })
        .toBeRevertedWithString(
          'ERC721: approve caller is not token owner or approved for all',
        )
    })

    it('Reverts if called by non-owner or approved', async () => {
      const { nameWrapper, accounts } = await loadFixture(approveFixture)

      await expect(nameWrapper)
        .write('approve', [accounts[1].address, toNameId(name)], {
          account: accounts[2],
        })
        .toBeRevertedWithString(
          'ERC721: approve caller is not token owner or approved for all',
        )
    })

    it('Emits Approval event', async () => {
      const { nameWrapper, accounts } = await loadFixture(approveFixture)

      await expect(nameWrapper)
        .write('approve', [accounts[1].address, toNameId(name)])
        .toEmitEvent('Approval')
        .withArgs(accounts[0].address, accounts[1].address, toNameId(name))
    })

    it('Allows approved address to call extendExpiry()', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture(
        approveFixture,
      )

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        expiry: 0n,
        fuses: CAN_DO_EVERYTHING,
      })
      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])

      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[1])

      await nameWrapper.write.extendExpiry(
        [namehash(name), labelhash(sublabel), 100n],
        { account: accounts[1] },
      )

      const [, , expiry] = await nameWrapper.read.getData([toNameId(subname)])
      expect(expiry).toEqual(100n)
    })

    it('Does not allows approved address to call setSubnodeOwner()', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture(
        approveFixture,
      )

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        expiry: 0n,
        fuses: CAN_DO_EVERYTHING,
      })
      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])

      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[1])

      await expect(nameWrapper)
        .write(
          'setSubnodeOwner',
          [namehash(name), sublabel, accounts[2].address, 0, 1000n],
          { account: accounts[1] },
        )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[1].address))
    })

    it('Allows approved address to call setSubnodeRecord()', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture(
        approveFixture,
      )

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        expiry: 0n,
        fuses: CAN_DO_EVERYTHING,
      })
      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])

      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[1])

      await expect(nameWrapper)
        .write(
          'setSubnodeRecord',
          [
            namehash(name),
            sublabel,
            accounts[1].address,
            zeroAddress,
            0n,
            0,
            10000n,
          ],
          { account: accounts[1] },
        )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[1].address))
    })

    it('Does not allow approved address to call setChildFuses()', async () => {
      const { nameWrapper, accounts, actions, parentExpiry } =
        await loadFixture(approveFixture)

      await nameWrapper.write.setFuses([namehash(name), CANNOT_UNWRAP])
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        expiry: 0n,
        fuses: CAN_DO_EVERYTHING,
      })
      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])

      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[1])

      await expect(nameWrapper)
        .write(
          'setChildFuses',
          [
            namehash(name),
            labelhash(sublabel),
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CAN_EXTEND_EXPIRY,
            parentExpiry,
          ],
          { account: accounts[1] },
        )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[1].address))
    })

    it('Does not allow approved accounts to extend expiry when expired', async () => {
      const { nameWrapper, accounts, actions, testClient } = await loadFixture(
        approveFixture,
      )

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        expiry: 0n,
        fuses: CAN_DO_EVERYTHING,
      })
      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])

      await testClient.increaseTime({
        seconds: Number(2n * DAY),
      })
      await testClient.mine({ blocks: 1 })

      await expect(nameWrapper)
        .write('extendExpiry', [namehash(name), labelhash(sublabel), 1000n], {
          account: accounts[1],
        })
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(subname))
    })

    it('Approved address can be replaced and previous approved is removed', async () => {
      const { nameWrapper, accounts, actions, parentExpiry } =
        await loadFixture(approveFixture)

      await nameWrapper.write.setFuses([namehash(name), CANNOT_UNWRAP])
      // Make sure there are no lingering approvals
      await nameWrapper.write.setApprovalForAll([accounts[1].address, false])
      await nameWrapper.write.setApprovalForAll([accounts[2].address, false])

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        expiry: parentExpiry - 1000n,
        fuses: CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CAN_EXTEND_EXPIRY,
      })
      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])
      await nameWrapper.write.approve([accounts[2].address, toNameId(name)])

      await nameWrapper.write.extendExpiry(
        [namehash(name), labelhash(sublabel), parentExpiry - 500n],
        { account: accounts[2] },
      )

      await expect(nameWrapper)
        .write(
          'extendExpiry',
          [namehash(name), labelhash(sublabel), parentExpiry],
          { account: accounts[1] },
        )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(subname), getAddress(accounts[1].address))

      const [, , expiry] = await nameWrapper.read.getData([toNameId(subname)])
      expect(expiry).toEqual(parentExpiry - 500n)
    })

    it('Approved address cannot be removed/replaced when fuse is burnt', async () => {
      const { nameWrapper, accounts } = await loadFixture(approveFixture)

      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])
      await nameWrapper.write.setFuses([
        namehash(name),
        CANNOT_UNWRAP | CANNOT_APPROVE,
      ])

      await expect(nameWrapper)
        .write('approve', [zeroAddress, toNameId(name)])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(name))

      await expect(nameWrapper)
        .write('approve', [accounts[0].address, toNameId(name)])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(name))
    })

    it('Approved address cannot transfer the name', async () => {
      const { nameWrapper, accounts } = await loadFixture(approveFixture)

      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])

      await expect(nameWrapper)
        .write(
          'safeTransferFrom',
          [accounts[0].address, accounts[1].address, toNameId(name), 1n, '0x'],
          { account: accounts[1] },
        )
        .toBeRevertedWithString('ERC1155: caller is not owner nor approved')
    })

    it('Approved address cannot transfer the name with setRecord()', async () => {
      const { nameWrapper, accounts } = await loadFixture(approveFixture)

      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])

      await expect(nameWrapper)
        .write(
          'setRecord',
          [namehash(name), accounts[1].address, zeroAddress, 0n],
          { account: accounts[1] },
        )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[1].address))
    })

    it('Approved address cannot call setResolver()', async () => {
      const { nameWrapper, accounts } = await loadFixture(approveFixture)

      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])

      await expect(nameWrapper)
        .write('setResolver', [namehash(name), accounts[1].address], {
          account: accounts[1],
        })
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[1].address))
    })

    it('Approved address cannot call setTTL()', async () => {
      const { nameWrapper, accounts } = await loadFixture(approveFixture)

      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])

      await expect(nameWrapper)
        .write('setTTL', [namehash(name), 100n], { account: accounts[1] })
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[1].address))
    })

    it('Approved address cannot unwrap .eth', async () => {
      const { nameWrapper, accounts } = await loadFixture(approveFixture)

      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])

      await expect(nameWrapper)
        .write(
          'unwrapETH2LD',
          [labelhash(label), accounts[1].address, accounts[1].address],
          { account: accounts[1] },
        )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[1].address))
    })

    it('Approved address cannot unwrap non .eth', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture(
        approveFixture,
      )

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        expiry: 0n,
        fuses: CAN_DO_EVERYTHING,
      })
      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])

      await expect(nameWrapper)
        .write(
          'unwrap',
          [namehash(name), labelhash(sublabel), accounts[1].address],
          { account: accounts[1] },
        )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(subname), getAddress(accounts[1].address))
    })

    it('Approval is cleared on transfer', async () => {
      const { nameWrapper, accounts } = await loadFixture(approveFixture)

      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])

      await nameWrapper.write.safeTransferFrom([
        accounts[0].address,
        accounts[2].address,
        toNameId(name),
        1n,
        '0x',
      ])

      await expect(
        nameWrapper.read.getApproved([toNameId(name)]),
      ).resolves.toEqualAddress(zeroAddress)
    })

    it('Approval is cleared on unwrapETH2LD()', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture(
        approveFixture,
      )

      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])

      await expect(
        nameWrapper.read.getApproved([toNameId(name)]),
      ).resolves.toEqualAddress(accounts[1].address)

      await nameWrapper.write.unwrapETH2LD([
        labelhash(label),
        accounts[0].address,
        accounts[0].address,
      ])

      await expect(
        nameWrapper.read.getApproved([toNameId(name)]),
      ).resolves.toEqualAddress(zeroAddress)

      // rewrapping to test approval is still cleared
      await actions.wrapEth2ld({
        label,
        fuses: 0,
        owner: accounts[0].address,
        resolver: zeroAddress,
      })

      await expect(
        nameWrapper.read.getApproved([toNameId(name)]),
      ).resolves.toEqualAddress(zeroAddress)

      // reapprove to show approval can be reinstated
      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])

      await expect(
        nameWrapper.read.getApproved([toNameId(name)]),
      ).resolves.toEqualAddress(accounts[1].address)
    })

    it('Approval is cleared on unwrap()', async () => {
      const { nameWrapper, accounts, actions } = await loadFixture(
        approveFixture,
      )

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[0].address,
        expiry: 0n,
        fuses: CAN_DO_EVERYTHING,
      })

      await nameWrapper.write.approve([accounts[1].address, toNameId(subname)])
      await expect(
        nameWrapper.read.getApproved([toNameId(subname)]),
      ).resolves.toEqualAddress(accounts[1].address)

      await actions.unwrapName({
        parentName: name,
        label: sublabel,
        controller: accounts[0].address,
      })
      await expect(
        nameWrapper.read.getApproved([toNameId(subname)]),
      ).resolves.toEqualAddress(zeroAddress)

      await actions.setRegistryApprovalForWrapper()

      // rewrapping to test approval is still cleared
      await actions.wrapName({
        name: subname,
        owner: accounts[0].address,
        resolver: zeroAddress,
      })
      await expect(
        nameWrapper.read.getApproved([toNameId(subname)]),
      ).resolves.toEqualAddress(zeroAddress)

      // reapprove to show approval can be reinstated
      await nameWrapper.write.approve([accounts[1].address, toNameId(subname)])
      await expect(
        nameWrapper.read.getApproved([toNameId(subname)]),
      ).resolves.toEqualAddress(accounts[1].address)
    })

    it('Approval is cleared on re-registration and wrap of expired name', async () => {
      const { nameWrapper, accounts, actions, testClient } = await loadFixture(
        approveFixture,
      )

      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])
      await nameWrapper.write.setFuses([
        namehash(name),
        CANNOT_UNWRAP | CANNOT_APPROVE,
      ])
      await expect(
        nameWrapper.read.getApproved([toNameId(name)]),
      ).resolves.toEqualAddress(accounts[1].address)

      await testClient.increaseTime({
        seconds: Number(2n * DAY + GRACE_PERIOD),
      })
      await testClient.mine({ blocks: 1 })

      await expect(
        nameWrapper.read.getApproved([toNameId(name)]),
      ).resolves.toEqualAddress(zeroAddress)

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })
      // rewrapping to test approval is still cleared
      await actions.wrapEth2ld({
        label,
        fuses: CAN_DO_EVERYTHING,
        owner: accounts[0].address,
        resolver: zeroAddress,
      })

      await expect(
        nameWrapper.read.getApproved([toNameId(name)]),
      ).resolves.toEqualAddress(zeroAddress)

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])
    })

    it('Approval is not cleared on transfer if CANNOT_APPROVE is burnt', async () => {
      const { nameWrapper, accounts } = await loadFixture(approveFixture)

      await nameWrapper.write.approve([accounts[1].address, toNameId(name)])
      await nameWrapper.write.setFuses([
        namehash(name),
        CANNOT_UNWRAP | CANNOT_APPROVE,
      ])
      await expect(
        nameWrapper.read.getApproved([toNameId(name)]),
      ).resolves.toEqualAddress(accounts[1].address)

      await nameWrapper.write.safeTransferFrom([
        accounts[0].address,
        accounts[2].address,
        toNameId(name),
        1n,
        '0x',
      ])

      await expect(
        nameWrapper.read.getApproved([toNameId(name)]),
      ).resolves.toEqualAddress(accounts[1].address)
    })
  })
}
