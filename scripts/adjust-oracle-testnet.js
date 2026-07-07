// scripts/adjust-oracle-testnet.js
import { ethers } from 'ethers'

const DUMMY_ORACLE_ADDR = '0xB809ee4058b437142F7d8143299BE5757D9589E3';
const NEW_ORACLE_VALUE = 4500000000; // scales price down ~50,000x from current

async function getArtifact(contractName) {
  const result = await remix.call('compilerArtefacts', 'getArtefactsByContractName', contractName);
  return result.artefact;
}

(async () => {
  const provider = new ethers.providers.Web3Provider(web3Provider);
  const signer = provider.getSigner();
  const artifact = await getArtifact('DummyOracle');
  const dummyOracle = new ethers.Contract(DUMMY_ORACLE_ADDR, artifact.abi, signer);

  const tx = await dummyOracle.set(NEW_ORACLE_VALUE);
  await tx.wait();
  console.log('DummyOracle value updated to:', NEW_ORACLE_VALUE);
})();