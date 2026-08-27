// ── TILE SELECTION ──
function enforceDownMin() {
  const loanBtn  = document.querySelector('#loanGrid .tile.on');
  const loanType = loanBtn ? loanBtn.dataset.val : 'conventional';
  const slider   = document.getElementById('downPayment');
  const minDown  = loanType === 'va' ? 0 : loanType === 'fha' ? 3.5 : 3;
  // Set min/step BEFORE reading value so browser doesn't auto-snap
  slider.step  = 0.5;
  slider.min   = 0; // keep html min at 0 so 3.5 is always a valid step
  const current = parseFloat(slider.value);
  if (isNaN(current) || current < minDown) slider.value = minDown;
}

function selectTile(btn, group) {
  const grid = document.getElementById(group === 'loan' ? 'loanGrid' : 'propGrid');
  grid.querySelectorAll('.tile').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  enforceDownMin();
  updateCalc();
}

// ── MAIN CALC ──
function updateSliderFill(el) {
  const min = parseFloat(el.min) || 0;
  const max = parseFloat(el.max) || 100;
  const val = parseFloat(el.value) || 0;
  const pct = ((val - min) / (max - min)) * 100;
  el.style.setProperty('--val', pct.toFixed(2) + '%');
}

function updateCalc() {
  const priceEl = document.getElementById('homePrice');
  const downEl  = document.getElementById('downPayment');
  updateSliderFill(priceEl);
  updateSliderFill(downEl);
  const price   = parseInt(priceEl.value) || 500000;

  const loanBtn  = document.querySelector('#loanGrid .tile.on');
  const loanType = loanBtn ? loanBtn.dataset.val : 'conventional';
  const propBtn  = document.querySelector('#propGrid .tile.on');
  const propType = propBtn ? propBtn.dataset.val : 'sfr';

  // Enforce down payment minimums per loan type
  const slider  = document.getElementById('downPayment');
  const minDown = loanType === 'va' ? 0 : loanType === 'fha' ? 3.5 : 3;
  slider.step = 0.5;
  slider.min  = 0; // keep at 0 so 3.5 is always a valid step position
  const rawDown = slider.value;
  let downPct = rawDown === '' ? minDown : parseFloat(rawDown);
  if (downPct < minDown) { downPct = minDown; slider.value = minDown; }

  const income  = parseFloat(document.getElementById('monthlyIncome').value) || 0;
  const debt    = parseFloat(document.getElementById('monthlyDebt').value) || 0;

  const downAmt = Math.round(price * downPct / 100);
  const loanAmt = price - downAmt;
  const ltv     = loanAmt / price * 100;

  // Update slider displays
  document.getElementById('priceDisplay').textContent = '$' + price.toLocaleString();
  document.getElementById('downDisplay').innerHTML = downPct + '% <span style="font-size:1rem;color:var(--g)">($' + downAmt.toLocaleString() + ')</span>';
  document.getElementById('approvedPrice').innerHTML = '$' + price.toLocaleString() + ' <span class="appr-sales-lbl">SALES PRICE</span>';
  document.getElementById('congratsPrice').textContent = '$' + price.toLocaleString();

  // Rate assumption
  const rate = loanType === 'va' ? 0.060 : loanType === 'fha' ? 0.060 : 0.065;
  const mo   = rate / 12;
  const n    = 360;
  const pi   = loanAmt > 0 ? loanAmt * (mo * Math.pow(1+mo,n)) / (Math.pow(1+mo,n)-1) : 0;

  // Fixed costs
  const tax = (price * 0.0125) / 12;
  const ins = 150;

  // PMI / MIP
  let pmi = 0;
  if (loanType === 'conventional' && ltv > 80) {
    let pmiRate = 0;
    if (ltv > 95)      pmiRate = 0.0050;  // 97% LTV
    else if (ltv > 90) pmiRate = 0.0031;  // 95% LTV
    else if (ltv > 85) pmiRate = 0.0015;  // 90% LTV
    else               pmiRate = 0.0010;  // 85% LTV
    pmi = (loanAmt * pmiRate) / 12;
  } else if (loanType === 'fha') {
    const mipRate = (loanAmt <= 726200 && ltv > 95) ? 0.0055 : 0.005;
    pmi = (loanAmt * mipRate) / 12;
  }

  // HOA — $450 for condo
  const hoa = propType === 'condo' ? 450 : 0;
  document.getElementById('hoaRow').style.display = hoa > 0 ? 'block' : 'none';

  const total = pi + tax + ins + pmi + hoa;

  // Update display
  document.getElementById('piDisplay').textContent  = '$' + Math.round(pi).toLocaleString() + '/mo';
  document.getElementById('taxDisplay').textContent  = '$' + Math.round(tax).toLocaleString() + '/mo';
  document.getElementById('insDisplay').textContent  = '$150/mo';
  document.getElementById('pmiDisplay').textContent  = pmi > 0 ? '$' + Math.round(pmi).toLocaleString() + '/mo' : 'None ✓';
  document.getElementById('pmiDisplay').style.color  = pmi > 0 ? 'var(--w)' : 'var(--teal)';
  document.getElementById('hoaDisplay').textContent  = '$450/mo (est.)';
  document.getElementById('totalDisplay').textContent = '$' + Math.round(total).toLocaleString() + '/mo';

  // DTI qualification check
  const loanName = loanType.toUpperCase();
  const el = document.getElementById('dtiLabel');

  if (income <= 0) {
    el.textContent = 'Enter your income to check qualification';
    el.style.color = 'var(--g)';
  } else {
    const frontDTI = (total / income) * 100;           // housing only
    const backDTI  = ((total + debt) / income) * 100;  // housing + all debt

    let qualified = true;
    let msg = '';

    if (loanType === 'fha') {
      // FHA: Front End max 46.99%, Back End max 56.99%
      if (frontDTI > 46.99) {
        qualified = false;
        msg = '⚠️ Front-End DTI ' + frontDTI.toFixed(1) + '% — above 46.99% FHA max. Lower the price or increase down payment.';
      } else if (backDTI > 56.99) {
        qualified = false;
        msg = '⚠️ Back-End DTI ' + backDTI.toFixed(1) + '% — above 56.99% FHA max. Reduce your monthly debts.';
      } else {
        msg = '✓ FHA Qualifies — Front-End ' + frontDTI.toFixed(1) + '% (max 46.99%) · Back-End ' + backDTI.toFixed(1) + '% (max 56.99%)';
      }
    } else if (loanType === 'va') {
      // VA: Back End max 60%
      if (backDTI > 60) {
        qualified = false;
        msg = '⚠️ DTI ' + backDTI.toFixed(1) + '% — above 60% VA max. Try a lower price or reduce debts.';
      } else {
        msg = '✓ VA Qualifies — DTI ' + backDTI.toFixed(1) + '% (max 60%)';
      }
    } else {
      // Conventional: Back End max 50%
      if (backDTI > 50) {
        qualified = false;
        msg = '⚠️ DTI ' + backDTI.toFixed(1) + '% — above 50% Conventional max. Try a lower price or reduce debts.';
      } else {
        msg = '✓ Conventional Qualifies — DTI ' + backDTI.toFixed(1) + '% (max 50%)';
      }
    }

    el.innerHTML = msg;
    el.style.color = qualified ? 'var(--teal)' : '#f0a500';
  }
}

