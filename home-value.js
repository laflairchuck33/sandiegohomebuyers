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
  const principal = parseFloat(document.getElementById('payoff').value) || 0;
  const rate = parseFloat(document.getElementById('interestRate').value) || 0;
  const years = parseFloat(document.getElementById('remainingYears').value) || 30;
  const closing = sale * (S.closing / 100);
  const comm = sale * 0.055;
  // Payoff interest = principal × (annual rate / 12) — one month's interest as payoff penalty estimate
  const payoffInterest = rate > 0 ? Math.round(principal * (rate / 100) / 12) : 0;
  const totalPayoff = principal + payoffInterest;
  const net = sale - totalPayoff - comm - closing;
  S.salePrice = sale; S.payoff = totalPayoff; S.interestRate = rate;

  // Monthly payment estimate
  const monthly = calcMonthlyPayment(principal, rate, years * 12);
  const monthlyEl = document.getElementById('ns-monthly');
  if (monthly > 0 && monthlyEl) {
    monthlyEl.textContent = fmt(monthly) + '/mo';
    document.getElementById('ns-monthly-row').style.display = 'flex';
  } else if (monthlyEl) {
    document.getElementById('ns-monthly-row').style.display = 'none';
  }

  document.getElementById('ns-sale').textContent = fmt(sale);
  document.getElementById('ns-principal').textContent = principal > 0 ? ('\u2212' + fmt(principal)) : fmt(0);
  // Show/hide payoff interest row
  const intRow = document.getElementById('ns-interest-row');
  const intEl = document.getElementById('ns-interest');
  if (payoffInterest > 0 && intRow && intEl) {
    intEl.textContent = '\u2212' + fmt(payoffInterest);
    intRow.style.display = 'flex';
  } else if (intRow) {
    intRow.style.display = 'none';
  }
  document.getElementById('ns-payoff').textContent = totalPayoff > 0 ? ('\u2212' + fmt(totalPayoff)) : fmt(0);
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

  // Notify Chuck + push to FUB (fire and forget — never block PDF)
  const addrVal2 = document.getElementById('addressInput').value.trim();
  notifyChuck(addrVal2).catch(e => console.log('Lead notify failed:', e));

  // Generate PDF
  btn.disabled = false;
  btn.innerHTML = 'Download My Free Report';
  try {
    generatePDF();
    goStep(5);
  } catch (e) {
    console.error('PDF generation error:', e);
    alert('Error generating report: ' + (e && e.message ? e.message : String(e)));
  }
}

