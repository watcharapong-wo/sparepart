#!/usr/bin/env node

/**
 * Smoke Test Suite: Core Flow Validation
 * Tests critical business flows: login, spareparts CRUD, movements, transfer, reports
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000';
const USERNAME = process.env.SMOKE_USERNAME || 'testuser';
const PASSWORD = process.env.SMOKE_PASSWORD || 'test123';
let authToken = '';
let warehouseId = 0;
let targetWarehouseId = 0;
let createdPartId = 0;
let createdPartNo = '';
let createdSerials = [];
let createdSerialItemId = 0;
let transferredPartId = 0;
let transferredSerialNo = '';

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

function parseJsonResponse(res) {
  try {
    return res.body ? JSON.parse(res.body) : null;
  } catch (err) {
    throw new Error(`Invalid JSON response: ${res.body}`);
  }
}

async function main() {
  console.log('\n========== SMOKE TEST SUITE ==========\n');
  
  let passed = 0, failed = 0;

  // 1. Health check
  if (await test('Health endpoint responds', async () => {
    const res = await request('GET', '/test');
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
      username: USERNAME,
      password: PASSWORD
    });
    if (res.status !== 200) throw new Error(`Login failed: ${res.status} - ${res.body}`);
    const body = parseJsonResponse(res);
    if (!body.token) throw new Error('No token in response');
    authToken = body.token;
  })) passed++; else failed++;

  // 4. Get warehouses and select one for test data
  if (await test('Fetch warehouses list', async () => {
    const res = await request('GET', '/warehouses', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = parseJsonResponse(res);
    if (!Array.isArray(body)) throw new Error('Response is not an array');
    if (body.length === 0) throw new Error('No warehouses found');
    warehouseId = Number(body[0].id);
    targetWarehouseId = body.length > 1 ? Number(body[1].id) : 0;
  })) passed++; else failed++;

  // 5. Create new sparepart
  if (await test('Create new sparepart', async () => {
    const uniqueId = Date.now();
    createdPartNo = `SMOKE-${uniqueId}`;
    createdSerials = [`${createdPartNo}-001`, `${createdPartNo}-002`, `${createdPartNo}-003`];
    const res = await request('POST', '/spareparts', {
      part_no: createdPartNo,
      name: 'Smoke Test Part',
      description: 'Created by smoke test',
      quantity: 3,
      unit_type: 'PC',
      conversion_rate: 1,
      price: 999.99,
      warehouseId,
      serials: createdSerials
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${res.body}`);
    const body = parseJsonResponse(res);
    createdPartId = Number(body.partId);
    if (!createdPartId) throw new Error('Missing created part ID');
  })) passed++; else failed++;

  // 6. Fetch created part serials
  if (await test('Fetch created part serials', async () => {
    const res = await request('GET', `/spareparts/${createdPartId}/serials`, null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = parseJsonResponse(res);
    if (!Array.isArray(body)) throw new Error('Response is not an array');
    if (body.length !== 3) throw new Error(`Expected 3 serials, got ${body.length}`);
    createdSerialItemId = Number(body[0].id);
    if (!createdSerialItemId) throw new Error('Missing serial item ID');
  })) passed++; else failed++;

  // 7. Record one stock movement
  if (await test('Record stock movement', async () => {
    const res = await request('POST', '/stock-movements', {
      part_id: createdPartId,
      movement_type: 'OUT',
      quantity: 1,
      department: 'SMOKE',
      receiver: 'Smoke Runner',
      receipt_number: `SMOKE-${Date.now()}`,
      note: 'Smoke test movement',
      serial_ids: [createdSerialItemId]
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${res.body}`);
    const body = parseJsonResponse(res);
    if (!body.movementId) throw new Error('Missing movement ID');
  })) passed++; else failed++;

  // 8. Transfer requires SP no list
  if (targetWarehouseId) {
    if (await test('Transfer rejects missing SP no list', async () => {
      const res = await request('POST', '/spareparts/transfer', {
        part_id: createdPartId,
        target_warehouse_id: targetWarehouseId,
        quantity: 1,
        note: 'Missing serial check'
      }, {
        'Authorization': `Bearer ${authToken}`
      });

      if (res.status !== 400) {
        throw new Error(`Expected 400, got ${res.status}: ${res.body}`);
      }
      const body = parseJsonResponse(res);
      if (!String(body?.error || '').toLowerCase().includes('sp no')) {
        throw new Error(`Unexpected error message: ${res.body}`);
      }
    })) passed++; else failed++;

    if (await test('Transfer succeeds with selected SP no', async () => {
      const sourceSerialRes = await request('GET', `/spareparts/${createdPartId}/serials`, null, {
        'Authorization': `Bearer ${authToken}`
      });
      if (sourceSerialRes.status !== 200) throw new Error(`Expected 200, got ${sourceSerialRes.status}`);
      const sourceSerials = parseJsonResponse(sourceSerialRes);
      if (!Array.isArray(sourceSerials) || sourceSerials.length === 0) {
        throw new Error('No available serials for transfer');
      }

      const selectedSerial = sourceSerials[0];
      const selectedSerialId = Number(selectedSerial.id);
      transferredSerialNo = String(selectedSerial.serial_no || '');
      if (!selectedSerialId || !transferredSerialNo) {
        throw new Error('Invalid selected serial for transfer');
      }

      const transferRes = await request('POST', '/spareparts/transfer', {
        part_id: createdPartId,
        target_warehouse_id: targetWarehouseId,
        quantity: 1,
        serial_ids: [selectedSerialId],
        note: 'Smoke transfer with selected serial'
      }, {
        'Authorization': `Bearer ${authToken}`
      });
      if (transferRes.status !== 200) {
        throw new Error(`Expected 200, got ${transferRes.status}: ${transferRes.body}`);
      }

      const sourceAfterRes = await request('GET', `/spareparts/${createdPartId}/serials`, null, {
        'Authorization': `Bearer ${authToken}`
      });
      if (sourceAfterRes.status !== 200) throw new Error(`Expected 200, got ${sourceAfterRes.status}`);
      const sourceAfter = parseJsonResponse(sourceAfterRes);
      if ((sourceAfter || []).some((row) => Number(row.id) === selectedSerialId)) {
        throw new Error('Transferred serial still exists in source part');
      }

      const allPartsRes = await request('GET', '/spareparts', null, {
        'Authorization': `Bearer ${authToken}`
      });
      if (allPartsRes.status !== 200) throw new Error(`Expected 200, got ${allPartsRes.status}`);
      const allParts = parseJsonResponse(allPartsRes);
      const targetPart = (allParts || []).find((p) => String(p.part_no || '') === createdPartNo && Number(p.warehouseId) === targetWarehouseId);
      if (!targetPart?.id) {
        throw new Error('Transferred target part not found');
      }
      transferredPartId = Number(targetPart.id);

      const targetSerialRes = await request('GET', `/spareparts/${transferredPartId}/serials`, null, {
        'Authorization': `Bearer ${authToken}`
      });
      if (targetSerialRes.status !== 200) throw new Error(`Expected 200, got ${targetSerialRes.status}`);
      const targetSerials = parseJsonResponse(targetSerialRes);
      const movedExists = (targetSerials || []).some((row) => String(row.serial_no || '') === transferredSerialNo);
      if (!movedExists) {
        throw new Error('Transferred serial not found in target part');
      }
    })) passed++; else failed++;
  }

  // 9. Fetch dashboard value report
  if (await test('Fetch dashboard value report', async () => {
    const res = await request('GET', '/report/value', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = parseJsonResponse(res);
    if (!Array.isArray(body)) throw new Error('Response is not an array');
  })) passed++; else failed++;

  // 10. Fetch dashboard low-stock report
  if (await test('Fetch dashboard low-stock report', async () => {
    const res = await request('GET', '/report/low-stock', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = parseJsonResponse(res);
    if (!Array.isArray(body)) throw new Error('Response is not an array');
  })) passed++; else failed++;

  // 11. Fetch dashboard movements report
  if (await test('Fetch dashboard movements report', async () => {
    const res = await request('GET', '/report/movements3', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = parseJsonResponse(res);
    if (!Array.isArray(body)) throw new Error('Response is not an array');
    const hasCreatedPart = body.some((item) => String(item.part_no || item.partType || '').includes(createdPartNo));
    if (!hasCreatedPart) throw new Error('Created part movement not found in report');
  })) passed++; else failed++;

  // 12. Fetch dashboard insights report
  if (await test('Fetch insights report', async () => {
    const res = await request('GET', '/report/insights', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = parseJsonResponse(res);
    if (!body.popular || !Array.isArray(body.popular)) throw new Error('Missing popular data');
    if (!body.deadStock || !Array.isArray(body.deadStock)) throw new Error('Missing deadStock data');
    if (!body.lowStock || !Array.isArray(body.lowStock)) throw new Error('Missing lowStock data');
    if (!body.overdue || !Array.isArray(body.overdue)) throw new Error('Missing overdue data');
  })) passed++; else failed++;

  // 13. Cleanup created parts
  if (createdPartId) {
    if (await test('Cleanup created sparepart', async () => {
      const res = await request('DELETE', `/spareparts/${createdPartId}`, null, {
        'Authorization': `Bearer ${authToken}`
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${res.body}`);

      if (transferredPartId) {
        const transferPartDeleteRes = await request('DELETE', `/spareparts/${transferredPartId}`, null, {
          'Authorization': `Bearer ${authToken}`
        });
        if (transferPartDeleteRes.status !== 200) {
          throw new Error(`Target cleanup failed: ${transferPartDeleteRes.status} ${transferPartDeleteRes.body}`);
        }
      }
    })) passed++; else failed++;
  }

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
