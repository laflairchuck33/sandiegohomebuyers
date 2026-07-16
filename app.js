// ===========================
// CONFIG — Update these
// ===========================
const CONFIG = {
  // Follow Up Boss
  fubApiKey: 'fka_078GYityEvI1PUsA99FQDNmbdwUeBB8IBC',
  fubWebhookUrl: '', // OR use a webhook URL if preferred

  // Lead notification email (your email)
  notifyEmail: 'chuck@allin-lending.com',

  // Your name/team shown to leads
  agentName: 'Chuck La Flair',
  agentPhone: '(619) 555-0100', // update with real number
};

// ===========================
// SYNC DOWN/PAYMENT FIELDS
// ===========================
document.getElementById('homePrice')?.addEventListener('input', syncDownPayment);
document.getElementById('downPayment')?.addEventListener('input', function() {
  const hp = parseFloat(document.getElementById('homePrice').value) || 0;
  const dp = parseFloat(this.value) || 0;
  document.getElementById('downPct').value = hp ? Math.round((dp / hp) * 100) : 0;
});

document.getElementById('downPct')?.addEventListener('input', function() {
  const hp = parseFloat(document.getElementById('homePrice').value) || 0;
  const pct = parseFloat(this.value) || 0;
  document.getElementById('downPayment').value = Math.round(hp * pct / 100);
});

function syncDownPayment() {
  const hp = parseFloat(document.getElementById('homePrice').value) || 0;
  const pct = parseFloat(document.getElementById('downPct').value) || 20;
  document.getElementById('downPayment').value = Math.round(hp * pct / 100);
}

