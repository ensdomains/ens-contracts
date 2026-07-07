// scripts/test-edge-cases.js
// Run in Remix via: right-click -> Run

import { ethers } from 'ethers'

// ---- Fill these in ----
const REGISTRY_ADDR = '0x78EA71136e82eDBF2C06354D6Ef98b8d7e3de544';
const BASE_REGISTRAR_ADDR = '0x81EcACe6dD13AFf8AdA5236C93819cB943FdED63';
const REVERSE_REGISTRAR_ADDR = '0x00cFF59f61c68652Ad96F127Dc80B2C112a5a1F3';
const PRICE_ORACLE_ADDR = '0x1928e9132DF17dfeF55C12E64cE86b53D31A90D5';
const CONTROLLER_ADDR = '0x68b9656899CF37F5AbD9B9000F8C5200E7db2f04';
const PUBLIC_RESOLVER_ADDR = '0x0764C6aD0F7FeD7444F3A314192E50DfB6bA7c14';

const EXISTING_LABEL = 'testname687124'; // registered successfully in test.js run
const SHORT_LABEL = 'ab';

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

async function expectRevert(promiseFn, expectedSubstring, label) {
  try {
    const tx = await promiseFn();
    await tx.wait();
    console.log(`!!! UNEXPECTED: "${label}" succeeded but should have reverted !!!`);
    return false;
  } catch (err) {
    const msg = err.reason || err.error?.message || err.message || '';
    const matched = expectedSubstring ? msg.includes(expectedSubstring) : true;
    console.log(`"${label}" reverted as expected${matched ? '' : ' (message did not match expected substring — likely a custom error, check manually)'}.`);
    console.log('  Message:', msg);
    return true;
  }
}

