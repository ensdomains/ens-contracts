const { ethers } = require("hardhat");

module.exports = async ({getNamedAccounts, deployments, network}) => {
    const {deploy} = deployments;
    const {deployer} = await getNamedAccounts();
    console.log({network, deployer, deploy})
    const registry = await ethers.getContract('ENSRegistry');
    console.log(registry.address)
    console.log(network.config.accounts)
    var GATEWAY_HOST = 'http://localhost:8000'
    // var GATEWAY_HOST = 'https://offchain-resolver-example.uc.r.appspot.com'
    var gatewayUrl = `${GATEWAY_HOST}/{sender}/{data}.json`

    await deploy('OffchainResolver', {
        from: deployer,
        args: [gatewayUrl, [deployer]],
        log: true,
    });
};
module.exports.tags = ['offchainexample'];
module.exports.dependencies = ['registry'];
