const http = require('http');

async function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

(async () => {
  const host = 'localhost';
  const port = 4003;

  console.log('--- Step 1: Login ---');
  const loginRes = await request({
    hostname: host,
    port,
    path: '/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'admin', password: 'admin123' });

  if (loginRes.status !== 200) {
    console.error('Login failed:', loginRes);
    return;
  }
  const token = loginRes.data.token;
  console.log('Login successful, token received.');

  console.log('--- Step 2: Add Part ---');
  const partData = {
    part_no: 'TEST-NOTIF-' + Date.now(),
    name: 'Debug Part ' + new Date().toLocaleTimeString(),
    description: 'Testing why new part notification fails',
    quantity: 5,
    price: 100,
    warehouseId: 1, // LPN1
    serials: ['SN-' + Date.now()]
  };

  const addRes = await request({
    hostname: host,
    port,
    path: '/spareparts',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, partData);

  console.log('Add Part Result:', addRes);
})();
