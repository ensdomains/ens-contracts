// scripts/deploy.js
// Run in Remix via: right-click -> Run (with contracts compiled first)

import { ethers } from 'ethers'

// ---- CONFIG: adjust these before running ----
const MIN_COMMITMENT_AGE = 60;        // seconds
const MAX_COMMITMENT_AGE = 86400;     // seconds (24h)
const ETN_NODE = '0x69a3977d40595dbc343e3fa6ddbd26dbe31cc237836622384941b3c5148974cd';

const REVOKE_DEPLOYER_WHITELIST_AFTER_SETUP = true;

async function getArtifact(contractName, filePath) {
  const lookupName = filePath ? `${filePath}:${contractName}` : contractName;
  const result = await remix.call('compilerArtefacts', 'getArtefactsByContractName', lookupName);
  if (!result || !result.artefact) {
    throw new Error(`Could not find compiled artifact for contract: ${lookupName}. Make sure it has been compiled.`);
  }
  return result.artefact;
}

async function deploy(contractName, signer, args = [], filePath) {
  const artifact = await getArtifact(contractName, filePath);
  const bytecode = artifact.bytecode ?? artifact.evm?.bytecode?.object;
  if (!bytecode) {
    console.log('Artifact shape for debugging:', JSON.stringify(artifact, null, 2).slice(0, 800));
    throw new Error(`Could not resolve bytecode for ${contractName}`);
  }
  const factory = new ethers.ContractFactory(artifact.abi, bytecode, signer);
  console.log(`Deploying ${contractName}...`);
  const contract = await factory.deploy(...args);
  await contract.deployed();
  console.log(`${contractName} deployed at: ${contract.address}`);
  return contract;
}

(async () => {
  try {
    const provider = new ethers.providers.Web3Provider(web3Provider);
    const signer = provider.getSigner();
    const deployerAddress = await signer.getAddress();
    console.log('Deploying from:', deployerAddress);

    // ---- 1. Core contract deployments (excluding PublicResolver for now) ----

    const registry = await deploy('ENSRegistry', signer);

    const baseRegistrar = await deploy('BaseRegistrarImplementation', signer, [
      registry.address,
      ETN_NODE,
    ]);

    const reverseRegistrar = await deploy('ReverseRegistrar', signer, [
      registry.address,
    ]);

    const priceOracle = await deploy('StablePriceOracle', signer);

    const controller = await deploy('ETHRegistrarController', signer, [
      baseRegistrar.address,
      priceOracle.address,
      MIN_COMMITMENT_AGE,
      MAX_COMMITMENT_AGE,
      reverseRegistrar.address,
      registry.address,
    ]);

    // ---- 2. Registry wiring ----
    console.log('\nWiring registry...');

    let tx = await registry.setSubnodeCreator(deployerAddress, true);
    await tx.wait();
    console.log('Registry: deployer temporarily whitelisted to bootstrap nodes');

    // --- .etn node ---
    const labelhashEtn = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('etn'));
    tx = await registry.setSubnodeOwner(
      ethers.constants.HashZero,
      labelhashEtn,
      baseRegistrar.address
    );
    await tx.wait();
    console.log('Registry: .etn node assigned to BaseRegistrar');

    // --- reverse node tree: reverse -> addr.reverse ---
    const labelhashReverse = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('reverse'));
    tx = await registry.setSubnodeOwner(
      ethers.constants.HashZero,
      labelhashReverse,
      deployerAddress
    );
    await tx.wait();
    console.log('Registry: "reverse" node created, owned by deployer');

    const reverseNode = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['bytes32', 'bytes32'],
        [ethers.constants.HashZero, labelhashReverse]
      )
    );

    const labelhashAddr = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('addr'));
    tx = await registry.setSubnodeOwner(
      reverseNode,
      labelhashAddr,
      reverseRegistrar.address
    );
    await tx.wait();
    console.log('Registry: "addr.reverse" node created, owned by ReverseRegistrar');

    // --- permanent whitelist entries ---
    tx = await registry.setSubnodeCreator(baseRegistrar.address, true);
    await tx.wait();
    console.log('Registry: BaseRegistrar whitelisted as subnode creator');

    tx = await registry.setSubnodeCreator(reverseRegistrar.address, true);
    await tx.wait();
    console.log('Registry: ReverseRegistrar whitelisted as subnode creator');

    if (REVOKE_DEPLOYER_WHITELIST_AFTER_SETUP) {
      tx = await registry.setSubnodeCreator(deployerAddress, false);
      await tx.wait();
      console.log('Registry: deployer whitelist entry revoked');
    }

    // ---- 3. Deploy PublicResolver (safe now that addr.reverse resolves) ----

    const publicResolver = await deploy('PublicResolver', signer, [
      registry.address,
      controller.address,
      reverseRegistrar.address,
    ]);

    // ---- 4. Remaining contract wiring ----
    console.log('\nWiring remaining contracts...');

    tx = await baseRegistrar.addController(controller.address);
    await tx.wait();
    console.log('BaseRegistrar: controller authorized');

    tx = await reverseRegistrar.setDefaultResolver(publicResolver.address);
    await tx.wait();
    console.log('ReverseRegistrar: default resolver set');

    tx = await reverseRegistrar.setController(controller.address, true);
    await tx.wait();
    console.log('ReverseRegistrar: ETHRegistrarController authorized as controller');

    // ---- Summary ----
    console.log('\n--- Deployment complete ---');
    console.log('ENSRegistry:                 ', registry.address);
    console.log('BaseRegistrarImplementation: ', baseRegistrar.address);
    console.log('ReverseRegistrar:            ', reverseRegistrar.address);
    console.log('StablePriceOracle:           ', priceOracle.address);
    console.log('ETHRegistrarController:      ', controller.address);
    console.log('PublicResolver:              ', publicResolver.address);

  } catch (e) {
    console.error(e.message || e);
  }
})();