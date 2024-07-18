import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { getAddress, labelhash, namehash, zeroAddress, zeroHash } from 'viem'
import { DAY } from '../fixtures/constants.js'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { toLabelId, toNameId } from '../fixtures/utils.js'
import { shouldRespectConstraints } from './Constraints.behaviour.js'
import { shouldBehaveLikeErc1155 } from './ERC1155.behaviour.js'
import { shouldSupportInterfaces } from './SupportsInterface.behaviour.js'
import {
  CANNOT_CREATE_SUBDOMAIN,
  CANNOT_TRANSFER,
  CANNOT_UNWRAP,
  CAN_DO_EVERYTHING,
  GRACE_PERIOD,
  MAX_EXPIRY,
  PARENT_CANNOT_CONTROL,
  expectOwnerOf,
  deployNameWrapperWithUtils as fixture,
  zeroAccount,
} from './fixtures/utils.js'

import { approveTests } from './functions/approve.js'
import { extendExpiryTests } from './functions/extendExpiry.js'
import { getApprovedTests } from './functions/getApproved.js'
import { getDataTests } from './functions/getData.js'
import { isWrappedTests } from './functions/isWrapped.js'
import { onERC721ReceivedTests } from './functions/onERC721Received.js'
import { ownerOfTests } from './functions/ownerOf.js'
import { registerAndWrapETH2LDTests } from './functions/registerAndWrapETH2LD.js'
import { renewTests } from './functions/renew.js'
import { setChildFusesTests } from './functions/setChildFuses.js'
import { setFusesTests } from './functions/setFuses.js'
import { setRecordTests } from './functions/setRecord.js'
import { setResolverTests } from './functions/setResolver.js'
import { setSubnodeOwnerTests } from './functions/setSubnodeOwner.js'
import { setSubnodeRecordTests } from './functions/setSubnodeRecord.js'
import { setTTLTests } from './functions/setTTL.js'
import { setUpgradeContractTests } from './functions/setUpgradeContract.js'
import { unwrapTests } from './functions/unwrap.js'
import { unwrapETH2LDTests } from './functions/unwrapETH2LD.js'
import { upgradeTests } from './functions/upgrade.js'
import { wrapTests } from './functions/wrap.js'
import { wrapETH2LDTests } from './functions/wrapETH2LD.js'