// ── LETTER FORM ──
function showLetterForm() {
  document.getElementById('step4').scrollIntoView({behavior:'smooth'});
}
function trackAndApply() {
  // Show lead capture modal before sending to 1003app
  document.getElementById('preApplyModal').style.display = 'flex';
  document.getElementById('paName').focus();
}
function closePreApply() {
  document.getElementById('preApplyModal').style.display = 'none';
}
function checkPreApply() {
  const name  = document.getElementById('paName').value.trim();
  const phone = document.getElementById('paPhone').value.trim();
  const email = document.getElementById('paEmail').value.trim();
  const btn   = document.getElementById('paSubmitBtn');
  const hint  = document.getElementById('paHint');
  const ready = name.length > 1 && phone.length > 6 && email.includes('@');
  btn.disabled        = !ready;
  btn.style.background = ready ? '#1a6cfe' : '#ccc';
  btn.style.color      = ready ? '#000'    : '#666';
  btn.style.cursor     = ready ? 'pointer' : 'not-allowed';
  hint.style.display   = ready ? 'none'    : 'block';
}
async function submitPreApply() {
  const name  = document.getElementById('paName').value.trim();
  const phone = document.getElementById('paPhone').value.trim();
  const email = document.getElementById('paEmail').value.trim();
  if (!name || !phone || !email) return;

  // Track
  gtag('event','apply_now_click',{event_category:'conversion',event_label:'Complete My Application'});
  gtag('event','conversion',{'send_to':'AW-18336070867/yggCCLD8o9McENP5qKdE','value':1.0,'currency':'USD'});
  fbq('track','Lead');

  // Send lead to server (Telegram + FUB)
  fetchWithRetry('https://sandiegohomebuyers.onrender.com/api/lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone, email, callTime: 'Any time', calcData: { prequalStatus: 'Apply Now Click' } })
  });

  // Close modal and open 1003app
  closePreApply();
  window.open('https://cmc.my1003app.com/220926/register?time=1772669246583', '_blank');
}