(async () => {
  try {
    const provider = new ethers.providers.Web3Provider(web3Provider);
    const signer = provider.getSigner();
    const myAddress = await signer.getAddress();

    const accounts = await provider.listAccounts();
    const secondAddress = accounts.length > 1 ? accounts[1] : myAddress;
    const secondSigner = accounts.length > 1 ? provider.getSigner(secondAddress) : signer;

    console.log('Primary account:', myAddress);
    console.log('Secondary account:', secondAddress, accounts.length > 1 ? '' : '(same as primary — limited test)');

    const registry = await attach('ENSRegistry', REGISTRY_ADDR, signer);
    const baseRegistrar = await attach('BaseRegistrarImplementation', BASE_REGISTRAR_ADDR, signer);
    const reverseRegistrar = await attach('ReverseRegistrar', REVERSE_REGISTRAR_ADDR, signer);
    const controller = await attach('ETHRegistrarController', CONTROLLER_ADDR, signer);
    const controllerAsSecond = await attach('ETHRegistrarController', CONTROLLER_ADDR, secondSigner);
    const publicResolver = await attach('PublicResolver', PUBLIC_RESOLVER_ADDR, signer);

    // ---- TEST 9: Label too short should be rejected ----
    console.log('\n=== TEST 9: valid() rejects labels under 3 chars ===');
    const shortAvailable = await controller.available(SHORT_LABEL);
    console.log(`"${SHORT_LABEL}" available (should be false):`, shortAvailable);

    const shortRegistration = {
      label: SHORT_LABEL,
      owner: myAddress,
      duration: 28 * 24 * 60 * 60,
      secret: randomSecret(),
      resolver: ethers.constants.AddressZero,
      data: [],
      reverseRecord: 0,
      referrer: ethers.constants.HashZero,
    };
    const shortCommitment = await controller.makeCommitment(shortRegistration);
    let tx = await controller.commit(shortCommitment);
    await tx.wait();
    await sleep(65000);
    await expectRevert(
      () => controller.register(shortRegistration, { value: ethers.utils.parseEther('1') }),
      'NameNotAvailable',
      'register() with sub-3-char label'
    );

    // ---- TEST 10: register() before minCommitmentAge elapses ----
    console.log('\n=== TEST 10: CommitmentTooNew ===');
    const freshLabel = randomLabel('freshcommit');
    const freshRegistration = {
      label: freshLabel,
      owner: myAddress,
      duration: 28 * 24 * 60 * 60,
      secret: randomSecret(),
      resolver: ethers.constants.AddressZero,
      data: [],
      reverseRecord: 0,
      referrer: ethers.constants.HashZero,
    };
    const freshCommitment = await controller.makeCommitment(freshRegistration);
    tx = await controller.commit(freshCommitment);
    await tx.wait();
    console.log('Committed. Attempting immediate register() (should fail)...');
    const price = await controller.rentPrice(freshLabel, freshRegistration.duration);
    await expectRevert(
      () => controller.register(freshRegistration, { value: price.base.add(price.premium) }),
      'CommitmentTooNew',
      'register() immediately after commit'
    );

    console.log('Waiting 65s, then retrying register() — should succeed...');
    await sleep(65000);
    tx = await controller.register(freshRegistration, { value: price.base.add(price.premium) });
    await tx.wait();
    console.log(`"${freshLabel}" registered successfully after waiting.`);

    // ---- TEST 11: Underpayment ----
    console.log('\n=== TEST 11: InsufficientValue ===');
    const underpayLabel = randomLabel('underpay');
    const underpayRegistration = {
      label: underpayLabel,
      owner: myAddress,
      duration: 28 * 24 * 60 * 60,
      secret: randomSecret(),
      resolver: ethers.constants.AddressZero,
      data: [],
      reverseRecord: 0,
      referrer: ethers.constants.HashZero,
    };
    const underpayCommitment = await controller.makeCommitment(underpayRegistration);
    tx = await controller.commit(underpayCommitment);
    await tx.wait();
    await sleep(65000);
    await expectRevert(
      () => controller.register(underpayRegistration, { value: 1 }),
      'InsufficientValue',
      'register() with insufficient payment'
    );

    // ---- TEST 12: Double registration ----
    console.log('\n=== TEST 12: NameNotAvailable on already-owned name ===');
    const dupRegistration = {
      label: EXISTING_LABEL,
      owner: myAddress,
      duration: 28 * 24 * 60 * 60,
      secret: randomSecret(),
      resolver: ethers.constants.AddressZero,
      data: [],
      reverseRecord: 0,
      referrer: ethers.constants.HashZero,
    };
    const dupCommitment = await controller.makeCommitment(dupRegistration);
    tx = await controller.commit(dupCommitment);
    await tx.wait();
    await sleep(65000);
    const dupPrice = await controller.rentPrice(EXISTING_LABEL, dupRegistration.duration);
    await expectRevert(
      () => controller.register(dupRegistration, { value: dupPrice.base.add(dupPrice.premium) }),
      'NameNotAvailable',
      `register() on already-owned "${EXISTING_LABEL}"`
    );

    // ---- TEST 13: Reverse record registration ----
    console.log('\n=== TEST 13: Reverse record set during registration ===');

    const configuredDefaultResolver = await reverseRegistrar.defaultResolver();
    console.log('ReverseRegistrar default resolver:', configuredDefaultResolver, '| Expected:', PUBLIC_RESOLVER_ADDR);

    const newLabel = randomLabel('edgecasetest');
    const reverseRegistration = {
      label: newLabel,
      owner: myAddress,
      duration: 28 * 24 * 60 * 60,
      secret: randomSecret(),
      resolver: PUBLIC_RESOLVER_ADDR,
      data: [],
      reverseRecord: 1,
      referrer: ethers.constants.HashZero,
    };
    const reverseCommitment = await controller.makeCommitment(reverseRegistration);
    tx = await controller.commit(reverseCommitment);
    await tx.wait();
    await sleep(65000);
    const reversePrice = await controller.rentPrice(newLabel, reverseRegistration.duration);
    tx = await controller.register(reverseRegistration, {
      value: reversePrice.base.add(reversePrice.premium),
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

    // ---- TEST 14: Renewal by a different address ----
    console.log('\n=== TEST 14: renew() called by non-owner ===');
    if (accounts.length > 1) {
      const renewPrice = await controller.rentPrice(EXISTING_LABEL, 28 * 24 * 60 * 60);
      tx = await controllerAsSecond.renew(
        EXISTING_LABEL,
        28 * 24 * 60 * 60,
        ethers.constants.HashZero,
        { value: renewPrice.base.add(renewPrice.premium) }
      );
      await tx.wait();
      console.log(`Renewal by secondary account (${secondAddress}) succeeded — this is expected ENS behavior.`);
    } else {
      console.log('Only one account available in this session — skipping true cross-account test.');
    }

    console.log('\n--- Edge case tests completed ---');

  } catch (e) {
    console.error('Test script error:', e.message || e);
  }
})();