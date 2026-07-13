// Lead capture backend
// Node.js / Express — serves the site + handles /api/lead
// Run: node server.js

require('dotenv').config();
const express = require('express');
const path = require('path');
const https = require('https');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ===========================
// CONFIG
// ===========================
const FUB_API_KEY    = process.env.FUB_API_KEY;
const NOTIFY_EMAIL   = process.env.NOTIFY_EMAIL   || 'chuck@allin-lending.com';
const NOTIFY_PHONE   = process.env.NOTIFY_PHONE   || '+16194540917';
const TWILIO_SID     = process.env.TWILIO_SID;
const TWILIO_TOKEN   = process.env.TWILIO_TOKEN;
const TWILIO_FROM    = process.env.TWILIO_FROM    || '+16192573708';
const PORT           = process.env.PORT           || 3000;

// ===========================
// LEAD ENDPOINT
// ===========================
app.post('/api/lead', async (req, res) => {
  const { name, phone, email, callTime, calcData = {} } = req.body;

  if (!name || !phone || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  console.log(`\n📋 NEW LEAD: ${name} | ${phone} | ${email}`);
  console.log(`   Home Price: $${(calcData.homePrice || 0).toLocaleString()}`);
  console.log(`   Est. Payment: $${Math.round(calcData.totalMonthly || 0).toLocaleString()}/mo`);
  console.log(`   Pre-Qual: ${calcData.prequalStatus}`);
  console.log(`   Best Time: ${callTime}`);

  const results = { fub: false, email: false };

  // --- Follow Up Boss ---
  try {
    await sendToFUB({ name, phone, email, callTime, calcData });
    results.fub = true;
    console.log('✅ FUB: Lead created');
  } catch (err) {
    console.error('❌ FUB Error:', err.message);
  }

  // --- Email notification ---
  try {
    await sendEmailNotification({ name, phone, email, callTime, calcData });
    results.email = true;
    console.log('✅ Email: Notification sent');
  } catch (err) {
    console.error('❌ Email Error:', err.message);
  }

  // --- SMS notification via Twilio ---
  try {
    await sendSMSNotification({ name, phone, email, calcData });
    results.sms = true;
    console.log('✅ SMS: Notification sent to Chuck');
  } catch (err) {
    console.error('❌ SMS Error:', err.message);
  }

  res.json({ success: true, results });
});

// ===========================
// FOLLOW UP BOSS
// ===========================
function sendToFUB({ name, phone, email, callTime, calcData }) {
  return new Promise((resolve, reject) => {
    const [firstName, ...lastParts] = (name || '').trim().split(' ');
    const lastName = lastParts.join(' ');

    const note = [
      `Source: SanDiegoHomeBuyers.com`,
      `Best Time to Call: ${callTime}`,
      calcData.homePrice ? `Home Price: $${Math.round(calcData.homePrice).toLocaleString()}` : '',
      calcData.downPayment ? `Down Payment: $${Math.round(calcData.downPayment).toLocaleString()}` : '',
      calcData.loanType ? `Loan Type: ${calcData.loanType}` : '',
      calcData.totalMonthly ? `Est. Monthly Payment: $${Math.round(calcData.totalMonthly).toLocaleString()}` : '',
      calcData.annualIncome ? `Annual Income: $${Math.round(calcData.annualIncome).toLocaleString()}` : '',
      calcData.monthlyDebt ? `Monthly Debt: $${Math.round(calcData.monthlyDebt).toLocaleString()}` : '',
      calcData.creditScore ? `Credit Score Range: ${calcData.creditScore}+` : '',
      calcData.dti ? `Est. DTI: ${calcData.dti.toFixed(1)}%` : '',
      calcData.prequalStatus ? `Pre-Qual Status: ${calcData.prequalStatus}` : '',
      calcData.maxPurchasePrice ? `Est. Max Purchase: $${Math.round(calcData.maxPurchasePrice).toLocaleString()}` : '',
    ].filter(Boolean).join('\n');

    const payload = JSON.stringify({
      source: 'SanDiegoHomeBuyers.com',
      type: 'buyer',
      firstName,
      lastName,
      emails: [{ value: email, type: 'personal' }],
      phones: [{ value: phone, type: 'mobile' }],
      tags: ['san-diego-homebuyer', 'website-lead', calcData.prequalStatus || 'unknown'],
      note,
    });

    const options = {
      hostname: 'api.followupboss.com',
      path: '/v1/people',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(FUB_API_KEY + ':').toString('base64')}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(data));
        else reject(new Error(`FUB status ${res.statusCode}: ${data}`));
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ===========================
// EMAIL NOTIFICATION
// ===========================
async function sendEmailNotification({ name, phone, email, callTime, calcData }) {
  // Uses system sendmail if available
  // For production: replace with SMTP (nodemailer) or SendGrid/Mailgun
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  const subject = `New Lead: ${name} — San Diego Home Buyers`;
  const body = `
New lead from SanDiegoHomeBuyers.com

Name: ${name}
Phone: ${phone}
Email: ${email}
Best Time to Call: ${callTime}

--- Calculator Data ---
Home Price: $${Math.round(calcData.homePrice || 0).toLocaleString()}
Down Payment: $${Math.round(calcData.downPayment || 0).toLocaleString()}
Loan Type: ${calcData.loanType || 'N/A'}
Est. Monthly Payment: $${Math.round(calcData.totalMonthly || 0).toLocaleString()}/mo
Annual Income: $${Math.round(calcData.annualIncome || 0).toLocaleString()}
Monthly Debt: $${Math.round(calcData.monthlyDebt || 0).toLocaleString()}
Credit Score: ${calcData.creditScore || 'N/A'}+
Est. DTI: ${calcData.dti ? calcData.dti.toFixed(1) + '%' : 'N/A'}
Pre-Qual Status: ${calcData.prequalStatus || 'N/A'}
Est. Max Purchase Power: $${Math.round(calcData.maxPurchasePrice || 0).toLocaleString()}

---
All In Lending | SanDiegoHomeBuyers.com
  `.trim();

  const emailMsg = `To: ${NOTIFY_EMAIL}\nSubject: ${subject}\nContent-Type: text/plain\n\n${body}`;

  try {
    const { exec: execCb } = require('child_process');
    await new Promise((resolve, reject) => {
      const child = execCb(`sendmail -t`, (err) => err ? reject(err) : resolve());
      child.stdin.write(emailMsg);
      child.stdin.end();
    });
  } catch {
    // sendmail not available — log only (FUB is the primary)
    console.log('   (sendmail unavailable — configure SMTP for email notifications)');
  }
}

// ===========================
// SMS NOTIFICATION (TWILIO)
// ===========================
function sendSMSNotification({ name, phone, email, calcData }) {
  return new Promise((resolve, reject) => {
    const msg = [
      `🏡 NEW LEAD - SanDiegoHomeBuyers.com`,
      `Name: ${name}`,
      `Phone: ${phone}`,
      `Email: ${email}`,
      `Loan: ${(calcData.loanType || 'N/A').toUpperCase()}`,
      `Price: $${Math.round(calcData.homePrice || 0).toLocaleString()}`,
      `Payment: $${Math.round(calcData.totalMonthly || 0).toLocaleString()}/mo`,
      `Status: ${calcData.prequalStatus || 'N/A'}`,
    ].join('\n');

    const body = new URLSearchParams({ To: NOTIFY_PHONE, From: TWILIO_FROM, Body: msg }).toString();
    const auth  = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');

    const options = {
      hostname: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(data));
        else reject(new Error(`Twilio ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ===========================
// START
// ===========================
app.listen(PORT, () => {
  console.log(`\n🏡 SanDiegoHomeBuyers.com server running on http://localhost:${PORT}`);
  console.log(`   FUB API: ${FUB_API_KEY ? '✅ configured' : '❌ missing'}`);
  console.log(`   Notify Email: ${NOTIFY_EMAIL}\n`);
});
