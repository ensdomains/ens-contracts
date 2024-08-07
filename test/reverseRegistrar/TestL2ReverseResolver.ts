import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import {
  encodePacked,
  getAddress,
  keccak256,
  namehash,
  toFunctionSelector,
  type AbiFunction,
  type Address,
  type Hex,
} from 'viem'

const coinType = 123n

async function fixture() {
  const accounts = await hre.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))

  const l2ReverseResolver = await hre.viem.deployContract('L2ReverseResolver', [
    namehash('optimism.reverse'),
    coinType,
  ])
  const mockSmartContractWallet = await hre.viem.deployContract(
    'MockSmartContractWallet',
    [accounts[0].address],
  )
  const mockOwnable = await hre.viem.deployContract('MockOwnable', [
    mockSmartContractWallet.address,
  ])

  return {
    l2ReverseResolver,
    mockSmartContractWallet,
    mockOwnable,
    accounts,
  }
}

const createMessageHash = ({
  contractAddress,
  functionSelector,
  name,
  address,
  inceptionDate,
}: {
  contractAddress: Address
  functionSelector: Hex
  name: string
  address: Address
  inceptionDate: bigint
}) =>
  keccak256(
    encodePacked(
      ['address', 'bytes4', 'string', 'address', 'uint256', 'uint256'],
      [
        contractAddress,
        functionSelector,
        name,
        address,
        inceptionDate,
        coinType,
      ],
    ),
  )

