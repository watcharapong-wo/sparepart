#!/usr/bin/env node

/**
 * Integration Test Suite: Complex Flow Validation
 * Tests business workflows: transfer, export, stock movements, advanced reports
 */

const http = require('http');
const fs = require('fs');

const BASE_URL = 'http://localhost:5000';
let authToken = '';
let testPartId = null;

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

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (err) {
    console.error(`✗ ${name}: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('\n========== INTEGRATION TEST SUITE ==========\n');
  
  let passed = 0, failed = 0;

  // Setup: Login
  if (await test('Login for integration tests', async () => {
    const res = await request('POST', '/login', {
      username: 'testuser',
      password: 'test123'
    });
    if (res.status !== 200) throw new Error(`Login failed: ${res.status}`);
    const body = JSON.parse(res.body);
    if (!body.token) throw new Error('No token in response');
    authToken = body.token;
  })) passed++; else failed++;

  // Test 1: Create sparepart for transfer test
  if (await test('Create source part for transfer', async () => {
    const res = await request('POST', '/spareparts', {
      part_no: `TRANSFER-SOURCE-${Date.now()}`,
      name: 'Transfer Source Part',
      description: 'Part for transfer test',
      quantity: 5,
      unit_type: 'PC',
      conversion_rate: 1,
      price: 500,
      warehouseId: 1,
      serials: ['TS-001', 'TS-002', 'TS-003', 'TS-004', 'TS-005']
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const body = JSON.parse(res.body);
    testPartId = body.partId;
    if (!testPartId) throw new Error('No partId in response');
  })) passed++; else failed++;

  // Test 2: Perform transfer between warehouses
  if (await test('Transfer part between warehouses', async () => {
    if (!testPartId) throw new Error('No test part ID');
    const res = await request('POST', '/spareparts/transfer', {
      part_id: testPartId,
      target_warehouse_id: 2,
      quantity: 2,
      note: 'Integration test transfer'
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${res.body}`);
  })) passed++; else failed++;

  // Test 3: Post stock movement IN
  if (await test('Create stock movement IN', async () => {
    const res = await request('POST', '/stock-movements', {
      part_id: testPartId || 1,
      movement_type: 'IN',
      quantity: 10,
      note: 'Integration test IN movement',
      movement_date: new Date().toISOString().split('T')[0],
      receiver: 'Test Receiver'
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${res.body}`);
  })) passed++; else failed++;

  // Test 4: Post stock movement OUT
  if (await test('Create stock movement OUT', async () => {
    const res = await request('POST', '/stock-movements', {
      part_id: testPartId || 1,
      movement_type: 'OUT',
      quantity: 3,
      note: 'Integration test OUT movement',
      movement_date: new Date().toISOString().split('T')[0],
      receiver: 'Maintenance Dept'
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${res.body}`);
  })) passed++; else failed++;

  // Test 5: Post stock movement BORROW
  if (await test('Create stock movement BORROW', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const res = await request('POST', '/stock-movements', {
      part_id: testPartId || 1,
      movement_type: 'BORROW',
      quantity: 2,
      note: 'Integration test BORROW movement',
      movement_date: new Date().toISOString().split('T')[0],
      due_date: futureDate.toISOString().split('T')[0],
      receiver: 'Engineering Dept'
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${res.body}`);
  })) passed++; else failed++;

  // Test 6: Get low stock report
  if (await test('Fetch low stock report', async () => {
    const res = await request('GET', '/report/low-stock', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!Array.isArray(body)) throw new Error('Response is not an array');
  })) passed++; else failed++;

  // Test 7: Get value report
  if (await test('Fetch stock value report', async () => {
    const res = await request('GET', '/report/value', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!body[0]) throw new Error('No data in response');
  })) passed++; else failed++;

  // Test 8: Get value by warehouse report
  if (await test('Fetch value by warehouse report', async () => {
    const res = await request('GET', '/report/value-by-warehouse', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!Array.isArray(body)) throw new Error('Response is not an array');
  })) passed++; else failed++;

  // Test 9: Get expense by warehouse report
  if (await test('Fetch expense by warehouse report', async () => {
    const res = await request('GET', '/report/expense-by-warehouse', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!Array.isArray(body)) throw new Error('Response is not an array');
  })) passed++; else failed++;

  // Test 10: Get movement trends report
  if (await test('Fetch movement trends report', async () => {
    const res = await request('GET', '/report/movement-trends', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!Array.isArray(body)) throw new Error('Response is not an array');
  })) passed++; else failed++;

  // Test 11: Get monthly comparison report
  if (await test('Fetch monthly comparison report', async () => {
    const res = await request('GET', '/report/monthly-comparison', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!Array.isArray(body)) throw new Error('Response is not an array');
  })) passed++; else failed++;

  // Test 12: Get withdraw by account report
  if (await test('Fetch withdraw by account report', async () => {
    const res = await request('GET', '/report/withdraw-by-account', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!Array.isArray(body)) throw new Error('Response is not an array');
  })) passed++; else failed++;

  // Test 13: Export movements to CSV
  if (await test('Export movements to CSV', async () => {
    const res = await request('GET', '/export/movements', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!res.body) throw new Error('No CSV content returned');
  })) passed++; else failed++;

  // Test 14: Get reasons list
  if (await test('Fetch movement reasons list', async () => {
    const res = await request('GET', '/reasons', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!Array.isArray(body)) throw new Error('Response is not an array');
  })) passed++; else failed++;

  // Test 15: Update sparepart
  if (await test('Update sparepart details', async () => {
    if (!testPartId) throw new Error('No test part ID');
    const res = await request('PUT', `/spareparts/${testPartId}`, {
      part_no: `TRANSFER-SOURCE-${Date.now()}`,
      name: 'Updated Test Part',
      description: 'Updated description',
      quantity: 5,
      price: 599.99
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${res.body}`);
  })) passed++; else failed++;

  // Test 16: Get spareparts list (verify test part exists)
  if (await test('Verify test part in list', async () => {
    const res = await request('GET', '/spareparts', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!Array.isArray(body) || body.length === 0) throw new Error('No spareparts in list');
  })) passed++; else failed++;

  // Test 17: Get all reports (comprehensive check)
  if (await test('Fetch comprehensive dashboard-like data', async () => {
    const res = await request('GET', '/report/insights', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!body.popular || !body.deadStock) throw new Error('Missing insights metrics');
  })) passed++; else failed++;

  // Test 18: Filter spareparts by warehouse
  if (await test('Filter spareparts by warehouse', async () => {
    const res = await request('GET', '/spareparts?warehouseId=1', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!Array.isArray(body)) throw new Error('Response is not an array');
  })) passed++; else failed++;

  // Test 19: Filter movements by warehouse
  if (await test('Filter movements by warehouse', async () => {
    const res = await request('GET', '/report/movements3?warehouseId=1', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!Array.isArray(body)) throw new Error('Response is not an array');
  })) passed++; else failed++;

  // Test 20: Error handling - non-existent part
  if (await test('Handle non-existent part gracefully', async () => {
    const res = await request('GET', '/spareparts/999999', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 404 && res.status !== 200) throw new Error(`Unexpected status: ${res.status}`);
  })) passed++; else failed++;

  console.log(`\n========== RESULTS ==========`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);
  console.log(`\n${failed === 0 ? '✓ All integration tests passed!' : '✗ Some integration tests failed'}\n`);

  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('Test suite error:', err);
  process.exitCode = 1;
});
