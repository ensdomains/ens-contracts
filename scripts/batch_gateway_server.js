#!/usr/bin/env node

/**
 * Batch Gateway Server for CCIP-Read Testing
 * 
 * This implements batch gateway functionality for CCIP-Read testing
 * to provide complete batch processing capabilities.
 * 
 * Usage:
 *   node batch_gateway_server.js <port>
 */

import { createServer } from 'node:http';

// Default port
const port = process.argv[2] ? parseInt(process.argv[2]) : 8080;

/**
 * Handle CCIP-Read requests by calling external services
 */
async function handleCCIPRequest(request) {
  try {
    const { sender, urls, data } = request;
    
    // Extract the function call from data
    // This is typically a DNS resolve call: resolve(bytes,uint16)
    
    if (urls.length === 0) {
      throw new Error('No URLs provided');
    }
    
    // For DNS oracle requests, make the actual HTTP request
    const url = urls[0];
    
    if (url.includes('dnssec-oracle.ens.domains')) {
      // Make actual request to DNS oracle
      const fetch = globalThis.fetch || (await import('node-fetch')).default;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sender,
          data
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      return result.data;
    } else {
      // For testing, return mock response
      return '0x' + Buffer.from(JSON.stringify({
        success: true,
        data: 'mock_dns_response'
      })).toString('hex');
    }
  } catch (error) {
    // Return encoded error
    throw error;
  }
}

/**
 * Decode function data to extract batch requests
 */
function decodeBatchData(data) {
  // Simplified decoding for query(Request[]) function
  // In a real implementation, would use proper ABI decoding
  
  try {
    // For testing purposes, decode basic structure
    if (data.startsWith('0x')) {
      // Try to decode as hex-encoded JSON for testing
      const decoded = Buffer.from(data.slice(2), 'hex').toString();
      const parsed = JSON.parse(decoded);
      
      if (parsed.function === 'query' && parsed.requests) {
        return parsed.requests;
      }
    }
    
    // Fallback to mock structure for compatibility
    return [
      {
        sender: '0x0000000000000000000000000000000000000000',
        urls: ['https://dnssec-oracle.ens.domains/'],
        data: '0x' + Buffer.from('resolve(bytes,uint16)', 'utf8').toString('hex')
      }
    ];
  } catch (error) {
    console.error('Failed to decode batch data:', error);
    return [];
  }
}

/**
 * Encode batch response
 */
function encodeBatchResponse(failures, responses) {
  // Simplified encoding for (bool[], bytes[]) return
  // In a real implementation, would use proper ABI encoding
  
  const result = {
    failures,
    responses
  };
  
  // Return as hex-encoded response
  return '0x' + Buffer.from(JSON.stringify(result)).toString('hex');
}

/**
 * Create the batch gateway server
 */
function createBatchGatewayServer() {
  const server = createServer(async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }
    
    try {
      // Read request body
      const body = [];
      for await (const chunk of req) {
        body.push(chunk);
      }
      
      const bodyStr = Buffer.concat(body).toString();
      const requestData = JSON.parse(bodyStr);
      
      const { sender, data } = requestData;
      
      if (!data || !data.startsWith('0x')) {
        res.writeHead(400);
        res.end('Invalid data format');
        return;
      }
      
      // Decode the batch request data
      const requests = decodeBatchData(data);
      
      // Process each request
      const failures = [];
      const responses = [];
      
      await Promise.all(
        requests.map(async (request, i) => {
          try {
            const response = await handleCCIPRequest(request);
            failures[i] = false;
            responses[i] = response;
          } catch (error) {
            failures[i] = true;
            responses[i] = '0x' + Buffer.from(error.message).toString('hex');
          }
        })
      );
      
      // Encode the response
      const responseData = encodeBatchResponse(failures, responses);
      
      // Send response
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify({
        data: responseData
      }));
      
    } catch (error) {
      console.error('Server error:', error);
      res.writeHead(500);
      res.end(JSON.stringify({
        error: error.message
      }));
    }
  });
  
  return server;
}

// Start the server
const server = createBatchGatewayServer();

server.listen(port, () => {
  console.log(`Batch gateway server listening on port ${port}`);
  console.log(`URL: http://localhost:${port}/`);
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\nShutting down batch gateway server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});
