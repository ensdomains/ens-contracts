import { evmChainIdToCoinType } from '@ensdomains/address-encoder/utils'
import { artifacts, deployScript, type Environment } from '@rocketh'
import fs from 'node:fs'
import path from 'node:path'
import type { Abi, Deployment } from 'rocketh'
import {
  concatHex,
  encodeDeployData,
  encodeFunctionData,
  Hash,
  Hex,
  keccak256,
  namehash,
  parseAbi,
  stringToHex,
  TransactionReceipt,
} from 'viem'
import { base, baseSepolia } from 'viem/chains'

type Writeable<T> = {
  -readonly [P in keyof T]: T[P]
}

export const safeConfig = {
  testnet: {
    safeAddress: '0x343431e9CEb7C19cC8d3eA0EE231bfF82B584910',
    baseDeploymentSalt:
      '0xb42292a18122332f920fcf3af8efe05e2c97a83802dfe4dd01dee7dec47f66ae',
    expectedDeploymentAddress: '0x00000BeEF055f7934784D6d81b6BC86665630dbA',
  },
  mainnet: {
    safeAddress: '0x353530FE74098903728Ddb66Ecdb70f52e568eC1',
    baseDeploymentSalt:
      '0xc68333947ff61550c9b629abed325e2244278524f8e5782579f1dd2ea46c0c4f',
    expectedDeploymentAddress: '0x0000000000D8e504002cC26E3Ec46D81971C1664',
  },
} as const

const create3ProxyAddress =
  '0x004eE012d77C5D0e67D861041D11824f51B590fb' as const

const oldReverseResolvers = {
  [base.id]: '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD',
  [baseSepolia.id]: '0x6533C94869D28fAA8dF77cc63f9e2b2D6Cf77eBA',
} as const

