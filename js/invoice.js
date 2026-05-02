const STRIPE_KEY = 'pk_live_51TF4TRL3KWfY91IGePCC3ktriGszwAc66EGbsJ1zh6VvIJU4pbIjs5mMw1Xfvq0HzmaIO47DLVf7ej2znWx8aNo100Mg1uaMd0';
  const stripe = Stripe(STRIPE_KEY);

  let lineCount = 0;
  let depositPercent = null;
  let invoiceCounter = Math.floor(Math.random() * 900) + 100;

  // Set today's date as default
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('invoiceDate').value = today;
  const due = new Date(); due.setDate(due.getDate() + 7);
  document.getElementById('dueDate').value = due.toISOString().split('T')[0];

  // Add default line items
  addLine('Wedding Videography Package', 1, '');
  addLine('Wedding Photography Package', 1, '');

  function showTab(name) {
    document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', ['create','preview','result'][i] === name));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-' + name).classList.add('active');
    if (name === 'preview') updatePreview();
  }

  function addLine(desc='', qty=1, price='') {
    lineCount++;
    const id = lineCount;
    const div = document.createElement('div');
    div.className = 'line-item';
    div.id = 'line-' + id;
    div.innerHTML = `
      <input type="text" placeholder="Service description" value="${desc}" oninput="calcTotals(); updatePreview()">
      <input type="number" placeholder="1" value="${qty}" min="1" oninput="calcTotals(); updatePreview()" style="text-align:center;">
      <input type="number" placeholder="0.00" value="${price}" min="0" step="0.01" oninput="calcTotals(); updatePreview()">
      <button class="remove-btn" onclick="removeLine(${id})">×</button>
    `;
    document.getElementById('lineItems').appendChild(div);
    calcTotals();
  }

  function removeLine(id) {
    const el = document.getElementById('line-' + id);
    if (el) el.remove();
    calcTotals();
    updatePreview();
  }

  function getTotal() {
    let total = 0;
    document.querySelectorAll('.line-item').forEach(item => {
      const inputs = item.querySelectorAll('input');
      const qty = parseFloat(inputs[1].value) || 0;
      const price = parseFloat(inputs[2].value) || 0;
      total += qty * price;
    });
    return total;
  }

  function calcTotals() {
    const total = getTotal();
    document.getElementById('subtotalDisplay').textContent = '$' + total.toFixed(2);
    document.getElementById('totalDisplay').textContent = '$' + total.toFixed(2);
    document.getElementById('prev-subtotal').textContent = '$' + total.toFixed(2);
    document.getElementById('prev-total').textContent = '$' + total.toFixed(2);
    updateChargeAmount();
  }

  function toggleDeposit() {
    const on = document.getElementById('depositToggle').checked;
    document.getElementById('depositOptions').classList.toggle('visible', on);
    if (!on) { depositPercent = null; updateChargeAmount(); }
  }

  function setDeposit(val) {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('customDepositField').style.display = val === 'custom' ? 'block' : 'none';
    depositPercent = val === 'custom' ? null : val;
    updateChargeAmount();
  }

  function updateChargeAmount() {
    const total = getTotal();
    let charge = total;
    if (depositPercent && depositPercent !== 'custom') {
      charge = total * depositPercent / 100;
    } else if (depositPercent === null && document.getElementById('depositToggle').checked) {
      const custom = parseFloat(document.getElementById('customDeposit')?.value) || 0;
      charge = custom;
    }
    document.getElementById('chargeDisplay').textContent = '$' + charge.toFixed(2);
    return charge;
  }

  function getChargeAmount() {
    const total = getTotal();
    if (!document.getElementById('depositToggle').checked) return total;
    if (depositPercent && depositPercent !== 'custom') return total * depositPercent / 100;
    return parseFloat(document.getElementById('customDeposit')?.value) || total;
  }

  function updatePreview() {
    const name = document.getElementById('clientName').value || 'Client Name';
    const email = document.getElementById('clientEmail').value || '';
    const wedding = document.getElementById('weddingDate').value;
    const invDate = document.getElementById('invoiceDate').value;
    const notes = document.getElementById('invoiceNotes').value;

    document.getElementById('prev-clientName').textContent = name;
    document.getElementById('prev-clientEmail').textContent = email;
    document.getElementById('prev-weddingDate').textContent = wedding ? 'Wedding: ' + new Date(wedding + 'T12:00:00').toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'}) : '';
    document.getElementById('prev-date').textContent = invDate ? new Date(invDate + 'T12:00:00').toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'}) : '';
    document.getElementById('prev-invoiceNo').textContent = '#RFP-' + invoiceCounter;
    document.getElementById('prev-notes').textContent = notes;
    // Title and desc
    const title = document.getElementById('invoiceTitle').value;
    const desc = document.getElementById('invoiceDesc').value;
    let prevTitleEl = document.getElementById('prev-invoice-title');
    if (!prevTitleEl) {
      prevTitleEl = document.createElement('div');
      prevTitleEl.id = 'prev-invoice-title';
      prevTitleEl.style.cssText = 'margin-bottom:24px; padding-bottom:24px; border-bottom:1px solid #eee;';
      document.querySelector('.preview-parties').after(prevTitleEl);
    }
    prevTitleEl.innerHTML = title ? `<div style="font-family:'Cormorant Garamond',serif; font-size:1.4rem; margin-bottom:8px;">${title}</div><div style="font-size:0.85rem; color:#666; line-height:1.7;">${desc}</div>` : '';

    // Line items
    const tbody = document.getElementById('prev-lineItems');
    tbody.innerHTML = '';
    document.querySelectorAll('.line-item').forEach(item => {
      const inputs = item.querySelectorAll('input');
      const desc = inputs[0].value || '—';
      const qty = parseFloat(inputs[1].value) || 0;
      const price = parseFloat(inputs[2].value) || 0;
      const amount = qty * price;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${desc}</td><td>${qty}</td><td>$${amount.toFixed(2)}</td>`;
      tbody.appendChild(tr);
    });

    calcTotals();
  }

  // Worker URL — update this after deploying your Cloudflare Worker
  const WORKER_URL = 'https://rockwell-invoice.stephenrockwellmedia.workers.dev';

  async function createPaymentLink() {
    const name = document.getElementById('clientName').value.trim();
    const email = document.getElementById('clientEmail').value.trim();
    const amount = getChargeAmount();

    if (!name) { showStatus('Please enter client name.', 'error'); return; }
    if (!email) { showStatus('Please enter client email.', 'error'); return; }
    if (amount <= 0) { showStatus('Please add at least one line item with a price.', 'error'); return; }

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Generating...';
    showStatus('', '');

    try {
      const lines = [];
      document.querySelectorAll('.line-item').forEach(item => {
        const inputs = item.querySelectorAll('input');
        const desc = inputs[0].value;
        if (desc) lines.push(desc);
      });
      const description = lines.join(' + ') || 'Wedding Services';
      const invoiceNo = 'RFP-' + invoiceCounter;
      const wedding = document.getElementById('weddingDate').value;
      const amountCents = Math.round(amount * 100);

      // Call Cloudflare Worker to create Stripe Checkout session
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: name,
          clientEmail: email,
          amountCents,
          description,
          invoiceNo,
          weddingDate: wedding,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        showStatus('Error: ' + (data.error || 'Could not generate link'), 'error');
        return;
      }

      // Payment link generated successfully
      const paymentUrl = data.url;
      const emailSubject = encodeURIComponent(`Invoice ${invoiceNo} — Rockwell Film & Photo`);
      const emailBody = encodeURIComponent(
        `Hi ${name},\n\nThank you for choosing Rockwell Film & Photo!\n\nPlease use the secure link below to complete your payment of $${amount.toFixed(2)}:\n\n${paymentUrl}\n\nInvoice: ${invoiceNo}\nServices: ${description}${wedding ? '\nWedding Date: ' + new Date(wedding + 'T12:00:00').toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'}) : ''}\n\nIf you have any questions, don't hesitate to reach out!\n\nWarm regards,\nStephen Rockwell\nRockwell Film & Photo\n(412) 292-5355\nrockwellfilmandphoto.com`
      );
      const mailtoLink = `mailto:${email}?subject=${emailSubject}&body=${emailBody}`;

      // Store for copy/email buttons
      document.getElementById('paymentLinkDisplay').textContent = paymentUrl;
      document.getElementById('paymentLinkDisplay').dataset.url = paymentUrl;
      document.getElementById('paymentLinkDisplay').dataset.mailto = mailtoLink;
      document.getElementById('paymentLinkDisplay').dataset.amount = amount.toFixed(2);
      document.getElementById('paymentLinkDisplay').dataset.client = name;
      document.getElementById('paymentLinkDisplay').dataset.email = email;

      invoiceCounter++;
      showTab('result');

    } catch (err) {
      showStatus('Error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate Payment Link';
    }
  }

  function copyLink() {
    const display = document.getElementById('paymentLinkDisplay');
    const url = display.dataset.url || display.textContent.trim();
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.getElementById('copyBtn');
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy Link', 2000);
    }).catch(() => {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      const btn = document.getElementById('copyBtn');
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy Link', 2000);
    });
  }

  function emailClient() {
    const display = document.getElementById('paymentLinkDisplay');
    window.location.href = display.dataset.mailto;
  }

  function showStatus(msg, type) {
    const el = document.getElementById('statusMsg');
    el.textContent = msg;
    el.className = 'status-msg ' + type;
    el.style.display = msg ? 'block' : 'none';
  }

  function resetForm() {
    document.getElementById('clientName').value = '';
    document.getElementById('clientEmail').value = '';
    document.getElementById('weddingDate').value = '';
    document.getElementById('invoiceNotes').value = '';
    document.getElementById('lineItems').innerHTML = '';
    lineCount = 0;
    addLine('Wedding Videography Package', 1, '');
    addLine('Wedding Photography Package', 1, '');
    calcTotals();
    showTab('create');
  }

  updatePreview();
  calcTotals();
  // ── COUPLE ANIMATION ──
  const canvas = document.getElementById('animCanvas');
  const ctx = canvas.getContext('2d');
  let brideI = 'S', groomI = 'J';
  let frame = 0;
  let heartsArr = [];

  function updateInitials() {
    brideI = (document.getElementById('brideInitial').value || 'S').toUpperCase();
    groomI = (document.getElementById('groomInitial').value || 'J').toUpperCase();
  }

  function spawnHeart() {
    heartsArr.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 30,
      y: 55,
      size: 8 + Math.random() * 8,
      opacity: 1,
      vx: (Math.random() - 0.5) * 1.5,
      vy: -(1.5 + Math.random()),
      life: 1
    });
  }

  function drawHeart(x, y, size, opacity, color) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x, y - size*0.3, x - size, y - size*0.3, x - size, y);
    ctx.bezierCurveTo(x - size, y + size*0.4, x, y + size*0.8, x, y + size);
    ctx.bezierCurveTo(x, y + size*0.8, x + size, y + size*0.4, x + size, y);
    ctx.bezierCurveTo(x + size, y - size*0.3, x, y - size*0.3, x, y);
    ctx.fill();
    ctx.restore();
  }

  function drawFigure(x, y, isBride, initial, swing) {
    ctx.save();
    ctx.translate(x, y);

    const GOLD = '#c9a84c';
    const WHITE = '#f5f2ea';
    const DARK = '#1a1510';

    // Body lean toward center
    const lean = isBride ? swing * 0.06 : -swing * 0.06;
    ctx.rotate(lean);

    // Dress / suit
    if (isBride) {
      // Dress skirt - flowy
      ctx.beginPath();
      ctx.moveTo(-2, 22);
      ctx.quadraticCurveTo(-22 + swing*2, 62, -28 + swing*1.5, 78);
      ctx.quadraticCurveTo(-10, 82, 0, 80);
      ctx.quadraticCurveTo(10, 82, 28 - swing*1.5, 78);
      ctx.quadraticCurveTo(22 - swing*2, 62, 2, 22);
      ctx.fillStyle = WHITE;
      ctx.fill();
      ctx.strokeStyle = 'rgba(201,168,76,0.3)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Bodice
      ctx.beginPath();
      ctx.roundRect(-8, 8, 16, 18, 2);
      ctx.fillStyle = WHITE;
      ctx.fill();

      // Veil
      ctx.beginPath();
      ctx.moveTo(4, -14);
      ctx.quadraticCurveTo(20, 0, 18 + swing, 40);
      ctx.quadraticCurveTo(16 + swing, 40, 14, 0);
      ctx.quadraticCurveTo(10, -10, 4, -14);
      ctx.fillStyle = 'rgba(245,242,234,0.4)';
      ctx.fill();

    } else {
      // Suit jacket
      ctx.beginPath();
      ctx.moveTo(-10, 10);
      ctx.lineTo(-10, 70);
      ctx.lineTo(10, 70);
      ctx.lineTo(10, 10);
      ctx.fillStyle = '#2a2825';
      ctx.fill();

      // Lapels
      ctx.beginPath();
      ctx.moveTo(-2, 10);
      ctx.lineTo(-8, 20);
      ctx.lineTo(-2, 30);
      ctx.fillStyle = '#1a1510';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(2, 10);
      ctx.lineTo(8, 20);
      ctx.lineTo(2, 30);
      ctx.fillStyle = '#1a1510';
      ctx.fill();

      // Tie
      ctx.beginPath();
      ctx.moveTo(-1.5, 15);
      ctx.lineTo(-3, 40);
      ctx.lineTo(0, 44);
      ctx.lineTo(3, 40);
      ctx.lineTo(1.5, 15);
      ctx.fillStyle = GOLD;
      ctx.fill();

      // Trousers
      ctx.fillStyle = '#1f1e1c';
      ctx.fillRect(-9, 60, 8, 20);
      ctx.fillRect(1, 60, 8, 20);
    }

    // Head
    ctx.beginPath();
    ctx.arc(0, -6, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#d4a574';
    ctx.fill();

    // Hair
    if (isBride) {
      ctx.beginPath();
      ctx.arc(0, -8, 12, Math.PI, Math.PI * 2);
      ctx.quadraticCurveTo(14, -6, 12, 0);
      ctx.quadraticCurveTo(-12, 0, -14, -6);
      ctx.fillStyle = '#4a3525';
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, -10, 12, Math.PI + 0.3, Math.PI * 2 - 0.3);
      ctx.fillStyle = '#3a2a1a';
      ctx.fill();
    }

    // Initial on body
    ctx.fillStyle = GOLD;
    ctx.font = `bold 11px 'Cormorant Garamond', serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, 0, isBride ? 30 : 40);

    ctx.restore();
  }

  function drawAmpersand(x, y, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#c9a84c';
    ctx.font = `italic bold 28px 'Cormorant Garamond', serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('&', x, y);
    ctx.restore();
  }

  function animate() {
    frame++;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const cx = W / 2;
    const swing = Math.sin(frame * 0.03) * 8;

    // Soft glow behind couple
    const grd = ctx.createRadialGradient(cx, 60, 10, cx, 60, 80);
    grd.addColorStop(0, 'rgba(201,168,76,0.06)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Arms reaching toward each other
    // Bride arm
    ctx.save();
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 22, 50);
    ctx.quadraticCurveTo(cx - 5, 42 + swing * 0.3, cx, 48);
    ctx.stroke();
    ctx.restore();

    // Groom arm
    ctx.save();
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + 22, 48);
    ctx.quadraticCurveTo(cx + 5, 42 + swing * 0.3, cx, 48);
    ctx.stroke();
    ctx.restore();

    // Draw figures
    drawFigure(cx - 38, 62, true, brideI, swing);
    drawFigure(cx + 38, 62, false, groomI, swing);

    // Ampersand between them
    const ampAlpha = 0.7 + Math.sin(frame * 0.04) * 0.3;
    drawAmpersand(cx, 40, ampAlpha);

    // Spawn hearts periodically
    if (frame % 25 === 0) spawnHeart();

    // Draw & update hearts
    heartsArr = heartsArr.filter(h => h.life > 0);
    heartsArr.forEach(h => {
      const col = Math.random() > 0.5 ? '#c9a84c' : '#e8d5a3';
      drawHeart(h.x, h.y, h.size * h.life, h.opacity * h.life, col);
      h.x += h.vx;
      h.y += h.vy;
      h.life -= 0.015;
      h.opacity = h.life;
    });

    // Ground line
    ctx.strok
