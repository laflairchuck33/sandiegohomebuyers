// Home Value Report — Logic
// Config — swap in real key when ready
const RENTCAST_KEY = window.RENTCAST_API_KEY || 'PENDING';

let S = {
  address: '', city: '', state: 'CA', zip: '',
  estValue: 0, valueLow: 0, valueHigh: 0,
  beds: '', baths: '', sqft: '', yearBuilt: '',
  salePrice: 0, payoff: 0, commission: 5.5, closing: 1.5,
  first: '', last: '', email: '', phone: ''
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

    document.getElementById('estValue').textContent = fmt(S.estValue);
    document.getElementById('valueRange').textContent = 'Estimated range: ' + fmt(S.valueLow) + ' – ' + fmt(S.valueHigh);
    document.getElementById('step2Addr').textContent = addrVal;

    const hasProp = data.bedrooms || data.bathrooms || data.squareFootage || S.beds;
    if (hasProp) {
      document.getElementById('infoBeds').textContent = data.bedrooms || S.beds || '—';
      document.getElementById('infoBaths').textContent = data.bathrooms || S.baths || '—';
      document.getElementById('infoSqft').textContent = data.squareFootage ? data.squareFootage.toLocaleString() : (S.sqft ? parseInt(S.sqft).toLocaleString() : '—');
      document.getElementById('infoYear').textContent = data.yearBuilt || '—';
      document.getElementById('propInfo').style.display = 'grid';
    }

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
function updateComm(v) { S.commission = parseFloat(v); document.getElementById('commPct').textContent = v + '%'; recalc(); }
function updateClosing(v) { S.closing = parseFloat(v); document.getElementById('closingPct').textContent = v + '%'; recalc(); }

function recalc() {
  const sale = parseFloat(document.getElementById('salePrice').value) || 0;
  const payoff = parseFloat(document.getElementById('payoff').value) || 0;
  const comm = sale * (S.commission / 100);
  const closing = sale * (S.closing / 100);
  const net = sale - payoff - comm - closing;
  S.salePrice = sale; S.payoff = payoff;

  document.getElementById('ns-sale').textContent = fmt(sale);
  document.getElementById('ns-payoff').textContent = payoff > 0 ? ('−' + fmt(payoff)) : fmt(0);
  document.getElementById('ns-comm').textContent = '−' + fmt(comm);
  document.getElementById('ns-closing').textContent = '−' + fmt(closing);
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

  // Push to FUB as lead
  try {
    await pushToFUB();
  } catch (e) { console.log('FUB push failed:', e); }

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
  const W = 612, navy = [10, 25, 65], gold = [212, 175, 55], white = [255,255,255], lightGray = [248,250,252];
  const addr = document.getElementById('addressInput').value.trim();
  const sale = S.salePrice || S.estValue;
  const payoff = S.payoff || 0;
  const comm = sale * (S.commission / 100);
  const closing = sale * (S.closing / 100);
  const net = sale - payoff - comm - closing;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Header bar
  doc.setFillColor(...navy);
  doc.rect(0, 0, W, 90, 'F');
  doc.setTextColor(...white);
  doc.setFontSize(22); doc.setFont('helvetica', 'bold');
  doc.text('HOME VALUE REPORT', 40, 38);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text('Prepared by All In Lending | Chuck La Flair | sandiegohomebuyers.org', 40, 56);
  doc.text('Prepared for: ' + S.first + ' ' + S.last + '   |   Date: ' + today, 40, 72);

  // Gold accent line
  doc.setFillColor(...gold);
  doc.rect(0, 90, W, 4, 'F');

  let y = 120;

  // Address
  doc.setTextColor(...navy);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text('Property Address', 40, y);
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  y += 18;
  doc.text(addr, 40, y);
  y += 30;

  // Estimated value box
  doc.setFillColor(...navy);
  doc.roundedRect(40, y, W - 80, 80, 8, 8, 'F');
  doc.setTextColor(...white);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.text('ESTIMATED MARKET VALUE', W/2, y + 22, { align: 'center' });
  doc.setFontSize(36); doc.setFont('helvetica', 'bold');
  doc.text(fmt(S.estValue), W/2, y + 56, { align: 'center' });
  y += 96;

  // Range
  doc.setTextColor(100, 120, 140);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text('Estimated Range: ' + fmt(S.valueLow) + ' – ' + fmt(S.valueHigh), W/2, y, { align: 'center' });
  y += 28;

  // Property details (if available)
  const infoBeds = document.getElementById('infoBeds').textContent;
  if (infoBeds !== '—') {
    doc.setFillColor(...lightGray);
    doc.roundedRect(40, y, W - 80, 56, 6, 6, 'F');
    const cols = [
      { label: 'BEDROOMS', val: infoBeds },
      { label: 'BATHROOMS', val: document.getElementById('infoBaths').textContent },
      { label: 'SQUARE FEET', val: document.getElementById('infoSqft').textContent },
      { label: 'YEAR BUILT', val: document.getElementById('infoYear').textContent }
    ];
    cols.forEach((c, i) => {
      const cx = 80 + i * 132;
      doc.setTextColor(130, 140, 155); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text(c.label, cx, y + 20);
      doc.setTextColor(...navy); doc.setFontSize(13); doc.setFont('helvetica', 'bold');
      doc.text(c.val || '—', cx, y + 40);
    });
    y += 72;
  }

  // Section: Net Proceeds
  y += 8;
  doc.setTextColor(...navy);
  doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text('Estimated Net Proceeds', 40, y);
  y += 14;

  const rows = [
    { label: 'Estimated Sale Price', val: fmt(sale), neg: false },
    { label: 'Mortgage Payoff', val: '− ' + fmt(payoff), neg: true },
    { label: 'Agent Commission (' + S.commission + '%)', val: '− ' + fmt(comm), neg: true },
    { label: 'Seller Closing Costs (' + S.closing + '%)', val: '− ' + fmt(closing), neg: true },
  ];

  rows.forEach((row, i) => {
    doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 252 : 255);
    doc.rect(40, y, W - 80, 26, 'F');
    doc.setTextColor(row.neg ? 180 : 30, row.neg ? 40 : 40, row.neg ? 40 : 40);
    doc.setFontSize(11); doc.setFont('helvetica', 'normal');
    doc.text(row.label, 56, y + 17);
    doc.setFont('helvetica', 'bold');
    doc.text(row.val, W - 56, y + 17, { align: 'right' });
    y += 26;
  });

  // Total row
  doc.setFillColor(...navy);
  doc.rect(40, y, W - 80, 36, 'F');
  doc.setTextColor(...white);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text('Estimated Net Proceeds', 56, y + 23);
  doc.setFontSize(18);
  doc.text(fmt(net), W - 56, y + 24, { align: 'right' });
  y += 52;

  // Disclaimer
  doc.setTextColor(150, 155, 165);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  const disclaimer = 'This report is an estimate based on available market data and is not a formal appraisal. Actual sale price and net proceeds may vary. Commission and closing cost figures are estimates. For a precise net sheet, contact All In Lending.';
  const lines = doc.splitTextToSize(disclaimer, W - 80);
  doc.text(lines, 40, y);
  y += lines.length * 12 + 16;

  // Footer CTA
  doc.setFillColor(...gold);
  doc.rect(0, 720, W, 72, 'F');
  doc.setTextColor(...navy);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text('Ready to make your move? Talk to Chuck La Flair today.', W/2, 748, { align: 'center' });
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text('sandiegohomebuyers.org  |  All In Lending  |  Chula Vista, CA 91914', W/2, 766, { align: 'center' });

  doc.save('Home-Value-Report-' + (addr.split(',')[0].replace(/\s+/g, '-')) + '.pdf');
}

function reDownload() { generatePDF(); }

// Init
document.addEventListener('DOMContentLoaded', initAutocomplete);
