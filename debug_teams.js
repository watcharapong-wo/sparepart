const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Load environment variables
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
      const idx = line.indexOf('=');
      if (idx !== -1) {
        process.env[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
      }
    });
  }
} catch (err) {}

const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
if (!webhookUrl) {
  console.error("Error: TEAMS_WEBHOOK_URL is not set in .env");
  process.exit(1);
}

console.log("Using Webhook URL:", webhookUrl.substring(0, 50) + "...");

const payload = {
  type: "OUT",
  eventType: "OUT",
  title: "Debug Test",
  summary: "This is a debug test",
  message: "Testing Power Automate Webhook connectivity",
  partName: "Test Part",
  quantity: "1 PC",
  user: "Admin",
  receiver: "Test",
  receiver_name: "Test",
  department: "IT",
  warehouse: "LPN1",
  sourceWarehouse: "-",
  destinationWarehouse: "-",
  serialNos: "SP0001",
  requestNumber: "REQ001",
  note: "Test note",
  timestamp: new Date().toLocaleString('th-TH')
};

const body = JSON.stringify(payload);
const parsedUrl = url.parse(webhookUrl);

const options = {
  hostname: parsedUrl.hostname,
  port: parsedUrl.port || 443,
  path: parsedUrl.path,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
};

console.log("Sending request...");
const req = https.request(options, (res) => {
  let responseBody = '';
  res.on('data', (chunk) => {
    responseBody += chunk;
  });
  res.on('end', () => {
    console.log(`\n--- HTTP Response ---`);
    console.log(`Status Code: ${res.statusCode}`);
    console.log(`Headers:`, res.headers);
    console.log(`Body: ${responseBody}`);
    console.log(`---------------------\n`);
  });
});

req.on('error', (e) => {
  console.error(`Request Error: ${e.message}`);
});

req.write(body);
req.end();
