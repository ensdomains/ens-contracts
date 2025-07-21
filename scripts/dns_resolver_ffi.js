#!/usr/bin/env node

/**
 * DNS Resolver Script for Foundry Tests
 *
 * This script provides real DNS resolution capabilities for Solidity tests
 * via Foundry's ffi functionality.
 *
 * Usage:
 *   node dns_resolver_ffi.js <command> [args...]
 *
 * Commands:
 *   resolve <domain> <type>     - Resolve DNS record
 *   encode <name>               - DNS encode a domain name
 *   dnssec <domain> <type>      - Get DNSSEC records
 *   batch <url> <requests>      - Batch gateway request
 *   start-gateway <port>        - Start local batch gateway server
 */

import { execSync } from 'child_process'

// DNS record types
const DNS_TYPES = {
  A: 1,
  NS: 2,
  CNAME: 5,
  TXT: 16,
  AAAA: 28,
  DNSKEY: 48,
  RRSIG: 46,
  DS: 43,
}

/**
 * DNS encode a domain name to wire format
 * Implements standard DNS wire format encoding as per RFC specifications
 */
function dnsEncodeName(name) {
  // Strip leading and trailing dots
  const value = name.replace(/^\.|\$/gm, '')

  if (value.length === 0) {
    return '00' // Root domain
  }

  const labels = value.split('.')
  let encoded = ''

  // Standard DNS wire format encoding
  for (const label of labels) {
    if (label === '') continue

    let labelBytes = Buffer.from(label, 'utf8')

    // Handle labels longer than 255 bytes
    if (labelBytes.length > 255) {
      // In production would use proper labelhash encoding
      labelBytes = labelBytes.slice(0, 255)
    }

    // Length prefix followed by label bytes
    encoded += labelBytes.length.toString(16).padStart(2, '0')
    encoded += labelBytes.toString('hex')
  }

  encoded += '00' // null terminator
  return encoded
}

/**
 * Resolve DNS record using dig
 */
