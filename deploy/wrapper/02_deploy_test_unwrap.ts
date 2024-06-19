import type { DeployFunction } from 'hardhat-deploy/types.js'
import type { Address } from 'viem'

const TESTNET_WRAPPER_ADDRESSES = {
  goerli: [
    '0x582224b8d4534F4749EFA4f22eF7241E0C56D4B8',
    '0xEe1F756aCde7E81B2D8cC6aB3c8A1E2cE6db0F39',
    '0x060f1546642E67c485D56248201feA2f9AB1803C',
    // Add more testnet NameWrapper addresses here...
  ],
}

const func: DeployFunction = async function (hre) {
  const { deployments, network, viem } = hre

  const { deployer, owner, ...namedAccounts } = await viem.getNamedClients()
  const unnamedClients = await viem.getUnnamedClients()
  const clients = [deployer, owner, ...unnamedClients]

  // only deploy on testnets
  if (network.name === 'mainnet') return

  const registry = await viem.getContract('ENSRegistry', owner)
  const registrar = await viem.getContract('BaseRegistrarImplementation', owner)

  await viem.deploy('TestUnwrap', [registry.address, registrar.address])

  const testnetWrapperAddresses = TESTNET_WRAPPER_ADDRESSES[
    network.name as keyof typeof TESTNET_WRAPPER_ADDRESSES
  ] as Address[]

  if (!testnetWrapperAddresses || testnetWrapperAddresses.length === 0) {
    console.log('No testnet wrappers found, skipping')
    return
  }

  let testUnwrap = await viem.getContract('TestUnwrap')
  const contractOwner = await testUnwrap.read.owner()
  const contractOwnerClient = clients.find((c) => c.address === contractOwner)
  const canModifyTestUnwrap = !!contractOwnerClient

  if (!canModifyTestUnwrap) {
    console.log(
      "WARNING: Can't modify TestUnwrap, will not run setWrapperApproval()",
    )
  } else {
    testUnwrap = await viem.getContract('TestUnwrap', contractOwnerClient)
  }

  for (const wrapperAddress of testnetWrapperAddresses) {
    let wrapper = await viem.getContractAt('NameWrapper', wrapperAddress)
    const upgradeContract = await wrapper.read.upgradeContract()

    const isUpgradeSet = upgradeContract === testUnwrap.address
    const isApprovedWrapper = await testUnwrap.read.approvedWrapper([
      wrapperAddress,
    ])

    if (isUpgradeSet && isApprovedWrapper) {
      console.log(`Wrapper ${wrapperAddress} already set up, skipping contract`)
      continue
    }

    if (!isUpgradeSet) {
      const owner = await wrapper.read.owner()
      const wrapperOwnerClient = clients.find((c) => c.address === owner)
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
        wrapper = await viem.getContractAt('NameWrapper', wrapperAddress, {
          client: wrapperOwnerClient,
        })
        const hash = await wrapper.write.setUpgradeContract([
          testUnwrap.address,
        ])
        console.log(
          `Setting upgrade contract for ${wrapperAddress} to ${testUnwrap.address} (tx: ${hash})...`,
        )
        await viem.waitForTransactionSuccess(hash)
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

    const hash = await testUnwrap.write.setWrapperApproval([
      wrapperAddress,
      true,
    ])
    console.log(`Approving wrapper ${wrapperAddress} (tx: ${hash})...`)
    await viem.waitForTransactionSuccess(hash)
  }
}

func.id = 'test-unwrap'
func.tags = ['wrapper', 'TestUnwrap']
func.dependencies = ['BaseRegistrarImplementation', 'registry']

export default func
