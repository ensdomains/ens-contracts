#!/usr/bin/env node

// Dynamic DNS wire format generator for DNSRegistrar tests
// This script generates DNSSEC proofs for DNS-to-ENS registration

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

function createTXTRRSet(dnsName, address, expiration, inception) {
  // For ENS, TXT records go under _ens subdomain
  const ensName = '_ens.' + dnsName;
  
  const sig = {
    name: ensName,
    type: 'RRSIG',
    ttl: 0,
    class: 'IN',
    flush: false,
    data: {
      typeCovered: 'TXT',
      algorithm: 253,
      labels: ensName.split('.').filter(l => l).length,
      originalTTL: 3600,
      expiration,
      inception,
      keyTag: 1278,
      signersName: '.',
      signature: Buffer.from([]),
    },
  };

  // Create TXT record with address
  const txtContent = `a=${address}`;
  const rrs = [{
    name: ensName,
    type: 'TXT',
    class: 'IN',
    ttl: 3600,
    data: [Buffer.from(txtContent, 'ascii')],
  }];

  return { sig, rrs };
}

function hexEncodeSignedSet({ rrs, sig }) {
  const ss = new SignedSet(rrs, sig);
  return '0x' + ss.toWire().toString('hex');
}

// Main function
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 4) {
    console.error('Usage: node generate_dns_registrar_fixtures.js <blockTimestamp> <dnsName> <address> <proofType>');
    console.error('proofType: valid, stale-inception, expired-sig, empty');
    process.exit(1);
  }
  
  const blockTimestamp = parseInt(args[0]);
  const dnsName = args[1]; // e.g., "foo.test"
  const address = args[2]; // e.g., "0x1234..."
  const proofType = args[3] || 'valid';
  
  // Use passed block timestamp for timestamps to ensure validity
  // If blockTimestamp is too small (< 1000), use current real time instead
  const currentTime = blockTimestamp < 1000 ? Math.floor(Date.now() / 1000) : blockTimestamp;
  
  const validityPeriod = 2419200; // 28 days
  let expiration, inception;
  
  switch (proofType) {
    case 'stale-inception':
      // Create proof with inception time in the past (for testing stale proof rejection)
      expiration = currentTime + validityPeriod;
      inception = currentTime - 7200; // 2 hours ago
      break;
    case 'expired-sig':
      // Create proof with expired signature
      inception = currentTime - 3600 * 24 * 30; // 30 days ago
      expiration = currentTime - 3600 * 24; // 1 day ago (expired)
      break;
    case 'empty':
      // Return empty proof array
      console.log('');
      return;
    default: // 'valid'
      expiration = currentTime + validityPeriod;
      inception = currentTime - 300; // 5 minutes ago
      break;
  }
  
  // Ensure timestamps are positive and valid
  inception = Math.max(inception, 1);
  expiration = Math.max(expiration, inception + 1);
  
  // Generate root keys
  const rootKeys = createRootKeys(expiration, inception);
  const rootKeysHex = hexEncodeSignedSet(rootKeys);
  
  // Generate TXT record with address
  const txtRRSet = createTXTRRSet(dnsName, address, expiration, inception);
  const txtHex = hexEncodeSignedSet(txtRRSet);
  
  // Output the hex strings (no extra output for parsing)
  console.log(`${rootKeysHex},${txtHex}`);
}

main();