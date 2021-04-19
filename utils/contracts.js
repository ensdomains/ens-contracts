module.exports = {
  loadENSContract: function loadENSContracts(modName, contractName) {
    if (modName === 'ens') {
      const ens = require(`@ensdomains/ens`)
      return ens[contractName]
    }
    return require(`@ensdomains/${modName}/build/contracts/${contractName}`)
  },
}
