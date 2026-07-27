// Lead capture backend
// Node.js / Express — serves the site + handles /api/lead
// Run: node server.js

require('dotenv').config();
const express    = require('express');
const nodemailer = require('nodemailer');
const cors       = require('cors');
const fetch      = require('node-fetch');
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
const TARA_EMAIL     = process.env.TARA_EMAIL      || 'tbalady@clearmortgagecapital.com';
const JORDY_TOKEN    = process.env.JORDY_BOT_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const NOTIFY_PHONE   = process.env.NOTIFY_PHONE   || '+16194540917';
const TWILIO_SID     = process.env.TWILIO_SID;
const TWILIO_TOKEN   = process.env.TWILIO_TOKEN;
const TWILIO_FROM    = process.env.TWILIO_FROM    || '+16192573708';
const PORT           = process.env.PORT           || 3000;

// Lead log (append-only, survives restarts on Render disk)
const fs = require('fs');
const LEADS_LOG = '/tmp/leads.jsonl';
function logLead(type, data) {
  try {
    const entry = JSON.stringify({ type, ts: new Date().toISOString(), ...data }) + '\n';
    fs.appendFileSync(LEADS_LOG, entry);
  } catch(e) { /* non-fatal */ }
}

// ===========================
// LEAD ENDPOINT
// ===========================
app.post('/api/lead', async (req, res) => {
  const { name, phone, email, callTime, calcData = {} } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  console.log(`\n📋 NEW LEAD: ${name} | ${phone} | ${email}`);
  console.log(`   Home Price: $${(calcData.homePrice || 0).toLocaleString()}`);
  console.log(`   Est. Payment: $${Math.round(calcData.totalMonthly || 0).toLocaleString()}/mo`);
  console.log(`   Pre-Qual: ${calcData.prequalStatus}`);
  console.log(`   Best Time: ${callTime}`);

  // Log lead immediately so we never lose it
  logLead('lead', { name, phone, email, callTime, calcData });

  const results = { fub: false, email: false };

  // --- Follow Up Boss ---
  try {
    await sendToFUB({ name, phone, email, callTime, calcData });
    results.fub = true;
    console.log('✅ FUB: Lead created');
  } catch (err) {
    console.error('❌ FUB Error:', err.message);
    results.fubError = err.message;
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
// LISTINGS STORAGE
// ===========================
const LISTINGS_FILE = path.join(__dirname, 'listings.json');

function readListings() {
  try { return JSON.parse(fs.readFileSync(LISTINGS_FILE, 'utf8')); }
  catch { return { listings: [] }; }
}
function writeListings(data) {
  fs.writeFileSync(LISTINGS_FILE, JSON.stringify(data, null, 2));
}

// View captured leads log
app.get('/api/leads', (req, res) => {
  try {
    const raw = fs.existsSync(LEADS_LOG) ? fs.readFileSync(LEADS_LOG, 'utf8') : '';
    const leads = raw.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
    res.json({ total: leads.length, leads: leads.reverse() });
  } catch(e) {
    res.json({ total: 0, leads: [], error: e.message });
  }
});

app.get('/api/listings', (req, res) => {
  res.json(readListings());
});

app.post('/api/listings', (req, res) => {
  const { listings } = req.body;
  if (!Array.isArray(listings)) return res.status(400).json({ error: 'Invalid' });
  writeListings({ listings });
  console.log(`🏠 Listings updated: ${listings.length} total`);
  res.json({ success: true, count: listings.length });
});

// ===========================
// SHOWING REQUEST ENDPOINT
// ===========================
app.post('/api/showing', async (req, res) => {
  const { name, phone, email, date, time, property } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Missing name or phone' });

  console.log(`\n🏡 SHOWING REQUEST: ${name} | ${phone} | ${property}`);
  logLead('showing', { name, phone, email, date, time, property });

  const msg = [
    '🏡 SHOWING REQUEST - SanDiegoHomeBuyers.com',
    '',
    `👤 Name: ${name}`,
    `📱 Phone: ${phone}`,
    email ? `📧 Email: ${email}` : '',
    `🏠 Property: ${property}`,
    date ? `📅 Preferred Date: ${date}` : '',
    time ? `🕐 Preferred Time: ${time}` : '',
  ].filter(Boolean).join('\n');

  // Telegram
  try {
    const botToken = TELEGRAM_BOT_TOKEN;
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: 865040112, text: msg })
    });
    console.log('✅ Telegram: Showing request sent');
  } catch(err) {
    console.error('❌ Telegram Error:', err.message);
  }

  // Email
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    await transporter.sendMail({
      from: `"San Diego Home Buyers" <${process.env.SMTP_USER}>`,
      to: 'chuck@allin-lending.com',
      cc: TARA_EMAIL,
      subject: `Showing Request: ${name} — ${property}`,
      text: msg
    });
    console.log('✅ Email: Showing request sent');
  } catch(err) {
    console.error('❌ Email Error:', err.message);
  }

  res.json({ success: true });
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
      firstName,
      lastName,
      emails: email ? [{ value: email, type: 'personal' }] : [],
      phones: [{ value: phone, type: 'mobile' }],
      tags: ['san-diego-homebuyer', 'website-lead', calcData.prequalStatus || 'unknown'],
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
    }
  });

  await transporter.sendMail({
    from: `"San Diego Home Buyers" <${process.env.SMTP_USER}>`,
    to: NOTIFY_EMAIL,
    cc: TARA_EMAIL,
    subject,
    text
  });
}

