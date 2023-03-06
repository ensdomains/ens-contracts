const { utils, BigNumber: BN } = ethers
const packet = require('dns-packet')

const labelhash = (label) => utils.keccak256(utils.toUtf8Bytes(label))
const namehash = require('eth-ens-namehash').hash
function encodeName(name) {
  return '0x' + packet.name.encode(name).toString('hex')
}

const FUSES = {
  CAN_DO_EVERYTHING: 0,
  CANNOT_UNWRAP: 1,
  CANNOT_BURN_FUSES: 2,
  CANNOT_TRANSFER: 4,
  CANNOT_SET_RESOLVER: 8,
  CANNOT_SET_TTL: 16,
  CANNOT_CREATE_SUBDOMAIN: 32,
  CANNOT_APPROVE: 64,
  PARENT_CANNOT_CONTROL: 2 ** 16,
  IS_DOT_ETH: 2 ** 17,
  CAN_EXTEND_EXPIRY: 2 ** 18,
}

let MAX_EXPIRY = 2n ** 64n - 1n

module.exports = {
  labelhash,
  namehash,
  encodeName,
  FUSES,
  MAX_EXPIRY,
}
