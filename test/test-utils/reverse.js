const { namehash } = require('viem/ens')

function getReverseNode(addr) {
  return namehash(addr.slice(2).toLowerCase() + '.addr.reverse')
}
module.exports = {
  getReverseNode,
}
