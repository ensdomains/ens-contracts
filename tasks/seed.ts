import fs from 'fs'

import * as envfile from 'envfile'
import n from 'eth-ens-namehash'
import { task } from 'hardhat/config'

const namehash = n.hash
const labelhash = (utils: any, label: string) =>
  utils.keccak256(utils.toUtf8Bytes(label))

function getOpenSeaUrl(ethers: any, contract: string, namehashedname: string) {
  const tokenId = ethers.BigNumber.from(namehashedname).toString()
  return `https://testnets.opensea.io/assets/${contract}/${tokenId}`
}

task('seed', 'Creates test subbdomains and wraps them with Namewrapper')
  .addPositionalParam('name', 'The ENS label to seed subdomains')
  .setAction(async ({ name }, hre) => {
    let parsedFile
    try {
      parsedFile = envfile.parse(fs.readFileSync('./.env', 'utf8'))
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error
      }
      console.warn(
        '.env file is empty, fill as in README to complete seed action',
      )
      return
    }
    const ethers = hre.ethers
    const [deployer] = await ethers.getSigners()
    const CAN_DO_EVERYTHING = 0
    const CANNOT_UNWRAP = 1
    const CANNOT_SET_RESOLVER = 8
    const firstAddress = deployer.address
    const {
      REGISTRY_ADDRESS: registryAddress,
      REGISTRAR_ADDRESS: registrarAddress,
      WRAPPER_ADDRESS: wrapperAddress,
      RESOLVER_ADDRESS: resolverAddress,
    } = parsedFile
    if (
      !(
        registryAddress &&
        registrarAddress &&
        wrapperAddress &&
        resolverAddress
      )
    ) {
      throw 'Set addresses on .env'
    }
    console.log('Account balance:', (await deployer.getBalance()).toString())
    console.log({
      registryAddress,
      registrarAddress,
      wrapperAddress,
      resolverAddress,
      firstAddress,
      name,
    })
    const EnsRegistry = await (
      await ethers.getContractFactory('ENSRegistry')
    ).attach(registryAddress)
    const BaseRegistrar = await (
      await ethers.getContractFactory('BaseRegistrarImplementation')
    ).attach(registrarAddress)
    const NameWrapper = await (
      await ethers.getContractFactory('NameWrapper')
    ).attach(wrapperAddress)
    const Resolver = await (
      await ethers.getContractFactory('PublicResolver')
    ).attach(resolverAddress)
    const domain = `${name}.eth`
    const namehashedname = namehash(domain)

    await (
      await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
    ).wait()
    console.log('BaseRegistrar setApprovalForAll successful')

    await (
      await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
    ).wait()
    console.log('EnsRegistry setApprovalForAll successful')

    await (
      await NameWrapper.wrapETH2LD(
        name,
        firstAddress,
        CAN_DO_EVERYTHING,
        0,
        resolverAddress,
        {
          gasLimit: 10000000,
        },
      )
    ).wait()
    console.log(
      `Wrapped NFT for ${domain} is available at ${getOpenSeaUrl(
        ethers,
        NameWrapper.address,
        namehashedname,
      )}`,
    )

    await (
      await NameWrapper.setSubnodeOwner(
        namehash(`${name}.eth`),
        'sub1',
        firstAddress,
        CAN_DO_EVERYTHING,
        0,
      )
    ).wait()
    console.log('NameWrapper setSubnodeOwner successful for sub1')

    await (
      await NameWrapper.setSubnodeOwner(
        namehash(`${name}.eth`),
        'sub2',
        firstAddress,
        CAN_DO_EVERYTHING,
        0,
      )
    ).wait()
    console.log('NameWrapper setSubnodeOwner successful for sub2')

    await (
      await NameWrapper.setResolver(
        namehash(`sub2.${name}.eth`),
        resolverAddress,
      )
    ).wait()
    console.log('NameWrapper setResolver successful for sub2')

    await (
      await Resolver.setText(
        namehash(`sub2.${name}.eth`),
        'domains.ens.nft.image',
        '',
      )
    ).wait()
    await (
      await Resolver.setText(
        namehash(`sub2.${name}.eth`),
        'avatar',
        'https://i.imgur.com/1JbxP0P.png',
      )
    ).wait()
    console.log(
      `Wrapped NFT for sub2.${name}.eth is available at ${getOpenSeaUrl(
        ethers,
        NameWrapper.address,
        namehash(`sub2.${name}.eth`),
      )}`,
    )

    await (
      await NameWrapper.setFuses(namehash(`${name}.eth`), CANNOT_UNWRAP, {
        gasLimit: 10000000,
      })
    ).wait()
    console.log('NameWrapper set CANNOT_UNWRAP fuse successful for sub2')

    await (
      await NameWrapper.setFuses(namehash(`sub2.${name}.eth`), CANNOT_UNWRAP, {
        gasLimit: 10000000,
      })
    ).wait()
    console.log('NameWrapper set CANNOT_UNWRAP fuse successful for sub2')

    await (
      await NameWrapper.setFuses(
        namehash(`sub2.${name}.eth`),
        CANNOT_SET_RESOLVER,
        {
          gasLimit: 10000000,
        },
      )
    ).wait()
    console.log('NameWrapper set CANNOT_SET_RESOLVER fuse successful for sub2')

    await (
      await NameWrapper.unwrap(
        namehash(`${name}.eth`),
        labelhash(ethers.utils, 'sub1'),
        firstAddress,
        {
          gasLimit: 10000000,
        },
      )
    ).wait()
    console.log(`NameWrapper unwrap successful for ${name}`)
  })
