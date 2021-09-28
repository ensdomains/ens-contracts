const { ethers } = require("hardhat");

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

module.exports = async ({getNamedAccounts, deployments, network}) => {
    const {deploy} = deployments;
    const {deployer, owner} = await getNamedAccounts();

    if(!network.tags.use_root) {
        return true;
    }

    const registry = await ethers.getContract('ENSRegistry');

    await deploy('Root', {
        from: deployer,
        args: [registry.address],
        log: true,
    });

    const root = await ethers.getContract('Root');

    let tx = await registry.setOwner(ZERO_HASH, root.address);
    console.log(`Setting owner of root node to root contract (tx: ${tx.hash})...`);
    await tx.wait();
    
    const rootOwner = await root.owner();
    switch(rootOwner) {
    case deployer:
        tx = await root.attach(deployer).transferOwnership(owner);
        console.log(`Transferring root ownership to final owner (tx: ${tx.hash})...`);
        await tx.wait();
    case owner:
        if(!await root.controllers(owner)) {
            tx = await root.attach(owner).setController(owner, true);
            console.log(`Setting final owner as controller on root contract (tx: ${tx.hash})...`);
            await tx.wait();
        }
        break;
    default:
        console.log(`WARNING: Root is owned by ${rootOwner}; cannot transfer to owner account`);
    }

    return true;
};
module.exports.id = "root";
module.exports.tags = ['root'];
module.exports.dependencies = ['registry'];
