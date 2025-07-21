import { task } from 'hardhat/config.js'
import { encodeFunctionData, parseAbi, zeroAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  simulateContract,
  waitForTransactionReceipt,
  writeContract,
} from 'viem/actions'

const safeConfig = {
  testnet: {
    expectedSafeAddress: '0x343431e9CEb7C19cC8d3eA0EE231bfF82B584910',
    owners: [
      '0xb8c2C29ee19D8307cb7255e1Cd9CbDE883A267d5', // nick.eth
      '0x866B3c4994e1416B7C738B9818b31dC246b95eEE', // jefflau.eth
      '0x8e8Db5CcEF88cca9d624701Db544989C996E3216', // taytems.eth
      '0x69420f05A11f617B4B74fFe2E04B2D300dFA556F', // test.taytems.eth
    ],
    threshold: 1n,
    salt: 14456295116498735855392865217074711037762705260078612101705118565764448348434n,
  },
  mainnet: {
    expectedSafeAddress: '0x353530FE74098903728Ddb66Ecdb70f52e568eC1',
    owners: [
      '0xb8c2C29ee19D8307cb7255e1Cd9CbDE883A267d5', // nick.eth
      '0x866B3c4994e1416B7C738B9818b31dC246b95eEE', // jefflau.eth
      '0x8e8Db5CcEF88cca9d624701Db544989C996E3216', // taytems.eth
    ],
    threshold: 2n,
    salt: 1916147144406496423238940984785748760203246482579184683213079347705459443738n,
  },
} as const

const singleton = '0x29fcB43b46531BcA003ddC8FCB67FFE91900C762'
const proxyFactory = '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67'
const fallbackHandler = '0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99'

task('create-l2-safe', 'Creates an L2 Safe', async (_, hre) => {
  const networkType = hre.network.tags.testnet ? 'testnet' : 'mainnet'
  const { expectedSafeAddress, owners, threshold, salt } =
    safeConfig[networkType]

  const encodedData = encodeFunctionData({
    abi: parseAbi([
      'function setup(address[] owners,uint256 threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address paymentReceiver)',
    ]),
    args: [
      owners,
      threshold,
      zeroAddress,
      '0x',
      fallbackHandler,
      zeroAddress,
      0n,
      zeroAddress,
    ],
  })

  const publicClient = await hre.viem.getPublicClient()
  const deployerAccount = privateKeyToAccount(
    process.env.DEPLOYER_KEY as `0x${string}`,
  )

  const safeArgs = {
    account: deployerAccount,
    abi: [
      {
        inputs: [
          { internalType: 'address', name: '_singleton', type: 'address' },
          { internalType: 'bytes', name: 'initializer', type: 'bytes' },
          { internalType: 'uint256', name: 'saltNonce', type: 'uint256' },
        ],
        name: 'createProxyWithNonce',
        outputs: [
          {
            internalType: 'contract GnosisSafeProxy',
            name: 'proxy',
            type: 'address',
          },
        ],
        stateMutability: 'nonpayable',
        type: 'function',
      },
    ],
    address: proxyFactory,
    functionName: 'createProxyWithNonce',
    args: [singleton, encodedData, salt],
  } as const

  const predictedSafeAddress = await simulateContract(publicClient, safeArgs)

  if (predictedSafeAddress.result !== expectedSafeAddress)
    throw new Error(
      `Predicted safe address does not match expected safe address. (predicted: ${predictedSafeAddress.result}, expected: ${expectedSafeAddress})`,
    )

  const transactionHash = await writeContract(publicClient, safeArgs)
  console.log('Transaction sent:', transactionHash)
  await waitForTransactionReceipt(publicClient, {
    hash: transactionHash,
  })
  console.log('Transaction confirmed')
  console.log('Safe deployed successfully')
})