async function fetchWithRetry(url, options, retries = 3, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
    } catch (e) {
      if (i < retries - 1) await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

function checkStep4() {
  const name  = document.getElementById('lfName').value.trim();
  const phone = document.getElementById('lfPhone').value.trim();
  const email = document.getElementById('lfEmail').value.trim();
  const btn   = document.getElementById('lfSubmitBtn');
  const hint  = document.getElementById('lfHint');
  const ready = name.length > 1 && phone.length > 6 && email.includes('@');
  btn.disabled = !ready;
  btn.style.background = ready ? '#1a6cfe' : '#ccc';
  btn.style.color      = ready ? '#000'    : '#666';
  btn.style.cursor     = ready ? 'pointer' : 'not-allowed';
  hint.style.display   = ready ? 'none'   : 'block';
}

function submitLetter() {
  const name  = document.getElementById('lfName').value.trim();
  const email = document.getElementById('lfEmail').value.trim();
  const phone = document.getElementById('lfPhone').value.trim();
  if (!name || !email || !phone) {
    if (!name)  document.getElementById('lfName').style.borderColor  = 'red';
    if (!phone) document.getElementById('lfPhone').style.borderColor = 'red';
    if (!email) document.getElementById('lfEmail').style.borderColor = 'red';
    return;
  }

  // ✅ Fire tracking AFTER validation — confirmed real lead
  gtag('event','preapproval_letter_request',{event_category:'conversion',event_label:'Get My Pre-Approval Letter'});
  gtag('event','conversion',{'send_to':'AW-18336070867/yggCCLD8o9McENP5qKdE','value':1.0,'currency':'USD'});
  fbq('track','Lead');

  // Hide form, show congrats
  document.getElementById('ctaArea4').style.display = 'none';
  document.getElementById('congratsBox').style.display = 'block';
  window.open('https://cmc.my1003app.com/220926/register?time=1772669246583', '_blank');

  // Fire lead to server with retry (handles Render cold start)
  const price    = parseInt(document.getElementById('homePrice').value) || 500000;
  const loanBtn  = document.querySelector('#loanGrid .tile.on');
  const loanType = loanBtn ? loanBtn.dataset.val : 'conventional';
  const downPct  = parseFloat(document.getElementById('downPayment').value) || 10;
  const income   = parseFloat(document.getElementById('monthlyIncome').value) || 0;
  const debt     = parseFloat(document.getElementById('monthlyDebt').value) || 0;

  fetchWithRetry('https://sandiegohomebuyers.onrender.com/api/lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name, email, phone,
      callTime: 'Any time',
      calcData: {
        homePrice: price,
        downPayment: Math.round(price * downPct / 100),
        loanType,
        totalMonthly: parseFloat(document.getElementById('totalPayment')?.textContent?.replace(/[^0-9.]/g,'')) || 0,
        annualIncome: income * 12,
        monthlyDebt: debt,
        prequalStatus: income > 0 ? 'Qualified' : 'Pending Income Verification'
      }
    })
  }); // retries 3x with 2s delay — handles Render cold start
}

// ── MAP ──
let map, markers = [], listingsData = [];

