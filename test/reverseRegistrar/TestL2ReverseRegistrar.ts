import { evmChainIdToCoinType } from '@ensdomains/address-encoder/utils'
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
import { optimism } from 'viem/chains'
import { serializeErc6492Signature } from 'viem'
import { deployUniversalSigValidator } from '../fixtures/universalSigValidator.js'

const connection = await hre.network.connect()

const coinType = evmChainIdToCoinType(optimism.id)

async function fixture() {
  const accounts = await connection.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))

  await deployUniversalSigValidator()

  const l2ReverseRegistrar = await connection.viem.deployContract(
    'L2ReverseRegistrar',
    [coinType],
  )
  const mockSmartContractAccount = await connection.viem.deployContract(
    'MockSmartContractWallet',
    [accounts[0].address],
  )
  const mockOwnableSca = await connection.viem.deployContract('MockOwnable', [
    mockSmartContractAccount.address,
  ])
  const mockErc6492WalletFactory = await connection.viem.deployContract(
    'MockERC6492WalletFactory',
  )
  const mockOwnableEoa = await connection.viem.deployContract('MockOwnable', [
    accounts[0].address,
  ])

  return {
    l2ReverseRegistrar,
    mockSmartContractAccount,
    mockErc6492WalletFactory,
    mockOwnableSca,
    mockOwnableEoa,
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
  coinTypes,
}: {
  contractAddress: Address
  functionSelector: Hex
  address: Address
  signatureExpiry: bigint
  name: string
  coinTypes: bigint[]
}) =>
  keccak256(
    encodePacked(
      ['address', 'bytes4', 'address', 'uint256', 'string', 'uint256[]'],
      [
        contractAddress,
        functionSelector,
        address,
        signatureExpiry,
        name,
        coinTypes,
      ],
    ),
  )

const createMessageHashForOwnable = ({
  contractAddress,
  functionSelector,
  targetOwnableAddress,
  ownerAddress,
  signatureExpiry,
  name,
  coinTypes,
}: {
  contractAddress: Address
  functionSelector: Hex
  targetOwnableAddress: Address
  ownerAddress: Address
  signatureExpiry: bigint
  name: string
  coinTypes: bigint[]
}) =>
  keccak256(
    encodePacked(
      [
        'address',
        'bytes4',
        'address',
        'address',
        'uint256',
        'string',
        'uint256[]',
      ],
      [
        contractAddress,
        functionSelector,
        targetOwnableAddress,
        ownerAddress,
        signatureExpiry,
        name,
        coinTypes,
      ],
    ),
  )

