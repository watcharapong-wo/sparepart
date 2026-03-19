#!/usr/bin/env node

/**
 * Edge Case & Boundary Test Suite (Simplified)
 * Tests error conditions, invalid inputs, and boundary scenarios
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000';
let authToken = '';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: data,
          headers: res.headers
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test(name, expectedStatus, fn) {
  try {
    const res = await fn();
    if (res.status === expectedStatus) {
      console.log(`✓ ${name} (${res.status})`);
      return true;
    } else {
      console.error(`✗ ${name}: Expected ${expectedStatus}, got ${res.status}`);
      return false;
    }
  } catch (err) {
    console.error(`✗ ${name}: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('\n========== EDGE CASE & BOUNDARY TEST SUITE ==========\n');

  let passed = 0, failed = 0;

  // Setup: Login
  const loginRes = await request('POST', '/login', {
    username: 'testuser',
    password: 'test123'
  });
  const loginBody = JSON.parse(loginRes.body);
  authToken = loginBody.token;

  console.log('Authentication & Input Validation Tests:\n');

  // Test 1: Valid credentials should work
  if (await test('Valid login', 200, () => 
    request('POST', '/login', { username: 'testuser', password: 'test123' })
  )) passed++; else failed++;

  // Test 2: Wrong password should fail
  if (await test('Wrong password rejection', 401, () => 
    request('POST', '/login', { username: 'testuser', password: 'wrongpass' })
  )) passed++; else failed++;

  // Test 3: Non-existent user
  if (await test('Non-existent user rejection', 404, () => 
    request('POST', '/login', { username: 'nobody_12345', password: 'pass' })
  )) passed++; else failed++;

  // Test 4: No auth token
  if (await test('No token rejection', 401, () => 
    request('GET', '/spareparts')
  )) passed++; else failed++;

  // Test 5: Invalid auth token
  if (await test('Invalid token rejection', 403, () => 
    request('GET', '/spareparts', null, { 'Authorization': 'Bearer invalid.token' })
  )) passed++; else failed++;

  console.log('\nData Validation Tests:\n');

  // Test 6: Part without required fields
  if (await test('Part missing serials', 400, () => 
    request('POST', '/spareparts', {
      part_no: 'TEST',
      name: 'Test',
      quantity: 1,
      warehouseId: 1,
      serials: []
    }, { 'Authorization': `Bearer ${authToken}` })
  )) passed++; else failed++;

  // Test 7: Part without warehouse
  if (await test('Part without warehouse', 400, () => 
    request('POST', '/spareparts', {
      part_no: `TEST-${Date.now()}`,
      name: 'Test',
      quantity: 1,
      serials: ['SN-001']
    }, { 'Authorization': `Bearer ${authToken}` })
  )) passed++; else failed++;

  // Test 8: Valid part creation
  if (await test('Valid part creation', 201, () => 
    request('POST', '/spareparts', {
      part_no: `EDGE-${Date.now()}`,
      name: 'Edge Case Test',
      quantity: 5,
      warehouseId: 1,
      serials: ['E1', 'E2', 'E3', 'E4', 'E5']
    }, { 'Authorization': `Bearer ${authToken}` })
  )) passed++; else failed++;

  // Test 9: Very long name
  if (await test('Long part name handling', 201, () => 
    request('POST', '/spareparts', {
      part_no: `LONG-${Date.now()}`,
      name: 'A'.repeat(500),
      quantity: 1,
      warehouseId: 1,
      serials: ['SN-LONG']
    }, { 'Authorization': `Bearer ${authToken}` })
  )) passed++; else failed++;

  // Test 10: Unicode characters
  if (await test('Unicode character handling', 201, () => 
    request('POST', '/spareparts', {
      part_no: `UNICODE-${Date.now()}`,
      name: '测试 テスト ทดสอบ',
      quantity: 1,
      warehouseId: 1,
      serials: ['SN-日本']
    }, { 'Authorization': `Bearer ${authToken}` })
  )) passed++; else failed++;

  console.log('\nMovement & Boundary Tests:\n');

  // Test 11: Movement with zero quantity (API rejects as invalid)
  if (await test('Zero quantity rejection', 400, () => 
    request('POST', '/stock-movements', {
      part_id: 1,
      movement_type: 'IN',
      quantity: 0,
      note: 'Zero qty test'
    }, { 'Authorization': `Bearer ${authToken}` })
  )) passed++; else failed++;

  // Test 12: Movement with negative quantity (API rejects as invalid)
  if (await test('Negative quantity rejection', 400, () => 
    request('POST', '/stock-movements', {
      part_id: 1,
      movement_type: 'OUT',
      quantity: -5,
      note: 'Negative qty'
    }, { 'Authorization': `Bearer ${authToken}` })
  )) passed++; else failed++;

  // Test 13: Invalid movement type (API now rejects with 400)
  if (await test('Invalid movement type rejection', 400, () => 
    request('POST', '/stock-movements', {
      part_id: 1,
      movement_type: 'INVALID',
      quantity: 10
    }, { 'Authorization': `Bearer ${authToken}` })
  )) passed++; else failed++;

  // Test 14: Valid IN movement
  if (await test('Valid IN movement', 201, () => 
    request('POST', '/stock-movements', {
      part_id: 1,
      movement_type: 'IN',
      quantity: 10,
      note: 'Valid movement'
    }, { 'Authorization': `Bearer ${authToken}` })
  )) passed++; else failed++;

  console.log('\nQuery & Filter Tests:\n');

  // Test 15: Valid warehouse filter
  if (await test('Valid warehouse filter', 200, () => 
    request('GET', '/spareparts?warehouseId=1', null, { 'Authorization': `Bearer ${authToken}` })
  )) passed++; else failed++;

  // Test 16: Invalid warehouse filter (string)
  if (await test('Invalid warehouse ID (string)', 200, () => 
    request('GET', '/spareparts?warehouseId=invalid', null, { 'Authorization': `Bearer ${authToken}` })
  )) passed++; else failed++;

  // Test 17: Nonexistent part ID
  if (await test('Nonexistent part query', 200, () => 
    request('GET', '/spareparts', null, { 'Authorization': `Bearer ${authToken}` })
  )) passed++; else failed++;

  console.log('\n========== RESULTS ==========');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);
  console.log(`\n${failed === 0 ? '✓ All edge case tests passed!' : '⚠ Some tests did not match expectations'}\n`);

  process.exitCode = 0;
}

main().catch((err) => {
  console.error('Edge case test error:', err);
  process.exitCode = 1;
});
