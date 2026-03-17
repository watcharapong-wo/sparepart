const fs = require('fs');
const path = require('path');

// Manual .env loader
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
      const idx = line.indexOf('=');
      if (idx !== -1) {
        const key = line.substring(0, idx).trim();
        const value = line.substring(idx + 1).trim();
        process.env[key] = value;
      }
    });
  }
} catch (err) {}

const { sendTeamsNotification } = require('./teams_notifier');

console.log('--- Testing MS Teams Notification ---');
console.log('Webhook URL:', process.env.TEAMS_WEBHOOK_URL ? 'FOUND' : 'NOT FOUND');

if (!process.env.TEAMS_WEBHOOK_URL) {
  console.error('Error: TEAMS_WEBHOOK_URL is missing in .env');
  process.exit(1);
}

sendTeamsNotification({
  type: 'NEW',
  partName: 'Test Part (Antigravity)',
  quantity: 1,
  user: 'Test User',
  receiver: 'Antigravity Bot',
  department: 'Maintenance',
  warehouse: 'LPN1'
});

console.log('Message sent! Please check your Teams channel.');