describe('NameWrapper', () => {
  shouldSupportInterfaces({
    contract: () => loadFixture(fixture).then(({ nameWrapper }) => nameWrapper),
    interfaces: ['INameWrapper', 'IERC721Receiver'],
  })

  shouldBehaveLikeErc1155({
    contracts: () =>
      loadFixture(fixture).then((contracts) => ({
        contract: contracts.nameWrapper,
        ...contracts,
      })),
    targetTokenIds: [
      toNameId('test1.eth'),
      toNameId('test2.eth'),
      toNameId('doesnotexist.eth'),
    ],
    mint: async (
      { accounts, actions },
      [firstTokenHolder, secondTokenHolder],
    ) => {
      await actions.setBaseRegistrarApprovalForWrapper()
      await actions.register({
        label: 'test1',
        owner: accounts[0].address,
        duration: 1n * DAY,
      })
      await actions.wrapEth2ld({
        label: 'test1',
        owner: firstTokenHolder,
        fuses: CAN_DO_EVERYTHING,
        resolver: zeroAddress,
      })
      await actions.register({
        label: 'test2',
        owner: accounts[0].address,
        duration: 1n * DAY,
      })
      await actions.wrapEth2ld({
        label: 'test2',
        owner: secondTokenHolder,
        fuses: CAN_DO_EVERYTHING,
        resolver: zeroAddress,
      })
    },
  })

  shouldRespectConstraints()

  approveTests()
  extendExpiryTests()
  getApprovedTests()
  getDataTests()
  isWrappedTests()
  onERC721ReceivedTests()
  ownerOfTests()
  registerAndWrapETH2LDTests()
  renewTests()
  setChildFusesTests()
  setFusesTests()
  setRecordTests()
  setResolverTests()
  setSubnodeOwnerTests()
  setSubnodeRecordTests()
  setTTLTests()
  setUpgradeContractTests()
  unwrapTests()
  unwrapETH2LDTests()
  upgradeTests()
  wrapTests()
  wrapETH2LDTests()

  describe('Transfer', () => {
    const label = 'transfer'
    const name = `${label}.eth`

    async function transferFixture() {
      const initial = await loadFixture(fixture)
      const { actions } = initial

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      return initial
    }

    it('safeTransfer cannot be called if CANNOT_TRANSFER is burned and is not expired', async () => {
      const { nameWrapper, accounts } = await loadFixture(transferFixture)

      await nameWrapper.write.setFuses([namehash(name), CANNOT_TRANSFER])

      await expect(nameWrapper)
        .write('safeTransferFrom', [
          accounts[0].address,
          accounts[1].address,
          toNameId(name),
          1n,
          '0x',
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(name))
    })

    it('safeBatchTransfer cannot be called if CANNOT_TRANSFER is burned and is not expired', async () => {
      const { nameWrapper, accounts } = await loadFixture(transferFixture)

      await nameWrapper.write.setFuses([namehash(name), CANNOT_TRANSFER])

      await expect(nameWrapper)
        .write('safeBatchTransferFrom', [
          accounts[0].address,
          accounts[1].address,
          [toNameId(name)],
          [1n],
          '0x',
        ])
        .toBeRevertedWithCustomError('OperationProhibited')
        .withArgs(namehash(name))
    })
  })

  describe('Controllable', () => {
    it('allows the owner to add and remove controllers', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setController', [accounts[0].address, true])
        .toEmitEvent('ControllerChanged')
        .withArgs(accounts[0].address, true)

      await expect(nameWrapper)
        .write('setController', [accounts[0].address, false])
        .toEmitEvent('ControllerChanged')
        .withArgs(accounts[0].address, false)
    })

    it('does not allow non-owners to add or remove controllers', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await nameWrapper.write.setController([accounts[0].address, true])

      await expect(nameWrapper)
        .write('setController', [accounts[1].address, true], {
          account: accounts[1],
        })
        .toBeRevertedWithString('Ownable: caller is not the owner')

      await expect(nameWrapper)
        .write('setController', [accounts[0].address, false], {
          account: accounts[1],
        })
        .toBeRevertedWithString('Ownable: caller is not the owner')
    })
  })

  describe('MetadataService', () => {
    it('uri() returns url', async () => {
      const { nameWrapper } = await loadFixture(fixture)

      await expect(nameWrapper.read.uri([123n])).resolves.toEqual(
        'https://ens.domains',
      )
    })

    it('owner can set a new MetadataService', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await nameWrapper.write.setMetadataService([accounts[1].address])

      await expect(nameWrapper.read.metadataService()).resolves.toEqualAddress(
        accounts[1].address,
      )
    })

    it('non-owner cannot set a new MetadataService', async () => {
      const { nameWrapper, accounts } = await loadFixture(fixture)

      await expect(nameWrapper)
        .write('setMetadataService', [accounts[1].address], {
          account: accounts[1],
        })
        .toBeRevertedWithString('Ownable: caller is not the owner')
    })
  })

  describe('NameWrapper.names preimage dictionary', () => {
    it('Does not allow manipulating the preimage db by manually setting owner as NameWrapper', async () => {
      const {
        baseRegistrar,
        ensRegistry,
        nameWrapper,
        accounts,
        testClient,
        publicClient,
        actions,
      } = await loadFixture(fixture)

      const label = 'base'
      const name = `${label}.eth`

      await actions.register({
        label,
        owner: accounts[2].address,
        duration: 1n * DAY,
      })
      await actions.setBaseRegistrarApprovalForWrapper({ account: 2 })
      await actions.wrapEth2ld({
        label,
        owner: accounts[2].address,
        fuses: CANNOT_UNWRAP,
        resolver: zeroAddress,
        account: 2,
      })

      await expectOwnerOf(label).on(baseRegistrar).toBe(nameWrapper)
      await expectOwnerOf(name).on(ensRegistry).toBe(nameWrapper)
      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[2])

      // signed a submomain for the hacker, with a soon-expired expiry
      const sublabel1 = 'sub1'
      const subname1 = `${sublabel1}.${name}` // sub1.base.eth
      const timestamp = await publicClient.getBlock().then((b) => b.timestamp)

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel1,
        owner: accounts[2].address,
        fuses: 0,
        expiry: timestamp + 3600n, // soonly expired
        account: 2,
      })

      await expectOwnerOf(subname1).on(ensRegistry).toBe(nameWrapper)
      await expectOwnerOf(subname1).on(nameWrapper).toBe(accounts[2])

      const [, fuses] = await nameWrapper.read.getData([toNameId(subname1)])
      expect(fuses).toEqual(0)

      // the hacker unwraps their wrappedSubTokenId
      await testClient.increaseTime({ seconds: 7200 })
      await actions.unwrapName({
        parentName: name,
        label: sublabel1,
        controller: accounts[2].address,
        account: 2,
      })
      await expectOwnerOf(subname1).on(ensRegistry).toBe(accounts[2])

      // the hacker setSubnodeOwner, to set the owner of subname2 as NameWrapper
      const sublabel2 = 'sub2'
      const subname2 = `${sublabel2}.${subname1}` // sub2.sub1.base.eth

      await actions.setSubnodeOwner.onEnsRegistry({
        parentName: subname1,
        label: sublabel2,
        owner: nameWrapper.address,
        account: 2,
      })

      await expectOwnerOf(subname2).on(ensRegistry).toBe(nameWrapper)

      // the hacker re-wraps the subname1
      await actions.setRegistryApprovalForWrapper({ account: 2 })
      await actions.wrapName({
        name: subname1,
        owner: accounts[2].address,
        resolver: zeroAddress,
        account: 2,
      })
      await expectOwnerOf(subname1).on(nameWrapper).toBe(accounts[2])

      // the hackers setSubnodeOwner
      // XXX: till now, the hacker gets sub2Domain with no name in Namewrapper
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: subname1,
        label: sublabel2,
        owner: accounts[2].address,
        fuses: CAN_DO_EVERYTHING,
        expiry: MAX_EXPIRY,
        account: 2,
      })
      await expectOwnerOf(subname2).on(nameWrapper).toBe(accounts[2])
      await expect(
        nameWrapper.read.names([namehash(subname2)]),
      ).resolves.toEqual(dnsEncodeName(subname2))

      // the hacker forge a fake root node
      const sublabel3 = 'eth'
      const subname3 = `${sublabel3}.${subname2}` // eth.sub2.sub1.base.eth

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: subname2,
        label: sublabel3,
        owner: accounts[2].address,
        fuses: CAN_DO_EVERYTHING,
        expiry: MAX_EXPIRY,
        account: 2,
      })

      await expectOwnerOf(subname3).on(nameWrapper).toBe(accounts[2])
      await expect(
        nameWrapper.read.names([namehash(subname3)]),
      ).resolves.toEqual(dnsEncodeName(subname3))
    })
  })

  describe('Grace period tests', () => {
    const label = 'test'
    const name = `${label}.eth`
    const sublabel = 'sub'
    const subname = `${sublabel}.${name}`

    async function gracePeriodFixture() {
      const initial = await loadFixture(fixture)
      const { nameWrapper, actions, accounts, testClient, publicClient } =
        initial

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const [, , parentExpiry] = await nameWrapper.read.getData([
        toNameId(name),
      ])

      // create a subdomain for other tests
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[1].address,
        fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
        expiry: parentExpiry - DAY / 2n,
      })

      // move .eth name to expired and be within grace period
      await testClient.increaseTime({ seconds: Number(2n * DAY) })
      await testClient.mine({ blocks: 1 })

      const timestamp = await publicClient.getBlock().then((b) => b.timestamp)

      // expect name to be expired, but inside grace period
      expect(parentExpiry - GRACE_PERIOD).toBeLessThan(timestamp)
      expect(parentExpiry + GRACE_PERIOD).toBeGreaterThan(timestamp)

      const [, , subExpiry] = await nameWrapper.read.getData([
        toNameId(subname),
      ])

      // subdomain is not expired
      expect(subExpiry).toBeGreaterThan(timestamp)

      return { ...initial, parentExpiry }
    }

    it('When a .eth name is in grace period it cannot call setSubnodeOwner', async () => {
      const { nameWrapper, parentExpiry, accounts } = await loadFixture(
        gracePeriodFixture,
      )

      await expect(nameWrapper)
        .write('setSubnodeOwner', [
          namehash(name),
          sublabel,
          accounts[1].address,
          PARENT_CANNOT_CONTROL,
          parentExpiry - DAY / 2n,
        ])
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[0].address))
    })

    it('When a .eth name is in grace period it cannot call setSubnodeRecord', async () => {
      const { nameWrapper, parentExpiry, accounts } = await loadFixture(
        gracePeriodFixture,
      )

      await expect(nameWrapper)
        .write('setSubnodeRecord', [
          namehash(name),
          sublabel,
          accounts[1].address,
          zeroAddress,
          0n,
          PARENT_CANNOT_CONTROL,
          parentExpiry - DAY / 2n,
        ])
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[0].address))
    })

    it('When a .eth name is in grace period it cannot call setRecord', async () => {
      const { nameWrapper, accounts } = await loadFixture(gracePeriodFixture)

      await expect(nameWrapper)
        .write('setRecord', [
          namehash(name),
          accounts[1].address,
          zeroAddress,
          0n,
        ])
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[0].address))
    })

    it('When a .eth name is in grace period it cannot call safeTransferFrom', async () => {
      const { nameWrapper, accounts } = await loadFixture(gracePeriodFixture)

      await expect(nameWrapper)
        .write('safeTransferFrom', [
          accounts[0].address,
          accounts[1].address,
          toNameId(name),
          1n,
          '0x',
        ])
        .toBeRevertedWithString('ERC1155: insufficient balance for transfer')
    })

    it('When a .eth name is in grace period it cannot call batchSafeTransferFrom', async () => {
      const { nameWrapper, accounts } = await loadFixture(gracePeriodFixture)

      await expect(nameWrapper)
        .write('safeBatchTransferFrom', [
          accounts[0].address,
          accounts[1].address,
          [toNameId(name)],
          [1n],
          '0x',
        ])
        .toBeRevertedWithString('ERC1155: insufficient balance for transfer')
    })

    it('When a .eth name is in grace period it cannot call setResolver', async () => {
      const { nameWrapper, accounts } = await loadFixture(gracePeriodFixture)

      await expect(nameWrapper)
        .write('setResolver', [namehash(name), zeroAddress])
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[0].address))
    })

    it('When a .eth name is in grace period it cannot call setTTL', async () => {
      const { nameWrapper, accounts } = await loadFixture(gracePeriodFixture)

      await expect(nameWrapper)
        .write('setTTL', [namehash(name), 0n])
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[0].address))
    })

    it('When a .eth name is in grace period it cannot call setFuses', async () => {
      const { nameWrapper, accounts } = await loadFixture(gracePeriodFixture)

      await expect(nameWrapper)
        .write('setFuses', [namehash(name), 0])
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[0].address))
    })

    it('When a .eth name is in grace period it cannot call setChildFuses', async () => {
      const { nameWrapper, accounts } = await loadFixture(gracePeriodFixture)

      await expect(nameWrapper)
        .write('setChildFuses', [namehash(name), labelhash(sublabel), 0, 0n])
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[0].address))
    })

    it('When a .eth name is in grace period, unexpired subdomains can call setFuses', async () => {
      const { nameWrapper, accounts } = await loadFixture(gracePeriodFixture)

      await nameWrapper.write.setFuses([namehash(subname), CANNOT_UNWRAP], {
        account: accounts[1],
      })

      const [, fuses] = await nameWrapper.read.getData([toNameId(subname)])
      expect(fuses).toEqual(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP)
    })

    it('When a .eth name is in grace period, unexpired subdomains can transfer', async () => {
      const { nameWrapper, accounts } = await loadFixture(gracePeriodFixture)

      await nameWrapper.write.safeTransferFrom(
        [accounts[1].address, accounts[0].address, toNameId(subname), 1n, '0x'],
        { account: accounts[1] },
      )

      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[0])
    })

    it('When a .eth name is in grace period, unexpired subdomains can set resolver', async () => {
      const { ensRegistry, nameWrapper, accounts } = await loadFixture(
        gracePeriodFixture,
      )

      await nameWrapper.write.setResolver(
        [namehash(subname), accounts[0].address],
        {
          account: accounts[1],
        },
      )

      await expect(
        ensRegistry.read.resolver([namehash(subname)]),
      ).resolves.toEqualAddress(accounts[0].address)
    })

    it('When a .eth name is in grace period, unexpired subdomains can set ttl', async () => {
      const { ensRegistry, nameWrapper, accounts } = await loadFixture(
        gracePeriodFixture,
      )

      await nameWrapper.write.setTTL([namehash(subname), 100n], {
        account: accounts[1],
      })

      await expect(ensRegistry.read.ttl([namehash(subname)])).resolves.toEqual(
        100n,
      )
    })

    it('When a .eth name is in grace period, unexpired subdomains can call setRecord', async () => {
      const { ensRegistry, nameWrapper, accounts } = await loadFixture(
        gracePeriodFixture,
      )

      await nameWrapper.write.setRecord(
        [namehash(subname), accounts[0].address, accounts[1].address, 100n],
        {
          account: accounts[1],
        },
      )

      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[0])
      await expectOwnerOf(subname).on(ensRegistry).toBe(nameWrapper)
      await expect(
        ensRegistry.read.resolver([namehash(subname)]),
      ).resolves.toEqualAddress(accounts[1].address)
      await expect(ensRegistry.read.ttl([namehash(subname)])).resolves.toBe(
        100n,
      )
    })

    it('When a .eth name is in grace period, unexpired subdomains can call setSubnodeOwner', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(
        gracePeriodFixture,
      )

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: subname,
        label: 'sub2',
        owner: accounts[1].address,
        fuses: 0,
        expiry: 0n,
        account: 1,
      })

      await expectOwnerOf(`sub2.${subname}`).on(nameWrapper).toBe(accounts[1])
    })

    it('When a .eth name is in grace period, unexpired subdomains can call setSubnodeRecord', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(
        gracePeriodFixture,
      )

      await actions.setSubnodeRecord.onNameWrapper({
        parentName: subname,
        label: 'sub2',
        owner: accounts[1].address,
        resolver: zeroAddress,
        ttl: 0n,
        fuses: 0,
        expiry: 0n,
        account: 1,
      })

      await expectOwnerOf(`sub2.${subname}`).on(nameWrapper).toBe(accounts[1])
    })

    it('When a .eth name is in grace period, unexpired subdomains can call setChildFuses if the subdomain exists', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(
        gracePeriodFixture,
      )

      await actions.setSubnodeOwner.onNameWrapper({
        parentName: subname,
        label: 'sub2',
        owner: accounts[1].address,
        fuses: 0,
        expiry: 0n,
        account: 1,
      })

      await nameWrapper.write.setChildFuses(
        [namehash(subname), labelhash('sub2'), 0, 100n],
        {
          account: accounts[1],
        },
      )

      const [owner, fuses, expiry] = await nameWrapper.read.getData([
        toNameId(`sub2.${subname}`),
      ])
      expect(owner).toEqualAddress(accounts[1].address)
      expect(expiry).toEqual(100n)
      expect(fuses).toEqual(0)
    })
  })

  describe('Registrar tests', () => {
    const label = 'sub1'
    const name = `${label}.eth`
    const sublabel = 'sub2'
    const subname = `${sublabel}.${name}`

    it('Reverts when attempting to call token owner protected function on an unwrapped name', async () => {
      const {
        ensRegistry,
        nameWrapper,
        baseRegistrar,
        actions,
        accounts,
        testClient,
      } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      // wait the ETH2LD expired and re-register to the hacker themselves
      await testClient.increaseTime({
        seconds: Number(GRACE_PERIOD + 1n * DAY + 1n),
      })
      await testClient.mine({ blocks: 1 })

      // XXX: note that at this step, the hackler should use the current .eth
      // registrar to directly register `sub1.eth` to himself, without wrapping
      // the name.
      await actions.register({
        label,
        owner: accounts[2].address,
        duration: 10n * DAY,
      })
      await expectOwnerOf(name).on(ensRegistry).toBe(accounts[2])
      await expectOwnerOf(label).on(baseRegistrar).toBe(accounts[2])

      // set `EnsRegistry.owner` as NameWrapper. Note that this step is used to
      // bypass the newly-introduced checks for [ZZ-001]
      //
      // XXX: corrently, `sub1.eth` becomes a normal node
      await ensRegistry.write.setOwner([namehash(name), nameWrapper.address], {
        account: accounts[2],
      })

      // create `sub2.sub1.eth` to the victim user with `PARENT_CANNOT_CONTROL`
      // burnt.
      await expect(nameWrapper)
        .write(
          'setSubnodeOwner',
          [
            namehash(name),
            sublabel,
            accounts[1].address,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
            MAX_EXPIRY,
          ],
          { account: accounts[2] },
        )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[2].address))
    })
  })

  describe('ERC1155 additional tests', () => {
    const label = 'erc1155'
    const name = `${label}.eth`

    it('Transferring a token that is not owned by the owner reverts', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      await expect(nameWrapper)
        .write(
          'safeTransferFrom',
          [accounts[2].address, accounts[0].address, toNameId(name), 1n, '0x'],
          { account: accounts[2] },
        )
        .toBeRevertedWithString('ERC1155: insufficient balance for transfer')
    })

    it('Approval on the Wrapper does not give permission to wrap the .eth name', async () => {
      const { nameWrapper, actions, accounts } = await loadFixture(fixture)

      await actions.register({
        label,
        owner: accounts[0].address,
        duration: 1n * DAY,
      })

      await nameWrapper.write.setApprovalForAll([accounts[2].address, true])

      await expect(nameWrapper)
        .write('wrapETH2LD', [label, accounts[2].address, 0, zeroAddress], {
          account: accounts[2],
        })
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(label + '.eth'), getAddress(accounts[2].address))
    })

    it('Approval on the Wrapper does not give permission to wrap a non .eth name', async () => {
      const { nameWrapper, ensRegistry, accounts, actions } = await loadFixture(
        fixture,
      )

      await expectOwnerOf('xyz').on(ensRegistry).toBe(accounts[0])

      await nameWrapper.write.setApprovalForAll([accounts[2].address, true])

      await actions.setRegistryApprovalForWrapper()

      await expect(nameWrapper)
        .write(
          'wrap',
          [dnsEncodeName('xyz'), accounts[2].address, zeroAddress],
          {
            account: accounts[2],
          },
        )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash('xyz'), getAddress(accounts[2].address))
    })

    it('When .eth name expires, it is untransferrable', async () => {
      const { nameWrapper, actions, accounts, testClient } = await loadFixture(
        fixture,
      )

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      await testClient.increaseTime({
        seconds: Number(GRACE_PERIOD + 1n * DAY + 1n),
      })
      await testClient.mine({ blocks: 1 })

      await expect(nameWrapper)
        .write('safeTransferFrom', [
          accounts[0].address,
          accounts[1].address,
          toNameId(name),
          1n,
          '0x',
        ])
        .toBeRevertedWithString('ERC1155: insufficient balance for transfer')
    })

    it('Approval on the Wrapper does not give permission to transfer after expiry', async () => {
      const { nameWrapper, actions, accounts, testClient } = await loadFixture(
        fixture,
      )

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })
      await nameWrapper.write.setApprovalForAll([accounts[2].address, true])

      await testClient.increaseTime({
        seconds: Number(GRACE_PERIOD + 1n * DAY + 1n),
      })
      await testClient.mine({ blocks: 1 })

      await expect(nameWrapper)
        .write('safeTransferFrom', [
          accounts[0].address,
          accounts[1].address,
          toNameId(name),
          1n,
          '0x',
        ])
        .toBeRevertedWithString('ERC1155: insufficient balance for transfer')

      await expect(nameWrapper)
        .write(
          'safeTransferFrom',
          [accounts[0].address, accounts[2].address, toNameId(name), 1n, '0x'],
          { account: accounts[2] },
        )
        .toBeRevertedWithString('ERC1155: insufficient balance for transfer')
    })

    it('When emancipated names expire, they are untransferrible', async () => {
      const { nameWrapper, actions, accounts, testClient, publicClient } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      const timestamp = await publicClient.getBlock().then((b) => b.timestamp)
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: 'test',
        owner: accounts[0].address,
        fuses: PARENT_CANNOT_CONTROL,
        expiry: 3600n + timestamp,
      })

      await testClient.increaseTime({ seconds: 3601 })
      await testClient.mine({ blocks: 1 })

      await expect(nameWrapper)
        .write('safeTransferFrom', [
          accounts[0].address,
          accounts[1].address,
          toNameId(`test.${name}`),
          1n,
          '0x',
        ])
        .toBeRevertedWithString('ERC1155: insufficient balance for transfer')
    })

    it('Returns a balance of 0 for expired names', async () => {
      const { nameWrapper, actions, accounts, testClient } = await loadFixture(
        fixture,
      )

      await actions.registerSetupAndWrapName({
        label,
        fuses: CAN_DO_EVERYTHING,
      })

      await expect(
        nameWrapper.read.balanceOf([accounts[0].address, toNameId(name)]),
      ).resolves.toEqual(1n)

      await testClient.increaseTime({ seconds: Number(86401n + GRACE_PERIOD) })
      await testClient.mine({ blocks: 1 })

      await expect(
        nameWrapper.read.balanceOf([accounts[0].address, toNameId(name)]),
      ).resolves.toEqual(0n)
    })

    it('Reregistering an expired name does not inherit its previous parent fuses', async () => {
      const { nameWrapper, actions, accounts, testClient, publicClient } =
        await loadFixture(fixture)

      await actions.registerSetupAndWrapName({
        label,
        fuses: CANNOT_UNWRAP,
      })

      // Mint the subdomain
      const timestamp1 = await publicClient.getBlock().then((b) => b.timestamp)
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: 'test',
        owner: accounts[0].address,
        fuses: PARENT_CANNOT_CONTROL,
        expiry: 3600n + timestamp1,
      })

      // Let it expire
      await testClient.increaseTime({ seconds: 3601 })
      await testClient.mine({ blocks: 1 })

      // Mint it again, without PCC
      const timestamp2 = await publicClient.getBlock().then((b) => b.timestamp)
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: 'test',
        owner: accounts[0].address,
        fuses: 0,
        expiry: 3600n + timestamp2,
      })

      // Check PCC isn't set
      const [, fuses] = await nameWrapper.read.getData([
        toNameId(`test.${name}`),
      ])
      expect(fuses).toEqual(0)
    })
  })

  describe('Implicit unwrap tests', () => {
    const label = 'sub1'
    const name = `${label}.eth`
    const sublabel = 'sub2'
    const subname = `${sublabel}.${name}`

    async function implicitUnwrapFixture() {
      const initial = await loadFixture(fixture)
      const { nameWrapper, baseRegistrar, accounts } = initial

      await baseRegistrar.write.addController([nameWrapper.address])
      await nameWrapper.write.setController([accounts[0].address, true])

      return initial
    }

    it('Trying to burn child fuses when re-registering a name on the old controller reverts', async () => {
      const {
        ensRegistry,
        nameWrapper,
        baseRegistrar,
        actions,
        accounts,
        testClient,
      } = await loadFixture(implicitUnwrapFixture)

      await nameWrapper.write.registerAndWrapETH2LD([
        label,
        accounts[2].address,
        1n * DAY,
        zeroAddress,
        CANNOT_UNWRAP,
      ])

      // create `sub2.sub1.eth` w/o fuses burnt
      await actions.setSubnodeOwner.onNameWrapper({
        parentName: name,
        label: sublabel,
        owner: accounts[2].address,
        fuses: CAN_DO_EVERYTHING,
        expiry: MAX_EXPIRY,
        account: 2,
      })

      await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[2])

      // wait the ETH2LD expired and re-register to the hacker themselves
      await testClient.increaseTime({
        seconds: Number(GRACE_PERIOD + 1n * DAY + 1n),
      })
      await testClient.mine({ blocks: 1 })

      // XXX: note that at this step, the hacker should use the current .eth
      // registrar to directly register `sub1.eth` to themselves, without wrapping
      // the name.
      await actions.register({
        label,
        owner: accounts[2].address,
        duration: 10n * DAY,
      })
      await expectOwnerOf(name).on(ensRegistry).toBe(accounts[2])
      await expectOwnerOf(label).on(baseRegistrar).toBe(accounts[2])

      // XXX: PREPARE HACK!
      // set `EnsRegistry.owner` of `sub1.eth` as the hacker themselves.
      await ensRegistry.write.setOwner([namehash(name), accounts[2].address], {
        account: accounts[2],
      })

      // XXX: PREPARE HACK!
      // set controller owner as the NameWrapper contract, to bypass the check
      await baseRegistrar.write.transferFrom(
        [accounts[2].address, nameWrapper.address, toLabelId(label)],
        { account: accounts[2] },
      )
      await expectOwnerOf(label).on(baseRegistrar).toBe(nameWrapper)

      // set `sub2.sub1.eth` to the victim user w fuses burnt
      // XXX: do this via `setChildFuses`
      // Cannot setChildFuses as the owner has not been updated in the wrapper when reregistering
      await expect(nameWrapper)
        .write(
          'setChildFuses',
          [
            namehash(name),
            labelhash(sublabel),
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CANNOT_CREATE_SUBDOMAIN,
            MAX_EXPIRY,
          ],
          { account: accounts[2] },
        )
        .toBeRevertedWithCustomError('Unauthorised')
        .withArgs(namehash(name), getAddress(accounts[2].address))
    })

    it('Renewing a wrapped, but expired name .eth in the wrapper, but unexpired on the registrar resyncs expiry', async () => {
      const { ensRegistry, nameWrapper, baseRegistrar, accounts, testClient } =
        await loadFixture(implicitUnwrapFixture)

      await nameWrapper.write.registerAndWrapETH2LD([
        label,
        accounts[0].address,
        1n * DAY,
        zeroAddress,
        CANNOT_UNWRAP,
      ])

      await baseRegistrar.write.renew([toLabelId(label), 365n * DAY])

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      // expired but in grace period
      await testClient.increaseTime({
        seconds: Number(GRACE_PERIOD + 1n * DAY + 1n),
      })
      await testClient.mine({ blocks: 1 })

      await expectOwnerOf(name).on(nameWrapper).toBe(zeroAccount)
      await expectOwnerOf(label).on(baseRegistrar).toBe(nameWrapper)
      await expectOwnerOf(name).on(ensRegistry).toBe(nameWrapper)

      await nameWrapper.write.renew([toLabelId(label), 1n])

      await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])

      const [, , expiry] = await nameWrapper.read.getData([toNameId(name)])
      const registrarExpiry = await baseRegistrar.read.nameExpires([
        toLabelId(label),
      ])

      expect(expiry).toEqual(registrarExpiry + GRACE_PERIOD)
    })
  })

  describe('TLD recovery', () => {
    it('Wraps a name which get stuck forever can be recovered by ROOT owner', async () => {
      const { ensRegistry, nameWrapper, accounts, actions } = await loadFixture(
        fixture,
      )

      await expectOwnerOf('xyz').on(nameWrapper).toBe(zeroAccount)

      await actions.setRegistryApprovalForWrapper()
      await actions.wrapName({
        name: 'xyz',
        owner: accounts[0].address,
        resolver: zeroAddress,
      })

      await expectOwnerOf('xyz').on(nameWrapper).toBe(accounts[0])

      await nameWrapper.write.setChildFuses([
        zeroHash,
        labelhash('xyz'),
        PARENT_CANNOT_CONTROL,
        0n,
      ])

      await expectOwnerOf('xyz').on(nameWrapper).toBe(zeroAccount)
      await expectOwnerOf('xyz').on(ensRegistry).toBe(nameWrapper)

      await expect(nameWrapper)
        .write('setChildFuses', [
          zeroHash,
          labelhash('xyz'),
          PARENT_CANNOT_CONTROL,
          100000000000000n,
        ])
        .toBeRevertedWithCustomError('NameIsNotWrapped')

      await ensRegistry.write.setSubnodeOwner([
        zeroHash,
        labelhash('xyz'),
        accounts[1].address,
      ])
      await actions.setRegistryApprovalForWrapper({ account: 1 })
      await actions.wrapName({
        name: 'xyz',
        owner: accounts[1].address,
        resolver: zeroAddress,
        account: 1,
      })

      await expectOwnerOf('xyz').on(nameWrapper).toBe(accounts[1])
      await expectOwnerOf('xyz').on(ensRegistry).toBe(nameWrapper)
    })
  })
})
