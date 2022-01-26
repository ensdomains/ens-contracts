module.exports = async ({getNamedAccounts, deployments, network}) => {
    const {deployer} = await getNamedAccounts();
    let REGISTRY_ADDRESS = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
    await deploy('UniversalResolver', {
        from: deployer,
        args: [REGISTRY_ADDRESS],
        log: true,
        contract: await deployments.getArtifact('UniversalResolver')
    });
    return true;
};
module.exports.id = "universal";
module.exports.tags = ['universal'];
