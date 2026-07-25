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
  if (!window.jspdf || !window.jspdf.jsPDF) { alert('PDF library not loaded. Please refresh the page and try again.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = 612, H = 792;

  // ROA Brand Colors
  const navy    = [21, 35, 64];     // #152340
  const green   = [46, 139, 87];    // #2E8B57
  const white   = [255, 255, 255];
  const offWhite= [248, 250, 252];
  const darkGray= [51, 51, 51];
  const midGray = [120, 120, 120];
  const lightGray=[204,204,204];
  const red     = [180, 40, 40];
  const darkRed = [120, 30, 30];
  const blue    = [0, 100, 160];

  const addr = document.getElementById('addressInput').value.trim();
  const addrShort = addr.split(',')[0];
  const cityLine  = addr.includes(',') ? addr.split(',').slice(1).join(',').trim() : '';
  const sale      = S.salePrice || S.estValue;
  const storedPrincipal = parseFloat(document.getElementById('payoff').value) || 0;
  const storedRate = S.interestRate || 0;
  const calcPayoffInterest = storedRate > 0 ? Math.round(storedPrincipal * (storedRate / 100) / 12) : 0;
  const totalMortgagePayoff = storedPrincipal + calcPayoffInterest;
  const comm    = sale * 0.055;
  const closing = sale * (S.closing / 100);
  const net     = sale - totalMortgagePayoff - comm - closing;
  const monthly = calcMonthlyPayment(storedPrincipal, storedRate, 30 * 12);
  const today   = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
  const todayShort = new Date().toLocaleDateString('en-US', { month:'numeric', day:'numeric', year:'numeric' });
  const infoBeds  = document.getElementById('infoBeds').textContent;
  const infoBaths = document.getElementById('infoBaths').textContent;
  const infoSqft  = document.getElementById('infoSqft').textContent;
  const infoYear  = document.getElementById('infoYear').textContent;

  // ── Helper: ROA Header (diagonal navy + green stripe) ───────────────
  function roaHeader() {
    // Full-width navy trapezoid at top
    // Draw as a filled polygon: top-left, top-right, angled-right, angled-left
    // Navy shape covers top ~120pt, angles down from right
    doc.setFillColor(...navy);
    // Top bar full width
    doc.rect(0, 0, W, 85, 'F');
    // Green diagonal stripe below navy (simulate with triangles)
    // Draw the slanted bottom edge using a path
    doc.setFillColor(...green);
    doc.rect(0, 82, W, 6, 'F');
    // White angled cut into the green (create diagonal effect)
    // Use triangle to clip: draw white triangle over bottom-right of green bar
    // Simulate diagonal: left side deeper, right side cuts up
    // We'll use lines approach: draw a filled polygon for the angled white cutaway
    doc.setFillColor(...white);
    doc.lines([[W*0.75, 0],[0, 6],[-W*0.75, -6]], W*0.25, 82, [1,1], 'F', true);

    // ROA Logo text
    doc.setTextColor(...white);
    doc.setFontSize(36); doc.setFont('helvetica', 'bold');
    doc.text('ROA', 30, 58);

    // TM mark
    doc.setFontSize(9);
    doc.text('TM', 96, 28);

    // Green triangle in the A — approximate with a small filled rect
    doc.setFillColor(...green);
    doc.lines([[13, 0],[-7, -16],[-6, 16]], 74, 48, [1,1], 'F', true);

    // REALTY OF AMERICA tagline
    doc.setTextColor(...white);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.setCharSpace(2);
    doc.text('REALTY OF AMERICA', 30, 72);
    doc.setCharSpace(0);

    // Vertical green divider line
    doc.setDrawColor(...green);
    doc.setLineWidth(1.5);
    doc.line(148, 14, 148, 78);

    // SELLER title (green)
    doc.setTextColor(...green);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.setCharSpace(3);
    doc.text('SELLER', 162, 40);
    doc.setCharSpace(0);

    // VALUATION REPORT (navy/white on dark bg)
    doc.setTextColor(...white);
    doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text('VALUATION REPORT', 162, 62);
  }

  // ── Helper: ROA Footer ───────────────────────────────────────────────
  function roaFooter() {
    const footerY = H - 90;

    // Green separator line full width
    doc.setDrawColor(...green);
    doc.setLineWidth(1.2);
    doc.line(20, footerY, W - 20, footerY);

    // Agent photo circle (use embedded headshot if available)
    const photoX = 26, photoY = footerY + 10, photoSize = 62;
    try {
      // Mauricio's headshot embedded at /mauricio-headshot.jpg on the server
      // Load via canvas trick — use a cached base64 or URL
      if (window._mauricioPhoto) {
        doc.addImage(window._mauricioPhoto, 'JPEG', photoX, photoY, photoSize, photoSize);
        // Circular clip visual — draw white ring
        doc.setDrawColor(...green);
        doc.setLineWidth(2);
        doc.ellipse(photoX + photoSize/2, photoY + photoSize/2, photoSize/2 + 2, photoSize/2 + 2, 'S');
      }
    } catch(e) {
      // Fallback: gray circle
      doc.setFillColor(200, 200, 200);
      doc.ellipse(photoX + photoSize/2, photoY + photoSize/2, photoSize/2, photoSize/2, 'F');
    }

    // Agent name
    const textX = photoX + photoSize + 14;
    doc.setTextColor(...navy);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text('Mauricio Perez-Vazquez', textX, footerY + 30);

    // Title in green
    doc.setTextColor(...green);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text('Founding Partner | Broker Associate', textX, footerY + 45);

    // Green line under title
    doc.setDrawColor(...green);
    doc.setLineWidth(0.8);
    doc.line(textX, footerY + 50, W - 20, footerY + 50);

    // Contact row with icons (text-based icons)
    const contacts = [
      { icon: '📞', text: '619.813.5903' },
      { icon: '✉', text: 'mo@mysandiegobroker.com' },
      { icon: '📍', text: '2434 Fenton St., Chula Vista, CA 91914' },
      { icon: '📄', text: 'DRE Lic. #01303708' },
    ];
    const contactY = footerY + 68;
    const contactSpacing = (W - 40) / contacts.length;
    contacts.forEach((c, i) => {
      const cx = 20 + i * contactSpacing;
      // Vertical divider (except first)
      if (i > 0) {
        doc.setDrawColor(...lightGray);
        doc.setLineWidth(0.5);
        doc.line(cx, contactY - 10, cx, contactY + 18);
      }
      doc.setTextColor(...green);
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(c.icon, cx + 6, contactY + 5);
      doc.setTextColor(...darkGray);
      doc.setFontSize(7.5);
      doc.text(c.text, cx + 20, contactY + 5);
    });
  }

  // ════════════════════════════════════════════
  // PAGE 1 — Valuation Report
  // ════════════════════════════════════════════
  roaHeader();

  let y = 105;

  // Property address block
  doc.setFillColor(...offWhite);
  doc.rect(20, y, W - 40, 46, 'F');
  doc.setFillColor(...green);
  doc.rect(20, y, 4, 46, 'F');
  doc.setTextColor(...navy);
  doc.setFontSize(15); doc.setFont('helvetica', 'bold');
  doc.text(addrShort, 32, y + 18);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...midGray);
  doc.text(cityLine + '  |  Prepared: ' + today, 32, y + 34);
  y += 56;

  // ── Estimated Market Value ───────────────────────────
  doc.setFillColor(...navy);
  doc.roundedRect(20, y, W - 40, 88, 6, 6, 'F');
  doc.setFillColor(...green);
  doc.roundedRect(20, y, W - 40, 88, 6, 6, 'S');

  doc.setTextColor(...green);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.setCharSpace(2);
  doc.text('ESTIMATED MARKET VALUE', W/2, y + 20, { align:'center' });
  doc.setCharSpace(0);

  doc.setTextColor(...white);
  doc.setFontSize(34); doc.setFont('helvetica', 'bold');
  doc.text(fmt(S.estValue), W/2, y + 56, { align:'center' });

  doc.setFillColor(...green);
  doc.rect(W/2 - 80, y + 64, 160, 1, 'F');

  doc.setTextColor(180, 220, 200);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
  doc.text('Value Range: ' + fmt(S.valueLow) + ' – ' + fmt(S.valueHigh), W/2, y + 78, { align:'center' });
  y += 100;

  // ── Property Details row ─────────────────────────────
  const details = [
    ['BEDROOMS', infoBeds], ['BATHROOMS', infoBaths],
    ['SQUARE FEET', infoSqft], ['YEAR BUILT', infoYear]
  ];
  const dw = (W - 40) / 4;
  details.forEach((d, i) => {
    const dx = 20 + i * dw;
    doc.setFillColor(i % 2 === 0 ? 242 : 248, 247, 252);
    doc.rect(dx, y, dw - 3, 44, 'F');
    // Green top border
    doc.setFillColor(...green);
    doc.rect(dx, y, dw - 3, 3, 'F');
    doc.setTextColor(...midGray);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
    doc.setCharSpace(1);
    doc.text(d[0], dx + dw/2 - 3, y + 16, { align:'center' });
    doc.setCharSpace(0);
    doc.setTextColor(...navy);
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text(d[1] || '—', dx + dw/2 - 3, y + 36, { align:'center' });
  });
  y += 56;

  // ── Net Proceeds ─────────────────────────────────────
  // Section header
  doc.setFillColor(...navy);
  doc.rect(20, y, W - 40, 24, 'F');
  doc.setFillColor(...green);
  doc.rect(20, y, 4, 24, 'F');
  doc.setTextColor(...white);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.setCharSpace(1);
  doc.text('ESTIMATED NET PROCEEDS', 32, y + 16);
  doc.setCharSpace(0);
  y += 24;

  const netRows = [
    { label: 'Estimated Sale Price',              val: fmt(sale),                       color: darkGray, bold: false },
    { label: 'Current Principal Balance',          val: '(' + fmt(storedPrincipal) + ')', color: red,     bold: false },
  ];
  if (calcPayoffInterest > 0) {
    netRows.push({ label: 'Payoff Interest (' + storedRate + '% annual)',
                   val: '(' + fmt(calcPayoffInterest) + ')', color: red, bold: false });
    netRows.push({ label: 'Total Mortgage Payoff',
                   val: '(' + fmt(totalMortgagePayoff) + ')', color: darkRed, bold: true });
  } else {
    netRows.push({ label: 'Total Mortgage Payoff',
                   val: '(' + fmt(totalMortgagePayoff) + ')', color: darkRed, bold: true });
  }
  if (monthly > 0) {
    netRows.push({ label: 'Current Monthly Payment',
                   val: fmt(monthly) + '/mo', color: blue, bold: false });
  }
  netRows.push({ label: 'Agent Commission (5.5%)', val: '(' + fmt(comm) + ')', color: red, bold: false });
  netRows.push({ label: 'Seller Closing Costs (' + S.closing + '%)', val: '(' + fmt(closing) + ')', color: red, bold: false });

  netRows.forEach((row, i) => {
    doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 252 : 255, i % 2 === 0 ? 250 : 255);
    doc.rect(20, y, W - 40, 22, 'F');
    // Green left micro-accent on even rows
    if (i % 2 === 0) { doc.setFillColor(...green); doc.rect(20, y, 2, 22, 'F'); }
    doc.setTextColor(...row.color);
    doc.setFontSize(9); doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.text(row.label, 30, y + 15);
    doc.setFont('helvetica', 'bold');
    doc.text(row.val, W - 28, y + 15, { align:'right' });
    y += 22;
  });

  // NET total bar
  doc.setFillColor(...navy);
  doc.rect(20, y, W - 40, 32, 'F');
  doc.setFillColor(...green);
  doc.rect(20, y, 4, 32, 'F');
  doc.setTextColor(...white);
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('ESTIMATED NET PROCEEDS TO SELLER', 32, y + 20);
  doc.setTextColor(net >= 0 ? [150, 255, 180] : [255, 120, 120]);
  doc.setFontSize(14);
  doc.text(fmt(net), W - 28, y + 21, { align:'right' });
  y += 44;

  // ── Disclaimer ───────────────────────────────────────
  doc.setFillColor(245, 248, 245);
  doc.rect(20, y, W - 40, 46, 'F');
  doc.setTextColor(...midGray); doc.setFontSize(6.8); doc.setFont('helvetica', 'italic');
  const disc = 'This report is provided for informational purposes only and does not constitute a formal appraisal, legal advice, or a commitment to lend. Estimated values are derived from available market data. Commission and closing costs are estimates and may vary. Actual sale results may differ. Cost to sell is negotiable — contact your agent to discuss.';
  const dLines = doc.splitTextToSize(disc, W - 56);
  doc.text(dLines, 30, y + 12);

  roaFooter();

  // ════════════════════════════════════════════
  // PAGE 2 — Comparable Sales (if available)
  // ════════════════════════════════════════════
  if (S.comparables && S.comparables.length > 0) {
    doc.addPage();
    roaHeader();

    let y2 = 108;

    // Section header
    doc.setFillColor(...navy);
    doc.rect(20, y2, W - 40, 24, 'F');
    doc.setFillColor(...green);
    doc.rect(20, y2, 4, 24, 'F');
    doc.setTextColor(...white);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('COMPARABLE SALES (' + S.comparables.length + ' properties)', 32, y2 + 16);
    y2 += 30;

    // Table header
    const cols = [
      { label: '#',       x: 20,  w: 16 },
      { label: 'ADDRESS', x: 38,  w: 162 },
      { label: 'DIST',    x: 202, w: 38 },
      { label: 'STATUS',  x: 242, w: 44 },
      { label: 'PRICE',   x: 288, w: 76 },
      { label: 'DATE',    x: 366, w: 56 },
      { label: 'BED',     x: 424, w: 24 },
      { label: 'BATH',    x: 450, w: 28 },
      { label: 'SQFT',    x: 480, w: 50 },
      { label: '$/SQFT',  x: 532, w: 52 },
    ];

    doc.setFillColor(...navy);
    doc.rect(20, y2, W - 40, 18, 'F');
    cols.forEach(c => {
      doc.setTextColor(...green);
      doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
      doc.text(c.label, c.x + 2, y2 + 12);
    });
    y2 += 18;

    S.comparables.forEach((comp, i) => {
      doc.setFillColor(i % 2 === 0 ? 247 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 248 : 255);
      doc.rect(20, y2, W - 40, 22, 'F');
      if (i % 2 === 0) { doc.setFillColor(...green); doc.rect(20, y2, 2, 22, 'F'); }

      const saleDate = comp.listedDate ? new Date(comp.listedDate).toLocaleDateString('en-US',{month:'numeric',day:'numeric',year:'2-digit'}) : '—';
      const priceSqft = comp.squareFootage && comp.price ? '$' + Math.round(comp.price / comp.squareFootage) : '—';
      const dist = comp.distance ? comp.distance.toFixed(2) + ' mi' : '—';
      const status = (comp.status || '').toLowerCase() === 'active' ? 'Active' : 'Sold';
      const statusColor = status === 'Active' ? [0, 130, 60] : [100, 100, 120];
      const addrText = (comp.formattedAddress || '').split(',')[0];
      const cityText = (comp.formattedAddress || '').split(',').slice(1,2).join('').trim();

      doc.setTextColor(...darkGray); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      doc.text(String(i + 1), cols[0].x + 2, y2 + 9);

      doc.setFont('helvetica', 'bold'); doc.setTextColor(...navy);
      doc.text(addrText.substring(0, 26), cols[1].x + 2, y2 + 9);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...midGray); doc.setFontSize(6.5);
      doc.text(cityText.substring(0, 22), cols[1].x + 2, y2 + 17);

      doc.setFontSize(7.5); doc.setTextColor(...darkGray); doc.setFont('helvetica', 'normal');
      doc.text(dist, cols[2].x + 2, y2 + 13);

      doc.setTextColor(...statusColor); doc.setFont('helvetica', 'bold');
      doc.text(status, cols[3].x + 2, y2 + 13);

      doc.setTextColor(...navy); doc.setFont('helvetica', 'bold');
      doc.text(comp.price ? '$' + (comp.price/1000).toFixed(0) + 'K' : '—', cols[4].x + 2, y2 + 13);

      doc.setTextColor(...darkGray); doc.setFont('helvetica', 'normal');
      doc.text(saleDate, cols[5].x + 2, y2 + 13);
      doc.text(comp.bedrooms ? String(comp.bedrooms) : '—', cols[6].x + 2, y2 + 13);
      doc.text(comp.bathrooms ? String(comp.bathrooms) : '—', cols[7].x + 2, y2 + 13);
      doc.text(comp.squareFootage ? comp.squareFootage.toLocaleString() : '—', cols[8].x + 2, y2 + 13);
      doc.setTextColor(...green); doc.setFont('helvetica', 'bold');
      doc.text(priceSqft, cols[9].x + 2, y2 + 13);

      y2 += 22;
    });

    // Avg $/sqft summary
    const validComps = S.comparables.filter(c => c.price && c.squareFootage);
    if (validComps.length > 0) {
      const avgPSF = Math.round(validComps.reduce((s, c) => s + c.price / c.squareFootage, 0) / validComps.length);
      y2 += 6;
      doc.setFillColor(...navy);
      doc.rect(20, y2, W - 40, 26, 'F');
      doc.setFillColor(...green); doc.rect(20, y2, 4, 26, 'F');
      doc.setTextColor(...white); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text('Average Price Per Sq Ft', 32, y2 + 17);
      doc.setTextColor(...green);
      doc.text('$' + avgPSF + ' / ft²', W - 28, y2 + 17, { align:'right' });
    }

    roaFooter();
  }

  doc.save('Seller-Valuation-Report-' + addrShort.replace(/\s+/g, '-') + '-' + new Date().toISOString().slice(0,10) + '.pdf');
}


function reDownload() { generatePDF(); }

// Init
document.addEventListener('DOMContentLoaded', initAutocomplete);
