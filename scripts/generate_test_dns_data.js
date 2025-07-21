#!/usr/bin/env node

// Generate DNS wire format data for specific test cases
// This script creates properly formatted DNS records that parse correctly
// but trigger NoMatchingProof during validation

import { SignedSet } from '@ensdomains/dnsprovejs'

function createRootKeysWithUnsupportedAlgorithm(expiration, inception) {
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
  }

  // Create DNSKEY with algorithm 255 (unsupported)
  const rrs = [
    {
      name: '.',
      type: 'DNSKEY',
      class: 'IN',
      ttl: 3600,
      data: {
        flags: 0x0101,
        protocol: 3,
        algorithm: 255, // Unsupported algorithm
        key: Buffer.from('0000', 'hex'),
      },
    },
  ]

  return { sig, rrs }
}

function createRootKeysWithDifferentKey(expiration, inception) {
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
  }

  // Create DNSKEY with different key data (will have different keytag)
  const rrs = [
    {
      name: '.',
      type: 'DNSKEY',
      class: 'IN',
      ttl: 3600,
      data: {
        flags: 0x0101,
        protocol: 3,
        algorithm: 253,
        key: Buffer.from('1112', 'hex'), // Different key data
      },
    },
  ]

  return { sig, rrs }
}

function createRootKeysWithoutZKBit(expiration, inception) {
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
  }

  // Create DNSKEY with flags=0 (no ZK bit)
  const rrs = [
    {
      name: '.',
      type: 'DNSKEY',
      class: 'IN',
      ttl: 3600,
      data: {
        flags: 0x0001, // No ZK bit (0x0100)
        protocol: 3,
        algorithm: 253,
        key: Buffer.from('1211', 'hex'),
      },
    },
  ]

  return { sig, rrs }
}

function hexEncodeSignedSet({ rrs, sig }) {
  const ss = new SignedSet(rrs, sig)
  return '0x' + ss.toWire().toString('hex')
}

// Main function
function main() {
  const args = process.argv.slice(2)

  if (args.length < 1) {
    console.error('Usage: node generate_test_dns_data.js <testCase>')
    console.error('testCase: bad-algorithm, bad-keytag, no-zk-bit, all')
    process.exit(1)
  }

  const testCase = args[0]

  // Use fixed timestamps for consistency
  const currentTime = Math.floor(Date.now() / 1000)
  const validityPeriod = 2419200 // 28 days
  const expiration = currentTime + validityPeriod
  const inception = currentTime - 300 // 5 minutes ago

  if (testCase === 'all') {
    console.log(
      '// DNS wire format data for test cases that should trigger NoMatchingProof',
    )
    console.log('// Generated on:', new Date().toISOString())
    console.log('')

    console.log('// Test case 1: Root DNSKEY with algorithm 255 (unsupported)')
    const badAlgorithm = createRootKeysWithUnsupportedAlgorithm(
      expiration,
      inception,
    )
    console.log(
      'const ROOT_DNSKEY_BAD_ALGORITHM =',
      hexEncodeSignedSet(badAlgorithm) + ';',
    )
    console.log('')

    console.log(
      '// Test case 2: Root DNSKEY with different key data (different keytag)',
    )
    const badKeytag = createRootKeysWithDifferentKey(expiration, inception)
    console.log(
      'const ROOT_DNSKEY_BAD_KEYTAG =',
      hexEncodeSignedSet(badKeytag) + ';',
    )
    console.log('')

    console.log('// Test case 3: Root DNSKEY with flags=0x0001 (no ZK bit)')
    const noZKBit = createRootKeysWithoutZKBit(expiration, inception)
    console.log(
      'const ROOT_DNSKEY_NO_ZK_BIT =',
      hexEncodeSignedSet(noZKBit) + ';',
    )

    return
  }

  let testData

  switch (testCase) {
    case 'bad-algorithm':
      testData = createRootKeysWithUnsupportedAlgorithm(expiration, inception)
      break
    case 'bad-keytag':
      testData = createRootKeysWithDifferentKey(expiration, inception)
      break
    case 'no-zk-bit':
      testData = createRootKeysWithoutZKBit(expiration, inception)
      break
    default:
      console.error('Unknown test case:', testCase)
      console.error(
        'Valid test cases: bad-algorithm, bad-keytag, no-zk-bit, all',
      )
      process.exit(1)
  }

  const hexData = hexEncodeSignedSet(testData)
  console.log(hexData)
}

main()
