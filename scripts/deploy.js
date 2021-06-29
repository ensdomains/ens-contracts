const fs = require('fs')
const envfile = require('envfile')
const sourcePath = './env'
const ensAppSourcePath = '../ens-app/cypress.env.json'
const { network } = require("hardhat");
const parsedFile = envfile.parse(fs.readFileSync('./.env'));

async function main() {
  let registryAddress, registrarAddress, metadataUrl
  if(network.name === 'localhost'){
    const addresses = JSON.parse(fs.readFileSync(ensAppSourcePath, 'utf8'))
    registryAddress = addresses.ensAddress
    registrarAddress = addresses.baseRegistrarAddress
    metadataUrl = 'http://localhost:8080/name/0x{id}'
    if(!(addresses.ensAddress && addresses.baseRegistrarAddress)){
      throw('please run yarn preTest on ../ens-app')
    }  
  }else{
    // Regisry and registrar addresses are same across all networks
    registryAddress = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
    registrarAddress = '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85'
    metadataUrl = 'https://ens-metadata-service.appspot.com/name/0x{id}'
  }
  const [deployer] = await ethers.getSigners();
    
  console.log(`Deploying contracts to ${network.name} with the account:${deployer.address}`);
  const balance = (await deployer.getBalance()).toString()
  console.log("Account balance:", balance, balance > 0);
  if(balance === 0){
    throw(`Not enough eth`)
  }

  const NameWrapper = await ethers.getContractFactory("NameWrapper");
  console.log({
    registryAddress, registrarAddress
  })
  const StaticMetadataService = await ethers.getContractFactory("StaticMetadataService");
  const metadata = await StaticMetadataService.deploy(metadataUrl)
  await metadata.deployTransaction.wait()
  console.log("StaticMetadataService address:", metadata.address);
  const wrapper = await NameWrapper.deploy(
    registryAddress,
    registrarAddress,
    metadata.address
  );
  await wrapper.deployTransaction.wait()
  console.log("Wrapper address:", wrapper.address);
    ethers.ContractFactor
  const PublicResolver = await ethers.getContractFactory("PublicResolver");
  const metadata = {address:'0xecc5d54d2da9e23caa5c70cda83ecd6ea3be7345'}
  const wrapper = {address:'0x9029c1574f91696026358d4edB0De773d0E04aeD'}
  const resolver = await PublicResolver.deploy(registryAddress, wrapper.address)
  await resolver.deployTransaction.wait()
  console.log("Resolver address:", resolver.address);
  parsedFile.REGISTRY_ADDRESS = registryAddress
  parsedFile.REGISTRAR_ADDRESS = registrarAddress
  parsedFile.METADATA_ADDRESS = metadata.address
  parsedFile.WRAPPER_ADDRESS = wrapper.address
  parsedFile.RESOLVER_ADDRESS = resolver.address
  fs.writeFileSync('./.env', envfile.stringify(parsedFile))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });