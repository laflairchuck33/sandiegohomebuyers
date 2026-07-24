// Home Value Report — Logic
// Config — swap in real key when ready
const RENTCAST_KEY = window.RENTCAST_API_KEY || 'PENDING';

let S = {
  address: '', city: '', state: 'CA', zip: '',
  estValue: 0, valueLow: 0, valueHigh: 0,
  beds: '', baths: '', sqft: '', yearBuilt: '',
  salePrice: 0, payoff: 0, commission: 5.5, closing: 1.5,
  interestRate: 0,
  first: '', last: '', email: '', phone: '',
  comparables: []
};

// ── Formatting ──────────────────────────────────────────
function fmt(n) {
  if (!n && n !== 0) return '$—';
  return '$' + Math.round(n).toLocaleString();
}

// ── Steps ────────────────────────────────────────────────
function goStep(n) {
  document.querySelectorAll('.step-section').forEach(s => s.classList.remove('active'));
  document.getElementById('step' + n).classList.add('active');
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById('dot' + i);
    const lbl = document.getElementById('lbl' + i);
    const line = document.getElementById('line' + i);
    dot.className = 'step-dot';
    lbl.className = 'step-label';
    dot.textContent = i;
    if (line) line.className = 'step-line';
    if (i < n) { dot.className = 'step-dot done'; dot.textContent = '✓'; if (line) line.className = 'step-line done'; }
    else if (i === n) { dot.className = 'step-dot active'; lbl.className = 'step-label active'; }
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Address Autocomplete (Mapbox) ────────────────────────
const MAPBOX_TOKEN = 'pk.eyJ1IjoiYWxsaW5sZW5kaW5nIiwiYSI6ImNtYzlxdTR6NjBhbXQya3NiNGc5OGI4bGoifQ.placeholder';
let debounce;

function initAutocomplete() {
  const input = document.getElementById('addressInput');
  input.addEventListener('input', function () {
    clearTimeout(debounce);
    debounce = setTimeout(() => suggest(this.value), 250);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.autocomplete-wrap')) document.getElementById('autocompleteList').style.display = 'none';
  });
}

async function suggest(q) {
  const list = document.getElementById('autocompleteList');
  if (q.length < 4) { list.style.display = 'none'; return; }
  try {
    // Use nominatim with proper headers - reliable US address search
    const r = await fetch(
      'https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=7&countrycodes=us&q=' + encodeURIComponent(q),
      { headers: { 'Accept-Language': 'en-US', 'User-Agent': 'SanDiegoHomeBuyers/1.0' } }
    );
    const data = await r.json();
    list.innerHTML = '';
    let count = 0;
    data.forEach(item => {
      const a = item.address || {};
      // Only show results with a house number (real street addresses)
      if (!a.house_number) return;
      const label = [
        a.house_number + ' ' + (a.road || ''),
        a.city || a.town || a.village || a.municipality || '',
        a.state || '',
        a.postcode || ''
      ].filter(Boolean).join(', ');
      const d = document.createElement('div');
      d.className = 'autocomplete-item';
      d.textContent = label;
      d.onclick = () => {
        S.address = (a.house_number + ' ' + (a.road || '')).trim();
        S.city = a.city || a.town || a.village || '';
        S.state = a.state_code || a.state || 'CA';
        S.zip = a.postcode || '';
        document.getElementById('addressInput').value = label;
        list.style.display = 'none';
      };
      list.appendChild(d);
      count++;
    });
    list.style.display = count > 0 ? 'block' : 'none';
  } catch (e) {
    console.warn('Autocomplete error:', e);
    list.style.display = 'none';
  }
}

// ── Valuation ────────────────────────────────────────────
async function runValuation() {
  const addrVal = document.getElementById('addressInput').value.trim();
  if (!addrVal) { alert('Please enter a property address.'); return; }
  // Always use whatever is typed — don't require dropdown selection
  if (!S.address) S.address = addrVal;
  S.beds = document.getElementById('beds').value || '';
  S.baths = document.getElementById('baths').value || '';
  S.sqft = document.getElementById('sqft').value || '';

  const btn = document.getElementById('valuateBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Looking up your home...';

  try {
    let data;
    if (RENTCAST_KEY === 'PENDING') {
      data = demoValue(addrVal);
    } else {
      // Use full typed address as fallback — works well with Rentcast
      const params = new URLSearchParams({ address: addrVal });
      if (S.beds) params.append('bedrooms', S.beds);
      if (S.baths) params.append('bathrooms', S.baths);
      if (S.sqft) params.append('squareFootage', S.sqft);

      const resp = await fetch('https://api.rentcast.io/v1/avm/value?' + params, {
        headers: { 'X-Api-Key': RENTCAST_KEY, 'Accept': 'application/json' }
      });
      if (resp.ok) {
        data = await resp.json();
      } else {
        const err = await resp.json().catch(() => ({}));
        console.warn('Rentcast error:', err);
        data = demoValue(addrVal);
      }
    }

    S.estValue = data.price || data.value || 0;
    S.valueLow = data.priceRangeLow || data.valueLow || Math.round(S.estValue * 0.93);
    S.valueHigh = data.priceRangeHigh || data.valueHigh || Math.round(S.estValue * 1.07);
    S.comparables = (data.comparables || []).slice(0, 8);

    // Pull property details from subjectProperty or top comparable or user input
    const sub = data.subjectProperty || {};
    const topComp = (data.comparables || [])[0] || {};
    const beds = sub.bedrooms || data.bedrooms || topComp.bedrooms || S.beds || null;
    const baths = sub.bathrooms || data.bathrooms || topComp.bathrooms || S.baths || null;
    const sqft = sub.squareFootage || data.squareFootage || topComp.squareFootage || (S.sqft ? parseInt(S.sqft) : null);
    const yearBuilt = sub.yearBuilt || data.yearBuilt || topComp.yearBuilt || null;

    document.getElementById('infoBeds').textContent = beds || '—';
    document.getElementById('infoBaths').textContent = baths || '—';
    document.getElementById('infoSqft').textContent = sqft ? parseInt(sqft).toLocaleString() : '—';
    document.getElementById('infoYear').textContent = yearBuilt || '—';
    document.getElementById('propInfo').style.display = 'grid';

    document.getElementById('estValue').textContent = fmt(S.estValue);
    document.getElementById('valueRange').textContent = 'Estimated range: ' + fmt(S.valueLow) + ' – ' + fmt(S.valueHigh);
    document.getElementById('step2Addr').textContent = addrVal;

    document.getElementById('salePrice').value = S.estValue;
    recalc();
    goStep(2);
  } catch (err) {
    console.error('Valuation error:', err);
    alert('Could not retrieve value. Please check the address and try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Get My Home Value →';
  }
}

function demoValue() {
  const base = 680000 + Math.floor(Math.random() * 320000);
  return { price: base, priceLow: Math.round(base * 0.93), priceHigh: Math.round(base * 1.07) };
}

// ── Net Sheet ────────────────────────────────────────────
function updateClosing(v) { S.closing = parseFloat(v); document.getElementById('closingPct').textContent = v + '%'; recalc(); }

function calcMonthlyPayment(principal, annualRate, remainingMonths) {
  if (!principal || !annualRate || !remainingMonths) return 0;
  const r = (annualRate / 100) / 12;
  return principal * (r * Math.pow(1 + r, remainingMonths)) / (Math.pow(1 + r, remainingMonths) - 1);
}

function recalc() {
  const sale = parseFloat(document.getElementById('salePrice').value) || 0;
  const payoff = parseFloat(document.getElementById('payoff').value) || 0;
  const rate = parseFloat(document.getElementById('interestRate').value) || 0;
  const years = parseFloat(document.getElementById('remainingYears').value) || 0;
  const closing = sale * (S.closing / 100);
  // Use a fixed 5% commission baked in (hidden from UI)
  const comm = sale * 0.055;
  const net = sale - payoff - comm - closing;
  S.salePrice = sale; S.payoff = payoff; S.interestRate = rate;

  // Monthly payment estimate
  const monthly = calcMonthlyPayment(payoff, rate, years * 12);
  const monthlyEl = document.getElementById('ns-monthly');
  if (monthly > 0 && monthlyEl) {
    monthlyEl.textContent = fmt(monthly) + '/mo';
    document.getElementById('ns-monthly-row').style.display = 'flex';
  } else if (monthlyEl) {
    document.getElementById('ns-monthly-row').style.display = 'none';
  }

  document.getElementById('ns-sale').textContent = fmt(sale);
  document.getElementById('ns-payoff').textContent = payoff > 0 ? ('\u2212' + fmt(payoff)) : fmt(0);
  document.getElementById('ns-closing').textContent = '\u2212' + fmt(closing);
  document.getElementById('ns-net').textContent = fmt(net);
  document.getElementById('ns-net').style.color = net >= 0 ? 'white' : '#fca5a5';
}

// ── PDF Report ───────────────────────────────────────────
async function downloadReport() {
  const first = document.getElementById('leadFirst').value.trim();
  const last = document.getElementById('leadLast').value.trim();
  const email = document.getElementById('leadEmail').value.trim();
  const phone = document.getElementById('leadPhone').value.trim();
  if (!first || !last || !email) { alert('Please fill in your name and email.'); return; }
  S.first = first; S.last = last; S.email = email; S.phone = phone;

  const btn = document.getElementById('downloadBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating your report...';

  // Notify Chuck + push to FUB
  const addrVal2 = document.getElementById('addressInput').value.trim();
  try { await notifyChuck(addrVal2); } catch (e) { console.log('Telegram notify failed:', e); }
  try { await pushToFUB(); } catch (e) { console.log('FUB push failed:', e); }

  // Generate PDF
  try {
    generatePDF();
    goStep(5);
  } catch (e) {
    alert('Error generating report. Please try again.');
  }

  btn.disabled = false;
  btn.innerHTML = 'Download My Free Report';
}

async function notifyChuck(addr) {
  const net = S.salePrice - S.payoff - S.salePrice*0.055 - S.salePrice*(S.closing/100);
  const msg = `🏠 NEW HOME VALUE LEAD\n\n👤 ${S.first} ${S.last}\n📧 ${S.email}${S.phone ? '\n📱 ' + S.phone : ''}\n\n📍 ${addr}\n💰 Est. Value: ${fmt(S.estValue)}\n🏦 Payoff: ${fmt(S.payoff)}\n✅ Est. Net: ${fmt(net)}\n\nFrom: sandiegohomebuyers.org`;
  await fetch(`https://api.telegram.org/bot${window.TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: '865040112', text: msg })
  });
}

async function pushToFUB() {
  const addr = document.getElementById('addressInput').value.trim();
  const body = {
    source: 'Home Value Tool - sandiegohomebuyers.org',
    firstName: S.first,
    lastName: S.last,
    emails: [{ value: S.email }],
    phones: S.phone ? [{ value: S.phone }] : [],
    tags: ['Home Value Lead', 'Seller Lead'],
    customFields: [
      { label: 'Property Address', value: addr },
      { label: 'Estimated Value', value: fmt(S.estValue) },
      { label: 'Loan Payoff', value: fmt(S.payoff) },
      { label: 'Estimated Net', value: fmt(S.salePrice - S.payoff - S.salePrice*(S.commission/100) - S.salePrice*(S.closing/100)) }
    ]
  };

  await fetch('https://api.followupboss.com/v1/people', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + btoa('fka_078GYityEvI1PUsA99FQDNmbdwUeBB8IBC:')
    },
    body: JSON.stringify(body)
  });
}

function generatePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = 612, H = 792;
  const navy = [10, 25, 65], navyLight = [20, 45, 100], gold = [212, 175, 55],
        white = [255,255,255], lightGray = [245, 247, 250], midGray = [180,185,195],
        darkGray = [60,65,75], teal = [0, 150, 180];
  const addr = document.getElementById('addressInput').value.trim();
  const addrShort = addr.split(',')[0];
  const sale = S.salePrice || S.estValue;
  const payoff = S.payoff || 0;
  const rate = S.interestRate || 0;
  const closing = sale * (S.closing / 100);
  const comm = sale * 0.055;
  const net = sale - payoff - comm - closing;
  const monthly = calcMonthlyPayment(payoff, rate, (parseFloat(document.getElementById('remainingYears').value)||30) * 12);
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const todayShort = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  const infoBeds = document.getElementById('infoBeds').textContent;
  const infoBaths = document.getElementById('infoBaths').textContent;
  const infoSqft = document.getElementById('infoSqft').textContent;
  const infoYear = document.getElementById('infoYear').textContent;

  // ── Helper: page header ──────────────────────────────
  function pageHeader(pg) {
    // Top navy bar
    doc.setFillColor(...navy);
    doc.rect(0, 0, W, 52, 'F');
    // Gold left accent
    doc.setFillColor(...gold);
    doc.rect(0, 0, 5, 52, 'F');
    // PROPERTY EXPLORER label
    doc.setTextColor(...gold);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('PROPERTY EXPLORER', W - 40, 20, { align: 'right' });
    // Address line
    doc.setTextColor(...white);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(addr, 16, 20);
    doc.setFontSize(8);
    doc.text('County: San Diego County', 16, 34);
    // Effective date
    doc.setTextColor(...gold);
    doc.setFontSize(8);
    doc.text('Effective Date: ' + todayShort, W - 40, 34, { align: 'right' });
    // Brand line
    doc.setTextColor(180, 200, 220);
    doc.setFontSize(7.5);
    doc.text('Prepared by All In Lending | Chuck La Flair | sandiegohomebuyers.org', 16, 46);
    // Bottom gold line
    doc.setFillColor(...gold);
    doc.rect(0, 52, W, 2, 'F');
  }

  // ── Helper: page footer ──────────────────────────────
  function pageFooter(pg, total) {
    doc.setFillColor(...navy);
    doc.rect(0, H - 28, W, 28, 'F');
    doc.setFillColor(...gold);
    doc.rect(0, H - 28, W, 2, 'F');
    doc.setTextColor(...midGray);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    doc.text('Order Date: ' + todayShort + '   |   Property Explorer powered by All In Lending', 16, H - 10);
    doc.text('Pg. ' + pg + ' of ' + total, W - 40, H - 10, { align: 'right' });
  }

  // ── Helper: section label ────────────────────────────
  function sectionLabel(label, y) {
    doc.setFillColor(...navyLight);
    doc.rect(5, y, 3, 14, 'F');
    doc.setTextColor(...navy);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(label, 14, y + 11);
    return y + 22;
  }

  // ══════════════════════════════════════
  // PAGE 1 — Value Summary
  // ══════════════════════════════════════
  pageHeader(1);

  let y = 70;

  // Property address block
  doc.setFillColor(...lightGray);
  doc.rect(16, y, W - 32, 42, 'F');
  doc.setFillColor(...gold);
  doc.rect(16, y, 4, 42, 'F');
  doc.setTextColor(...navy);
  doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text(addrShort, 28, y + 16);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...darkGray);
  const cityLine = addr.includes(',') ? addr.split(',').slice(1).join(',').trim() : '';
  doc.text(cityLine, 28, y + 30);
  y += 52;

  // Two-column: Value estimate + Property details
  const colL = 16, colR = W / 2 + 8, colW = W / 2 - 24;

  // LEFT: Value box
  doc.setFillColor(...navy);
  doc.roundedRect(colL, y, colW, 110, 6, 6, 'F');
  doc.setTextColor(...gold);
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('ESTIMATED MARKET VALUE', colL + colW/2, y + 18, { align: 'center' });
  doc.setTextColor(...white);
  doc.setFontSize(28); doc.setFont('helvetica', 'bold');
  doc.text(fmt(S.estValue), colL + colW/2, y + 54, { align: 'center' });
  doc.setFillColor(...gold);
  doc.rect(colL + 20, y + 62, colW - 40, 1, 'F');
  doc.setTextColor(180, 210, 240);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text('Range: ' + fmt(S.valueLow) + ' – ' + fmt(S.valueHigh), colL + colW/2, y + 76, { align: 'center' });
  doc.setFontSize(7.5);
  doc.text('Effective Date: ' + todayShort, colL + colW/2, y + 90, { align: 'center' });
  doc.text('Prepared for: ' + S.first + ' ' + S.last, colL + colW/2, y + 102, { align: 'center' });

  // RIGHT: Property details grid
  const props = [
    ['BEDROOMS', infoBeds], ['BATHROOMS', infoBaths],
    ['SQUARE FEET', infoSqft], ['YEAR BUILT', infoYear]
  ];
  const pw = (colW) / 2;
  props.forEach((p, i) => {
    const px = colR + (i % 2) * pw;
    const py = y + Math.floor(i / 2) * 52;
    doc.setFillColor(i % 2 === 0 ? 240 : 248, 242, 250);
    doc.rect(px, py, pw - 4, 46, 'F');
    doc.setTextColor(...midGray); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text(p[0], px + 8, py + 14);
    doc.setTextColor(...navy); doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text(p[1] || '—', px + 8, py + 36);
  });
  y += 120;

  // ── Net Proceeds Section ─────────────────────────────
  y = sectionLabel('Estimated Net Proceeds', y);

  const netRows = [
    { label: 'Estimated Sale Price', val: fmt(sale), color: darkGray, bold: false },
    { label: 'Mortgage Payoff', val: '− ' + fmt(payoff), color: [180,40,40], bold: false },
    { label: 'Agent Commission (5.5%)', val: '− ' + fmt(comm), color: [180,40,40], bold: false },
    { label: 'Seller Closing Costs (' + S.closing + '%)', val: '− ' + fmt(closing), color: [180,40,40], bold: false },
  ];
  if (monthly > 0) netRows.splice(2, 0, { label: 'Current Monthly Payment @ ' + rate + '%', val: fmt(monthly) + '/mo', color: [0,100,160], bold: false });

  netRows.forEach((row, i) => {
    doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 249 : 255, i % 2 === 0 ? 252 : 255);
    doc.rect(16, y, W - 32, 24, 'F');
    doc.setTextColor(...row.color);
    doc.setFontSize(9.5); doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.text(row.label, 28, y + 16);
    doc.setFont('helvetica', 'bold');
    doc.text(row.val, W - 28, y + 16, { align: 'right' });
    y += 24;
  });

  // Net total bar
  doc.setFillColor(...navy);
  doc.rect(16, y, W - 32, 34, 'F');
  doc.setFillColor(...gold);
  doc.rect(16, y, 4, 34, 'F');
  doc.setTextColor(...white);
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('ESTIMATED NET PROCEEDS', 28, y + 21);
  doc.setFontSize(16);
  const netColor = net >= 0 ? white : [255, 100, 100];
  doc.setTextColor(...netColor);
  doc.text(fmt(net), W - 28, y + 22, { align: 'right' });
  y += 44;



  // ── Disclaimer ───────────────────────────────────────
  y += 16;
  doc.setFillColor(245, 245, 240);
  doc.rect(16, y, W - 32, 52, 'F');
  doc.setTextColor(...midGray); doc.setFontSize(7); doc.setFont('helvetica', 'italic');
  const disc = 'This report is provided for general informational purposes only and is not a formal appraisal or offer to lend. Estimated values are based on available market data from Rentcast AVM. Actual sale price, net proceeds, and market conditions may vary. Commission and closing cost figures are estimates only. All In Lending is a licensed mortgage lender; this is not a legal or financial opinion. Contact All In Lending for a complete financial analysis.';
  const discLines = doc.splitTextToSize(disc, W - 52);
  doc.text(discLines, 28, y + 12);

  const totalPages = S.comparables.length > 0 ? 2 : 1;
  pageFooter(1, totalPages);

  // ══════════════════════════════════════
  // PAGE 2 — Comparable Sales
  // ══════════════════════════════════════
  if (S.comparables.length > 0) {
    doc.addPage();
    pageHeader(2);

    let y2 = 68;
    y2 = sectionLabel('Suggested Comparable Sales (' + S.comparables.length + ' properties)', y2);
    y2 += 4;

    // Table header
    const cols = [
      { label: '#',        x: 18,  w: 18 },
      { label: 'ADDRESS',  x: 38,  w: 160 },
      { label: 'DIST',     x: 200, w: 36 },
      { label: 'STATUS',   x: 238, w: 46 },
      { label: 'PRICE',    x: 286, w: 74 },
      { label: 'DATE',     x: 362, w: 58 },
      { label: 'BED',      x: 422, w: 24 },
      { label: 'BATH',     x: 448, w: 28 },
      { label: 'SQFT',     x: 478, w: 50 },
      { label: '$/SQFT',   x: 530, w: 52 },
    ];

    doc.setFillColor(...navy);
    doc.rect(16, y2, W - 32, 18, 'F');
    cols.forEach(c => {
      doc.setTextColor(...gold);
      doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
      doc.text(c.label, c.x + 2, y2 + 12);
    });
    y2 += 18;

    S.comparables.forEach((comp, i) => {
      const bg = i % 2 === 0 ? lightGray : white;
      doc.setFillColor(...bg);
      doc.rect(16, y2, W - 32, 22, 'F');

      const saleDate = comp.listedDate ? new Date(comp.listedDate).toLocaleDateString('en-US',{month:'numeric',day:'numeric',year:'2-digit'}) : '—';
      const priceSqft = comp.squareFootage && comp.price ? '$' + Math.round(comp.price / comp.squareFootage) : '—';
      const dist = comp.distance ? comp.distance.toFixed(2) + ' mi' : '—';
      const status = (comp.status || '').toLowerCase() === 'active' ? 'Active' : 'Sold';
      const statusColor = status === 'Active' ? [0, 130, 60] : [100, 100, 120];
      const addrText = (comp.formattedAddress || '').split(',')[0];
      const cityText = (comp.formattedAddress || '').split(',').slice(1,2).join('').trim();

      doc.setTextColor(...darkGray); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      doc.text(String(i + 1), cols[0].x + 2, y2 + 9);

      // Address (two lines)
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...navy);
      doc.text(addrText.substring(0, 26), cols[1].x + 2, y2 + 9);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...midGray); doc.setFontSize(6.5);
      doc.text(cityText.substring(0, 22), cols[1].x + 2, y2 + 17);

      doc.setFontSize(7.5); doc.setTextColor(...darkGray); doc.setFont('helvetica', 'normal');
      doc.text(dist, cols[2].x + 2, y2 + 13);

      doc.setTextColor(...statusColor); doc.setFont('helvetica', 'bold');
      doc.text(status, cols[3].x + 2, y2 + 13);

      doc.setTextColor(...navy); doc.setFont('helvetica', 'bold');
      doc.text(comp.price ? '$' + (comp.price/1000).toFixed(0)+'K' : '—', cols[4].x + 2, y2 + 13);

      doc.setTextColor(...darkGray); doc.setFont('helvetica', 'normal');
      doc.text(saleDate, cols[5].x + 2, y2 + 13);
      doc.text(comp.bedrooms ? String(comp.bedrooms) : '—', cols[6].x + 2, y2 + 13);
      doc.text(comp.bathrooms ? String(comp.bathrooms) : '—', cols[7].x + 2, y2 + 13);
      doc.text(comp.squareFootage ? comp.squareFootage.toLocaleString() : '—', cols[8].x + 2, y2 + 13);

      doc.setTextColor(...teal); doc.setFont('helvetica', 'bold');
      doc.text(priceSqft, cols[9].x + 2, y2 + 13);

      y2 += 22;
    });

    // Avg price per sqft
    const validComps = S.comparables.filter(c => c.price && c.squareFootage);
    if (validComps.length > 0) {
      const avgPSF = Math.round(validComps.reduce((s, c) => s + c.price / c.squareFootage, 0) / validComps.length);
      y2 += 8;
      doc.setFillColor(...navyLight);
      doc.rect(16, y2, W - 32, 24, 'F');
      doc.setTextColor(...white); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text('Average Price Per Sq Ft (Comparables)', 28, y2 + 15);
      doc.setTextColor(...gold);
      doc.text('$' + avgPSF + '/ft²', W - 28, y2 + 15, { align: 'right' });
      y2 += 34;
    }

    // Subject vs comps summary
    y2 += 8;
    y2 = sectionLabel('Subject Property vs. Market', y2);
    const subjectRows = [
      ['Property Address', addrShort],
      ['Estimated Value', fmt(S.estValue)],
      ['Bedrooms', infoBeds], ['Bathrooms', infoBaths],
      ['Square Feet', infoSqft], ['Year Built', infoYear],
      ['Comps Analyzed', String(S.comparables.length)],
    ];
    subjectRows.forEach((r, i) => {
      doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 249 : 255, i % 2 === 0 ? 252 : 255);
      doc.rect(16, y2, W - 32, 20, 'F');
      doc.setTextColor(...darkGray); doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
      doc.text(r[0], 28, y2 + 13);
      doc.setTextColor(...navy); doc.setFont('helvetica', 'bold');
      doc.text(r[1] || '—', W - 28, y2 + 13, { align: 'right' });
      y2 += 20;
    });

    pageFooter(2, totalPages);
  }

  doc.save('Property-Explorer-' + addrShort.replace(/\s+/g, '-') + '-' + new Date().toISOString().slice(0,10) + '.pdf');
}

function reDownload() { generatePDF(); }

// Init
document.addEventListener('DOMContentLoaded', initAutocomplete);
