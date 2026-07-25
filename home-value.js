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
  const params = new URLSearchParams({
    firstName: S.first, lastName: S.last,
    email: S.email, phone: S.phone || '',
    address: addr,
    estValue: fmt(S.estValue),
    payoff: fmt(S.payoff),
    estNet: fmt(net)
  });
  // GET request to our own server - no CORS issues
  await fetch('/api/home-value-lead?' + params.toString());
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
  const W = 612;

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

  let y = 40;

  // Header bar
  doc.setFillColor(21, 35, 64);
  doc.rect(0, 0, W, 70, 'F');
  doc.setFillColor(46, 139, 87);
  doc.rect(0, 70, W, 5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('ROA', 30, 50);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('REALTY OF AMERICA', 30, 65);

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('SELLER VALUATION REPORT', 160, 38);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 220, 200);
  doc.text('Prepared: ' + today, 160, 58);

  y = 95;

  // Address block
  doc.setFillColor(248, 250, 252);
  doc.rect(20, y, W - 40, 44, 'F');
  doc.setFillColor(46, 139, 87);
  doc.rect(20, y, 4, 44, 'F');
  doc.setTextColor(21, 35, 64);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(addrShort, 32, y + 18);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(cityLine, 32, y + 34);
  y += 56;

  // Estimated value box
  doc.setFillColor(21, 35, 64);
  doc.rect(20, y, W - 40, 80, 'F');
  doc.setTextColor(46, 139, 87);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTIMATED MARKET VALUE', W / 2, y + 18, { align: 'center' });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(32);
  doc.setFont('helvetica', 'bold');
  doc.text(fmt(S.estValue), W / 2, y + 52, { align: 'center' });
  doc.setTextColor(180, 220, 200);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Value Range: ' + fmt(S.valueLow) + ' – ' + fmt(S.valueHigh), W / 2, y + 70, { align: 'center' });
  y += 92;

  // Property details
  const details = [
    ['BEDROOMS', document.getElementById('infoBeds').textContent],
    ['BATHROOMS', document.getElementById('infoBaths').textContent],
    ['SQUARE FEET', document.getElementById('infoSqft').textContent],
    ['YEAR BUILT', document.getElementById('infoYear').textContent]
  ];
  const dw = (W - 40) / 4;
  details.forEach(function(d, i) {
    const dx = 20 + i * dw;
    doc.setFillColor(i % 2 === 0 ? 242 : 248, 247, 252);
    doc.rect(dx, y, dw - 3, 44, 'F');
    doc.setFillColor(46, 139, 87);
    doc.rect(dx, y, dw - 3, 3, 'F');
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text(d[0], dx + (dw - 3) / 2, y + 16, { align: 'center' });
    doc.setTextColor(21, 35, 64);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(String(d[1] || '—'), dx + (dw - 3) / 2, y + 36, { align: 'center' });
  });
  y += 56;

  // Net proceeds header
  doc.setFillColor(21, 35, 64);
  doc.rect(20, y, W - 40, 24, 'F');
  doc.setFillColor(46, 139, 87);
  doc.rect(20, y, 4, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTIMATED NET PROCEEDS', 32, y + 16);
  y += 24;

  const rows = [
    { label: 'Estimated Sale Price', val: fmt(sale), r: 51, g: 51, b: 51, bold: false },
    { label: 'Mortgage Payoff', val: '(' + fmt(totalPayoff) + ')', r: 180, g: 40, b: 40, bold: true },
    { label: 'Agent Commission (5.5%)', val: '(' + fmt(comm) + ')', r: 180, g: 40, b: 40, bold: false },
    { label: 'Seller Closing Costs (' + S.closing + '%)', val: '(' + fmt(closing) + ')', r: 180, g: 40, b: 40, bold: false }
  ];

  rows.forEach(function(row, i) {
    doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 252 : 255, i % 2 === 0 ? 250 : 255);
    doc.rect(20, y, W - 40, 22, 'F');
    doc.setTextColor(row.r, row.g, row.b);
    doc.setFontSize(9);
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.text(row.label, 30, y + 15);
    doc.setFont('helvetica', 'bold');
    doc.text(row.val, W - 28, y + 15, { align: 'right' });
    y += 22;
  });

  // Net total
  doc.setFillColor(21, 35, 64);
  doc.rect(20, y, W - 40, 32, 'F');
  doc.setFillColor(46, 139, 87);
  doc.rect(20, y, 4, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTIMATED NET PROCEEDS TO SELLER', 32, y + 20);
  if (net >= 0) {
    doc.setTextColor(150, 255, 180);
  } else {
    doc.setTextColor(255, 120, 120);
  }
  doc.setFontSize(14);
  doc.text(fmt(net), W - 28, y + 21, { align: 'right' });
  y += 44;

  // Disclaimer
  doc.setFillColor(245, 248, 245);
  doc.rect(20, y, W - 40, 50, 'F');
  doc.setTextColor(120, 120, 120);
  doc.setFontSize(6.8);
  doc.setFont('helvetica', 'italic');
  var disc = 'This report is for informational purposes only and does not constitute a formal appraisal or commitment to lend. Estimated values are derived from available market data. Commission and closing costs are estimates and may vary.';
  var dLines = doc.splitTextToSize(disc, W - 56);
  doc.text(dLines, 30, y + 14);
  y += 62;

  // Footer
  doc.setFillColor(46, 139, 87);
  doc.rect(20, y, W - 40, 1, 'F');
  y += 10;
  doc.setTextColor(21, 35, 64);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Mauricio Perez-Vazquez', 30, y + 16);
  doc.setTextColor(46, 139, 87);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Founding Partner | Broker Associate', 30, y + 30);
  doc.setTextColor(120, 120, 120);
  doc.setFontSize(8);
  doc.text('619.813.5903  |  mo@mysandiegobroker.com  |  2434 Fenton St., Chula Vista, CA 91914  |  DRE #01303708', 30, y + 44);

  doc.save('Seller-Valuation-Report-' + addrShort.replace(/\s+/g, '-') + '.pdf');
}

function reDownload() { generatePDF(); }

// Init
document.addEventListener('DOMContentLoaded', initAutocomplete);
