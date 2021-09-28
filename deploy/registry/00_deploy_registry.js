const { ethers } = require("hardhat");

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

module.exports = async ({getNamedAccounts, deployments, network}) => {
    const {deploy} = deployments;
    const {deployer, owner} = await getNamedAccounts();

    if(network.tags.legacy) {
        const contract = await deploy('LegacyENSRegistry', {
            from: deployer,
            args: [],
            log: true,
            contract: await deployments.getArtifact('ENSRegistry')
        });
        await deploy('ENSRegistry', {
            from: deployer,
            args: [contract.address],
            log: true,
            contract: await deployments.getArtifact('ENSRegistryWithFallback')
        });    
    } else {
        await deploy('ENSRegistry', {
            from: deployer,
            args: [],
            log: true,
        });    
    }

    if(!network.tags.use_root) {
        const registry = await ethers.getContract('ENSRegistry');
        const rootOwner = await registry.owner(ZERO_HASH);
        switch(rootOwner) {
        case deployer:
            const tx = await registry.setOwner(ZERO_HASH, owner, {from: deployer});
            console.log("Setting final owner of root node on registry (tx:${tx.hash})...");
            await tx.wait();
            break;
        case owner:
            break;
        default:
            console.log(`WARNING: ENS registry root is owned by ${rootOwner}; cannot transfer to owner`);
        }
    }

    return true;
};
module.exports.tags = ['registry'];
module.exports.id = "ens";
