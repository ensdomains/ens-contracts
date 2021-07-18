module.exports = async ({getNamedAccounts, deployments, network}) => {
    const {deploy} = deployments;
    const {deployer} = await getNamedAccounts();

    await deploy('SHA1NSEC3Digest', {
        from: deployer,
        args: [],
        log: true,
    });
};
module.exports.tags = ['dnssec-nsec3-digests'];