const fallbackListings = [
  {id:1,addr:'Chula Vista, CA 91914',price:'$749,000',beds:4,baths:3,sqft:'2,100',status:'For Sale',img:'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=600&q=80',lat:32.6401,lng:-117.0842},
  {id:2,addr:'Eastlake, CA 91915',price:'$895,000',beds:5,baths:3,sqft:'2,650',status:'For Sale',img:'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=600&q=80',lat:32.6274,lng:-116.9637},
  {id:3,addr:'Otay Ranch, CA 91913',price:'$629,000',beds:3,baths:2,sqft:'1,750',status:'For Sale',img:'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&q=80',lat:32.6105,lng:-116.9544},
];

function renderListings(listings) {
  listingsData = listings;
  const side = document.getElementById('listingsSide');
  if (!listings.length) {
    side.innerHTML = '<div style="padding:60px 40px;color:#555;text-align:center">No listings available right now. Check back soon!</div>';
    return;
  }
  side.innerHTML = listings.map((l, i) => `
    <div class="lcard" onclick="window.location.href='/property.html?id='+${l.id||i}" style="${i===listings.length-1?'border-bottom:none':''}">
      ${l.img ? `<img class="lim" src="${l.img}" alt="${l.addr}" onerror="this.style.display='none'"/>` : '<div class="lim" style="height:180px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:2rem">🏠</div>'}
      <div class="lbd">
        <div class="ltg">${l.status||'For Sale'}</div>
        <div class="lpr">${l.price}</div>
        <div class="lad">${l.addr}</div>
        <div class="lme">
          ${l.beds?`<span>🛏 ${l.beds} Beds</span>`:''}
          ${l.baths?`<span>🚿 ${l.baths} Baths</span>`:''}
          ${l.sqft?`<span>📐 ${l.sqft} sqft</span>`:''}
        </div>
        ${l.desc?`<div style="font-size:.78rem;color:#999;margin:6px 0;line-height:1.5">${l.desc}</div>`:''}
        ${l.mls?`<div style="font-size:.72rem;color:#555;margin-bottom:6px">MLS# ${l.mls}</div>`:''}
        <button class="showing-btn" onclick="event.stopPropagation();openShowing('${l.addr} — ${l.price}')">🗓 Request a Showing</button>
      </div>
    </div>
  `).join('');

  // Update map pins
  if (map) {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    listings.forEach((l, i) => {
      if (!l.lat || !l.lng) return;
      const icon = L.divIcon({className:'',html:`<div style="background:#1a6cfe;color:#000;font-weight:800;font-size:11px;padding:5px 9px;border-radius:4px;white-space:nowrap;font-family:Inter,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4)">${l.price}</div>`,iconAnchor:[38,18]});
      markers.push(L.marker([l.lat,l.lng],{icon}).addTo(map).bindPopup(`<b>${l.price}</b><br>${l.addr}${l.beds?' | '+l.beds+' bed':''}${l.baths?' · '+l.baths+' bath':''}`));
    });
  }
}

function initMap() {
  map = L.map('map',{zoomControl:true}).setView([32.628,-117.02],12);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{attribution:'&copy; OpenStreetMap &copy; CARTO',subdomains:'abcd',maxZoom:19}).addTo(map);
  // Load listings from server, fall back to defaults
  fetch('/api/listings').then(r=>r.json()).then(data=>{
    allListingsData = (data.listings && data.listings.length) ? data.listings : fallbackListings;
    renderListingPage();
  }).catch(()=>{ allListingsData = fallbackListings; renderListingPage(); });
}
function focusPin(i){
  const l = listingsData[i];
  if(l && l.lat && l.lng) map.setView([l.lat,l.lng],14,{animate:true});
  if(markers[i]) markers[i].openPopup();
}

// ── DYNAMIC ANCHOR OFFSET — always clears the nav no matter the screen size ──
function setScrollOffsets(){
  const nav = document.querySelector('nav');
  if(!nav) return;
  const off = Math.round(nav.getBoundingClientRect().height) + 24;
  document.querySelectorAll('#quickcap,#step1,#step2,#step3,#step4,#prequal,#testi,#contact').forEach(el=>{ el.style.scrollMarginTop = off + 'px'; });
}
window.addEventListener('load', () => {
  setScrollOffsets();
  const priceEl = document.getElementById('homePrice');
  const downEl  = document.getElementById('downPayment');
  if (priceEl) updateSliderFill(priceEl);
  if (downEl)  updateSliderFill(downEl);
});
window.addEventListener('resize', setScrollOffsets);
setScrollOffsets();

// ── QUICK CAPTURE STRIP ──
function submitQuickCap(){
  const name = document.getElementById('qc-name').value.trim();
  const phone = document.getElementById('qc-phone').value.trim();
  if(name.length < 2 || phone.length < 7){ alert('Please enter your name and phone number.'); return; }
  gtag('event','qualify_lead',{event_category:'conversion',event_label:'Hot Listings Signup'});
  gtag('event','conversion',{'send_to':'AW-18336070867/yggCCLD8o9McENP5qKdE','value':1.0,'currency':'USD'});
  fbq('track','Lead');
  fetchWithRetry('https://sandiegohomebuyers.onrender.com/api/lead', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ name, phone, email:'', callTime:'Any time', calcData:{ prequalStatus:'Hot Listings Signup' } })
  });
  document.getElementById('qc-form').style.display='none';
  document.getElementById('qc-done').style.display='block';
}

// ── EXIT INTENT ──
let exitShown = sessionStorage.getItem('exitShown') === '1';
document.addEventListener('mouseout', function(e){
  if(exitShown || e.relatedTarget || e.clientY > 10) return;
  if(window.innerWidth <= 768) return; // desktop only
  exitShown = true;
  sessionStorage.setItem('exitShown','1');
  document.getElementById('exitModal').style.display='flex';
});
function closeExitModal(){ document.getElementById('exitModal').style.display='none'; }
function submitExitLead(){
  const name = document.getElementById('exName').value.trim();
  const phone = document.getElementById('exPhone').value.trim();
  if(name.length < 2 || phone.length < 7){ alert('Please enter your name and phone number.'); return; }
  gtag('event','qualify_lead',{event_category:'conversion',event_label:'Exit Intent'});
  gtag('event','conversion',{'send_to':'AW-18336070867/yggCCLD8o9McENP5qKdE','value':1.0,'currency':'USD'});
  fbq('track','Lead');
  fetchWithRetry('https://sandiegohomebuyers.onrender.com/api/lead', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ name, phone, email:'', callTime:'Any time', calcData:{ prequalStatus:'Exit Intent Lead' } })
  });
  document.getElementById('exDone').style.display='block';
  setTimeout(closeExitModal, 2200);
}
document.getElementById('exitModal').addEventListener('click',function(e){if(e.target===this)closeExitModal();});

// ── MISC ──
// ── HERO AGENT VIDEO SOUND ──
// Promo video sound toggle
let promoMuted = true;
function togglePromoSound() {
  const btn = document.getElementById('promoSoundBtn');
  const iframe = document.getElementById('promoVid');
  promoMuted = !promoMuted;
  const src = iframe.src;
  if (promoMuted) {
    iframe.src = src.replace('mute=0','mute=1');
    btn.textContent = '🔇 Tap for Sound';
  } else {
    iframe.src = src.replace('mute=1','mute=0');
    btn.innerHTML = '🔊 Sound On';
    btn.style.background = 'rgba(26,108,254,0.9)';
  }
}

function startHeroSound() {
  const vid = document.getElementById('heroVid');
  const overlay = document.getElementById('heroOverlay');
  const btn = document.getElementById('heroSoundBtn');
  vid.muted = false;
  vid.volume = 1;
  vid.currentTime = 0;
  vid.play();
  overlay.style.display = 'none';
  btn.style.display = 'flex';
}
function toggleHeroSound() {
  const vid = document.getElementById('heroVid');
  const btn = document.getElementById('heroSoundBtn');
  vid.muted = !vid.muted;
  btn.textContent = vid.muted ? '🔇' : '🔊';
}

// ── ADDRESS AUTOCOMPLETE (Nominatim) ──
let addrTimer;
function addrAutocomplete(val) {
  clearTimeout(addrTimer);
  const box = document.getElementById('addrSuggestions');
  if (!val || val.length < 4) { box.style.display='none'; return; }
  addrTimer = setTimeout(() => {
    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val+', San Diego County, CA')}&format=json&limit=6&addressdetails=1&countrycodes=us`)
      .then(r => r.json())
      .then(results => {
        if (!results.length) { box.style.display='none'; return; }
        box.innerHTML = results.map(r => {
          const display = r.display_name.split(',').slice(0,4).join(',');
          return `<div onclick="selectAddr('${display.replace(/'/g,"&#39;")}')" style="padding:10px 14px;cursor:pointer;font-size:.85rem;color:#ccc;border-bottom:1px solid #222" onmouseover="this.style.background='#222'" onmouseout="this.style.background='transparent'">${display}</div>`;
        }).join('');
        box.style.display = 'block';
      }).catch(() => box.style.display='none');
  }, 350);
}
function selectAddr(addr) {
  document.getElementById('sh2-addr').value = addr;
  document.getElementById('addrSuggestions').style.display = 'none';
}
document.addEventListener('click', e => {
  if (!e.target.closest('#addrSuggestions') && e.target.id !== 'sh2-addr')
    document.getElementById('addrSuggestions').style.display = 'none';
});

