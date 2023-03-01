import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const TESTNET_WRAPPER_ADDRESSES = {
  goerli: [
    '0x582224b8d4534F4749EFA4f22eF7241E0C56D4B8',
    '0xEe1F756aCde7E81B2D8cC6aB3c8A1E2cE6db0F39',
    '0x060f1546642E67c485D56248201feA2f9AB1803C',
    // Add more testnet NameWrapper addresses here...
  ],
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, getUnnamedAccounts, deployments, network } = hre
  const { deploy } = deployments
  const { deployer, owner, ...namedAccounts } = await getNamedAccounts()
  const unnamedAccounts = await getUnnamedAccounts()
  const accounts = [
    deployer,
    owner,
    ...Object.values(namedAccounts),
    ...unnamedAccounts,
  ]

  // only deploy on testnets
  if (network.name === 'mainnet') return

  const registry = await ethers.getContract('ENSRegistry', owner)
  const registrar = await ethers.getContract(
    'BaseRegistrarImplementation',
    owner,
  )

  await deploy('TestUnwrap', {
    from: deployer,
    args: [registry.address, registrar.address],
    log: true,
  })

  const testnetWrapperAddresses =
    TESTNET_WRAPPER_ADDRESSES[
      network.name as keyof typeof TESTNET_WRAPPER_ADDRESSES
    ]

  if (!testnetWrapperAddresses || testnetWrapperAddresses.length === 0) {
    console.log('No testnet wrappers found, skipping')
    return
  }

  let testUnwrap = await ethers.getContract('TestUnwrap')
  const contractOwner = await testUnwrap.owner()
  const canModifyTestUnwrap = accounts.includes(contractOwner)

  if (!canModifyTestUnwrap) {
    console.log(
      "WARNING: Can't modify TestUnwrap, will not run setWrapperApproval()",
    )
  } else {
    testUnwrap = testUnwrap.connect(ethers.provider.getSigner(contractOwner))
  }

  for (const wrapperAddress of testnetWrapperAddresses) {
    let wrapper = await ethers.getContractAt('NameWrapper', wrapperAddress)
    const upgradeContract = await wrapper.upgradeContract()

    const isUpgradeSet = upgradeContract === testUnwrap.address
    const isApprovedWrapper = await testUnwrap.approvedWrapper(wrapperAddress)

    if (isUpgradeSet && isApprovedWrapper) {
      console.log(`Wrapper ${wrapperAddress} already set up, skipping contract`)
      continue
    }

    if (!isUpgradeSet) {
      const owner = await wrapper.owner()
      const canModifyWrapper = accounts.includes(owner)
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
        wrapper = wrapper.connect(ethers.provider.getSigner(owner))
        const tx = await wrapper.setUpgradeContract(testUnwrap.address)
        console.log(
          `Setting upgrade contract for ${wrapperAddress} to ${testUnwrap.address} (tx: ${tx.hash})...`,
        )
        await tx.wait()
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
    const tx = await testUnwrap.setWrapperApproval(wrapperAddress, true)
    console.log(`Approving wrapper ${wrapperAddress} (tx: ${tx.hash})...`)
    await tx.wait()
  }
}

func.id = 'test-unwrap'
func.tags = ['wrapper', 'TestUnwrap']
func.dependencies = ['BaseRegistrarImplementation', 'registry']

export default func