// ===========================
// CALCULATE
// ===========================
function calculate() {
  const homePrice = parseFloat(document.getElementById('homePrice').value) || 0;
  const downPayment = parseFloat(document.getElementById('downPayment').value) || 0;
  const loanType = document.getElementById('loanType').value;
  const annualRate = parseFloat(document.getElementById('rate').value) || 7.25;
  const annualIncome = parseFloat(document.getElementById('income').value) || 0;
  const monthlyDebt = parseFloat(document.getElementById('monthlyDebt').value) || 0;
  const creditScore = parseInt(document.getElementById('creditScore').value) || 680;

  if (homePrice < 50000) {
    alert('Please enter a valid home price.');
    return;
  }

  const loanAmount = homePrice - downPayment;
  const termMonths = loanType === 'conv15' ? 180 : 360;
  const monthlyRate = (annualRate / 100) / 12;

  // Principal + Interest
  const pi = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
             (Math.pow(1 + monthlyRate, termMonths) - 1);

  // Estimated taxes & insurance (rough estimate)
  const taxes = (homePrice * 0.0125) / 12;
  const insurance = (homePrice * 0.005) / 12;

  // PMI if down < 20%
  const downPct = downPayment / homePrice;
  const pmi = downPct < 0.2 ? (loanAmount * 0.0085) / 12 : 0;

  // FHA MIP
  let mip = 0;
  if (loanType === 'fha') {
    mip = (loanAmount * 0.0055) / 12;
  }

  const totalMonthly = pi + taxes + insurance + pmi + mip;

  // Pre-qual calculation
  const monthlyIncome = annualIncome / 12;
  const maxDTI = creditScore >= 720 ? 0.45 : creditScore >= 680 ? 0.43 : 0.41;
  const maxHousingPayment = (monthlyIncome * maxDTI) - monthlyDebt;
  const maxLoanAmount = maxHousingPayment > 0
    ? (maxHousingPayment - taxes - insurance) / monthlyRate *
      (1 - Math.pow(1 + monthlyRate, -termMonths))
    : 0;
  const maxPurchasePrice = maxLoanAmount + downPayment;

  // DTI for this loan
  const dti = monthlyIncome > 0 ? ((totalMonthly + monthlyDebt) / monthlyIncome) * 100 : 999;

  // Pre-qual status
  let prequalStatus, prequalIcon, prequalTitle, prequalSub, badgeClass;

  if (creditScore < 620) {
    prequalStatus = 'low';
    prequalIcon = '⚠️';
    prequalTitle = 'Credit Score May Be a Challenge';
    prequalSub = 'A score below 620 limits most loan programs. Talk to our team — we have options.';
    badgeClass = 'red';
  } else if (dti > 50) {
    prequalStatus = 'tight';
    prequalIcon = '⚠️';
    prequalTitle = 'Debt-to-Income Is High';
    prequalSub = `Your estimated DTI is ${dti.toFixed(0)}%. Lenders typically want under 43–45%. Let's talk about your options.`;
    badgeClass = 'yellow';
  } else if (dti > 43) {
    prequalStatus = 'borderline';
    prequalIcon = '🟡';
    prequalTitle = 'You May Qualify — Let\'s Confirm';
    prequalSub = `DTI of ${dti.toFixed(0)}% is on the edge. You may qualify with certain loan programs. A quick call can confirm.`;
    badgeClass = 'yellow';
  } else {
    prequalStatus = 'strong';
    prequalIcon = '✅';
    prequalTitle = 'You Look Like a Strong Candidate!';
    prequalSub = `Based on your inputs, you may qualify for up to $${formatNum(maxPurchasePrice)} in purchasing power.`;
    badgeClass = 'green';
  }

  // Render results
  const resultsEl = document.getElementById('calcResults');
  resultsEl.innerHTML = `
    <div class="results-content">
      <div class="result-header">
        <div class="result-icon">🏠</div>
        <div>
          <h3>Your Estimated Payment</h3>
          <p>Based on a ${formatNum(loanAmount, true)} loan</p>
        </div>
      </div>

      <div class="result-main">
        <div class="r-label">Estimated Monthly Payment</div>
        <div class="r-amount">$${formatNum(totalMonthly)}</div>
        <div class="r-sub">Principal, interest, taxes & insurance</div>
      </div>

      <div class="result-breakdown">
        <div class="breakdown-row"><span class="b-label">Principal & Interest</span><span class="b-val">$${formatNum(pi)}</span></div>
        <div class="breakdown-row"><span class="b-label">Property Tax (est.)</span><span class="b-val">$${formatNum(taxes)}</span></div>
        <div class="breakdown-row"><span class="b-label">Home Insurance (est.)</span><span class="b-val">$${formatNum(insurance)}</span></div>
        ${pmi > 0 ? `<div class="breakdown-row"><span class="b-label">PMI</span><span class="b-val">$${formatNum(pmi)}</span></div>` : ''}
        ${mip > 0 ? `<div class="breakdown-row"><span class="b-label">FHA MIP</span><span class="b-val">$${formatNum(mip)}</span></div>` : ''}
        <div class="breakdown-row"><span class="b-label">Loan Amount</span><span class="b-val">$${formatNum(loanAmount)}</span></div>
        <div class="breakdown-row"><span class="b-label">Down Payment</span><span class="b-val">$${formatNum(downPayment)} (${Math.round(downPct*100)}%)</span></div>
        <div class="breakdown-row"><span class="b-label">Est. DTI</span><span class="b-val">${dti.toFixed(1)}%</span></div>
      </div>

      <div class="prequal-badge ${badgeClass}">
        <div class="pq-icon">${prequalIcon}</div>
        <div class="pq-title">${prequalTitle}</div>
        <div class="pq-sub">${prequalSub}</div>
      </div>

      <button class="btn btn-primary result-cta" onclick="showLeadModal('${prequalStatus}', '${prequalTitle}')">
        📞 Speak with ${CONFIG.agentName} →
      </button>
    </div>
  `;

  // Smooth scroll to results on mobile
  if (window.innerWidth < 900) {
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Store calc data for lead form
  window.lastCalcData = {
    homePrice, downPayment, loanAmount, loanType, annualRate,
    totalMonthly, annualIncome, monthlyDebt, creditScore, dti,
    prequalStatus, maxPurchasePrice
  };
}

// ===========================
// MODAL
// ===========================
function showLeadModal(status, title) {
  const overlay = document.getElementById('modalOverlay');
  const modalTitle = document.getElementById('modalTitle');
  const modalSub = document.getElementById('modalSub');

  if (status === 'strong') {
    modalTitle.textContent = '🎉 Great News — You Look Pre-Qualified!';
    modalSub.textContent = `Want ${CONFIG.agentName} to confirm your numbers and issue a real pre-approval letter? It's fast and there's no hard credit pull to get started.`;
  } else if (status === 'borderline') {
    modalTitle.textContent = '📋 Let\'s See What We Can Do';
    modalSub.textContent = `Your numbers are close. A 5-minute call with ${CONFIG.agentName} can find the right program for you.`;
  } else {
    modalTitle.textContent = '💬 Let\'s Talk — We Have Options';
    modalSub.textContent = `Every situation is different. ${CONFIG.agentName} has helped buyers in all kinds of situations. Let's see what's possible for you.`;
  }

  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal(event) {
  if (event.target === document.getElementById('modalOverlay')) {
    document.getElementById('modalOverlay').style.display = 'none';
    document.body.style.overflow = '';
  }
}

// ===========================
// SUBMIT LEAD
// ===========================
async function submitLead(event) {
  event.preventDefault();

  const name = document.getElementById('leadName').value;
  const phone = document.getElementById('leadPhone').value;
  const email = document.getElementById('leadEmail').value;
  const callTime = document.getElementById('leadTime').value;
  const calcData = window.lastCalcData || {};

  const btn = event.target.querySelector('button[type=submit]');
  btn.textContent = 'Sending...';
  btn.disabled = true;

  try {
    // Submit to backend
    const res = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, email, callTime, calcData })
    });

    if (res.ok) {
      document.getElementById('modalOverlay').style.display = 'none';
      document.getElementById('successOverlay').style.display = 'flex';
      document.body.style.overflow = '';
      event.target.reset();
    } else {
      throw new Error('Server error');
    }
  } catch (err) {
    // Fallback: open mailto if server unavailable
    const subject = encodeURIComponent(`New Lead: ${name} — San Diego Home Buyers`);
    const body = encodeURIComponent(
      `New lead from SanDiegoHomeBuyers.com\n\n` +
      `Name: ${name}\nPhone: ${phone}\nEmail: ${email}\nBest Time to Call: ${callTime}\n\n` +
      `Calculator Data:\n` +
      `Home Price: $${formatNum(calcData.homePrice || 0)}\n` +
      `Est. Monthly Payment: $${formatNum(calcData.totalMonthly || 0)}\n` +
      `Pre-Qual Status: ${calcData.prequalStatus || 'unknown'}`
    );
    window.open(`mailto:${CONFIG.notifyEmail}?subject=${subject}&body=${body}`);

    document.getElementById('modalOverlay').style.display = 'none';
    document.getElementById('successOverlay').style.display = 'flex';
    document.body.style.overflow = '';
  }

  btn.textContent = 'Yes, I Want to Speak with an Expert →';
  btn.disabled = false;
}

// ===========================
// HELPERS
// ===========================
function formatNum(n, dollar = false) {
  if (!n || isNaN(n)) return dollar ? '$0' : '0';
  return Math.round(n).toLocaleString('en-US');
}