describe('L2ReverseResolver', () => {
  it('should deploy the contract', async () => {
    const { l2ReverseResolver } = await loadFixture(fixture)

    expect(l2ReverseResolver.address).not.toBeUndefined()
  })

  describe('setName', () => {
    async function setNameFixture() {
      const initial = await loadFixture(fixture)
      const { l2ReverseResolver, accounts } = initial

      const name = 'myname.eth'
      const node = await l2ReverseResolver.read.node([accounts[0].address])

      return {
        ...initial,
        name,
        node,
      }
    }

    it('should set the name record for the calling account', async () => {
      const { l2ReverseResolver, name, node } = await loadFixture(
        setNameFixture,
      )

      await l2ReverseResolver.write.setName([name])

      await expect(l2ReverseResolver.read.name([node])).resolves.toBe(name)
    })

    it('event ReverseClaimed is emitted', async () => {
      const { l2ReverseResolver, name, node, accounts } = await loadFixture(
        setNameFixture,
      )

      await expect(l2ReverseResolver)
        .write('setName', [name])
        .toEmitEvent('ReverseClaimed')
        .withArgs(getAddress(accounts[0].address), node)
    })
  })

  describe('setNameForAddrWithSignature', () => {
    async function setNameForAddrWithSignatureFixture() {
      const initial = await loadFixture(fixture)
      const { l2ReverseResolver, accounts } = initial

      const name = 'myname.eth'
      const node = await l2ReverseResolver.read.node([accounts[0].address])
      const functionSelector = toFunctionSelector(
        l2ReverseResolver.abi.find(
          (f) =>
            f.type === 'function' && f.name === 'setNameForAddrWithSignature',
        ) as AbiFunction,
      )

      const publicClient = await hre.viem.getPublicClient()
      const inceptionDate = await publicClient
        .getBlock()
        .then((b) => b.timestamp)

      const [walletClient] = await hre.viem.getWalletClients()
      const messageHash = createMessageHash({
        contractAddress: l2ReverseResolver.address,
        functionSelector,
        name,
        address: accounts[0].address,
        inceptionDate,
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      return {
        ...initial,
        name,
        node,
        functionSelector,
        inceptionDate,
        signature,
        walletClient,
      }
    }

    it('allows an account to sign a message to allow a relayer to claim the address', async () => {
      const {
        l2ReverseResolver,
        name,
        node,
        inceptionDate,
        signature,
        accounts,
      } = await loadFixture(setNameForAddrWithSignatureFixture)

      await l2ReverseResolver.write.setNameForAddrWithSignature(
        [accounts[0].address, name, inceptionDate, signature],
        { account: accounts[1] },
      )

      await expect(l2ReverseResolver.read.name([node])).resolves.toBe(name)
    })

    it('event ReverseClaimed is emitted', async () => {
      const {
        l2ReverseResolver,
        name,
        node,
        inceptionDate,
        signature,
        accounts,
      } = await loadFixture(setNameForAddrWithSignatureFixture)

      await expect(l2ReverseResolver)
        .write(
          'setNameForAddrWithSignature',
          [accounts[0].address, name, inceptionDate, signature],
          { account: accounts[1] },
        )
        .toEmitEvent('ReverseClaimed')
        .withArgs(getAddress(accounts[0].address), node)
    })

    it('reverts if signature parameters do not match', async () => {
      const {
        l2ReverseResolver,
        name,
        functionSelector,
        inceptionDate,
        walletClient,
        accounts,
      } = await loadFixture(setNameForAddrWithSignatureFixture)

      const newInceptionDate = inceptionDate + 3600n
      const messageHash = keccak256(
        encodePacked(
          ['address', 'bytes4', 'string', 'address', 'uint256'],
          [
            l2ReverseResolver.address,
            functionSelector,
            name,
            accounts[0].address,
            newInceptionDate,
          ],
        ),
      )
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(l2ReverseResolver)
        .write(
          'setNameForAddrWithSignature',
          [accounts[0].address, name, newInceptionDate, signature],
          { account: accounts[1] },
        )
        .toBeRevertedWithCustomError('InvalidSignature')
    })

    it('reverts if inception date is too low', async () => {
      const {
        l2ReverseResolver,
        name,
        node,
        functionSelector,
        inceptionDate,
        signature,
        accounts,
        walletClient,
      } = await loadFixture(setNameForAddrWithSignatureFixture)

      await l2ReverseResolver.write.setNameForAddrWithSignature(
        [accounts[0].address, name, inceptionDate, signature],
        { account: accounts[1] },
      )

      await expect(l2ReverseResolver.read.name([node])).resolves.toBe(name)

      const inceptionDate2 = 0n
      const messageHash2 = createMessageHash({
        contractAddress: l2ReverseResolver.address,
        functionSelector,
        name,
        address: accounts[0].address,
        inceptionDate: inceptionDate2,
      })
      const signature2 = await walletClient.signMessage({
        message: { raw: messageHash2 },
      })

      await expect(l2ReverseResolver)
        .write(
          'setNameForAddrWithSignature',
          [accounts[0].address, name, inceptionDate2, signature2],
          { account: accounts[1] },
        )
        .toBeRevertedWithCustomError('InvalidSignatureDate')
    })
  })

  describe('setNameForAddrWithSignatureAndOwnable', () => {
    async function setNameForAddrWithSignatureAndOwnableFixture() {
      const initial = await loadFixture(fixture)
      const { l2ReverseResolver, mockOwnable, mockSmartContractWallet } =
        initial

      const name = 'ownable.eth'
      const node = await l2ReverseResolver.read.node([mockOwnable.address])
      const functionSelector = toFunctionSelector(
        l2ReverseResolver.abi.find(
          (f) =>
            f.type === 'function' &&
            f.name === 'setNameForAddrWithSignatureAndOwnable',
        ) as AbiFunction,
      )

      const publicClient = await hre.viem.getPublicClient()
      const inceptionDate = await publicClient
        .getBlock()
        .then((b) => b.timestamp)

      const messageHash = keccak256(
        encodePacked(
          [
            'address',
            'bytes4',
            'string',
            'address',
            'address',
            'uint256',
            'uint256',
          ],
          [
            l2ReverseResolver.address,
            functionSelector,
            name,
            mockOwnable.address,
            mockSmartContractWallet.address,
            inceptionDate,
            coinType,
          ],
        ),
      )

      const [walletClient] = await hre.viem.getWalletClients()
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      return {
        ...initial,
        name,
        node,
        functionSelector,
        inceptionDate,
        signature,
        walletClient,
      }
    }

    it('allows an account to sign a message to allow a relayer to claim the address of a contract that is owned by another contract that the account is a signer of', async () => {
      const {
        l2ReverseResolver,
        name,
        node,
        inceptionDate,
        signature,
        accounts,
        mockOwnable,
        mockSmartContractWallet,
      } = await loadFixture(setNameForAddrWithSignatureAndOwnableFixture)

      await l2ReverseResolver.write.setNameForAddrWithSignatureAndOwnable(
        [
          mockOwnable.address,
          mockSmartContractWallet.address,
          name,
          inceptionDate,
          signature,
        ],
        { account: accounts[1] },
      )

      await expect(l2ReverseResolver.read.name([node])).resolves.toBe(name)
    })

    it('event ReverseClaimed is emitted', async () => {
      const {
        l2ReverseResolver,
        name,
        node,
        inceptionDate,
        signature,
        accounts,
        mockOwnable,
        mockSmartContractWallet,
      } = await loadFixture(setNameForAddrWithSignatureAndOwnableFixture)

      await expect(l2ReverseResolver)
        .write(
          'setNameForAddrWithSignatureAndOwnable',
          [
            mockOwnable.address,
            mockSmartContractWallet.address,
            name,
            inceptionDate,
            signature,
          ],
          { account: accounts[1] },
        )
        .toEmitEvent('ReverseClaimed')
        .withArgs(getAddress(mockOwnable.address), node)
    })
  })
})
