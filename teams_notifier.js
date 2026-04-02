const https = require('https');
const url = require('url');

const SUPPORTED_NOTIFICATION_TYPES = new Set(["IN", "OUT", "BORROW", "RETURN", "TRANSFER", "REMINDER", "LOW_STOCK"]);

function normalizeNotificationType(type) {
  return String(type || '').trim().toUpperCase();
}

function isSupportedNotificationType(type) {
  return SUPPORTED_NOTIFICATION_TYPES.has(normalizeNotificationType(type));
}

function asText(value, fallback = '-') {
  const trimmed = String(value ?? '').trim();
  return trimmed || fallback;
}

function buildNotificationContent({ type, titleText, partName, quantity, warehouse, user, receiver, department, sourceWarehouse, destinationWarehouse, serialNos, note, timestamp }) {
  const actionConfig = {
    OUT: {
      summaryLabel: 'Issued',
      actorLabel: 'Issued By',
      targetLabel: 'Issued To'
    },
    BORROW: {
      summaryLabel: 'Borrowed',
      actorLabel: 'Handled By',
      targetLabel: 'Borrower'
    },
    RETURN: {
      summaryLabel: 'Returned',
      actorLabel: 'Received By',
      targetLabel: 'Returned By'
    },
    TRANSFER: {
      summaryLabel: 'Transferred',
      actorLabel: 'Transferred By',
      targetLabel: 'Destination'
    }
  }[type] || {
    summaryLabel: 'Moved',
    actorLabel: 'User',
    targetLabel: 'Receiver'
  };

  const summary = type === 'TRANSFER'
    ? `${titleText} | ${partName} | ${sourceWarehouse} -> ${destinationWarehouse} | Qty ${quantity}`
    : `${titleText} | ${actionConfig.summaryLabel}: ${partName} | Qty ${quantity}`;
  const lines = [
    titleText,
    '',
    `Part: ${partName}`,
    `Quantity: ${quantity}`
  ];

  if (type === 'TRANSFER') {
    lines.push(`From Warehouse: ${sourceWarehouse}`);
    lines.push(`To Warehouse: ${destinationWarehouse}`);
    lines.push(`${actionConfig.actorLabel}: ${user}`);
  } else {
    lines.push(`Warehouse: ${warehouse}`);
    lines.push(`${actionConfig.actorLabel}: ${user}`);
    lines.push(`${actionConfig.targetLabel}: ${receiver}`);
    lines.push(`Department: ${department}`);
  }

  lines.push(`SP No: ${serialNos}`);
  lines.push(`Note: ${note}`);
  lines.push(`Time: ${timestamp}`);

  return {
    summary,
    message: lines.join('\n')
  };
}

/**
 * Sends a notification to MS Teams via Power Automate Webhook
 * @param {Object} params 
 * @param {string} params.type - Notification type (OUT, BORROW, RETURN, TRANSFER, REMINDER)
 * @param {string} params.partName - Name of the spare part
 * @param {number} params.quantity - Quantity moved
 * @param {string} params.user - User who performed the action
 * @param {string} params.receiver - Receiver of the part
 * @param {string} params.department - Department involved
 * @param {string} params.warehouse - Warehouse name
 * @param {string} params.sourceWarehouse - Source warehouse for transfers
 * @param {string} params.destinationWarehouse - Destination warehouse for transfers
 * @param {string} params.serialNos - List of serial numbers (SP no)
 * @param {string} params.note - Additional note
 */
function sendTeamsNotification({ type, partName, quantity, qty, user, receiver, department, warehouse, sourceWarehouse, destinationWarehouse, serialNos, spNo, note }) {
  const normalizedType = normalizeNotificationType(type);
  if (!isSupportedNotificationType(normalizedType)) {
    console.log(`[TEAMS] Skip notification for type: ${type}`);
    return;
  }

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
    'UPDATE': '✏️',
    'DELETE': '🗑️',
    'LOW_STOCK': '⚠️',
    'REMINDER': '⏰'
  }[normalizedType] || '🔔';

  const qtyValue = quantity ?? qty;
  const serialValue = serialNos ?? spNo;

  const titleText = normalizedType === 'LOW_STOCK'
    ? `⚠️ CRITICAL: Low Stock Alert!`
    : normalizedType === 'REMINDER'
    ? `⏰ OVERDUE REMINDER: Return Required`
    : normalizedType === 'DELETE'
    ? `🗑️ Spare Part Deleted`
    : `${typeEmoji} Stock Movement: ${normalizedType}`;
  const timestamp = new Date().toLocaleString('th-TH');
  const payloadFields = {
    partName: asText(partName),
    quantity: Number(qtyValue || 0),
    user: asText(user, 'System'),
    receiver: asText(receiver),
    department: asText(department),
    warehouse: asText(warehouse),
    sourceWarehouse: asText(sourceWarehouse),
    destinationWarehouse: asText(destinationWarehouse),
    serialNos: asText(serialValue),
    note: asText(note),
    timestamp: asText(timestamp)
  };
  const notificationContent = buildNotificationContent({ type: normalizedType, titleText, ...payloadFields });

  const isPowerAutomateWebhook = /powerautomate|logic\.azure\.com/i.test(webhookUrl);

  // Power Automate endpoints usually expect a plain JSON object.
  // Direct Teams incoming webhooks expect type=message + attachments.
  const payload = isPowerAutomateWebhook
    ? {
        type: String(normalizedType || 'UNKNOWN'),
        eventType: String(normalizedType || 'UNKNOWN'),
        title: titleText,
        summary: notificationContent.summary,
        message: notificationContent.message,
        partName: payloadFields.partName,
        quantity: payloadFields.quantity,
        user: payloadFields.user,
        receiver: payloadFields.receiver,
        department: payloadFields.department,
        warehouse: payloadFields.warehouse,
        sourceWarehouse: payloadFields.sourceWarehouse,
        destinationWarehouse: payloadFields.destinationWarehouse,
        serialNos: payloadFields.serialNos,
        note: payloadFields.note,
        timestamp: payloadFields.timestamp
      }
    : {
        type: "message",
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
                    { title: "Part:", value: payloadFields.partName },
                    { title: "Qty:", value: String(payloadFields.quantity) },
                    { title: "Warehouse:", value: payloadFields.warehouse },
                    { title: "By:", value: payloadFields.user },
                    { title: "Receiver:", value: payloadFields.receiver },
                    { title: "Dept:", value: payloadFields.department },
                    { title: "SP No:", value: payloadFields.serialNos },
                    { title: "Note:", value: payloadFields.note },
                    { title: "Time:", value: payloadFields.timestamp }
                  ]
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
    let responseBody = '';
    res.on('data', (chunk) => {
      responseBody += chunk;
    });
    res.on('end', () => {
      console.log(`[TEAMS] Sent type=${normalizedType} status=${res.statusCode}`);
      if (responseBody) {
        console.log(`[TEAMS] Response: ${responseBody}`);
      }
    });
  });

  req.on('error', (e) => {
    console.error(`[TEAMS] Error: ${e.message}`);
  });

  req.setTimeout(10000, () => {
    console.error('[TEAMS] Error: request timeout');
    req.destroy();
  });

  req.write(body);
  req.end();
}

module.exports = {
  SUPPORTED_NOTIFICATION_TYPES,
  isSupportedNotificationType,
  normalizeNotificationType,
  sendTeamsNotification
};
