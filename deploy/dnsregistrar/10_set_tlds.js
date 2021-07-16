const { ethers } = require("hardhat");

const tld_map = {
    'mainnet': ['xyz'],
    'ropsten': ['xyz'],
    'localhost': ['xyz'],
}

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

async function setTLDsOnRoot(owner, root, registrar, tlds) {
    if(tlds === undefined){
        return [];
    }

    const transactions = []
    for(const tld of tlds) {
        const labelhash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(tld));
        transactions.push(await root.setSubnodeOwner(labelhash, registrar.address, {from: owner}));
    }
    return transactions;
}

async function setTLDsOnRegistry(owner, registry, registrar, tlds) {
    if(tlds === undefined){
        return [];
    }

    const transactions = []
    for(const tld of tlds) {
        const labelhash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(tld));
        transactions.push(await registry.setSubnodeOwner(ZERO_HASH, labelhash, registrar.address, {from: owner}));
    }
    return transactions;
}

module.exports = async ({getNamedAccounts, deployments, network}) => {
    const {deploy} = deployments;
    const {owner} = await getNamedAccounts();

    const registrar = await ethers.getContract('DNSRegistrar');

    let transactions;
    if(network.tags.use_root) {
        const root = await ethers.getContract('Root');
        transactions = await setTLDsOnRoot(owner, root, registrar, tld_map[network.name]);
    } else {
        const registry = await ethers.getContract('ENSRegistry');
        transactions = await setTLDsOnRegistry(owner, registry, registrar, tld_map[network.name]);
    }

    if(transactions.length > 0) {
        console.log(`Waiting on ${transactions.length} transactions setting DNS TLDs`)
        await Promise.all(transactions.map((tx) => tx.wait()));
    }
};
module.exports.tags = ['dnsregistrar'];
module.exports.dependencies = ['registry', 'root', 'dnssec-oracle'];