// ── STEP 2: REQUEST A SHOWING (inline form) ──
function checkStep2() {
  const addr  = document.getElementById('sh2-addr').value.trim();
  const name  = document.getElementById('sh2-name').value.trim();
  const phone = document.getElementById('sh2-phone').value.trim();
  const btn   = document.getElementById('sh2-btn');
  const hint  = document.getElementById('sh2-hint');
  const ready = addr.length > 5 && name.length > 1 && phone.length > 6;
  btn.disabled         = !ready;
  btn.style.background = ready ? '#1a6cfe' : '#ccc';
  btn.style.color      = ready ? '#000'    : '#666';
  btn.style.cursor     = ready ? 'pointer' : 'not-allowed';
  hint.style.display   = ready ? 'none'   : 'block';
}

function submitStep2(){
  const addr  = document.getElementById('sh2-addr').value.trim();
  const name  = document.getElementById('sh2-name').value.trim();
  const phone = document.getElementById('sh2-phone').value.trim();
  const email = document.getElementById('sh2-email').value.trim();
  const date  = document.getElementById('sh2-date').value;
  const time  = document.getElementById('sh2-time').value;
  if(!addr||!name||!phone){alert('Please fill in the property address, your name, and phone number.');return;}
  // ✅ Fire tracking AFTER validation passes — real lead confirmed
  gtag('event','request_showing',{event_category:'conversion',event_label:'Request My Showing'});
  gtag('event','conversion',{'send_to':'AW-18336070867/yggCCLD8o9McENP5qKdE','value':1.0,'currency':'USD'});
  fbq('track','Lead');
  document.getElementById('sh2-thanks').style.display='block';
  document.querySelector('#step2 button[onclick]').style.display='none';
  fetchWithRetry('https://sandiegohomebuyers.onrender.com/api/showing',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name,phone,email,date,time,property:addr})
  }); // retries 3x with 2s delay — handles Render cold start
}

