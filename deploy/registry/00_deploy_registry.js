module.exports = async ({getNamedAccounts, deployments, network}) => {
    const {deploy} = deployments;
    const {deployer} = await getNamedAccounts();

    const registry = await deploy('ENSRegistry', {
        from: deployer,
        args: [],
        log: true,
    });
    if(network.tags.legacy) {
        await deploy('ENSRegistry', {
            from: deployer,
            args: [registry.address],
            log: true,
            contract: await deployments.getArtifact('ENSRegistryWithFallback')
        });
    }
    return true;
};
module.exports.tags = ['registry'];
module.exports.id = "ens";
