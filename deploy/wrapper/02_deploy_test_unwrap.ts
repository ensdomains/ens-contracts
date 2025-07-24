import { execute, artifacts } from '@rocketh'
import {
  createPublicClient,
  http,
  encodeFunctionData,
  decodeFunctionResult,
} from 'viem'
import type { Address } from 'viem'

const TESTNET_WRAPPER_ADDRESSES = {
  goerli: [
    '0x582224b8d4534F4749EFA4f22eF7241E0C56D4B8',
    '0xEe1F756aCde7E81B2D8cC6aB3c8A1E2cC6db0F39',
    '0x060f1546642E67c485D56248201feA2f9AB1803C',
    // Add more testnet NameWrapper addresses here...
  ],
}

export default execute(
  async ({ deploy, get, namedAccounts, network, tx }) => {
    const { deployer, owner, ...otherAccounts } = namedAccounts

    // Create a public client for reading contract state
    const publicClient = createPublicClient({
      chain: {
        id: network.chain?.id || network.config?.chainId || 31337,
        name: network.name || 'localhost',
        rpcUrls: {
          default: {
            http: [network.config?.rpcUrl || 'http://127.0.0.1:8545'],
          },
        },
        nativeCurrency: {
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18,
        },
      },
      transport: http(network.config?.rpcUrl || 'http://127.0.0.1:8545'),
    })

    // Build client list from named accounts (no unnamed clients in rocketh)
    const clients = [deployer, owner, ...Object.values(otherAccounts)]

    const registry = await get('ENSRegistry')
    const registrar = await get('BaseRegistrarImplementation')

    await deploy('TestUnwrap', {
      account: deployer,
      artifact: artifacts.TestUnwrap,
      args: [registry.address, registrar.address],
    })

    const testnetWrapperAddresses = TESTNET_WRAPPER_ADDRESSES[
      network.name as keyof typeof TESTNET_WRAPPER_ADDRESSES
    ] as Address[]

    if (!testnetWrapperAddresses || testnetWrapperAddresses.length === 0) {
      console.log('No testnet wrappers found, skipping')
      return
    }

    let testUnwrap = await get('TestUnwrap')

    // Read the contract owner using public client
    const contractOwnerResult = await publicClient.readContract({
      address: testUnwrap.address as Address,
      abi: testUnwrap.abi,
      functionName: 'owner',
    })
    const contractOwner = contractOwnerResult as Address
    const contractOwnerClient = clients.find((c) => c.address === contractOwner)
    const canModifyTestUnwrap = !!contractOwnerClient

    if (!canModifyTestUnwrap) {
      console.log(
        "WARNING: Can't modify TestUnwrap, will not run setWrapperApproval()",
      )
    }

    for (const wrapperAddress of testnetWrapperAddresses) {
      try {
        // Get the NameWrapper artifact (equivalent to original)
        const nameWrapperArtifact = artifacts.NameWrapper

        // Read upgrade contract from the wrapper using public client
        const upgradeContract = (await publicClient.readContract({
          address: wrapperAddress,
          abi: nameWrapperArtifact.abi,
          functionName: 'upgradeContract',
        })) as Address

        const isUpgradeSet = upgradeContract === testUnwrap.address

        // Read approved wrapper status from TestUnwrap
        const isApprovedWrapper = (await publicClient.readContract({
          address: testUnwrap.address as Address,
          abi: testUnwrap.abi,
          functionName: 'approvedWrapper',
          args: [wrapperAddress],
        })) as boolean

        if (isUpgradeSet && isApprovedWrapper) {
          console.log(
            `Wrapper ${wrapperAddress} already set up, skipping contract`,
          )
          continue
        }

        if (!isUpgradeSet) {
          // Read wrapper owner
          const wrapperOwner = (await publicClient.readContract({
            address: wrapperAddress,
            abi: nameWrapperArtifact.abi,
            functionName: 'owner',
          })) as Address

          const wrapperOwnerClient = clients.find(
            (c) => c.address === wrapperOwner,
          )
          const canModifyWrapper = !!wrapperOwnerClient

          if (!canModifyWrapper && !canModifyTestUnwrap) {
            console.log(
              `WARNING: Can't modify wrapper ${wrapperAddress} or TestUnwrap, skipping contract`,
            )
            continue
          } else if (!canModifyWrapper) {
            console.log(
              `WARNING: Can't modify wrapper ${wrapperAddress}, skipping setUpgradeContract()`,
            )
          } else {
            // Set upgrade contract using tx()
            const setUpgradeHash = await tx({
              to: wrapperAddress,
              data: encodeFunctionData({
                abi: nameWrapperArtifact.abi,
                functionName: 'setUpgradeContract',
                args: [testUnwrap.address],
              }),
              account: wrapperOwnerClient,
            })
            console.log(
              `Setting upgrade contract for ${wrapperAddress} to ${testUnwrap.address} (tx: ${setUpgradeHash})...`,
            )
          }

          if (isApprovedWrapper) {
            console.log(
              `Wrapper ${wrapperAddress} already approved, skipping setWrapperApproval()`,
            )
            continue
          }
        }

        if (!canModifyTestUnwrap) {
          console.log(
            `WARNING: Can't modify TestUnwrap, skipping setWrapperApproval() for ${wrapperAddress}`,
          )
          continue
        }

        // Set wrapper approval using tx()
        const setApprovalHash = await tx({
          to: testUnwrap.address,
          data: encodeFunctionData({
            abi: testUnwrap.abi,
            functionName: 'setWrapperApproval',
            args: [wrapperAddress, true],
          }),
          account: contractOwnerClient!,
        })
        console.log(
          `Approving wrapper ${wrapperAddress} (tx: ${setApprovalHash})...`,
        )
      } catch (error) {
        console.log(
          `Failed to process wrapper ${wrapperAddress}:`,
          error instanceof Error ? error.message : String(error),
        )
      }
    }
  },
  {
    id: 'TestUnwrap v1.0.0',
    tags: ['category:wrapper', 'TestUnwrap'],
    dependencies: ['BaseRegistrarImplementation', 'ENSRegistry'],
    skip: async ({ network }: any) => {
      if (network.name === 'mainnet') return true
      return false
    },
  } as any,
)
