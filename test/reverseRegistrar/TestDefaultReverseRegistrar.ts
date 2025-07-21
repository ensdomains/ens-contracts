import { shouldSupportInterfaces } from '@ensdomains/hardhat-chai-matchers-viem/behaviour'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import {
  encodeFunctionData,
  encodePacked,
  getAddress,
  keccak256,
  toFunctionSelector,
  type AbiFunction,
  type Address,
  type Hex,
} from 'viem'
import { serializeErc6492Signature } from 'viem/experimental'
import { deployUniversalSigValidator } from '../fixtures/universalSigValidator.js'

async function fixture() {
  const accounts = await hre.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))

  await deployUniversalSigValidator()

  const defaultReverseRegistrar = await hre.viem.deployContract(
    'DefaultReverseRegistrar',
  )
  const mockSmartContractAccount = await hre.viem.deployContract(
    'MockSmartContractWallet',
    [accounts[0].address],
  )
  const mockErc6492WalletFactory = await hre.viem.deployContract(
    'MockERC6492WalletFactory',
  )

  return {
    defaultReverseRegistrar,
    mockSmartContractAccount,
    mockErc6492WalletFactory,
    accounts,
  }
}

const createMessageHash = ({
  contractAddress,
  functionSelector,
  address,
  signatureExpiry,
  name,
}: {
  contractAddress: Address
  functionSelector: Hex
  address: Address
  signatureExpiry: bigint
  name: string
}) =>
  keccak256(
    encodePacked(
      ['address', 'bytes4', 'address', 'uint256', 'string'],
      [contractAddress, functionSelector, address, signatureExpiry, name],
    ),
  )

