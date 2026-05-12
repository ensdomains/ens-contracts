import { shouldSupportInterfaces } from '@ensdomains/hardhat-chai-matchers-viem/behaviour'
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
import { serializeErc6492Signature } from 'viem'
import {
  deployUniversalSigValidator,
  getUniversalSigValidatorAddress,
} from '../fixtures/universalSigValidator.js'

const connection = await hre.network.connect()

async function fixture() {
  const accounts = await connection.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))

  await deployUniversalSigValidator()

  const defaultReverseRegistrar = await connection.viem.deployContract(
    'DefaultReverseRegistrar',
  )
  const mockSmartContractAccount = await connection.viem.deployContract(
    'MockSmartContractWallet',
    [accounts[0].address],
  )
  const mockErc6492WalletFactory = await connection.viem.deployContract(
    'MockERC6492WalletFactory',
  )

  return {
    defaultReverseRegistrar,
    mockSmartContractAccount,
    mockErc6492WalletFactory,
    accounts,
  }
}

const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

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
      loadFixture().then(
        ({ defaultReverseRegistrar }) => defaultReverseRegistrar,
      ),
    interfaces: [
      'IDefaultReverseRegistrar',
      'IERC165',
      'IStandaloneReverseRegistrar',
    ],
  })

  it('should deploy the contract', async () => {
    const { defaultReverseRegistrar } =
      await connection.networkHelpers.loadFixture(fixture)

    expect(defaultReverseRegistrar.address).not.toBeUndefined()
  })

  describe('setName', () => {
    async function setNameFixture() {
      const initial = await connection.networkHelpers.loadFixture(fixture)

      const name = 'myname.eth'

      return {
        ...initial,
        name,
      }
    }

    it('should set the name record for the calling account', async () => {
      const { defaultReverseRegistrar, name, accounts } =
        await connection.networkHelpers.loadFixture(setNameFixture)

      await defaultReverseRegistrar.write.setName([name])

      await expect(
        defaultReverseRegistrar.read.nameForAddr([accounts[0].address]),
      ).resolves.toStrictEqual(name)
    })

    it('event NameForAddrChanged is emitted', async () => {
      const { defaultReverseRegistrar, name, accounts } =
        await connection.networkHelpers.loadFixture(setNameFixture)

      await expect(defaultReverseRegistrar.write.setName([name])).toEmitEvent(
        'NameForAddrChanged',
      )
      // .withArgs(getAddress(accounts[0].address), name)
    })
  })

  describe('setNameForAddrWithSignature', () => {
    async function setNameForAddrWithSignatureFixture() {
      const initial = await connection.networkHelpers.loadFixture(fixture)
      const { defaultReverseRegistrar, accounts } = initial

      const name = 'myname.eth'
      const functionSelector = toFunctionSelector(
        defaultReverseRegistrar.abi.find(
          (f) =>
            f.type === 'function' && f.name === 'setNameForAddrWithSignature',
        ) as AbiFunction,
      )

      const publicClient = await connection.viem.getPublicClient()
      const blockTimestamp = await publicClient
        .getBlock()
        .then((b) => b.timestamp)
      const signatureExpiry = blockTimestamp + 3600n

      const [walletClient] = await connection.viem.getWalletClients()
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
      } = await connection.networkHelpers.loadFixture(
        setNameForAddrWithSignatureFixture,
      )

      await defaultReverseRegistrar.write.setNameForAddrWithSignature(
        [accounts[0].address, signatureExpiry, name, signature],
        { account: accounts[1] },
      )

      await expect(
        defaultReverseRegistrar.read.nameForAddr([accounts[0].address]),
      ).resolves.toStrictEqual(name)
    })

    it('event NameForAddrChanged is emitted', async () => {
      const {
        defaultReverseRegistrar,
        name,
        signatureExpiry,
        signature,
        accounts,
      } = await connection.networkHelpers.loadFixture(
        setNameForAddrWithSignatureFixture,
      )

      await expect(
        defaultReverseRegistrar.write.setNameForAddrWithSignature(
          [accounts[0].address, signatureExpiry, name, signature],
          { account: accounts[1] },
        ),
      ).toEmitEvent('NameForAddrChanged')
      // .withArgs(getAddress(accounts[0].address), name)
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
      } = await connection.networkHelpers.loadFixture(
        setNameForAddrWithSignatureFixture,
      )

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

      await expect(
        defaultReverseRegistrar.write.setNameForAddrWithSignature(
          [mockSmartContractAccount.address, signatureExpiry, name, signature],
          { account: accounts[1] },
        ),
      ).toEmitEvent('NameForAddrChanged')
      // .withArgs(getAddress(mockSmartContractAccount.address), name)

      await expect(
        defaultReverseRegistrar.read.nameForAddr([
          mockSmartContractAccount.address,
        ]),
      ).resolves.toStrictEqual(name)
    })

    it.skip('allows undeployed SCA signatures (ERC6492)', async () => {
      // TODO blocker: UniversalSigValidator address mismatch after compiler settings update
      // Expected by SignatureUtils.sol: 0x164af34fAF9879394370C7f09064127C043A35E9
      // Current with 0.8.26 + 1M runs:  0x544a812f33e0a8586f1dc8e685477e4476da8f9f
      // Previous with 0.8.25 + 1200:    0x751fea99af86bf90a81dca8899cd0dbe95344cd8
      //
      // The compiler settings changes improved address but exact bytecode match requires
      // additional investigation of dependency versions, EVM target, and build environment.
      const {
        defaultReverseRegistrar,
        name,
        signatureExpiry,
        functionSelector,
        accounts,
        mockErc6492WalletFactory,
        walletClient,
      } = await connection.networkHelpers.loadFixture(
        setNameForAddrWithSignatureFixture,
      )

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

      await expect(
        defaultReverseRegistrar.write.setNameForAddrWithSignature(
          [predictedAddress, signatureExpiry, name, wrappedSignature],
          { account: accounts[1] },
        ),
      ).toEmitEvent('NameForAddrChanged')
      // .withArgs(getAddress(predictedAddress), name)

      await expect(
        defaultReverseRegistrar.read.nameForAddr([predictedAddress]),
      ).resolves.toStrictEqual(name)
    })

    it('reverts if signature parameters do not match', async () => {
      const {
        defaultReverseRegistrar,
        name,
        functionSelector,
        signatureExpiry,
        walletClient,
        accounts,
      } = await connection.networkHelpers.loadFixture(
        setNameForAddrWithSignatureFixture,
      )

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

      await expect(
        defaultReverseRegistrar.write.setNameForAddrWithSignature(
          [accounts[0].address, signatureExpiry, name, signature],
          { account: accounts[1] },
        ),
      ).toBeRevertedWithCustomError('InvalidSignature')
    })

    it('reverts if expiry date is too low', async () => {
      const {
        defaultReverseRegistrar,
        name,
        functionSelector,
        accounts,
        walletClient,
      } = await connection.networkHelpers.loadFixture(
        setNameForAddrWithSignatureFixture,
      )

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

      await expect(
        defaultReverseRegistrar.write.setNameForAddrWithSignature(
          [accounts[0].address, signatureExpiry, name, signature],
          { account: accounts[1] },
        ),
      ).toBeRevertedWithCustomError('SignatureExpired')
    })

    it('reverts if expiry date is too high', async () => {
      const {
        defaultReverseRegistrar,
        name,
        functionSelector,
        signatureExpiry: oldSignatureExpiry,
        accounts,
        walletClient,
      } = await connection.networkHelpers.loadFixture(
        setNameForAddrWithSignatureFixture,
      )

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

      await expect(
        defaultReverseRegistrar.write.setNameForAddrWithSignature(
          [accounts[0].address, signatureExpiry, name, signature],
          { account: accounts[1] },
        ),
      ).toBeRevertedWithCustomError('SignatureExpiryTooHigh')
    })
  })
})
