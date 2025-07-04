#!/usr/bin/env node

// Dynamic DNS wire format generator for Foundry tests
// This script takes a timestamp as input and generates wire format data

import { SignedSet } from '@ensdomains/dnsprovejs';

function createRootKeys(expiration, inception) {
  const name = '.';
  const sig = {
    name: '.',
    type: 'RRSIG',
    ttl: 0,
    class: 'IN',
    flush: false,
    data: {
      typeCovered: 'DNSKEY',
      algorithm: 253,
      labels: 0,
      originalTTL: 3600,
      expiration,
      inception,
      keyTag: 1278,
      signersName: '.',
      signature: Buffer.from([]),
    },
  };

  const rrs = [
    {
      name: '.',
      type: 'DNSKEY',
      class: 'IN',
      ttl: 3600,
      data: { flags: 0, algorithm: 253, key: Buffer.from('0000', 'hex') },
    },
    {
      name: '.',
      type: 'DNSKEY',
      class: 'IN',
      ttl: 3600,
      data: { flags: 0, algorithm: 253, key: Buffer.from('1112', 'hex') },
    },
    {
      name: '.',
      type: 'DNSKEY',
      class: 'IN',
      ttl: 3600,
      data: {
        flags: 0x0101,
        algorithm: 253,
        key: Buffer.from('0000', 'hex'),
      },
    },
  ];
  
  return { name, sig, rrs };
}

function createRRSetWithTexts(name, texts, expiration, inception) {
  const sig = {
    name,
    type: 'RRSIG',
    ttl: 0,
    class: 'IN',
    flush: false,
    data: {
      typeCovered: 'TXT',
      algorithm: 253,
      labels: name.split('.').length,
      originalTTL: 3600,
      expiration,
      inception,
      keyTag: 1278,
      signersName: '.',
      signature: Buffer.from([]),
    },
  };

  const rrs = texts.map((text) => ({
    name: typeof text === 'string' ? name : text.name,
    type: 'TXT',
    class: 'IN',
    ttl: 3600,
    data: [
      Buffer.from(typeof text === 'string' ? text : text.value, 'ascii'),
    ],
  }));

  return { sig, rrs };
}

function hexEncodeSignedSet({ rrs, sig }) {
  const ss = new SignedSet(rrs, sig);
  return '0x' + ss.toWire().toString('hex');
}

// Main function
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: node generate_dns_fixtures.js <blockTimestamp> [textType]');
    console.error('textType: standard, extra, ens, invalid, multiple');
    process.exit(1);
  }
  
  const blockTimestamp = parseInt(args[0]);
  const textType = args[1] || 'standard';
  
  // Use passed block timestamp for timestamps to ensure validity
  const currentTime = blockTimestamp < 1000000000 ? Math.floor(Date.now() / 1000) : blockTimestamp;
  
  const validityPeriod = 2419200; // 28 days
  const expiration = currentTime + validityPeriod; // Far future
  const inception = Math.max(currentTime - 300, 1); // 5 minutes ago, but at least 1
  
  // Generate root keys
  const rootKeys = createRootKeys(expiration, inception);
  const rootKeysHex = hexEncodeSignedSet(rootKeys);
  
  // Generate appropriate TXT records based on type
  let texts;
  
  // If textType starts with "ENS1", treat it as custom TXT content
  if (textType.startsWith('ENS1') || textType === 'nonsense') {
    texts = [textType];
  } else {
    switch (textType) {
      case 'extra':
        texts = ['ENS1 0x1d1499e622d69689cdf9004d05ec547d650ff211 blah'];
        break;
      case 'ens':
        texts = ['ENS1 dnsresolver.eth'];
        break;
      case 'invalid':
        texts = ['nonsense'];
        break;
      case 'multiple':
        texts = ['foo', 'ENS1 0x1d1499e622d69689cdf9004d05ec547d650ff211'];
        break;
      default: // 'standard'
        texts = ['ENS1 0x1d1499e622d69689cdf9004d05ec547d650ff211'];
        break;
    }
  }
  
  const txtRRSet = createRRSetWithTexts('test.test', texts, expiration, inception);
  const txtHex = hexEncodeSignedSet(txtRRSet);
  
  // Output the hex strings (no extra output for parsing)
  console.log(`${rootKeysHex},${txtHex}`);
}

main();