function resolveDNS(domain, type) {
  try {
    const typeNum = DNS_TYPES[type] || parseInt(type)
    const typeName =
      Object.keys(DNS_TYPES).find((k) => DNS_TYPES[k] === typeNum) || type

    // Use dig to resolve DNS record
    const cmd = `dig +short +dnssec ${domain} ${typeName}`
    const result = execSync(cmd, { encoding: 'utf8', timeout: 10000 })

    return {
      success: true,
      domain,
      type: typeNum,
      data: result
        .trim()
        .split('\n')
        .filter((line) => line.length > 0),
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Get DNSSEC records for domain
 */
function getDNSSECRecords(domain, type) {
  try {
    const typeNum = DNS_TYPES[type] || parseInt(type)
    const typeName =
      Object.keys(DNS_TYPES).find((k) => DNS_TYPES[k] === typeNum) || type

    // Get DNSSEC records including RRSIG
    const cmd = `dig +dnssec +multi ${domain} ${typeName}`
    const result = execSync(cmd, { encoding: 'utf8', timeout: 15000 })

    // Parse dig output for DNSSEC data
    const lines = result.split('\n')
    const records = []
    let currentRecord = null

    for (const line of lines) {
      if (line.includes('RRSIG')) {
        if (currentRecord) records.push(currentRecord)
        currentRecord = { type: 'RRSIG', data: line.trim() }
      } else if (line.includes('DNSKEY')) {
        if (currentRecord) records.push(currentRecord)
        currentRecord = { type: 'DNSKEY', data: line.trim() }
      } else if (line.includes('DS')) {
        if (currentRecord) records.push(currentRecord)
        currentRecord = { type: 'DS', data: line.trim() }
      } else if (currentRecord && line.trim()) {
        currentRecord.data += ' ' + line.trim()
      }
    }

    if (currentRecord) records.push(currentRecord)

    return {
      success: true,
      domain,
      type: typeNum,
      dnssecRecords: records,
      rawOutput: result,
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Make HTTP request to batch gateway
 */
async function fetchBatchGateway(url, requests) {
  // Node.js 18+ has built-in fetch
  const fetch = globalThis.fetch || (await import('node-fetch')).default

  try {
    const requestData = {
      sender: '0x0000000000000000000000000000000000000000',
      data: encodeBatchRequests(requests),
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestData),
    })

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      }
    }

    const result = await response.json()
    return {
      success: true,
      data: result.data,
      decoded: decodeBatchResponse(result.data),
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Encode batch requests (simplified ABI encoding)
 */
function encodeBatchRequests(requests) {
  // Simplified encoding for query(Request[]) function call
  // In real implementation would use proper ABI encoding
  const encoded = {
    function: 'query',
    requests: requests,
  }
  return '0x' + Buffer.from(JSON.stringify(encoded)).toString('hex')
}

/**
 * Decode batch response
 */
function decodeBatchResponse(data) {
  try {
    if (data.startsWith('0x')) {
      const decoded = Buffer.from(data.slice(2), 'hex').toString()
      return JSON.parse(decoded)
    }
    return null
  } catch (error) {
    return null
  }
}

/**
 * Start local batch gateway server
 */
async function startBatchGateway(port = 8080) {
  try {
    // Import spawn dynamically to match ES module pattern
    const { spawn } = await import('child_process')

    const child = spawn(
      'node',
      ['scripts/batch_gateway_server.js', port.toString()],
      {
        detached: false,
        stdio: ['ignore', 'ignore', 'ignore'],
      },
    )

    // Give server time to start
    await new Promise((resolve) => setTimeout(resolve, 500))

    return {
      success: true,
      port: port,
      url: `http://localhost:${port}/`,
      pid: child.pid,
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Test DNS oracle connectivity via batch gateway
 */
async function testDNSOracle(oracleUrl) {
  const testDomain = 'cloudflare.com'
  const encodedName = dnsEncodeName(testDomain)

  try {
    // Test with local batch gateway
    const localGatewayUrl = 'http://localhost:8080/'

    const requests = [
      {
        sender: '0x0000000000000000000000000000000000000000',
        urls: [oracleUrl],
        data: `0x${encodedName}0010`, // A record query
      },
    ]

    const result = await fetchBatchGateway(localGatewayUrl, requests)
    return result
  } catch (error) {
    return {
      success: false,
      error: error.message,
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  let result

  switch (command) {
    case 'resolve':
      if (args.length < 3) {
        console.error('Usage: resolve <domain> <type>')
        process.exit(1)
      }
      result = resolveDNS(args[1], args[2])
      break

    case 'encode':
      if (args.length < 2) {
        console.error('Usage: encode <name>')
        process.exit(1)
      }
      result = {
        success: true,
        encoded: dnsEncodeName(args[1]),
      }
      break

    case 'dnssec':
      if (args.length < 3) {
        console.error('Usage: dnssec <domain> <type>')
        process.exit(1)
      }
      result = getDNSSECRecords(args[1], args[2])
      break

    case 'test-oracle':
      if (args.length < 2) {
        console.error('Usage: test-oracle <oracle_url>')
        process.exit(1)
      }
      result = await testDNSOracle(args[1])
      break

    case 'batch':
      if (args.length < 3) {
        console.error('Usage: batch <url> <requests>')
        process.exit(1)
      }
      try {
        const requests = JSON.parse(args[2])
        result = await fetchBatchGateway(args[1], requests)
      } catch (error) {
        result = { success: false, error: error.message }
      }
      break

    case 'start-gateway':
      if (args.length < 2) {
        console.error('Usage: start-gateway <port>')
        process.exit(1)
      }
      result = await startBatchGateway(parseInt(args[1]))
      break

    default:
      console.error('Unknown command:', command)
      console.error(
        'Available commands: resolve, encode, dnssec, test-oracle, batch, start-gateway',
      )
      process.exit(1)
  }

  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.message }))
  process.exit(1)
})
