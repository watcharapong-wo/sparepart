#!/usr/bin/env node

/**
 * Smoke Test Suite: Core Flow Validation
 * Tests critical business flows: login, spareparts CRUD, movements, transfer, reports
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
  console.log('\n========== SMOKE TEST SUITE ==========\n');
  
  let passed = 0, failed = 0;

  // 1. Root health check
  if (await test('Root endpoint responds', async () => {
    const res = await request('GET', '/');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  })) passed++; else failed++;

  // 2. Login page load
  if (await test('Login page loads', async () => {
    const res = await request('GET', '/login.html');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  })) passed++; else failed++;

  // 3. Login and get token
  if (await test('User login works', async () => {
    const res = await request('POST', '/login', {
      username: 'testuser',
      password: 'test123'
    });
    if (res.status !== 200) throw new Error(`Login failed: ${res.status} - ${res.body}`);
    const body = JSON.parse(res.body);
    if (!body.token) throw new Error('No token in response');
    authToken = body.token;
  })) passed++; else failed++;

  // 4. Get spareparts list
  if (await test('Fetch spareparts list', async () => {
    const res = await request('GET', '/spareparts', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!Array.isArray(body)) throw new Error('Response is not an array');
  })) passed++; else failed++;

  // 5. Create new sparepart
  if (await test('Create new sparepart', async () => {
    const res = await request('POST', '/spareparts', {
      part_no: `TEST-${Date.now()}`,
      name: 'Test Part',
      description: 'Test Description',
      quantity: 3,
      unit_type: 'piece',
      conversion_rate: 1,
      price: 999.99,
      warehouseId: 1,
      serials: ['SN-001', 'SN-002', 'SN-003']
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${res.body}`);
  })) passed++; else failed++;

  // 6. Get stock movements (via report endpoint)
  if (await test('Fetch stock movements report', async () => {
    const res = await request('GET', '/report/movements', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!Array.isArray(body)) throw new Error('Response is not an array');
  })) passed++; else failed++;

  // 7. Get warehouses
  if (await test('Fetch warehouses list', async () => {
    const res = await request('GET', '/warehouses', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!Array.isArray(body)) throw new Error('Response is not an array');
  })) passed++; else failed++;

  // 8. Get users list (admin only)
  if (await test('Fetch users list (admin)', async () => {
    const res = await request('GET', '/users', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!Array.isArray(body)) throw new Error('Response is not an array');
  })) passed++; else failed++;

  // 9. Get report: activity logs
  if (await test('Fetch activity logs report', async () => {
    const res = await request('GET', '/report/activity-logs', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!Array.isArray(body)) throw new Error('Response is not an array');
  })) passed++; else failed++;

  // 10. Get report: movements (with last 30 days)
  if (await test('Fetch movements report', async () => {
    const res = await request('GET', '/report/movements3', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!Array.isArray(body)) throw new Error('Response is not an array');
  })) passed++; else failed++;

  // 11. Get report: insights
  if (await test('Fetch insights report', async () => {
    const res = await request('GET', '/report/insights', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!body.popular || !Array.isArray(body.popular)) throw new Error('Missing popular data');
    if (!body.deadStock || !Array.isArray(body.deadStock)) throw new Error('Missing deadStock data');
  })) passed++; else failed++;

  // 12. Protected endpoint returns 401 without token
  if (await test('Protected endpoint denies unauthenticated', async () => {
    const res = await request('GET', '/spareparts');
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  })) passed++; else failed++;

  // 13. Invalid token returns 403
  if (await test('Invalid token returns 403', async () => {
    const res = await request('GET', '/spareparts', null, {
      'Authorization': 'Bearer invalid_token'
    });
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
  })) passed++; else failed++;

  console.log(`\n========== RESULTS ==========`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);
  console.log(`\n${failed === 0 ? '✓ All tests passed!' : '✗ Some tests failed'}\n`);

  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('Test suite error:', err);
  process.exitCode = 1;
});