// ── REQUEST A SHOWING ──
function openShowing(property){
  document.getElementById('showingProperty').textContent = property;
  document.getElementById('shName').value='';
  document.getElementById('shPhone').value='';
  document.getElementById('shEmail').value='';
  document.getElementById('shDate').value='';
  document.getElementById('shTime').selectedIndex=0;
  document.getElementById('showingThanks').style.display='none';
  // Reset button to disabled state
  const shBtn = document.getElementById('shBtn');
  shBtn.disabled=true; shBtn.style.background='#ccc'; shBtn.style.color='#666'; shBtn.style.cursor='not-allowed';
  document.getElementById('shHint').style.display='block';
  document.querySelector('#showingModal > div > button').style.display='block';
  document.querySelector('#showingModal h3').style.display='block';
  document.querySelector('#showingModal input[type="text"]').parentElement.querySelectorAll('input,select,button:last-of-type').forEach(el=>el.style.display='');
  const modal = document.getElementById('showingModal');
  modal.style.display='flex';
}
function closeShowing(){
  document.getElementById('showingModal').style.display='none';
}
function checkShowing() {
  const name  = document.getElementById('shName').value.trim();
  const phone = document.getElementById('shPhone').value.trim();
  const btn   = document.getElementById('shBtn');
  const hint  = document.getElementById('shHint');
  const ready = name.length > 1 && phone.length > 6;
  btn.disabled         = !ready;
  btn.style.background = ready ? '#1a6cfe' : '#ccc';
  btn.style.color      = ready ? '#000'    : '#666';
  btn.style.cursor     = ready ? 'pointer' : 'not-allowed';
  hint.style.display   = ready ? 'none'   : 'block';
}

