module.exports = [
  [
    'SHA256Digest',
    [
      '0x',
      '0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    ], // valid 1
    [
      'foo',
      '0x2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae'
    ], // valid 2
    ['0x', '0x1111111111111111111111111111111111111111111111111111111111111111'] // invalid
  ],
  [
    'SHA1Digest',
    ['0x', '0xda39a3ee5e6b4b0d3255bfef95601890afd80709'], // valid 1
    ['foo', '0x0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33'], // valid 2
    ['0x', '0x1111111111111111111111111111111111111111'] // invalid
  ]
];

// NOTE: WE HAD TO DO THE 2 VALIDS ON TOP LEVEL OTHERWISE IT DIDN'T SEEM TO WORK
