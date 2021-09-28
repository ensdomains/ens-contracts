var base32hex = require('rfc4648').base32hex;
var sha1 = artifacts.require('./nsec3digests/SHA1NSEC3Digest.sol');

function fromBase32(s) {
  return (
    '0x' +
    Buffer.from(base32hex.parse(s.toUpperCase())).toString('hex') +
    '000000000000000000000000'
  );
}

// @todo fix byte encoding of these vectors
vectors = [
  [
    '0x',
    '0x',
    0,
    '0xda39a3ee5e6b4b0d3255bfef95601890afd80709000000000000000000000000'
  ],
  [
    web3.utils.toHex('nacl'),
    web3.utils.toHex('test'),
    0,
    '0x68b36a28941caebfc2af818c99a8e34478d77fec000000000000000000000000'
  ],
  [
    web3.utils.toHex('nacl'),
    web3.utils.toHex('test'),
    1,
    '0x16574cbb9312cf064794482fdd1148289027db73000000000000000000000000'
  ],
  [
    web3.utils.toHex('nacl'),
    web3.utils.toHex('test'),
    10,
    '0x455370ef51d39be8efa646b807a818c7649a505e000000000000000000000000'
  ],
  [
    '0xaabbccdd',
    web3.utils.asciiToHex('\x07example\x00'),
    12,
    fromBase32('0p9mhaveqvm6t7vbl5lop2u3t2rp3tom')
  ],
  [
    '0xaabbccdd',
    web3.utils.asciiToHex('\x01a\x07example\x00'),
    12,
    fromBase32('35mthgpgcu1qg68fab165klnsnk3dpvl')
  ],
  [
    '0x5BA6AD4385844262',
    web3.utils.asciiToHex('\x07matoken\x03xyz\x00'),
    1,
    fromBase32('bst4hlje7r0o8c8p4o8q582lm0ejmiqt')
  ]
];

contract('SHA1NSEC3Digest', function(accounts) {
  for (var i = 0; i < vectors.length; i++) {
    (function(i, vector) {
      it('calculates test vector ' + i, async function() {
        var instance = await sha1.deployed();
        assert.equal(
          await instance.hash(vector[0], vector[1], vector[2]),
          vector[3]
        );
      });
    })(i, vectors[i]);
  }
});
