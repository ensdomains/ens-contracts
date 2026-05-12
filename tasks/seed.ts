import * as dotenv from 'dotenv'
import type { NewTaskActionFunction } from 'hardhat/types/tasks'
import { Address, Hex, hexToBigInt } from 'viem'
import { labelhash, namehash } from 'viem/ens'

function getOpenSeaUrl(contract: Address, namehashedname: Hex) {
  const tokenId = hexToBigInt(namehashedname).toString()
  return `https://testnets.opensea.io/assets/${contract}/${tokenId}`
}

type SeedArgs = {
  name: string
}

const taskSeed: NewTaskActionFunction<SeedArgs> = async ({ name }, hre) => {
  const { viem } = await hre.network.connect()
  const { parsed: parsedFile, error } = dotenv.config({
    path: './.env',
    encoding: 'utf8',
  })

  if (error) throw error
  if (!parsedFile) throw new Error('Failed to parse .env')

  const [deployer] = await viem.getWalletClients()
  const CAN_DO_EVERYTHING = 0
  const CANNOT_UNWRAP = 1
  const CANNOT_SET_RESOLVER = 8
  const firstAddress = deployer.account.address
  const {
    REGISTRY_ADDRESS: registryAddress,
    REGISTRAR_ADDRESS: registrarAddress,
    WRAPPER_ADDRESS: wrapperAddress,
    RESOLVER_ADDRESS: resolverAddress,
  } = parsedFile as Record<string, Address>
  if (
    !(registryAddress && registrarAddress && wrapperAddress && resolverAddress)
  ) {
    throw 'Set addresses on .env'
  }
  const publicClient = await viem.getPublicClient()
  console.log(
    'Account balance:',
    publicClient.getBalance({ address: deployer.account.address }),
  )
  console.log({
    registryAddress,
    registrarAddress,
    wrapperAddress,
    resolverAddress,
    firstAddress,
    name,
  })
  const EnsRegistry = await viem.getContractAt('ENSRegistry', registryAddress)

  const BaseRegistrar = await viem.getContractAt(
    'BaseRegistrarImplementation',
    registrarAddress,
  )

  const NameWrapper = await viem.getContractAt('NameWrapper', wrapperAddress)

  const Resolver = await viem.getContractAt('PublicResolver', resolverAddress)

  const domain = `${name}.eth`
  const namehashedname = namehash(domain)

  await BaseRegistrar.write.setApprovalForAll([NameWrapper.address, true])

  console.log('BaseRegistrar setApprovalForAll successful')

  await EnsRegistry.write.setApprovalForAll([NameWrapper.address, true])

  await NameWrapper.write.wrapETH2LD(
    [name, firstAddress, CAN_DO_EVERYTHING, resolverAddress],
    {
      gas: 10000000n,
    },
  )

  console.log(
    `Wrapped NFT for ${domain} is available at ${getOpenSeaUrl(
      NameWrapper.address,
      namehashedname,
    )}`,
  )

  await NameWrapper.write.setSubnodeOwner([
    namehash(`${name}.eth`),
    'sub1',
    firstAddress,
    CAN_DO_EVERYTHING,
    0n,
  ])

  console.log('NameWrapper setSubnodeOwner successful for sub1')

  await NameWrapper.write.setSubnodeOwner([
    namehash(`${name}.eth`),
    'sub2',
    firstAddress,
    CAN_DO_EVERYTHING,
    0n,
  ])

  console.log('NameWrapper setSubnodeOwner successful for sub2')

  await NameWrapper.write.setResolver([
    namehash(`sub2.${name}.eth`),
    resolverAddress,
  ])

  console.log('NameWrapper setResolver successful for sub2')

  await Resolver.write.setText([
    namehash(`sub2.${name}.eth`),
    'domains.ens.nft.image',
    '',
  ])

  await Resolver.write.setText([
    namehash(`sub2.${name}.eth`),
    'avatar',
    'https://i.imgur.com/1JbxP0P.png',
  ])

  console.log(
    `Wrapped NFT for sub2.${name}.eth is available at ${getOpenSeaUrl(
      NameWrapper.address,
      namehash(`sub2.${name}.eth`),
    )}`,
  )

  await NameWrapper.write.setFuses([namehash(`${name}.eth`), CANNOT_UNWRAP], {
    gas: 10000000n,
  })

  console.log('NameWrapper set CANNOT_UNWRAP fuse successful for sub2')

  await NameWrapper.write.setFuses(
    [namehash(`sub2.${name}.eth`), CANNOT_UNWRAP],
    {
      gas: 10000000n,
    },
  )

  console.log('NameWrapper set CANNOT_UNWRAP fuse successful for sub2')

  await NameWrapper.write.setFuses(
    [namehash(`sub2.${name}.eth`), CANNOT_SET_RESOLVER],
    {
      gas: 10000000n,
    },
  )

  console.log('NameWrapper set CANNOT_SET_RESOLVER fuse successful for sub2')

  await NameWrapper.write.unwrap(
    [namehash(`${name}.eth`), labelhash('sub1'), firstAddress],
    {
      gas: 10000000n,
    },
  )

  console.log(`NameWrapper unwrap successful for ${name}`)
}

export default taskSeed