async function notifyChuck(addr) {
  const net = S.salePrice - S.payoff - S.salePrice*0.055 - S.salePrice*(S.closing/100);
  await fetch('/api/home-value-lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: S.first, lastName: S.last,
      email: S.email, phone: S.phone || '',
      address: addr,
      estValue: fmt(S.estValue),
      payoff: fmt(S.payoff),
      estNet: fmt(net)
    })
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
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('PDF library not loaded. Please refresh and try again.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = 612, H = 792;

  // Draw ROA template as background
  if (typeof ROA_TEMPLATE_B64 === 'undefined') {
    alert('Template not loaded. Please do a hard refresh (Ctrl+Shift+R) and try again.');
    return;
  }
  doc.addImage(ROA_TEMPLATE_B64, 'PNG', 0, 0, W, H);

  // Data
  const addr = document.getElementById('addressInput').value.trim();
  const addrShort = addr.split(',')[0];
  const cityLine = addr.includes(',') ? addr.split(',').slice(1).join(',').trim() : '';
  const sale = S.salePrice || S.estValue;
  const principal = parseFloat(document.getElementById('payoff').value) || 0;
  const rate = S.interestRate || 0;
  const payoffInterest = rate > 0 ? Math.round(principal * (rate / 100) / 12) : 0;
  const totalPayoff = principal + payoffInterest;
  const comm = sale * 0.055;
  const closing = sale * (S.closing / 100);
  const net = sale - totalPayoff - comm - closing;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const infoBeds = document.getElementById('infoBeds').textContent;
  const infoBaths = document.getElementById('infoBaths').textContent;
  const infoSqft = document.getElementById('infoSqft').textContent;
  const infoYear = document.getElementById('infoYear').textContent;

  // Content zone: header ends ~195pt, footer starts ~640pt
  let y = 195;
  const firstName = S.first || 'Homeowner';

  // Date
  doc.setTextColor(51, 51, 51);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(today, 40, y);
  y += 20;

  // Salutation
  doc.setTextColor(51, 51, 51);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Dear ' + firstName + ',', 40, y);
  y += 18;

  // Opening paragraph
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 51, 51);
  var openPara = 'Thank you for your inquiry on how much net proceeds you would receive if you sold your home at ' + addr + ' for ' + fmt(S.estValue) + '. Below is a breakdown of what that would look like based on current market data.';
  var openLines = doc.splitTextToSize(openPara, W - 80);
  doc.text(openLines, 40, y);
  y += openLines.length * 14 + 10;

  // Green divider
  doc.setDrawColor(46, 139, 87);
  doc.setLineWidth(1);
  doc.line(40, y, W - 40, y);
  y += 16;

  // Estimated value box
  doc.setFillColor(15, 42, 71);
  doc.rect(40, y, W - 80, 52, 'F');
  doc.setTextColor(46, 139, 87);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTIMATED MARKET VALUE', W / 2, y + 12, { align: 'center' });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(fmt(S.estValue), W / 2, y + 33, { align: 'center' });
  doc.setTextColor(180, 220, 200);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Estimated Range: ' + fmt(S.valueLow) + ' – ' + fmt(S.valueHigh), W / 2, y + 46, { align: 'center' });
  y += 60;

  // Property details row
  var details = [
    ['BEDROOMS', String(infoBeds || '—')],
    ['BATHROOMS', String(infoBaths || '—')],
    ['SQUARE FEET', String(infoSqft || '—')],
    ['YEAR BUILT', String(infoYear || '—')]
  ];
  var dw = (W - 80) / 4;
  details.forEach(function(d, i) {
    var dx = 40 + i * dw;
    doc.setFillColor(i % 2 === 0 ? 245 : 250, 248, 252);
    doc.rect(dx, y, dw - 2, 30, 'F');
    doc.setFillColor(46, 139, 87);
    doc.rect(dx, y, dw - 2, 2, 'F');
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text(d[0], dx + (dw - 2) / 2, y + 11, { align: 'center' });
    doc.setTextColor(21, 35, 64);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(d[1], dx + (dw - 2) / 2, y + 24, { align: 'center' });
  });
  y += 38;

  // Net proceeds header
  doc.setFillColor(15, 42, 71);
  doc.rect(40, y, W - 80, 20, 'F');
  doc.setFillColor(46, 139, 87);
  doc.rect(40, y, 3, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTIMATED NET PROCEEDS', 50, y + 14);
  y += 20;

  var rows = [
    { label: 'Estimated Sale Price', val: fmt(sale), r: 21, g: 35, b: 64 },
    { label: 'Mortgage Payoff', val: '(' + fmt(totalPayoff) + ')', r: 180, g: 40, b: 40 },
    { label: 'Agent Commission', val: 'TBD', r: 51, g: 51, b: 51 },
    { label: 'Seller Closing Costs', val: 'TBD', r: 51, g: 51, b: 51 }
  ];
  rows.forEach(function(row, i) {
    doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 248 : 255);
    doc.rect(40, y, W - 80, 16, 'F');
    doc.setTextColor(row.r, row.g, row.b);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text(row.label, 48, y + 11);
    doc.setFont('helvetica', 'bold');
    doc.text(row.val, W - 48, y + 11, { align: 'right' });
    y += 16;
  });

  // Net total
  doc.setFillColor(15, 42, 71);
  doc.rect(40, y, W - 80, 26, 'F');
  doc.setFillColor(46, 139, 87);
  doc.rect(40, y, 3, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTIMATED NET TO SELLER', 50, y + 18);
  doc.setTextColor(net >= 0 ? 150 : 255, net >= 0 ? 255 : 120, net >= 0 ? 180 : 120);
  doc.setFontSize(12);
  doc.text(fmt(net), W - 48, y + 18, { align: 'right' });
  y += 36;

  // Green divider
  doc.setDrawColor(46, 139, 87);
  doc.setLineWidth(1);
  doc.line(40, y, W - 40, y);
  y += 12;

  // Next steps paragraph
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 51, 51);
  var nextPara = 'The next step, if you would like to have a more serious conversation, is for us to schedule a call or consultation to discuss your selling goals. I will make sure to answer all of your questions and guide you through every step of the process.';
  var nextLines = doc.splitTextToSize(nextPara, W - 80);
  doc.text(nextLines, 40, y);
  y += nextLines.length * 14 + 10;

  // Closing
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 51, 51);
  doc.text('Thank you so much for your inquiry — I will be in touch soon!', 40, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 51, 51);
  doc.text('Warm regards,', 40, y);
  y += 13;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 42, 71);
  doc.text('Mauricio Perez-Vazquez', 40, y);

  doc.save('Seller-Valuation-Report-' + addrShort.replace(/[^a-zA-Z0-9]/g, '-') + '.pdf');
}

function reDownload() { generatePDF(); }

// Init
document.addEventListener('DOMContentLoaded', initAutocomplete);
