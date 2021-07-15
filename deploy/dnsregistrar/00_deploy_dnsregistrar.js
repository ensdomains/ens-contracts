const { ethers } = require("hardhat");

module.exports = async ({getNamedAccounts, deployments, network}) => {
    const {deploy} = deployments;
    const {deployer} = await getNamedAccounts();

    const registry = await ethers.getContract('ENSRegistry');
    const dnssec = await ethers.getContract('DNSSECImpl');

    const publicSuffixList = await deploy('TLDPublicSuffixList', {
        from: deployer,
        args: [],
        log: true,
    });

    await deploy('DNSRegistrar', {
        from: deployer,
        args: [dnssec.address, publicSuffixList.address, registry.address],
        log: true,
    });
};
module.exports.tags = ['dnsregistrar'];
module.exports.dependencies = ['registry', 'dnssec-oracle'];