function submitShowing(){
  const name  = document.getElementById('shName').value.trim();
  const phone = document.getElementById('shPhone').value.trim();
  const email = document.getElementById('shEmail').value.trim();
  const date  = document.getElementById('shDate').value;
  const time  = document.getElementById('shTime').value;
  const prop  = document.getElementById('showingProperty').textContent;
  if(!name||!phone){alert('Please enter your name and phone number.');return;}
  // ✅ Fire tracking AFTER validation passes — real lead confirmed
  gtag('event','request_showing',{event_category:'conversion',event_label:'Request Showing Modal'});
  gtag('event','conversion',{'send_to':'AW-18336070867/yggCCLD8o9McENP5qKdE','value':1.0,'currency':'USD'});
  fbq('track','Lead');
  // Show thanks
  document.getElementById('showingThanks').style.display='block';
  document.querySelector('#showingModal button[onclick="submitShowing()"]').style.display='none';
  // Send to server with retry (handles Render cold start)
  fetchWithRetry('https://sandiegohomebuyers.onrender.com/api/showing', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name,phone,email,date,time,property:prop})
  });
  setTimeout(closeShowing, 3000);
}
document.getElementById('showingModal').addEventListener('click',function(e){if(e.target===this)closeShowing();});
document.getElementById('preApplyModal').addEventListener('click',function(e){if(e.target===this)closePreApply();});

function doMLSSearch(){
  const city     = document.getElementById('srCity').value;
  const minPrice = document.getElementById('srMinPrice').value;
  const maxPrice = document.getElementById('srMaxPrice').value;
  const beds     = document.getElementById('srBeds').value;
  const baths    = document.getElementById('srBaths').value;
  const type     = document.getElementById('srType').value;
  let url = 'https://www.crmls.org/servlet/lDisplayListings?LA=EN';
  if(city)     url += '&City=' + encodeURIComponent(city);
  if(minPrice) url += '&MinPrice=' + minPrice;
  if(maxPrice) url += '&MaxPrice=' + maxPrice;
  if(beds)     url += '&MinBeds=' + beds;
  if(baths)    url += '&MinBaths=' + baths;
  if(type)     url += '&PropType=' + encodeURIComponent(type);
  window.open(url, '_blank');
}
function doSearch(){
  const v = document.getElementById('navSearch').value.trim();
  if(v){
    const url = 'https://www.crmls.org/servlet/lDisplayListings?LA=EN&City=' + encodeURIComponent(v);
    window.open(url, '_blank');
  }
}
document.querySelectorAll('a[href^="#"]').forEach(a=>{a.addEventListener('click',e=>{e.preventDefault();const el=document.querySelector(a.getAttribute('href'));if(el)el.scrollIntoView({behavior:'smooth'});});});
// ── CUSTOM CALENDAR ──
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
let calDate = new Date(), calSelected = null;

function toggleCal() {
  const p = document.getElementById('calPopup');
  p.classList.toggle('open');
  if (p.classList.contains('open')) renderCal();
}
function calNav(dir) {
  calDate.setMonth(calDate.getMonth() + dir);
  renderCal();
}
function renderCal() {
  const today = new Date(); today.setHours(0,0,0,0);
  const y = calDate.getFullYear(), m = calDate.getMonth();
  document.getElementById('calMonth').textContent = MONTHS[m] + ' ' + y;
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m+1, 0).getDate();
  let html = DAYS.map(d => `<div class="cal-dow">${d}</div>`).join('');
  for (let i=0; i<first; i++) html += '<div class="cal-day empty"></div>';
  for (let d=1; d<=days; d++) {
    const dt = new Date(y,m,d);
    const isPast = dt < today;
    const isSel = calSelected && dt.toDateString()===calSelected.toDateString();
    const isToday = dt.toDateString()===today.toDateString();
    const cls = [isPast?'disabled':'', isSel?'selected':'', isToday&&!isSel?'today':''].join(' ');
    const click = !isPast ? `onclick="selectCalDay(${y},${m},${d})"` : '';
    html += `<div class="cal-day ${cls}" ${click}>${d}</div>`;
  }
  document.getElementById('calGrid').innerHTML = html;
}
function selectCalDay(y,m,d) {
  calSelected = new Date(y,m,d);
  const opts = {weekday:'short',month:'short',day:'numeric',year:'numeric'};
  document.getElementById('calDisplay').textContent = '📅 ' + calSelected.toLocaleDateString('en-US', opts);
  document.getElementById('sh2-date').value = calSelected.toISOString().split('T')[0];
  document.getElementById('calPopup').classList.remove('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('#calWrap')) document.getElementById('calPopup')?.classList.remove('open');
});

