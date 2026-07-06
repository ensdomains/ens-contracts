// scripts/test13-reverse-record.js
// Run in Remix via: right-click -> Run

import { ethers } from 'ethers'

// ---- Fill these in ----
const REGISTRY_ADDR = '0xDB17057Df68B5FD4420481fAC03f77524283d234';
const BASE_REGISTRAR_ADDR = '0x828D90d597aE4EACca8bA95Cb982597522e3d07A';
const REVERSE_REGISTRAR_ADDR = '0x9E4df99d31fcDbA4a0ba0e50A2F4D1aF0E6a3d71';
const PRICE_ORACLE_ADDR = '0x2ec973aC77a1Bb70316835A236EF81EC5AE5167A';
const CONTROLLER_ADDR = '0x811EF8079124FDC01B852de72806961f4fB57F59';
const PUBLIC_RESOLVER_ADDR = '0xC32dD6c4b1e380F915aD02a57c36B6776584fD36';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomSecret() {
  return ethers.utils.hexlify(ethers.utils.randomBytes(32));
}

function randomLabel(prefix) {
  return `${prefix}${Math.floor(Math.random() * 1000000)}`;
}

async function getArtifact(contractName) {
  const result = await remix.call('compilerArtefacts', 'getArtefactsByContractName', contractName);
  if (!result || !result.artefact) {
    throw new Error(`Could not find compiled artifact for contract: ${contractName}`);
  }
  return result.artefact;
}

async function attach(contractName, address, signerOrProvider) {
  const artifact = await getArtifact(contractName);
  return new ethers.Contract(address, artifact.abi, signerOrProvider);
}

(async () => {
  try {
    const provider = new ethers.providers.Web3Provider(web3Provider);
    const signer = provider.getSigner();
    const myAddress = await signer.getAddress();
    console.log('Testing as:', myAddress);

    const reverseRegistrar = await attach('ReverseRegistrar', REVERSE_REGISTRAR_ADDR, signer);
    const controller = await attach('ETHRegistrarController', CONTROLLER_ADDR, signer);
    const publicResolver = await attach('PublicResolver', PUBLIC_RESOLVER_ADDR, signer);

    console.log('\n=== TEST 13: Reverse record set during registration ===');

    const configuredDefaultResolver = await reverseRegistrar.defaultResolver();
    console.log('ReverseRegistrar default resolver:', configuredDefaultResolver, '| Expected:', PUBLIC_RESOLVER_ADDR);

    const newLabel = randomLabel('reversetest');
    const reverseRegistration = {
      label: newLabel,
      owner: myAddress,
      duration: 28 * 24 * 60 * 60,
      secret: randomSecret(),
      resolver: PUBLIC_RESOLVER_ADDR,
      data: [],
      reverseRecord: 1, // REVERSE_RECORD_ETHEREUM_BIT
      referrer: ethers.constants.HashZero,
    };

    const commitment = await controller.makeCommitment(reverseRegistration);
    let tx = await controller.commit(commitment);
    await tx.wait();
    console.log(`Committed for "${newLabel}". Waiting 65s for commitment to mature...`);
    await sleep(65000);

    const price = await controller.rentPrice(newLabel, reverseRegistration.duration);
    tx = await controller.register(reverseRegistration, {
      value: price.base.add(price.premium),
    });
    await tx.wait();
    console.log(`"${newLabel}" registered with reverse record requested.`);

    const reverseNodeForMe = await reverseRegistrar.node(myAddress);
    console.log('Reverse node for my address:', reverseNodeForMe);

    try {
      const resolvedName = await publicResolver['name(bytes32)'](reverseNodeForMe);
      console.log('Resolved reverse name:', resolvedName, `| Expected: ${newLabel}.etn`);
    } catch (e) {
      console.log('Reverse name read failed. Full error:', e.message || e);
    }

    console.log('\n--- Test 13 completed ---');

  } catch (e) {
    console.error('Test script error:', e.message || e);
  }
})();