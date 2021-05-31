const packet = require('dns-packet');

function hexEncodeName(name) {
  return '0x' + packet.name.encode(name).toString('hex');
}

function hexEncodeTXT(keys) {
  return '0x' + packet.answer.encode(keys).toString('hex');
}

module.exports = {
  zeroAddress: '0x0000000000000000000000000000000000000000',
  hexEncodeTXT: hexEncodeTXT,
  hexEncodeName: hexEncodeName
};
