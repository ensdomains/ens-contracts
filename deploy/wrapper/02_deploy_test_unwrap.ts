import { execute, artifacts } from '@rocketh'
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
  async ({ deploy, get, namedAccounts, network, viem, deployments }) => {
    const { deployer, owner, ...otherAccounts } = namedAccounts
    const unnamedClients = await viem.getUnnamedClients()
    const clients = [
      deployer,
      owner,
      ...Object.values(otherAccounts),
      ...unnamedClients,
    ]

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
    const contractOwner = await (testUnwrap as any).read.owner()
    const contractOwnerClient = clients.find((c) => c.address === contractOwner)
    const canModifyTestUnwrap = !!contractOwnerClient

    if (!canModifyTestUnwrap) {
      console.log(
        "WARNING: Can't modify TestUnwrap, will not run setWrapperApproval()",
      )
    }

    for (const wrapperAddress of testnetWrapperAddresses) {
      try {
        const nameWrapperArtifact = await (deployments as any).getArtifact(
          'NameWrapper',
        )
        const wrapperContract = await viem.getContractAt(
          'NameWrapper',
          wrapperAddress,
          { client: owner },
        )

        const upgradeContract = await wrapperContract.read.upgradeContract()
        const isUpgradeSet = upgradeContract === testUnwrap.address
        const isApprovedWrapper = await (
          testUnwrap as any
        ).read.approvedWrapper([wrapperAddress])

        if (isUpgradeSet && isApprovedWrapper) {
          console.log(
            `Wrapper ${wrapperAddress} already set up, skipping contract`,
          )
          continue
        }

        if (!isUpgradeSet) {
          const wrapperOwner = await wrapperContract.read.owner()
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
            const setUpgradeHash =
              await wrapperContract.write.setUpgradeContract(
                [testUnwrap.address],
                { account: wrapperOwnerClient.account },
              )
            console.log(
              `Setting upgrade contract for ${wrapperAddress} to ${testUnwrap.address} (tx: ${setUpgradeHash})...`,
            )
            await viem.waitForTransactionSuccess(setUpgradeHash)
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

        const setApprovalHash = await (
          testUnwrap as any
        ).write.setWrapperApproval([wrapperAddress, true], {
          account: contractOwnerClient!.account,
        })
        console.log(
          `Approving wrapper ${wrapperAddress} (tx: ${setApprovalHash})...`,
        )
        await viem.waitForTransactionSuccess(setApprovalHash)
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
