const fs = require('fs')
const n = require('eth-ens-namehash')
const envfile = require('envfile')
const sourcePath = './.env'
const packet = require('dns-packet')
const { utils, BigNumber: BN } = ethers
const { use, expect } = require('chai')
const { solidity } = require('ethereum-waffle')

use(solidity)

const namehash = n.hash
const labelhash = (label) => utils.keccak256(utils.toUtf8Bytes(label))

function encodeName(name) {
  return '0x' + packet.name.encode(name).toString('hex')
}

async function main() {
    const sourceFile = fs.readFileSync(sourcePath)
    const parsedFile = envfile.parse(sourceFile);
    const [deployer] = await ethers.getSigners();
    console.log({parsedFile})
    const CAN_DO_EVERYTHING = 0
    const CANNOT_UNWRAP = 1
    const CANNOT_SET_RESOLVER = 8
    const firstAddress = deployer.address
    console.log("Account balance:", (await deployer.getBalance()).toString());
    const {
      REGISTRY_ADDRESS:registryAddress,
      REGISTRAR_ADDRESS:registrarAddress,
      WRAPPER_ADDRESS:wrapperAddress
    } = parsedFile
    console.log({
      registryAddress,registrarAddress, wrapperAddress, firstAddress
    })
    const EnsRegistry = await (await ethers.getContractFactory("ENSRegistry")).attach(registryAddress);
    const BaseRegistrar = await (await ethers.getContractFactory("BaseRegistrarImplementation")).attach(registrarAddress);
    const NameWrapper = await (await ethers.getContractFactory("NameWrapper")).attach(wrapperAddress);
    const namehashedname = namehash('postmigration.eth')
    const labelhashedname = labelhash('postmigration')
    console.log('postimigration.eth', {namehashedname, labelhashedname})
    await BaseRegistrar.setApprovalForAll(NameWrapper.address, true)
    await EnsRegistry.setApprovalForAll(NameWrapper.address, true)
    await NameWrapper.wrapETH2LD('postmigration', firstAddress, CAN_DO_EVERYTHING)
    await NameWrapper.setSubnodeOwnerAndWrap(namehash('postmigration.eth'), 'sub1', firstAddress, CAN_DO_EVERYTHING)
    await NameWrapper.setSubnodeOwnerAndWrap(namehash('postmigration.eth'), 'sub2', firstAddress, CAN_DO_EVERYTHING)
    await NameWrapper.burnFuses(namehash('sub2.postmigration.eth'),CANNOT_UNWRAP)
    await NameWrapper.burnFuses(namehash('sub2.postmigration.eth'),CANNOT_SET_RESOLVER)
    await NameWrapper.unwrap(namehash('postmigration.eth'), labelhash('sub1'), firstAddress)
    let tokenURI = await NameWrapper.uri(namehashedname)
    console.log('owner', {tokenURI})
  }
  
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });