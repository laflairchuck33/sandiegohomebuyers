// Lead capture backend
// Node.js / Express — serves the site + handles /api/lead
// Run: node server.js

require('dotenv').config();
const express    = require('express');
const nodemailer = require('nodemailer');
const cors       = require('cors');
const path = require('path');
const https = require('https');

const app = express();
app.use(cors());
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

  // --- Telegram notification (fastest) ---
  try {
    await sendTelegramNotification({ name, phone, email, callTime, calcData });
    results.telegram = true;
    console.log('✅ Telegram: Notification sent');
  } catch (err) {
    console.error('❌ Telegram Error:', err.message, err.stack);
    results.telegramError = err.message;
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
  const subject = `🏠 New Lead: ${name} — San Diego Home Buyers`;
  const text = [
    'New lead from SanDiegoHomeBuyers.com',
    '',
    `Name: ${name}`,
    `Phone: ${phone || 'Not provided'}`,
    `Email: ${email}`,
    `Best Time to Call: ${callTime}`,
    '',
    '--- Calculator Data ---',
    `Home Price: $${Math.round(calcData.homePrice || 0).toLocaleString()}`,
    `Loan Type: ${(calcData.loanType || 'N/A').toUpperCase()}`,
    `Est. Monthly Payment: $${Math.round(calcData.totalMonthly || 0).toLocaleString()}/mo`,
    `Pre-Qual Status: ${calcData.prequalStatus || 'N/A'}`,
    '',
    '---',
    'San Diego Home Buyers | allin-lending.com'
  ].join('\n');

  const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: { ciphers: 'SSLv3' }
  });

  await transporter.sendMail({
    from: `"San Diego Home Buyers" <${process.env.SMTP_USER}>`,
    to: NOTIFY_EMAIL,
    subject,
    text
  });
}

// ===========================
// TELEGRAM NOTIFICATION
// ===========================
function sendTelegramNotification({ name, phone, email, callTime, calcData }) {
  return new Promise((resolve, reject) => {
    const msg = [
      '🏠 NEW LEAD - SanDiegoHomeBuyers.com',
      '',
      `👤 Name: ${name}`,
      `📱 Phone: ${phone || 'Not provided'}`,
      `📧 Email: ${email}`,
      `🏦 Loan: ${(calcData.loanType || 'N/A').toUpperCase()}`,
      `💰 Price: $${Math.round(calcData.homePrice || 0).toLocaleString()}`,
      `💵 Est. Payment: $${Math.round(calcData.totalMonthly || 0).toLocaleString()}/mo`,
      `✅ Status: ${calcData.prequalStatus || 'N/A'}`,
    ].join('\n');

    const payload = JSON.stringify({ chat_id: 865040112, text: msg });
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    const opts = {
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };

    const req = https.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        const r = JSON.parse(d);
        if (r.ok) resolve(r);
        else reject(new Error('Telegram: ' + JSON.stringify(r)));
      });
    });
    req.on('error', reject);
    req.write(payload); req.end();
  });
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