describe('DefaultReverseRegistrar', () => {
  shouldSupportInterfaces({
    contract: () =>
      loadFixture(fixture).then(
        ({ defaultReverseRegistrar }) => defaultReverseRegistrar,
      ),
    interfaces: [
      'IDefaultReverseRegistrar',
      '@openzeppelin/contracts-v5/utils/introspection/IERC165.sol:IERC165',
      'IStandaloneReverseRegistrar',
    ],
  })

  it('should deploy the contract', async () => {
    const { defaultReverseRegistrar } = await loadFixture(fixture)

    expect(defaultReverseRegistrar.address).not.toBeUndefined()
  })

  describe('setName', () => {
    async function setNameFixture() {
      const initial = await loadFixture(fixture)

      const name = 'myname.eth'

      return {
        ...initial,
        name,
      }
    }

    it('should set the name record for the calling account', async () => {
      const { defaultReverseRegistrar, name, accounts } = await loadFixture(
        setNameFixture,
      )

      await defaultReverseRegistrar.write.setName([name])

      await expect(
        defaultReverseRegistrar.read.nameForAddr([accounts[0].address]),
      ).resolves.toBe(name)
    })

    it('event NameForAddrChanged is emitted', async () => {
      const { defaultReverseRegistrar, name, accounts } = await loadFixture(
        setNameFixture,
      )

      await expect(defaultReverseRegistrar)
        .write('setName', [name])
        .toEmitEvent('NameForAddrChanged')
        .withArgs(getAddress(accounts[0].address), name)
    })
  })

  describe('setNameForAddrWithSignature', () => {
    async function setNameForAddrWithSignatureFixture() {
      const initial = await loadFixture(fixture)
      const { defaultReverseRegistrar, accounts } = initial

      const name = 'myname.eth'
      const functionSelector = toFunctionSelector(
        defaultReverseRegistrar.abi.find(
          (f) =>
            f.type === 'function' && f.name === 'setNameForAddrWithSignature',
        ) as AbiFunction,
      )

      const publicClient = await hre.viem.getPublicClient()
      const blockTimestamp = await publicClient
        .getBlock()
        .then((b) => b.timestamp)
      const signatureExpiry = blockTimestamp + 3600n

      const [walletClient] = await hre.viem.getWalletClients()
      const messageHash = createMessageHash({
        contractAddress: defaultReverseRegistrar.address,
        functionSelector,
        address: accounts[0].address,
        signatureExpiry,
        name,
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      return {
        ...initial,
        name,
        functionSelector,
        signatureExpiry,
        signature,
        walletClient,
      }
    }

    it('allows an account to sign a message to allow a relayer to claim the address', async () => {
      const {
        defaultReverseRegistrar,
        name,
        signatureExpiry,
        signature,
        accounts,
      } = await loadFixture(setNameForAddrWithSignatureFixture)

      await defaultReverseRegistrar.write.setNameForAddrWithSignature(
        [accounts[0].address, signatureExpiry, name, signature],
        { account: accounts[1] },
      )

      await expect(
        defaultReverseRegistrar.read.nameForAddr([accounts[0].address]),
      ).resolves.toBe(name)
    })

    it('event NameForAddrChanged is emitted', async () => {
      const {
        defaultReverseRegistrar,
        name,
        signatureExpiry,
        signature,
        accounts,
      } = await loadFixture(setNameForAddrWithSignatureFixture)

      await expect(defaultReverseRegistrar)
        .write(
          'setNameForAddrWithSignature',
          [accounts[0].address, signatureExpiry, name, signature],
          { account: accounts[1] },
        )
        .toEmitEvent('NameForAddrChanged')
        .withArgs(getAddress(accounts[0].address), name)
    })

    it('allows SCA signatures', async () => {
      const {
        defaultReverseRegistrar,
        name,
        signatureExpiry,
        functionSelector,
        accounts,
        mockSmartContractAccount,
        walletClient,
      } = await loadFixture(setNameForAddrWithSignatureFixture)

      const messageHash = createMessageHash({
        contractAddress: defaultReverseRegistrar.address,
        functionSelector,
        address: mockSmartContractAccount.address,
        signatureExpiry,
        name,
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(defaultReverseRegistrar)
        .write(
          'setNameForAddrWithSignature',
          [mockSmartContractAccount.address, signatureExpiry, name, signature],
          { account: accounts[1] },
        )
        .toEmitEvent('NameForAddrChanged')
        .withArgs(getAddress(mockSmartContractAccount.address), name)

      await expect(
        defaultReverseRegistrar.read.nameForAddr([
          mockSmartContractAccount.address,
        ]),
      ).resolves.toBe(name)
    })

    it('allows undeployed SCA signatures (ERC6492)', async () => {
      const {
        defaultReverseRegistrar,
        name,
        signatureExpiry,
        functionSelector,
        accounts,
        mockErc6492WalletFactory,
        walletClient,
      } = await loadFixture(setNameForAddrWithSignatureFixture)

      const predictedAddress =
        await mockErc6492WalletFactory.read.predictAddress([
          accounts[0].address,
        ])

      const messageHash = createMessageHash({
        contractAddress: defaultReverseRegistrar.address,
        functionSelector,
        address: predictedAddress,
        signatureExpiry,
        name,
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      const wrappedSignature = serializeErc6492Signature({
        address: mockErc6492WalletFactory.address,
        data: encodeFunctionData({
          abi: mockErc6492WalletFactory.abi,
          functionName: 'createWallet',
          args: [accounts[0].address],
        }),
        signature,
      })

      await expect(defaultReverseRegistrar)
        .write(
          'setNameForAddrWithSignature',
          [predictedAddress, signatureExpiry, name, wrappedSignature],
          { account: accounts[1] },
        )
        .toEmitEvent('NameForAddrChanged')
        .withArgs(getAddress(predictedAddress), name)

      await expect(
        defaultReverseRegistrar.read.nameForAddr([predictedAddress]),
      ).resolves.toBe(name)
    })

    it('reverts if signature parameters do not match', async () => {
      const {
        defaultReverseRegistrar,
        name,
        functionSelector,
        signatureExpiry,
        walletClient,
        accounts,
      } = await loadFixture(setNameForAddrWithSignatureFixture)

      const messageHash = keccak256(
        encodePacked(
          ['address', 'bytes4', 'string', 'address', 'uint256'],
          [
            defaultReverseRegistrar.address,
            functionSelector,
            name,
            accounts[0].address,
            signatureExpiry,
          ],
        ),
      )
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(defaultReverseRegistrar)
        .write(
          'setNameForAddrWithSignature',
          [accounts[0].address, signatureExpiry, name, signature],
          { account: accounts[1] },
        )
        .toBeRevertedWithCustomError('InvalidSignature')
    })

    it('reverts if expiry date is too low', async () => {
      const {
        defaultReverseRegistrar,
        name,
        functionSelector,
        accounts,
        walletClient,
      } = await loadFixture(setNameForAddrWithSignatureFixture)

      const signatureExpiry = 0n

      const messageHash = createMessageHash({
        contractAddress: defaultReverseRegistrar.address,
        functionSelector,
        address: accounts[0].address,
        signatureExpiry,
        name,
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(defaultReverseRegistrar)
        .write(
          'setNameForAddrWithSignature',
          [accounts[0].address, signatureExpiry, name, signature],
          { account: accounts[1] },
        )
        .toBeRevertedWithCustomError('SignatureExpired')
    })

    it('reverts if expiry date is too high', async () => {
      const {
        defaultReverseRegistrar,
        name,
        functionSelector,
        signatureExpiry: oldSignatureExpiry,
        accounts,
        walletClient,
      } = await loadFixture(setNameForAddrWithSignatureFixture)

      const signatureExpiry = oldSignatureExpiry + 86401n

      const messageHash = createMessageHash({
        contractAddress: defaultReverseRegistrar.address,
        functionSelector,
        address: accounts[0].address,
        signatureExpiry,
        name,
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(defaultReverseRegistrar)
        .write(
          'setNameForAddrWithSignature',
          [accounts[0].address, signatureExpiry, name, signature],
          { account: accounts[1] },
        )
        .toBeRevertedWithCustomError('SignatureExpiryTooHigh')
    })
  })
})
