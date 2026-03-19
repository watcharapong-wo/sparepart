const https = require('https');
const url = require('url');

/**
 * Sends a notification to MS Teams via Power Automate Webhook
 * @param {Object} params 
 * @param {string} params.type - Movement type (IN, OUT, BORROW, RETURN)
 * @param {string} params.partName - Name of the spare part
 * @param {number} params.quantity - Quantity moved
 * @param {string} params.user - User who performed the action
 * @param {string} params.receiver - Receiver of the part
 * @param {string} params.department - Department involved
 * @param {string} params.warehouse - Warehouse name
 * @param {string} params.serialNos - List of serial numbers (SP no)
 * @param {string} params.note - Additional note
 */
function sendTeamsNotification({ type, partName, quantity, qty, user, receiver, department, warehouse, serialNos, spNo, note }) {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('[TEAMS] Webhook URL not found in environment variables');
    return;
  }

  const typeEmoji = {
    'IN': '📥',
    'OUT': '📤',
    'BORROW': '📂',
    'RETURN': '🔄',
    'TRANSFER': '🔁',
    'NEW': '📦',
    'DELETE': '🗑️',
    'LOW_STOCK': '⚠️',
    'REMINDER': '⏰'
  }[type] || '🔔';

  const qtyValue = quantity ?? qty;
  const serialValue = serialNos ?? spNo;

  const titleText = type === 'LOW_STOCK'
    ? `⚠️ CRITICAL: Low Stock Alert!`
    : type === 'REMINDER'
    ? `⏰ OVERDUE REMINDER: Return Required`
    : type === 'DELETE'
    ? `🗑️ Spare Part Deleted`
    : `${typeEmoji} Stock Movement: ${type}`;
  const timestamp = new Date().toLocaleString('th-TH');

  // Constructing a payload that handles both lowercase and uppercase expectations
  const payload = {
    type: "message",
    Type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: titleText,
              weight: "Bolder",
              size: "Medium"
            },
            {
              type: "FactSet",
              facts: [
                { title: "Part:", value: String(partName || '-') },
                { title: "Qty:", value: String(qtyValue || '0') },
                { title: "Warehouse:", value: String(warehouse || '-') },
                { title: "By:", value: String(user || 'System') },
                { title: "Receiver:", value: String(receiver || '-') },
                { title: "Dept:", value: String(department || '-') },
                { title: "SP No:", value: String(serialValue || '-') },
                { title: "Note:", value: String(note || '-') },
                { title: "Time:", value: String(timestamp) }
              ]
            }
          ]
        }
      }
    ],
    Attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: titleText,
              weight: "Bolder",
              size: "Medium"
            }
          ]
        }
      }
    ]
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

  const req = https.request(options, (res) => {
    console.log(`[TEAMS] Status: ${res.statusCode}`);
  });

  req.on('error', (e) => {
    console.error(`[TEAMS] Error: ${e.message}`);
  });

  req.write(body);
  req.end();
}

module.exports = { sendTeamsNotification };
