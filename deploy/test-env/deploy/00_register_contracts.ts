/* eslint-disable import/no-extraneous-dependencies */

/* eslint-disable no-await-in-loop */
import { DeployFunction } from 'hardhat-deploy/types.js'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { namehash } from 'viem'

const names = [
  {
    label: 'data',
    namedOwner: 'owner',
    data: [],
    reverseRecord: false,
    fuses: 0,
    subnames: [
      {
        label: 'eth-usd',
        namedOwner: 'owner',
        contract: 'DummyOracle',
      },
    ],
  },
] as const

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network, viem } = hre
  const allNamedClients = await viem.getNamedClients()

  const controller = await viem.getContract('ETHRegistrarController')
  const publicResolver = await viem.getContract('PublicResolver')

  await network.provider.send('anvil_setBlockTimestampInterval', [60])

  for (const { label, namedOwner, data, reverseRecord, fuses, subnames } of names) {
    // eslint-disable-next-line no-restricted-syntax
    const secret = '0x0000000000000000000000000000000000000000000000000000000000000000'
    const owner = allNamedClients[namedOwner].account
    const resolver = publicResolver.address
    const duration = 31536000n
    const wrapperExpiry = 1659467455n + duration

    const commitment = await controller.read.makeCommitment([
      label,
      owner.address,
      duration,
      secret,
      resolver,
      data,
      reverseRecord,
      fuses,
    ])

    const commitTx = await controller.write.commit([commitment])
    console.log(`Commiting commitment for ${label}.eth (tx: ${commitTx})...`)

    await network.provider.send('evm_mine')

    const { base: price } = await controller.read.rentPrice([label, duration])

    const registerTx = await controller.write.register(
      [label, owner.address, duration, secret, resolver, data, reverseRecord, fuses],
      {
        value: price,
        account: owner,
      },
    )
    console.log(`Registering name ${label}.eth (tx: ${registerTx})...`)

    if (subnames) {
      console.log(`Setting subnames for ${label}.eth...`)
      const nameWrapper = await viem.getContract('NameWrapper')
      for (const {
        label: subnameLabel,
        namedOwner: namedSubnameOwner,
        contract: subnameContract,
      } of subnames) {
        const subnameOwner = allNamedClients[namedSubnameOwner].account
        const setSubnameHash = await nameWrapper.write.setSubnodeRecord(
          [
            namehash(`${label}.eth`),
            subnameLabel,
            subnameOwner.address,
            resolver,
            0n,
            0,
            wrapperExpiry,
          ],
          {
            account: subnameOwner,
          },
        )
        console.log(` - ${subnameLabel} (tx: ${setSubnameHash})...`)
        await viem.waitForTransactionSuccess(setSubnameHash)

        if (subnameContract) {
          console.log('setting', subnameContract, 'contract for', `${subnameLabel}.${label}.eth`)

          const contract = await viem.getContract(subnameContract)

          const hash = namehash(`${subnameLabel}.${label}.eth`)

          console.log('setting address records for ', `${subnameLabel}.${label}.eth`)

          const setAddrHash = await publicResolver.write.setAddr([hash, 60n, contract.address], {
            account: subnameOwner,
          })
          console.log(` - ${subnameContract} ${contract.address} (tx: ${setAddrHash})...`)
          await viem.waitForTransactionSuccess(setAddrHash)
        }
      }
    }
  }

  await network.provider.send('anvil_setBlockTimestampInterval', [1])

  return true
}

func.id = 'register-contracts'
func.tags = ['register-contracts']
func.dependencies = ['ETHRegistrarController']
func.runAtTheEnd = true

export default func
