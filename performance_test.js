#!/usr/bin/env node

/**
 * Performance & Load Test Suite
 * Validates API response times and concurrent request handling
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000';
let authToken = '';
const CONCURRENT_REQUESTS = 10;
const ITERATIONS = 5;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
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
        const duration = Date.now() - startTime;
        resolve({
          status: res.statusCode,
          body: data,
          duration
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function performanceTest(name, fn, iterations = ITERATIONS) {
  const durations = [];
  
  for (let i = 0; i < iterations; i++) {
    try {
      const startTime = Date.now();
      await fn();
      const duration = Date.now() - startTime;
      durations.push(duration);
    } catch (err) {
      console.error(`  Error in iteration ${i + 1}: ${err.message}`);
      return null;
    }
  }

  const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const p95 = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)];

  console.log(`✓ ${name}`);
  console.log(`  Avg: ${avg}ms | Min: ${min}ms | Max: ${max}ms | P95: ${p95}ms`);
  
  return { avg, min, max, p95, durations };
}

async function main() {
  console.log('\n========== PERFORMANCE TEST SUITE ==========\n');

  // Setup: Login
  const loginRes = await request('POST', '/login', {
    username: 'testuser',
    password: 'test123'
  });
  const loginBody = JSON.parse(loginRes.body);
  authToken = loginBody.token;

  console.log('Individual Endpoint Performance:\n');

  // Test 1: Root endpoint
  await performanceTest('GET / (root)', async () => {
    const res = await request('GET', '/');
    if (res.status !== 200) throw new Error(`Unexpected status: ${res.status}`);
  });

  // Test 2: List spareparts
  await performanceTest('GET /spareparts (list)', async () => {
    const res = await request('GET', '/spareparts', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Unexpected status: ${res.status}`);
  });

  // Test 3: Get reports
  await performanceTest('GET /report/movements3 (report)', async () => {
    const res = await request('GET', '/report/movements3', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Unexpected status: ${res.status}`);
  });

  // Test 4: Get insights
  await performanceTest('GET /report/insights (complex report)', async () => {
    const res = await request('GET', '/report/insights', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Unexpected status: ${res.status}`);
  });

  // Test 5: Export CSV
  await performanceTest('GET /export/movements (CSV export)', async () => {
    const res = await request('GET', '/export/movements', null, {
      'Authorization': `Bearer ${authToken}`
    });
    if (res.status !== 200) throw new Error(`Unexpected status: ${res.status}`);
  });

  console.log('\n\nConcurrent Request Handling:\n');

  // Test concurrent requests
  async function testConcurrent(name, fn, concurrent = CONCURRENT_REQUESTS) {
    const startTime = Date.now();
    const promises = [];
    
    for (let i = 0; i < concurrent; i++) {
      promises.push(fn().catch(err => ({ error: err.message })));
    }

    const results = await Promise.all(promises);
    const duration = Date.now() - startTime;
    
    const successful = results.filter(r => !r.error).length;
    const failed = results.filter(r => r.error).length;
    
    console.log(`✓ ${name}`);
    console.log(`  ${concurrent} concurrent requests in ${duration}ms (${successful} ok, ${failed} failed)`);
    console.log(`  Throughput: ~${Math.round(concurrent / (duration / 1000))} req/sec`);

    return { successful, failed, duration };
  }

  await testConcurrent(
    'List spareparts (10 concurrent)',
    () => request('GET', '/spareparts', null, { 'Authorization': `Bearer ${authToken}` })
  );

  await testConcurrent(
    'Get report (10 concurrent)',
    () => request('GET', '/report/movements3', null, { 'Authorization': `Bearer ${authToken}` })
  );

  console.log('\n========== END PERFORMANCE TEST ==========\n');
  process.exitCode = 0;
}

main().catch((err) => {
  console.error('Performance test error:', err);
  process.exitCode = 1;
});