window.addEventListener('load',()=>{
  initMap();
  enforceDownMin();
  updateCalc();
  initCookieBanner();
});

// ── SORT LISTINGS ──
function sortListings(listings) {
  const sort = document.getElementById('srSort')?.value || '';
  const parsed = listings.map(l => ({ ...l, _price: parseInt((l.price||'0').replace(/[^0-9]/g,'')) || 0 }));
  if (sort === 'price_asc') return parsed.sort((a,b) => a._price - b._price);
  if (sort === 'price_desc') return parsed.sort((a,b) => b._price - a._price);
  if (sort === 'newest') return parsed.sort((a,b) => (b.id||0) - (a.id||0));
  return parsed;
}

// ── PAGINATION ──
const LISTINGS_PER_PAGE = 9;
let currentListingsPage = 1;
let allListingsData = [];

function renderListingPage() {
  const sorted = sortListings(allListingsData);
  const total = sorted.length;
  const pages = Math.ceil(total / LISTINGS_PER_PAGE) || 1;
  if (currentListingsPage > pages) currentListingsPage = 1;
  const slice = sorted.slice((currentListingsPage-1)*LISTINGS_PER_PAGE, currentListingsPage*LISTINGS_PER_PAGE);
  renderListings(slice);
  renderPagination(pages);
}

function renderPagination(pages) {
  let pag = document.getElementById('listingsPagination');
  if (!pag) {
    pag = document.createElement('div');
    pag.id = 'listingsPagination';
    pag.style.cssText = 'display:flex;gap:8px;justify-content:center;padding:16px 0;flex-wrap:wrap';
    const side = document.getElementById('listingsSide');
    if (side) side.after(pag);
  }
  if (pages <= 1) { pag.innerHTML = ''; return; }
  pag.innerHTML = '';
  for (let i=1; i<=pages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.style.cssText = `padding:6px 14px;border-radius:6px;border:1px solid #ddd;cursor:pointer;font-family:inherit;font-size:.82rem;font-weight:${i===currentListingsPage?'800':'500'};background:${i===currentListingsPage?'#1a6cfe':'#fff'};color:${i===currentListingsPage?'#fff':'#333'}`;
    btn.onclick = () => { currentListingsPage = i; renderListingPage(); document.getElementById('listings')?.scrollIntoView({behavior:'smooth'}); };
    pag.appendChild(btn);
  }
}

// Hook sort change
document.getElementById('srSort')?.addEventListener('change', () => { currentListingsPage = 1; renderListingPage(); });

// ── COOKIE CONSENT BANNER ──
function initCookieBanner() {
  if (localStorage.getItem('cookie_consent')) return;
  const banner = document.createElement('div');
  banner.id = 'cookieBanner';
  banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#111;color:#fff;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:.82rem;border-top:2px solid #1a6cfe';
  banner.innerHTML = `
    <span>🍪 We use cookies to improve your experience and track analytics. <a href="/privacy.html" style="color:#00b4d8;text-decoration:none">Learn more</a></span>
    <div style="display:flex;gap:10px;flex-shrink:0">
      <button onclick="acceptCookies()" style="background:#1a6cfe;color:#fff;border:none;padding:8px 20px;border-radius:6px;font-weight:700;cursor:pointer;font-family:inherit">Accept All</button>
      <button onclick="declineCookies()" style="background:transparent;color:#aaa;border:1px solid #444;padding:8px 16px;border-radius:6px;cursor:pointer;font-family:inherit">Decline</button>
    </div>`;
  document.body.appendChild(banner);
}
function acceptCookies() {
  localStorage.setItem('cookie_consent', 'accepted');
  document.getElementById('cookieBanner')?.remove();
}
function declineCookies() {
  localStorage.setItem('cookie_consent', 'declined');
  document.getElementById('cookieBanner')?.remove();
}