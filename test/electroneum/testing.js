// scripts/test.js
// Run in Remix via: right-click -> Run
// Fill in the addresses from your deploy.js output below.

import { ethers } from 'ethers'

// ---- Fill these in from your deployment output ----
const REGISTRY_ADDR = '0x1239193Ee0954d4A61Ae244A550e1D73BFb96fE5';
const BASE_REGISTRAR_ADDR = '0xf5Af2b932160d7D528DfF4d0467b13003FCa8Baf';
const REVERSE_REGISTRAR_ADDR = '0x2A93654305D37105B3281d87139ddcCC909764B1';
const PRICE_ORACLE_ADDR = '0xf9fE23EEf3ED14F86e835785F1751a3A5e27AE10';
const CONTROLLER_ADDR = '0xDFA971C9c5BB0fCe89940c7462a01D79D2759E98';
const PUBLIC_RESOLVER_ADDR = '0xE2357d2e384B413f9fCcb2e7997497Ce76646922';

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
      secret: randomSecret(), // was: ethers.constants.HashZero
      resolver: PUBLIC_RESOLVER_ADDR,
      data: [],
      reverseRecord: 0, // 0 = no reverse record for this test; set to 1 to test reverse too
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
    const waitMs = (minAge.toNumber() + 5) * 1000; // small buffer past the minimum
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