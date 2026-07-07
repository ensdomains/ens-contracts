// scripts/test.js
// Run in Remix via: right-click -> Run

import { ethers } from 'ethers'

// ---- Fill these in from your deployment output ----
const REGISTRY_ADDR = '0x78EA71136e82eDBF2C06354D6Ef98b8d7e3de544';
const BASE_REGISTRAR_ADDR = '0x81EcACe6dD13AFf8AdA5236C93819cB943FdED63';
const REVERSE_REGISTRAR_ADDR = '0x00cFF59f61c68652Ad96F127Dc80B2C112a5a1F3';
const PRICE_ORACLE_ADDR = '0x1928e9132DF17dfeF55C12E64cE86b53D31A90D5';
const CONTROLLER_ADDR = '0x68b9656899CF37F5AbD9B9000F8C5200E7db2f04';
const PUBLIC_RESOLVER_ADDR = '0x0764C6aD0F7FeD7444F3A314192E50DfB6bA7c14';

const TEST_LABEL = 'testname' + Math.floor(Math.random() * 1000000); // fresh label every run
const REGISTRATION_DURATION = 28 * 24 * 60 * 60; // 28 days, matches MIN_REGISTRATION_DURATION

function randomSecret() {
  return ethers.utils.hexlify(ethers.utils.randomBytes(32));
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  try {
    const provider = new ethers.providers.Web3Provider(web3Provider);
    const signer = provider.getSigner();
    const myAddress = await signer.getAddress();
    console.log('Testing as:', myAddress);
    console.log('Using label:', TEST_LABEL);

    const registry = await attach('ENSRegistry', REGISTRY_ADDR, signer);
    const baseRegistrar = await attach('BaseRegistrarImplementation', BASE_REGISTRAR_ADDR, signer);
    const reverseRegistrar = await attach('ReverseRegistrar', REVERSE_REGISTRAR_ADDR, signer);
    const priceOracle = await attach('StablePriceOracle', PRICE_ORACLE_ADDR, signer);
    const controller = await attach('ETHRegistrarController', CONTROLLER_ADDR, signer);
    const publicResolver = await attach('PublicResolver', PUBLIC_RESOLVER_ADDR, signer);

    // ---- TEST 1: Price check ----
    console.log('\n=== TEST 1: rentPrice() ===');
    const price = await controller.rentPrice(TEST_LABEL, REGISTRATION_DURATION);
    console.log(`Base: ${ethers.utils.formatEther(price.base)} ETN, Premium: ${ethers.utils.formatEther(price.premium)} ETN`);
    const totalPrice = price.base.add(price.premium);
    console.log(`Total for "${TEST_LABEL}" (${TEST_LABEL.length} chars, 28 days): ${ethers.utils.formatEther(totalPrice)} ETN`);

    // ---- TEST 2: Availability check ----
    console.log('\n=== TEST 2: available() ===');
    const isAvailable = await controller.available(TEST_LABEL);
    console.log(`"${TEST_LABEL}" available:`, isAvailable);
    if (!isAvailable) {
      throw new Error(`"${TEST_LABEL}" is not available — pick a different TEST_LABEL and rerun.`);
    }

    // ---- TEST 3: Commit ----
    console.log('\n=== TEST 3: commit() ===');
    const registration = {
      label: TEST_LABEL,
      owner: myAddress,
      duration: REGISTRATION_DURATION,
      secret: randomSecret(),
      resolver: PUBLIC_RESOLVER_ADDR,
      data: [],
      reverseRecord: 0,
      referrer: ethers.constants.HashZero,
    };

    const commitment = await controller.makeCommitment(registration);
    console.log('Commitment hash:', commitment);

    let tx = await controller.commit(commitment);
    await tx.wait();
    console.log('Commitment submitted.');

    // ---- TEST 4: Wait for minCommitmentAge, then register ----
    console.log('\n=== TEST 4: register() ===');
    const minAge = await controller.minCommitmentAge();
    const waitMs = (minAge.toNumber() + 5) * 1000;
    console.log(`Waiting ${waitMs / 1000}s for commitment to mature...`);
    await sleep(waitMs);

    tx = await controller.register(registration, { value: totalPrice });
    const receipt = await tx.wait();
    console.log('Registered! Tx hash:', receipt.transactionHash);

    // ---- TEST 5: Verify ownership on-chain ----
    console.log('\n=== TEST 5: Verify registration ===');
    const labelhash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(TEST_LABEL));
    const tokenId = labelhash;
    const nftOwner = await baseRegistrar.ownerOf(tokenId);
    console.log('BaseRegistrar reports owner:', nftOwner, '| Expected:', myAddress);

    const ETN_NODE = '0x69a3977d40595dbc343e3fa6ddbd26dbe31cc237836622384941b3c5148974cd';
    const namehash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(['bytes32', 'bytes32'], [ETN_NODE, labelhash])
    );
    const registryOwner = await registry.owner(namehash);
    console.log('Registry reports owner:', registryOwner, '| Expected:', myAddress);

    // ---- TEST 6: Resolver — set and read an address record ----
    console.log('\n=== TEST 6: PublicResolver setAddr/addr ===');
    tx = await publicResolver['setAddr(bytes32,address)'](namehash, myAddress);
    await tx.wait();
    const resolvedAddr = await publicResolver['addr(bytes32)'](namehash);
    console.log('Resolved address:', resolvedAddr, '| Expected:', myAddress);

    // ---- TEST 7: CRITICAL — verify subdomain creation is blocked ----
    console.log('\n=== TEST 7: Subdomain creation should FAIL ===');
    const sublabelhash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('sub'));
    try {
      tx = await registry.setSubnodeOwner(namehash, sublabelhash, myAddress);
      await tx.wait();
      console.log('!!! UNEXPECTED: subdomain creation SUCCEEDED. This should not happen. !!!');
    } catch (err) {
      console.log('Subdomain creation correctly REVERTED as expected.');
      console.log('Revert reason (if visible):', err.reason || err.message);
    }

    // ---- TEST 8: Renew ----
    console.log('\n=== TEST 8: renew() ===');
    const renewPrice = await controller.rentPrice(TEST_LABEL, REGISTRATION_DURATION);
    const renewTotal = renewPrice.base.add(renewPrice.premium);
    tx = await controller.renew(TEST_LABEL, REGISTRATION_DURATION, ethers.constants.HashZero, {
      value: renewTotal,
    });
    await tx.wait();
    const newExpiry = await baseRegistrar.nameExpires(tokenId);
    console.log('New expiry timestamp:', newExpiry.toString(), `(${new Date(newExpiry.toNumber() * 1000)})`);

    console.log('\n--- All tests completed ---');

  } catch (e) {
    console.error('Test script error:', e.message || e);
  }
})();