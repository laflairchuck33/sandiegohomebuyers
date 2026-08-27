const TELEGRAM_BOT_TOKEN = '8446603163:AAHhsI1gfTHApp7MsgMEjYcV8VnCr41HO6o';
const CHUCK_CHAT_ID = '865040112';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { name, phone, email, market, volume, source = 'LO Recruiting Page' } = JSON.parse(event.body);

    if (!name || !phone) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    const msg = `🔥 *NEW LO RECRUITING LEAD*\n\n` +
      `👤 *Name:* ${name}\n` +
      `📞 *Phone:* ${phone}\n` +
      `📧 *Email:* ${email || 'N/A'}\n` +
      `📍 *Market:* ${market || 'N/A'}\n` +
      `📊 *Monthly Volume:* ${volume || 'N/A'}\n` +
      `📣 *Source:* ${source}`;

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHUCK_CHAT_ID, text: msg, parse_mode: 'Markdown' })
    });

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true })
    };
  } catch (e) {
    console.error('lo-lead error:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