// ===========================
// TELEGRAM NOTIFICATION
// ===========================
async function sendTelegramNotification({ name, phone, email, callTime, calcData }) {
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

  const botToken = TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: 865040112, text: msg })
  });
  const r = await res.json();
  if (!r.ok) throw new Error('Telegram: ' + JSON.stringify(r));

  // Also notify Jordy (Tara's bot) if token + chat ID configured
  if (JORDY_TOKEN && process.env.TARA_CHAT_ID) {
    try {
      await fetch(`https://api.telegram.org/bot${JORDY_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TARA_CHAT_ID, text: msg })
      });
      console.log('✅ Jordy: Notification sent to Tara');
    } catch(e) {
      console.error('❌ Jordy Error:', e.message);
    }
  }

  return r;
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
// LO SURVEY
// ===========================
app.post('/api/lo-survey', async (req, res) => {
  const { agentName, company, sentBusiness, closedDeal, dealCount, submittedAt } = req.body;
  if (!agentName || !company) return res.status(400).json({ error: 'Missing required fields' });

  console.log(`\n📋 LO SURVEY: ${agentName} | ${company} | Sent: ${sentBusiness} | Closed: ${closedDeal} | Deals: ${dealCount}`);

  const msg = [
    '📋 LO SURVEY — Chuck La Flair',
    '',
    `👤 Agent: ${agentName}`,
    `🏢 Company: ${company}`,
    `📤 Sent Business: ${sentBusiness}`,
    `✅ Closed a Deal: ${closedDeal}`,
    closedDeal === 'Yes' ? `🔢 Deals Closed: ${dealCount}` : '',
    `🕐 Submitted: ${new Date(submittedAt).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PT`,
  ].filter(Boolean).join('\n');

  // Telegram
  try {
    const botToken = TELEGRAM_BOT_TOKEN;
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: 865040112, text: msg })
    });
    console.log('✅ Telegram: LO survey sent');
  } catch(err) {
    console.error('❌ Telegram Error:', err.message);
  }

  res.json({ success: true });
});

// ===========================
// HOME VALUE LEAD NOTIFICATION
// ===========================
app.get('/api/home-value-lead', async (req, res) => {
  req.body = req.query; // remap query params to body
  return handleHomeValueLead(req, res);
});
app.post('/api/home-value-lead', async (req, res) => {
  return handleHomeValueLead(req, res);
});
async function handleHomeValueLead(req, res) {
  const { firstName, lastName, email, phone, address, estValue, payoff, estNet, consultationRequest } = req.body;
  try {
    // Telegram notify Chuck
    const botToken = TELEGRAM_BOT_TOKEN;
    const msg = consultationRequest
      ? `📅 CONSULTATION REQUEST\n\n👤 ${firstName} ${lastName}\n📧 ${email}${phone ? '\n📱 ' + phone : ''}\n\n📍 ${address}\n💰 Est. Value: ${estValue}\n\n❗️ This person wants to schedule a consultation!\n\nFrom: sandiegohomebuyers.org/home-value.html`
      : `🏠 NEW HOME VALUE LEAD\n\n👤 ${firstName} ${lastName}\n📧 ${email}${phone ? '\n📱 ' + phone : ''}\n\n📍 ${address}\n💰 Est. Value: ${estValue}\n🏦 Principal Balance: ${payoff}\n✅ Est. Net: ${estNet}\n\nFrom: sandiegohomebuyers.org/home-value.html`;
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: '865040112', text: msg })
    });

    // Push to FUB
    await fetch('https://api.followupboss.com/v1/people', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(process.env.FUB_API_KEY + ':').toString('base64')
      },
      body: JSON.stringify({
        source: 'Home Value Tool - sandiegohomebuyers.org',
        firstName, lastName,
        emails: [{ value: email }],
        phones: phone ? [{ value: phone }] : [],
        tags: ['Home Value Lead', 'Seller Lead'],
        customFields: [
          { label: 'Property Address', value: address },
          { label: 'Estimated Value', value: estValue },
          { label: 'Principal Balance', value: payoff },
          { label: 'Estimated Net', value: estNet }
        ]
      })
    });

    // Email Chuck the lead (using same Office365 setup as main site)
    try {
      const chuckTransporter = nodemailer.createTransport({
        host: 'smtp.office365.com',
        port: 587,
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
      const chuckSubject = consultationRequest
        ? `📅 Consultation Request — ${firstName} ${lastName}`
        : `🏠 New Home Value Lead — ${firstName} ${lastName}`;
      const chuckText = consultationRequest
        ? `CONSULTATION REQUEST\n\nName: ${firstName} ${lastName}\nEmail: ${email}\nPhone: ${phone || 'Not provided'}\nAddress: ${address}\nEst. Value: ${estValue}\n\nReach out ASAP!`
        : `NEW HOME VALUE LEAD\n\nName: ${firstName} ${lastName}\nEmail: ${email}\nPhone: ${phone || 'Not provided'}\nAddress: ${address}\nEst. Value: ${estValue}\nPrincipal Balance: ${payoff}\nEst. Net: ${estNet}\n\nFrom: sandiegohomebuyers.org/home-value.html`;
      await chuckTransporter.sendMail({
        from: `"San Diego Home Buyers" <${process.env.SMTP_USER}>`,
        to: 'chuck@allin-lending.com',
        subject: chuckSubject,
        text: chuckText
      });
      console.log('✅ Email: Home value lead sent to Chuck');
    } catch(emailErr) {
      console.error('Chuck email error:', emailErr.message);
    }

    // Email client their report
    if (email) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: false,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        });
        await transporter.sendMail({
          from: `"San Diego Home Buyers" <${process.env.SMTP_USER}>`,
          to: email,
          subject: `Your Home Valuation Report – ${address}`,
          html: `<p>Dear ${firstName},</p>
<p>Thank you for your inquiry! As discussed, here is a summary of your home valuation for <strong>${address}</strong>.</p>
<ul>
  <li><strong>Estimated Market Value:</strong> ${estValue}</li>
  <li><strong>Mortgage Payoff:</strong> ${payoff}</li>
  <li><strong>Estimated Net Proceeds:</strong> ${estNet}</li>
</ul>
<p>The next step, if you would like to have a more serious conversation, is for us to schedule a call or consultation to discuss your selling goals. I will make sure to answer all of your questions.</p>
<p>Thank you so much for your inquiry — I will be in touch soon!</p>
<p><strong>Mauricio Perez-Vazquez</strong><br>Founding Partner | Broker Associate<br>Realty of America<br>📞 619.813.5903</p>`
        });
      } catch (emailErr) {
        console.error('Client email error:', emailErr.message);
      }
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('Home value lead error:', e.message);
    res.json({ ok: false, error: e.message });
  }
}

// ===========================
// KEEP-ALIVE (prevent Render cold starts)
// ===========================
const SELF_URL = process.env.RENDER_EXTERNAL_URL || 'https://sandiegohomebuyers.onrender.com';
function keepAlive() {
  fetch(`${SELF_URL}/api/ping`).catch(() => {});
}
// Ping self every 10 minutes
setInterval(keepAlive, 10 * 60 * 1000);

app.get('/api/ping', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ===========================
// START
// ===========================
app.listen(PORT, () => {
  console.log(`\n🏡 SanDiegoHomeBuyers.com server running on http://localhost:${PORT}`);
  console.log(`   FUB API: ${FUB_API_KEY ? '✅ configured' : '❌ missing'}`);
  console.log(`   Notify Email: ${NOTIFY_EMAIL}`);
  console.log(`   Keep-alive: pinging ${SELF_URL} every 10 min\n`);
  // First ping after 1 min to confirm startup
  setTimeout(keepAlive, 60 * 1000);
});