describe('L2ReverseRegistrar', () => {
  shouldSupportInterfaces({
    contract: () =>
      loadFixture().then(({ l2ReverseRegistrar }) => l2ReverseRegistrar),
    interfaces: [
      'IL2ReverseRegistrar',
      'IERC165',
      'IStandaloneReverseRegistrar',
    ],
  })

  it('should deploy the contract', async () => {
    const { l2ReverseRegistrar } = await connection.networkHelpers.loadFixture(
      fixture,
    )

    expect(l2ReverseRegistrar.address).not.toBeUndefined()
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
      const { l2ReverseRegistrar, name, accounts } =
        await connection.networkHelpers.loadFixture(setNameFixture)

      await l2ReverseRegistrar.write.setName([name])

      await expect(
        l2ReverseRegistrar.read.nameForAddr([accounts[0].address]),
      ).resolves.toStrictEqual(name)
    })

    it('event NameForAddrChanged is emitted', async () => {
      const { l2ReverseRegistrar, name, accounts } =
        await connection.networkHelpers.loadFixture(setNameFixture)

      await expect(l2ReverseRegistrar.write.setName([name])).toEmitEvent(
        'NameForAddrChanged',
      )
      // .withArgs(getAddress(accounts[0].address), name)
    })
  })

  describe('setNameForAddr', () => {
    async function setNameForAddrFixture() {
      const initial = await connection.networkHelpers.loadFixture(fixture)

      const name = 'myname.eth'

      return {
        ...initial,
        name,
      }
    }
    it('should set the name record for the target address', async () => {
      const { l2ReverseRegistrar, name, accounts, mockOwnableEoa } =
        await connection.networkHelpers.loadFixture(setNameForAddrFixture)

      await l2ReverseRegistrar.write.setNameForAddr([
        mockOwnableEoa.address,
        name,
      ])

      await expect(
        l2ReverseRegistrar.read.nameForAddr([mockOwnableEoa.address]),
      ).resolves.toStrictEqual(name)
    })

    it('event NameForAddrChanged is emitted', async () => {
      const { l2ReverseRegistrar, name, mockOwnableEoa } =
        await connection.networkHelpers.loadFixture(setNameForAddrFixture)

      await expect(
        l2ReverseRegistrar.write.setNameForAddr([mockOwnableEoa.address, name]),
      ).toEmitEvent('NameForAddrChanged')
      // .withArgs(getAddress(mockOwnableEoa.address), name)
    })

    it('reverts if the caller is not the owner of the target address', async () => {
      const { l2ReverseRegistrar, name, accounts, mockOwnableEoa } =
        await connection.networkHelpers.loadFixture(setNameForAddrFixture)

      await expect(
        l2ReverseRegistrar.write.setNameForAddr(
          [mockOwnableEoa.address, name],
          {
            account: accounts[1],
          },
        ),
      ).toBeRevertedWithCustomError('Unauthorised')
    })
  })

  describe('setNameForAddrWithSignature', () => {
    async function setNameForAddrWithSignatureFixture() {
      const initial = await connection.networkHelpers.loadFixture(fixture)
      const { l2ReverseRegistrar, accounts } = initial

      const name = 'myname.eth'
      const functionSelector = toFunctionSelector(
        l2ReverseRegistrar.abi.find(
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
        contractAddress: l2ReverseRegistrar.address,
        functionSelector,
        address: accounts[0].address,
        signatureExpiry,
        name,
        coinTypes: [coinType],
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
      const { l2ReverseRegistrar, name, signatureExpiry, signature, accounts } =
        await connection.networkHelpers.loadFixture(
          setNameForAddrWithSignatureFixture,
        )

      await l2ReverseRegistrar.write.setNameForAddrWithSignature(
        [accounts[0].address, signatureExpiry, name, [coinType], signature],
        { account: accounts[1] },
      )

      await expect(
        l2ReverseRegistrar.read.nameForAddr([accounts[0].address]),
      ).resolves.toStrictEqual(name)
    })

    it('event NameForAddrChanged is emitted', async () => {
      const { l2ReverseRegistrar, name, signatureExpiry, signature, accounts } =
        await connection.networkHelpers.loadFixture(
          setNameForAddrWithSignatureFixture,
        )

      await expect(
        l2ReverseRegistrar.write.setNameForAddrWithSignature(
          [accounts[0].address, signatureExpiry, name, [coinType], signature],
          { account: accounts[1] },
        ),
      ).toEmitEvent('NameForAddrChanged')
      // .withArgs(getAddress(accounts[0].address), name)
    })

    it('allows SCA signatures', async () => {
      const {
        l2ReverseRegistrar,
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
        contractAddress: l2ReverseRegistrar.address,
        functionSelector,
        address: mockSmartContractAccount.address,
        signatureExpiry,
        name,
        coinTypes: [coinType],
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(
        l2ReverseRegistrar.write.setNameForAddrWithSignature(
          [
            mockSmartContractAccount.address,
            signatureExpiry,
            name,
            [coinType],
            signature,
          ],
          { account: accounts[1] },
        ),
      ).toEmitEvent('NameForAddrChanged')
      // .withArgs(getAddress(mockSmartContractAccount.address), name)

      await expect(
        l2ReverseRegistrar.read.nameForAddr([mockSmartContractAccount.address]),
      ).resolves.toStrictEqual(name)
    })

    it.skip('allows undeployed SCA signatures (ERC6492)', async () => {
      const {
        l2ReverseRegistrar,
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
        contractAddress: l2ReverseRegistrar.address,
        functionSelector,
        address: predictedAddress,
        signatureExpiry,
        name,
        coinTypes: [coinType],
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
        l2ReverseRegistrar.write.setNameForAddrWithSignature(
          [
            predictedAddress,
            signatureExpiry,
            name,
            [coinType],
            wrappedSignature,
          ],
          { account: accounts[1] },
        ),
      ).toEmitEvent('NameForAddrChanged')
      // .withArgs(getAddress(predictedAddress), name)

      await expect(
        l2ReverseRegistrar.read.nameForAddr([predictedAddress]),
      ).resolves.toStrictEqual(name)
    })

    it('reverts if signature parameters do not match', async () => {
      const {
        l2ReverseRegistrar,
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
            l2ReverseRegistrar.address,
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
        l2ReverseRegistrar.write.setNameForAddrWithSignature(
          [accounts[0].address, signatureExpiry, name, [coinType], signature],
          { account: accounts[1] },
        ),
      ).toBeRevertedWithCustomError('InvalidSignature')
    })

    it('reverts if expiry date is too low', async () => {
      const {
        l2ReverseRegistrar,
        name,
        functionSelector,
        accounts,
        walletClient,
      } = await connection.networkHelpers.loadFixture(
        setNameForAddrWithSignatureFixture,
      )

      const signatureExpiry = 0n

      const messageHash = createMessageHash({
        contractAddress: l2ReverseRegistrar.address,
        functionSelector,
        address: accounts[0].address,
        signatureExpiry,
        name,
        coinTypes: [coinType],
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(
        l2ReverseRegistrar.write.setNameForAddrWithSignature(
          [accounts[0].address, signatureExpiry, name, [coinType], signature],
          { account: accounts[1] },
        ),
      ).toBeRevertedWithCustomError('SignatureExpired')
    })

    it('reverts if expiry date is too high', async () => {
      const {
        l2ReverseRegistrar,
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
        contractAddress: l2ReverseRegistrar.address,
        functionSelector,
        address: accounts[0].address,
        signatureExpiry,
        name,
        coinTypes: [coinType],
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(
        l2ReverseRegistrar.write.setNameForAddrWithSignature(
          [accounts[0].address, signatureExpiry, name, [coinType], signature],
          { account: accounts[1] },
        ),
      ).toBeRevertedWithCustomError('SignatureExpiryTooHigh')
    })

    it('allows unrelated coin types in array', async () => {
      const {
        l2ReverseRegistrar,
        name,
        signatureExpiry,
        functionSelector,
        accounts,
        walletClient,
      } = await connection.networkHelpers.loadFixture(
        setNameForAddrWithSignatureFixture,
      )

      const coinTypes = [34384n, 54842344n, 3498283n, coinType]

      const messageHash = createMessageHash({
        contractAddress: l2ReverseRegistrar.address,
        functionSelector,
        address: accounts[0].address,
        signatureExpiry,
        name,
        coinTypes,
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await l2ReverseRegistrar.write.setNameForAddrWithSignature(
        [accounts[0].address, signatureExpiry, name, coinTypes, signature],
        { account: accounts[1] },
      )

      await expect(
        l2ReverseRegistrar.read.nameForAddr([accounts[0].address]),
      ).resolves.toStrictEqual(name)
    })
    it('reverts if coin type is not in array', async () => {
      const {
        l2ReverseRegistrar,
        name,
        signatureExpiry,
        functionSelector,
        accounts,
        walletClient,
      } = await connection.networkHelpers.loadFixture(
        setNameForAddrWithSignatureFixture,
      )

      const coinTypes = [34384n, 54842344n, 3498283n]

      const messageHash = createMessageHash({
        contractAddress: l2ReverseRegistrar.address,
        functionSelector,
        address: accounts[0].address,
        signatureExpiry,
        name,
        coinTypes,
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(
        l2ReverseRegistrar.write.setNameForAddrWithSignature(
          [accounts[0].address, signatureExpiry, name, coinTypes, signature],
          { account: accounts[1] },
        ),
      ).toBeRevertedWithCustomError('CoinTypeNotFound')
    })
    it('reverts if array is empty', async () => {
      const {
        l2ReverseRegistrar,
        name,
        signatureExpiry,
        functionSelector,
        accounts,
        walletClient,
      } = await connection.networkHelpers.loadFixture(
        setNameForAddrWithSignatureFixture,
      )

      const coinTypes = [] as bigint[]

      const messageHash = createMessageHash({
        contractAddress: l2ReverseRegistrar.address,
        functionSelector,
        address: accounts[0].address,
        signatureExpiry,
        name,
        coinTypes,
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(
        l2ReverseRegistrar.write.setNameForAddrWithSignature(
          [accounts[0].address, signatureExpiry, name, coinTypes, signature],
          { account: accounts[1] },
        ),
      ).toBeRevertedWithCustomError('CoinTypeNotFound')
    })
  })

  describe('setNameForOwnableWithSignature', () => {
    async function setNameForOwnableWithSignatureFixture() {
      const initial = await connection.networkHelpers.loadFixture(fixture)
      const { l2ReverseRegistrar } = initial

      const name = 'ownable.eth'
      const functionSelector = toFunctionSelector(
        l2ReverseRegistrar.abi.find(
          (f) =>
            f.type === 'function' &&
            f.name === 'setNameForOwnableWithSignature',
        ) as AbiFunction,
      )

      const publicClient = await connection.viem.getPublicClient()
      const blockTimestamp = await publicClient
        .getBlock()
        .then((b) => b.timestamp)
      const signatureExpiry = blockTimestamp + 3600n

      const [walletClient] = await connection.viem.getWalletClients()

      return {
        ...initial,
        name,
        functionSelector,
        signatureExpiry,
        walletClient,
      }
    }

    it('allows an EOA to sign a message to claim the address of a contract it owns via Ownable', async () => {
      const {
        l2ReverseRegistrar,
        name,
        functionSelector,
        signatureExpiry,
        accounts,
        mockOwnableEoa,
        walletClient,
      } = await connection.networkHelpers.loadFixture(
        setNameForOwnableWithSignatureFixture,
      )

      const messageHash = createMessageHashForOwnable({
        contractAddress: l2ReverseRegistrar.address,
        functionSelector,
        targetOwnableAddress: mockOwnableEoa.address,
        ownerAddress: accounts[0].address,
        signatureExpiry,
        name,
        coinTypes: [coinType],
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(
        l2ReverseRegistrar.write.setNameForOwnableWithSignature(
          [
            mockOwnableEoa.address,
            accounts[0].address,
            signatureExpiry,
            name,
            [coinType],
            signature,
          ],
          { account: accounts[9] },
        ),
      ).toEmitEvent('NameForAddrChanged')
      // .withArgs(getAddress(mockOwnableEoa.address), name)

      await expect(
        l2ReverseRegistrar.read.nameForAddr([mockOwnableEoa.address]),
      ).resolves.toStrictEqual(name)
    })

    it('allows an SCA to sign a message to claim the address of a contract it owns via Ownable', async () => {
      const {
        l2ReverseRegistrar,
        name,
        functionSelector,
        signatureExpiry,
        accounts,
        mockOwnableSca,
        mockSmartContractAccount,
        walletClient,
      } = await connection.networkHelpers.loadFixture(
        setNameForOwnableWithSignatureFixture,
      )

      const messageHash = createMessageHashForOwnable({
        contractAddress: l2ReverseRegistrar.address,
        functionSelector,
        targetOwnableAddress: mockOwnableSca.address,
        ownerAddress: mockSmartContractAccount.address,
        signatureExpiry,
        name,
        coinTypes: [coinType],
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(
        l2ReverseRegistrar.write.setNameForOwnableWithSignature(
          [
            mockOwnableSca.address,
            mockSmartContractAccount.address,
            signatureExpiry,
            name,
            [coinType],
            signature,
          ],
          { account: accounts[9] },
        ),
      ).toEmitEvent('NameForAddrChanged')
      // .withArgs(getAddress(mockOwnableSca.address), name)

      await expect(
        l2ReverseRegistrar.read.nameForAddr([mockOwnableSca.address]),
      ).resolves.toStrictEqual(name)
    })

    it('reverts if the owner address is not the owner of the contract', async () => {
      const {
        l2ReverseRegistrar,
        name,
        functionSelector,
        signatureExpiry,
        accounts,
        mockOwnableEoa,
      } = await connection.networkHelpers.loadFixture(
        setNameForOwnableWithSignatureFixture,
      )
      const [, walletClient] = await connection.viem.getWalletClients()

      const messageHash = createMessageHashForOwnable({
        contractAddress: l2ReverseRegistrar.address,
        functionSelector,
        targetOwnableAddress: mockOwnableEoa.address,
        ownerAddress: accounts[1].address,
        signatureExpiry,
        name,
        coinTypes: [coinType],
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(
        l2ReverseRegistrar.write.setNameForOwnableWithSignature(
          [
            mockOwnableEoa.address,
            accounts[1].address,
            signatureExpiry,
            name,
            [coinType],
            signature,
          ],
          { account: accounts[9] },
        ),
      ).toBeRevertedWithCustomError('NotOwnerOfContract')
    })

    it('reverts if the target address is not a contract', async () => {
      const {
        l2ReverseRegistrar,
        name,
        functionSelector,
        signatureExpiry,
        accounts,
        walletClient,
      } = await connection.networkHelpers.loadFixture(
        setNameForOwnableWithSignatureFixture,
      )

      const messageHash = createMessageHashForOwnable({
        contractAddress: l2ReverseRegistrar.address,
        functionSelector,
        targetOwnableAddress: accounts[2].address,
        ownerAddress: accounts[0].address,
        signatureExpiry,
        name,
        coinTypes: [coinType],
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(
        l2ReverseRegistrar.write.setNameForOwnableWithSignature(
          [
            accounts[2].address,
            accounts[0].address,
            signatureExpiry,
            name,
            [coinType],
            signature,
          ],
          { account: accounts[9] },
        ),
      ).toBeRevertedWithCustomError('NotOwnerOfContract')
    })

    it('reverts if the target address does not implement Ownable', async () => {
      const {
        l2ReverseRegistrar,
        name,
        functionSelector,
        signatureExpiry,
        accounts,
        walletClient,
      } = await connection.networkHelpers.loadFixture(
        setNameForOwnableWithSignatureFixture,
      )

      const messageHash = createMessageHashForOwnable({
        contractAddress: l2ReverseRegistrar.address,
        functionSelector,
        targetOwnableAddress: l2ReverseRegistrar.address,
        ownerAddress: accounts[0].address,
        signatureExpiry,
        name,
        coinTypes: [coinType],
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(
        l2ReverseRegistrar.write.setNameForOwnableWithSignature(
          [
            l2ReverseRegistrar.address,
            accounts[0].address,
            signatureExpiry,
            name,
            [coinType],
            signature,
          ],
          { account: accounts[9] },
        ),
      ).toBeRevertedWithCustomError('NotOwnerOfContract')
    })

    it('reverts if the signature is invalid', async () => {
      const {
        l2ReverseRegistrar,
        name,
        functionSelector,
        signatureExpiry,
        accounts,
        mockOwnableEoa,
        walletClient,
      } = await connection.networkHelpers.loadFixture(
        setNameForOwnableWithSignatureFixture,
      )

      const messageHash = createMessageHashForOwnable({
        contractAddress: l2ReverseRegistrar.address,
        functionSelector,
        targetOwnableAddress: mockOwnableEoa.address,
        ownerAddress: accounts[0].address,
        signatureExpiry: 0n,
        name,
        coinTypes: [coinType],
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(
        l2ReverseRegistrar.write.setNameForOwnableWithSignature(
          [
            mockOwnableEoa.address,
            accounts[0].address,
            signatureExpiry,
            name,
            [coinType],
            signature,
          ],
          { account: accounts[9] },
        ),
      ).toBeRevertedWithCustomError('InvalidSignature')
    })

    it('reverts if expiry date is too low', async () => {
      const {
        l2ReverseRegistrar,
        name,
        functionSelector,
        accounts,
        mockOwnableEoa,
        walletClient,
      } = await connection.networkHelpers.loadFixture(
        setNameForOwnableWithSignatureFixture,
      )

      const signatureExpiry = 0n

      const messageHash = createMessageHashForOwnable({
        contractAddress: l2ReverseRegistrar.address,
        functionSelector,
        targetOwnableAddress: mockOwnableEoa.address,
        ownerAddress: accounts[0].address,
        signatureExpiry,
        name,
        coinTypes: [coinType],
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(
        l2ReverseRegistrar.write.setNameForOwnableWithSignature(
          [
            mockOwnableEoa.address,
            accounts[0].address,
            signatureExpiry,
            name,
            [coinType],
            signature,
          ],
          { account: accounts[9] },
        ),
      ).toBeRevertedWithCustomError('SignatureExpired')
    })

    it('reverts if expiry date is too high', async () => {
      const {
        l2ReverseRegistrar,
        name,
        functionSelector,
        accounts,
        mockOwnableEoa,
        walletClient,
        signatureExpiry: oldSignatureExpiry,
      } = await connection.networkHelpers.loadFixture(
        setNameForOwnableWithSignatureFixture,
      )

      const signatureExpiry = oldSignatureExpiry + 86401n

      const messageHash = createMessageHashForOwnable({
        contractAddress: l2ReverseRegistrar.address,
        functionSelector,
        targetOwnableAddress: mockOwnableEoa.address,
        ownerAddress: accounts[0].address,
        signatureExpiry,
        name,
        coinTypes: [coinType],
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(
        l2ReverseRegistrar.write.setNameForOwnableWithSignature(
          [
            mockOwnableEoa.address,
            accounts[0].address,
            signatureExpiry,
            name,
            [coinType],
            signature,
          ],
          { account: accounts[9] },
        ),
      ).toBeRevertedWithCustomError('SignatureExpiryTooHigh')
    })

    it('allows unrelated coin types in array', async () => {
      const {
        l2ReverseRegistrar,
        name,
        functionSelector,
        signatureExpiry,
        accounts,
        mockOwnableEoa,
        walletClient,
      } = await connection.networkHelpers.loadFixture(
        setNameForOwnableWithSignatureFixture,
      )

      const coinTypes = [34384n, 54842344n, 3498283n, coinType]
      const messageHash = createMessageHashForOwnable({
        contractAddress: l2ReverseRegistrar.address,
        functionSelector,
        targetOwnableAddress: mockOwnableEoa.address,
        ownerAddress: accounts[0].address,
        signatureExpiry,
        name,
        coinTypes,
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(
        l2ReverseRegistrar.write.setNameForOwnableWithSignature(
          [
            mockOwnableEoa.address,
            accounts[0].address,
            signatureExpiry,
            name,
            coinTypes,
            signature,
          ],
          { account: accounts[9] },
        ),
      ).toEmitEvent('NameForAddrChanged')
      // .withArgs(getAddress(mockOwnableEoa.address), name)

      await expect(
        l2ReverseRegistrar.read.nameForAddr([mockOwnableEoa.address]),
      ).resolves.toStrictEqual(name)
    })

    it('reverts if coin type is not in array', async () => {
      const {
        l2ReverseRegistrar,
        name,
        functionSelector,
        signatureExpiry,
        accounts,
        mockOwnableEoa,
        walletClient,
      } = await connection.networkHelpers.loadFixture(
        setNameForOwnableWithSignatureFixture,
      )

      const coinTypes = [34384n, 54842344n, 3498283n]
      const messageHash = createMessageHashForOwnable({
        contractAddress: l2ReverseRegistrar.address,
        functionSelector,
        targetOwnableAddress: mockOwnableEoa.address,
        ownerAddress: accounts[0].address,
        signatureExpiry,
        name,
        coinTypes,
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(
        l2ReverseRegistrar.write.setNameForOwnableWithSignature(
          [
            mockOwnableEoa.address,
            accounts[0].address,
            signatureExpiry,
            name,
            coinTypes,
            signature,
          ],
          { account: accounts[9] },
        ),
      ).toBeRevertedWithCustomError('CoinTypeNotFound')
    })

    it('reverts if array is empty', async () => {
      const {
        l2ReverseRegistrar,
        name,
        functionSelector,
        signatureExpiry,
        accounts,
        mockOwnableEoa,
        walletClient,
      } = await connection.networkHelpers.loadFixture(
        setNameForOwnableWithSignatureFixture,
      )

      const coinTypes = [] as bigint[]
      const messageHash = createMessageHashForOwnable({
        contractAddress: l2ReverseRegistrar.address,
        functionSelector,
        targetOwnableAddress: mockOwnableEoa.address,
        ownerAddress: accounts[0].address,
        signatureExpiry,
        name,
        coinTypes,
      })
      const signature = await walletClient.signMessage({
        message: { raw: messageHash },
      })

      await expect(
        l2ReverseRegistrar.write.setNameForOwnableWithSignature(
          [
            mockOwnableEoa.address,
            accounts[0].address,
            signatureExpiry,
            name,
            coinTypes,
            signature,
          ],
          { account: accounts[9] },
        ),
      ).toBeRevertedWithCustomError('CoinTypeNotFound')
    })
  })
})