// Rocketh-compatible safeDeploy function
// This function handles Safe multisig deployments using CREATE3 proxy patterns
// It can be used as an alternative to the standard deploy() function for L2 chains
// that require Safe multisig approval for deployments
const safeDeploy = async (
  env: Pick<Environment, 'network' | 'viem' | 'save'>,
  {
    reverseNode,
    coinType,
  }: {
    reverseNode: Hex
    coinType: bigint
  },
) => {
  const networkType = env.network.tags.testnet ? 'testnet' : 'mainnet'
  const { safeAddress, baseDeploymentSalt, expectedDeploymentAddress } =
    safeConfig[networkType]

  const deployConfig = (() => {
    if (
      env.network.chain.id === base.id ||
      env.network.chain.id === baseSepolia.id
    )
      return {
        artifactName: 'L2ReverseRegistrarWithMigration',
        deploymentArgs: [
          coinType,
          safeAddress,
          reverseNode,
          oldReverseResolvers[
            env.network.chain.id as keyof typeof oldReverseResolvers
          ],
        ] as [bigint, Hex, Hex, Hex],
      } as const
    return {
      artifactName: 'L2ReverseRegistrar',
      deploymentArgs: [coinType] as [bigint],
    } as const
  })()

  console.log('L2ReverseRegistrar type:', deployConfig.artifactName)
  console.log(
    'L2ReverseRegistrar deployment args:',
    deployConfig.deploymentArgs,
  )

  const confirmAndSave = async ({
    deployment,
    receipt,
  }: {
    deployment: Deployment<Abi>
    receipt: TransactionReceipt
  }) => {
    const publicClient = env.viem.publicClient
    const currentBytecode = await publicClient.getCode({
      address: expectedDeploymentAddress,
    })
    if (!currentBytecode) throw new Error('L2ReverseRegistrar not deployed')

    console.log(
      `"L2ReverseRegistrar" deployed at: ${expectedDeploymentAddress} with ${receipt.gasUsed} gas`,
    )

    const completeDeployment = {
      ...deployment,
      receipt: {
        confirmations: 1,
        blockHash: receipt.blockHash,
        blockNumber: receipt.blockNumber,
        transactionIndex: receipt.transactionIndex,
      },
      transaction: {
        hash: receipt.transactionHash,
        origin: receipt.from,
        nonce: 0,
      },
    }

    await env.save('L2ReverseRegistrar', completeDeployment)
  }

  const { default: SafeApiKit } = await import('@safe-global/api-kit').then(
    (m) => m.default,
  )
  const { default: Safe } = await import('@safe-global/protocol-kit').then(
    (m) => m.default,
  )

  const publicClient = env.viem.publicClient
  const privateKey = process.env.SAFE_PROPOSER_KEY!

  if (networkType === 'mainnet') {
    const pendingSafeTransactionsFile = path.join(
      'deployments',
      env.network.name,
      '.pendingSafeTransactions',
    )
    const pendingSafeTransactions = JSON.parse(
      fs.existsSync(pendingSafeTransactionsFile)
        ? fs.readFileSync(pendingSafeTransactionsFile, 'utf8')
        : '{}',
    )
    const existingTransaction = pendingSafeTransactions['L2ReverseRegistrar']
    if (existingTransaction) {
      const apiKit = new SafeApiKit({
        chainId: BigInt(env.network.chain.id!),
      })
      const safeTransaction = await apiKit.getTransaction(
        existingTransaction.safeTransactionHash,
      )
      if (!safeTransaction) throw new Error('Safe transaction not found')
      if (!safeTransaction.isExecuted)
        throw new Error('Safe transaction not yet executed')
      if (!safeTransaction.isSuccessful)
        throw new Error('Safe transaction failed')

      const receipt = await publicClient.getTransactionReceipt({
        hash: safeTransaction.transactionHash as Hash,
      })
      if (receipt.status !== 'success') throw new Error('Transaction failed')

      await confirmAndSave({ deployment: existingTransaction, receipt })

      delete pendingSafeTransactions['L2ReverseRegistrar']

      if (Object.keys(pendingSafeTransactions).length === 0)
        fs.unlinkSync(pendingSafeTransactionsFile)
      else
        fs.writeFileSync(
          pendingSafeTransactionsFile,
          JSON.stringify(pendingSafeTransactions, null, 2),
        )

      return true
    }
  }

  const protocolKit = await Safe.init({
    provider: env.network.provider,
    signer: privateKey,
    safeAddress,
    contractNetworks: {
      [env.network.chain.id.toString()]: {
        createCallAddress: '0x9b35Af71d77eaf8d7e40252370304687390A1A52',
        fallbackHandlerAddress: '0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99',
        multiSendAddress: '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526',
        multiSendCallOnlyAddress: '0x9641d764fc13c8B624c04430C7356C1C7C8102e2',
        safeProxyFactoryAddress: '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67',
        safeSingletonAddress: '0x29fcB43b46531BcA003ddC8FCB67FFE91900C762',
      },
    },
  })

  // Get artifact from Rocketh artifacts
  const artifact = artifacts[deployConfig.artifactName]
  const { abi, bytecode, ...artifactData } = artifact

  const deployData = encodeDeployData({
    abi,
    bytecode: bytecode as Hex,
    args: deployConfig.deploymentArgs,
  })

  const create3Transaction = encodeFunctionData({
    abi: parseAbi([
      'function deployDeterministic(bytes initCode, bytes32 salt) returns (address)',
    ]),
    args: [
      deployData,
      keccak256(
        concatHex([
          baseDeploymentSalt,
          stringToHex('L2ReverseRegistrar v1.0.0'),
        ]),
      ),
    ],
  })

  const safeTransaction = await protocolKit.createTransaction({
    transactions: [
      {
        to: create3ProxyAddress,
        data: create3Transaction,
        value: '0',
      },
    ],
  })

  const safeTransactionHash = await protocolKit.getTransactionHash(
    safeTransaction,
  )
  const signature = await protocolKit.signHash(safeTransactionHash)

  const deployment = {
    address: expectedDeploymentAddress,
    abi,
    argsData: deployConfig.deploymentArgs,
    bytecode,
    ...artifactData,
  }

  if (networkType === 'testnet') {
    safeTransaction.addSignature(signature)

    const { hash } = await protocolKit.executeTransaction(safeTransaction)
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: hash as Hash,
    })
    if (receipt.status !== 'success') throw new Error('Transaction failed')
    await confirmAndSave({ deployment, receipt })
    return true
  } else {
    const apiKit = new SafeApiKit({
      chainId: BigInt(env.network.chain.id!),
    })

    await apiKit.proposeTransaction({
      safeAddress,
      safeTransactionData: safeTransaction.data,
      safeTxHash: safeTransactionHash,
      senderAddress: signature.signer,
      senderSignature: signature.data,
    })

    console.log('Transaction proposed:', safeTransactionHash)

    const pendingSafeTransactionsFile = path.join(
      'deployments',
      env.network.name,
      '.pendingSafeTransactions',
    )
    const pendingSafeTransactions = JSON.parse(
      fs.existsSync(pendingSafeTransactionsFile)
        ? fs.readFileSync(pendingSafeTransactionsFile, 'utf8')
        : '{}',
    )
    pendingSafeTransactions['L2ReverseRegistrar'] = {
      ...deployment,
      safeTransactionHash,
    }
    fs.writeFileSync(
      pendingSafeTransactionsFile,
      JSON.stringify(pendingSafeTransactions, null, 2),
    )
    console.log(
      'Safe transaction saved. Confirm transaction on Safe, and re-run deploy script.',
    )
    return false
  }
}

export default deployScript(
  async ({ deploy, namedAccounts, network, save, viem, config }) => {
    const { deployer } = namedAccounts
    const chainId = network.chain.id
    const coinType = evmChainIdToCoinType(chainId) as bigint
    const coinTypeHex = coinType.toString(16)

    const REVERSE_NAMESPACE = `${coinTypeHex}.reverse`
    const REVERSENODE = namehash(REVERSE_NAMESPACE)

    if (process.env.SAFE_PROPOSER_KEY && config.saveDeployments) {
      return await safeDeploy(
        { network, save, viem },
        {
          reverseNode: REVERSENODE,
          coinType,
        },
      )
    } else {
      console.log(`Deploying L2ReverseRegistrar on ${network.name} with:`)
      console.log(`coinType: ${coinType}`)

      await deploy('L2ReverseRegistrar', {
        account: deployer,
        artifact: artifacts.L2ReverseRegistrar,
        args: [coinType],
      })
    }
  },
  {
    id: 'L2ReverseRegistrar v1.0.0',
    tags: ['category:l2', 'L2ReverseRegistrar'],
    dependencies: ['UniversalSigValidator'],
  },
)
