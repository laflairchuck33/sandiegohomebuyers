function generatePDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('PDF library not loaded. Please refresh and try again.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = 612, H = 792;

  // Draw ROA template as background
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

  // Content starts below header (~y=195pt)
  let y = 195;

  // Prepared date (small, top of content area)
  doc.setTextColor(120, 120, 120);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Prepared: ' + today, W - 30, y, { align: 'right' });
  y += 14;

  // Address
  doc.setTextColor(21, 35, 64);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(addrShort, 30, y);
  y += 16;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(cityLine, 30, y);
  y += 22;

  // Green divider
  doc.setDrawColor(46, 139, 87);
  doc.setLineWidth(1.5);
  doc.line(30, y, W - 30, y);
  y += 18;

  // Estimated value
  doc.setFillColor(21, 35, 64);
  doc.rect(30, y, W - 60, 72, 'F');
  doc.setTextColor(46, 139, 87);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTIMATED MARKET VALUE', W / 2, y + 16, { align: 'center' });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(30);
  doc.setFont('helvetica', 'bold');
  doc.text(fmt(S.estValue), W / 2, y + 46, { align: 'center' });
  doc.setTextColor(180, 220, 200);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Range: ' + fmt(S.valueLow) + ' – ' + fmt(S.valueHigh), W / 2, y + 62, { align: 'center' });
  y += 84;

  // Property details row
  const details = [
    ['BEDROOMS', String(infoBeds || '—')],
    ['BATHROOMS', String(infoBaths || '—')],
    ['SQUARE FEET', String(infoSqft || '—')],
    ['YEAR BUILT', String(infoYear || '—')]
  ];
  const dw = (W - 60) / 4;
  details.forEach(function(d, i) {
    const dx = 30 + i * dw;
    doc.setFillColor(i % 2 === 0 ? 245 : 250, 248, 252);
    doc.rect(dx, y, dw - 2, 40, 'F');
    doc.setFillColor(46, 139, 87);
    doc.rect(dx, y, dw - 2, 2, 'F');
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text(d[0], dx + (dw - 2) / 2, y + 14, { align: 'center' });
    doc.setTextColor(21, 35, 64);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(d[1], dx + (dw - 2) / 2, y + 32, { align: 'center' });
  });
  y += 52;

  // Net proceeds section header
  doc.setFillColor(21, 35, 64);
  doc.rect(30, y, W - 60, 22, 'F');
  doc.setFillColor(46, 139, 87);
  doc.rect(30, y, 3, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTIMATED NET PROCEEDS', 40, y + 15);
  y += 22;

  const rows = [
    { label: 'Estimated Sale Price', val: fmt(sale), r: 21, g: 35, b: 64, bold: false },
    { label: 'Mortgage Payoff', val: '(' + fmt(totalPayoff) + ')', r: 180, g: 40, b: 40, bold: false },
    { label: 'Agent Commission (5.5%)', val: '(' + fmt(comm) + ')', r: 180, g: 40, b: 40, bold: false },
    { label: 'Seller Closing Costs (' + S.closing + '%)', val: '(' + fmt(closing) + ')', r: 180, g: 40, b: 40, bold: false }
  ];

  rows.forEach(function(row, i) {
    doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 248 : 255);
    doc.rect(30, y, W - 60, 20, 'F');
    doc.setTextColor(row.r, row.g, row.b);
    doc.setFontSize(9);
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.text(row.label, 38, y + 14);
    doc.setFont('helvetica', 'bold');
    doc.text(row.val, W - 38, y + 14, { align: 'right' });
    y += 20;
  });

  // Net total bar
  doc.setFillColor(21, 35, 64);
  doc.rect(30, y, W - 60, 28, 'F');
  doc.setFillColor(46, 139, 87);
  doc.rect(30, y, 3, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTIMATED NET TO SELLER', 40, y + 19);
  doc.setTextColor(net >= 0 ? 150 : 255, net >= 0 ? 255 : 120, net >= 0 ? 180 : 120);
  doc.setFontSize(13);
  doc.text(fmt(net), W - 38, y + 19, { align: 'right' });
  y += 38;

  // Disclaimer
  doc.setTextColor(160, 160, 160);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'italic');
  var disc = 'This report is for informational purposes only and does not constitute a formal appraisal or commitment to lend. Values are estimates from available market data. Commission and closing costs may vary. Negotiable — contact your agent.';
  var dLines = doc.splitTextToSize(disc, W - 60);
  doc.text(dLines, 30, y + 10);

  doc.save('Seller-Valuation-Report-' + addrShort.replace(/[^a-zA-Z0-9]/g, '-') + '.pdf');
}

function reDownload() { generatePDF(); }
