module.exports = async ({getNamedAccounts, deployments, network}) => {
    const {deploy} = deployments;
    const {deployer} = await getNamedAccounts();

    await deploy('RSASHA1Algorithm', {
        from: deployer,
        args: [],
        log: true,
    });
    await deploy('RSASHA256Algorithm', {
        from: deployer,
        args: [],
        log: true,
    });
    await deploy('P256SHA256Algorithm', {
        from: deployer,
        args: [],
        log: true,
    });
    if(network.tags.test) {
        await deploy('DummyAlgorithm', {
            from: deployer,
            args: [],
            log: true,
        });
    }
};
module.exports.tags = ['dnssec-algorithms'];
