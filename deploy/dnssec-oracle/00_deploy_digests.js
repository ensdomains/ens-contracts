module.exports = async ({getNamedAccounts, deployments, network}) => {
    const {deploy} = deployments;
    const {deployer} = await getNamedAccounts();

    await deploy('SHA1Digest', {
        from: deployer,
        args: [],
        log: true,
    });
    await deploy('SHA256Digest', {
        from: deployer,
        args: [],
        log: true,
    });
    if(network.tags.test) {
        await deploy('DummyDigest', {
            from: deployer,
            args: [],
            log: true,
        });
    }
};
module.exports.tags = ['dnssec-digests'];
