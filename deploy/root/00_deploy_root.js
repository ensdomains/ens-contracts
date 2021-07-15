const { ethers } = require("hardhat");

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

module.exports = async ({getNamedAccounts, deployments, network}) => {
    const {deploy} = deployments;
    const {deployer, owner} = await getNamedAccounts();

    if(!network.tags.use_root) {
        return;
    }

    const registry = await ethers.getContract('ENSRegistry');

    await deploy('Root', {
        from: deployer,
        args: [registry.address],
        log: true,
    });

    const root = await ethers.getContract('Root');

    await registry.setOwner(ZERO_HASH, root.address);
    
    const rootOwner = await root.owner();
    switch(rootOwner) {
    case deployer:
        await root.transferOwnership(owner);
    case owner:
        if(!await root.controllers(owner)) {
            await root.setController(owner, true);
        }
        break;
    default:
        console.log(`WARNING: Root is owned by ${rootOwner}; cannot transfer to owner account`);
    }
};
module.exports.tags = ['root'];
module.exports.dependencies = ['registry'];
