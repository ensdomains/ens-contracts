const fs = require('fs')
const envfile = require('envfile')
const sourcePath = './env'
const ensAppSourcePath = '../ens-app/cypress.env.json'
async function main() {
  const addresses = JSON.parse(fs.readFileSync(ensAppSourcePath, 'utf8'))
  console.log({addresses})

  if(!(addresses.ensAddress && addresses.baseRegistrarAddress)){
    throw('please run yarn preTest on ../ens-app')
  }
  const registryAddress = addresses.ensAddress
  const registrarAddress = addresses.baseRegistrarAddress


    const [deployer] = await ethers.getSigners();
  
    console.log(
      "Deploying contracts with the account:",
      deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());
    const NameWrapper = await ethers.getContractFactory("NameWrapper");
    console.log({
      registryAddress, registrarAddress
    })
    const StaticMetadataService = await ethers.getContractFactory("StaticMetadataService");
    console.log(2)
    const metadata = await StaticMetadataService.deploy(
      'https://ens.domains'
    )
    console.log(3)
    console.log("StaticMetadataService address:", metadata.address);

    const wrapper = await NameWrapper.deploy(
      registryAddress,
      registrarAddress,
      metadata.address
    );
  
    console.log("Wrapper address:", wrapper.address);

    const parsedFile = envfile.parse(sourcePath);
    parsedFile.REGISTRY_ADDRESS = registryAddress
    parsedFile.REGISTRAR_ADDRESS = registrarAddress
    parsedFile.METADATA_ADDRESS = metadata.address
    parsedFile.WRAPPER_ADDRESS = wrapper.address
    fs.writeFileSync('./.env', envfile.stringify(parsedFile))
  }
  
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });