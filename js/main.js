/* ── CUSTOM VIDEO PLAYER CONTROL ── */
  function toggleVideo(videoId, wrapId) {
    const video = document.getElementById(videoId);
    const wrap = document.getElementById(wrapId);
    if (!video || !wrap) return;

    // Pause all other custom-player videos first
    document.querySelectorAll('.video-player-wrap video').forEach(v => {
      if (v.id !== videoId && !v.paused) {
        v.pause();
        const otherWrap = v.closest('.video-player-wrap');
        if (otherWrap) otherWrap.classList.remove('playing');
      }
    });

    if (video.paused || video.ended) {
      video.play().then(() => {
        wrap.classList.add('playing');
        // Enable native controls once playing so user can scrub/pause/volume
        video.setAttribute('controls', 'controls');
      }).catch(err => {
        console.warn('Video play failed:', err);
      });
    } else {
      video.pause();
      wrap.classList.remove('playing');
      video.removeAttribute('controls');
    }
  }

  // Auto-sync class state when videos end/pause via native controls
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.video-player-wrap video').forEach(v => {
      const wrap = v.closest('.video-player-wrap');
      v.addEventListener('ended', () => {
        wrap.classList.remove('playing');
        v.removeAttribute('controls');
        v.currentTime = 0;
      });
      v.addEventListener('pause', () => {
        // Only remove 'playing' on explicit pause, not on seek
        if (!v.seeking) {
          setTimeout(() => {
            if (v.paused) wrap.classList.remove('playing');
          }, 100);
        }
      });
      v.addEventListener('play', () => {
        wrap.classList.add('playing');
      });
    });
  });

  /* ── STATS COUNTER ── */
  const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.getAttribute('data-target'));
        const suffix = el.getAttribute('data-suffix') || '';
        const duration = 2000;
        const steps = 60;
        const increment = target / steps;
        let current = 0;
        const interval = setInterval(() => {
          current += increment;
          if (current >= target) {
            current = target;
            clearInterval(interval);
          }
          el.textContent = Math.floor(current) + suffix;
        }, duration / steps);
        statsObserver.unobserve(el);
      }
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.stat-number').forEach(el => statsObserver.observe(el));

  /* ── TIMELINE BUILDER ── */
  let tlCustomEvents = [];
  let tlCustomCounter = 0;

  // Each block: { id, icon, label, startMins, endMins, custom }
  // Stored so edits persist across re-renders
  let tlBlocks = [];
  let tlBlocksInitialized = false;

  const tlDanceTypes = ['First Dance','Father / Daughter','Mother / Son','Parent Dance','Wedding Party Dance','Anniversary Dance','Money Dance','Surprise Dance','Other'];

  const tlOptionalDefs = [
    {
      id:'firstLook', title:'First Look',
      desc:'Will you do a First Look before the ceremony?',
      hasTime:true,
      tip:'A First Look gives you a private moment, calms nerves, and allows portraits in better light. Plan 20–30 minutes plus walking time.'
    },
    {
      id:'altFirstLook', title:'Additional First Looks',
      desc:'First looks with parents, siblings, or others.',
      hasTime:true,
      tip:'Stack additional first looks back-to-back in the same spot. Each takes about 10–15 minutes.'
    },
    {
      id:'letterExchange', title:'Letter / Gift Exchange',
      desc:'Will you exchange letters or gifts before the ceremony?',
      hasTime:true,
      tip:'Do this in good light by a window. Reading out loud lets us capture audio and reactions for the film.'
    },
    {
      id:'customVows', title:'Custom Vows',
      desc:'Are you exchanging written vows during the ceremony?',
      hasTime:false,
      tip:'Print vows on a clean card instead of reading from a phone — it looks better on camera.'
    },
    {
      id:'ceremonyRituals', title:'Ceremony Rituals',
      desc:'Unity candle, sand ceremony, handfasting, etc.',
      hasTime:false,
      tip:'Ask your officiant to pause briefly at each ritual so we can get close-ups from multiple angles.'
    },
    {
      id:'familyFormals', title:'Family Formals',
      desc:'Formal family photos after the ceremony.',
      hasTime:true,
      tip:'Start with the largest groups and work smaller, releasing people as you go. Keep the list to 15 groupings max.'
    },
    {
      id:'speechDetails', title:'Speeches & Toasts',
      desc:'Who is giving speeches and when?',
      hasTime:true,
      tip:'Remind speakers to hold notes rather than a phone and keep eye contact with you — that reads best on film.'
    },
    {
      id:'dances', title:'Dances',
      desc:'First dance, parent dances, and any other special dances.',
      hasTime:true,
      tip:'Tell your DJ when each dance starts so we are ready for the reactions — not scrambling when the song begins.',
      isDances: true
    },
    {
      id:'bouquetToss', title:'Bouquet Toss',
      desc:'Will there be a bouquet toss?',
      hasTime:true,
      tip:'Gather guests near the dance floor center and keep ceiling height in mind. We need about 60 seconds to get into position.'
    },
    {
      id:'garterToss', title:'Garter Toss',
      desc:'Will there be a garter toss?',
      hasTime:true,
      tip:'Talk through how playful or modest you want it so everyone is on the same page.'
    },
    {
      id:'cakeCutting', title:'Cake Cutting',
      desc:'When are you cutting the cake?',
      hasTime:true,
      tip:'Make sure the DJ gives us a 2-minute heads-up so we can get into position before you cut.'
    },
    {
      id:'surprises', title:'Surprises / Performances',
      desc:'Flash mobs, special performances, or other surprises.',
      hasTime:true,
      tip:'Loop us in on any surprises so we are in the right spot — we would rather pretend to be surprised than miss the shot.'
    },
    {
      id:'sendoff', title:'Grand Exit / Send-Off',
      desc:'Sparklers, petals, confetti, ribbon wands?',
      hasTime:true,
      tip:'Coordinate with your planner so all guests are lined up before you come out. A fully lined send-off photographs much better.'
    },
  ];

  // Dance state
  let tlDances = [
    { id:'td1', type:'First Dance', who:'', song:'' },
    { id:'td2', type:'Father / Daughter', who:'', song:'' },
    { id:'td3', type:'Mother / Son', who:'', song:'' },
  ];
  let tlDanceCounter = 10;

  function tlFormatTime(mins) {
    if (mins == null) return 'TBD';
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${m.toString().padStart(2,'0')} ${ampm}`;
  }

  function tlToMins(str) {
    if (!str) return null;
    const [h, m] = str.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }

  function tlMinsTo24(mins) {
    if (mins == null) return '';
    return String(Math.floor(mins/60)%24).padStart(2,'0') + ':' + String(mins%60).padStart(2,'0');
  }

  function buildTimeline() {
    const ceremonyMins    = tlToMins(document.getElementById('tlCeremonyTime').value) ?? 900;
    const receptionEnd    = tlToMins(document.getElementById('tlReceptionEnd').value) ?? 1380;
    const cocktailMins    = parseInt(document.getElementById('tlCocktail').value) || 60;
    const cocktailStartOv = tlToMins(document.getElementById('tlCocktailStart').value);
    const firstLook       = document.getElementById('tlFirstLook').value === 'yes';
    const attendCocktail  = document.getElementById('tlAttendCocktail').value === 'yes';
    const brideLoc        = document.getElementById('tlBrideLoc').value.trim();
    const groomLoc        = document.getElementById('tlGroomLoc').value.trim();
    const cerLoc          = document.getElementById('tlCerLocation').value.trim();
    const recLoc          = document.getElementById('tlRecLocation').value.trim();

    // Build default blocks
    const defaults = [];
    const add = (id, icon, label, start, end) => defaults.push({ id, icon, label, startMins: start, endMins: end });

    add('hairMakeup',   '💄', 'Hair & Makeup — Bride & Attendants' + (brideLoc ? ` · ${brideLoc}` : ''), ceremonyMins-480, ceremonyMins-150);
    add('rockwellArr',  '🎬', 'Rockwell Arrives — Detail & Getting Ready Shots' + (brideLoc ? ` · ${brideLoc}` : ''), ceremonyMins-195, ceremonyMins-150);
    add('groomReady',   '🤵', 'Groom & Groomsmen Getting Ready' + (groomLoc ? ` · ${groomLoc}` : ''), ceremonyMins-150, ceremonyMins-90);
    add('brideDress',   '👗', 'Bride Steps Into Dress', ceremonyMins-150, ceremonyMins-90);

    if (firstLook) {
      add('firstLookBlock','👁',  'First Look', ceremonyMins-90, ceremonyMins-60);
      add('couplePort',  '📸', 'Bride & Groom Portraits', ceremonyMins-60, ceremonyMins-15);
      add('partyPort',   '🥂', 'Wedding Party Photos', ceremonyMins-15, ceremonyMins-5);
    }

    add('guestsArrive', '🚗', 'Guests Begin Arriving' + (cerLoc ? ` · ${cerLoc}` : ''), ceremonyMins-30, ceremonyMins);
    add('ceremony',     '💒', 'Ceremony' + (cerLoc ? ` · ${cerLoc}` : ''), ceremonyMins, ceremonyMins+45);

    const postCer = ceremonyMins + 45;
    if (!firstLook) {
      add('familyPort',  '📸', 'Family Formals & Couple Portraits', postCer, postCer+45);
      add('partyPort2',  '🥂', 'Wedding Party Photos', postCer+45, postCer+75);
    }

    const afterPortraits = firstLook ? postCer : postCer + 75;
    const travelTime = (recLoc && recLoc !== cerLoc) ? 20 : 0;
    if (travelTime) add('travel', '🚗', 'Travel to Reception · ' + recLoc, afterPortraits, afterPortraits + travelTime);

    const cocktailStart = cocktailStartOv ?? (afterPortraits + travelTime);
    const cocktailEnd   = cocktailStart + cocktailMins;

    if (!firstLook && !attendCocktail) {
      add('cocktailPort', '📸', 'Portraits (during Cocktail Hour)', cocktailStart, cocktailStart+45);
      add('cocktail',     '🍾', 'Cocktail Hour — Guests' + (recLoc ? ` · ${recLoc}` : ''), cocktailStart, cocktailEnd);
      add('joinCocktail', '🥂', 'Couple Joins Cocktail Hour', cocktailStart+45, cocktailEnd);
    } else {
      add('cocktail',     '🍾', 'Cocktail Hour' + (recLoc ? ` · ${recLoc}` : ''), cocktailStart, cocktailEnd);
    }

    const recStart = cocktailEnd;
    add('grandEntrance','🎉', 'Grand Entrance & Reception' + (recLoc ? ` · ${recLoc}` : ''), recStart, recStart+20);
    add('dinner',       '🍽', 'Dinner Service', recStart+20, recStart+80);
    add('speeches',     '🎤', 'Toasts & Speeches', recStart+80, recStart+110);

    let danceStart = recStart + 110;
    tlDances.forEach(d => {
      const lbl = d.type + (d.who ? ` — ${d.who}` : '') + (d.song ? ` · "${d.song}"` : '');
      add('dance_'+d.id, '💃', lbl, danceStart, danceStart+8);
      danceStart += 8;
    });

    add('openDance',    '🎶', 'Open Dance Floor', danceStart, receptionEnd-15);
    add('grandExit',    '✨', 'Grand Exit / Send-Off', receptionEnd-15, receptionEnd);

    // Merge with existing edits — if user changed a time, keep it
    if (!tlBlocksInitialized) {
      tlBlocks = defaults;
      tlBlocksInitialized = true;
    } else {
      // Update labels/defaults for non-custom blocks, keep user-edited times
      const edited = {};
      tlBlocks.forEach(b => { edited[b.id] = { startMins: b.startMins, endMins: b.endMins }; });
      tlBlocks = defaults.map(d => ({
        ...d,
        startMins: edited[d.id]?.startMins ?? d.startMins,
        endMins:   edited[d.id]?.endMins   ?? d.endMins,
      }));
      // Re-add custom events
      tlCustomEvents.forEach(ce => {
        if (!tlBlocks.find(b => b.id === ce.id)) {
          tlBlocks.push({ id: ce.id, icon:'⭐', label: ce.label, startMins: ce.mins, endMins: ce.mins ? ce.mins+30 : null, custom: true });
        }
      });
    }

    tlBlocks.sort((a,b) => (a.startMins??9999) - (b.startMins??9999));

    renderTlBlocks();

    if (!document.getElementById('tlOptionalAccordion').children.length) tlRenderOptional();
  }

  function renderTlBlocks() {
    const out = document.getElementById('timelineOutput');
    out.innerHTML = '';

    // Summary bar
    const first = tlBlocks[0];
    const last  = tlBlocks[tlBlocks.length-1];
    const totalH = first && last ? (((last.endMins??last.startMins??0) - (first.startMins??0)) / 60).toFixed(1) : '—';
    const summaryBar = document.createElement('div');
    summaryBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;padding:18px 24px;background:var(--mid);border:1px solid rgba(201,168,76,0.25);margin-bottom:36px;';
    summaryBar.innerHTML = `
      <div>
        <p style="font-size:0.58rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--gold);margin-bottom:4px;">Coverage Window</p>
        <p style="font-family:'Cormorant Garamond',serif;font-size:1.4rem;font-weight:300;color:var(--white);">${tlFormatTime(first?.startMins)} – ${tlFormatTime(last?.endMins)}</p>
      </div>
      <div style="text-align:right;">
        <p style="font-size:0.58rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--gold);margin-bottom:4px;">Total Hours</p>
        <p style="font-family:'Cormorant Garamond',serif;font-size:1.4rem;font-weight:300;color:var(--white);">${totalH} hrs</p>
      </div>
    `;
    out.appendChild(summaryBar);

    tlBlocks.forEach((block, i) => {
      const isLast = i === tlBlocks.length - 1;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:0;';
      const s24 = tlMinsTo24(block.startMins);
      const e24 = tlMinsTo24(block.endMins);
      row.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;margin-right:18px;flex-shrink:0;">
          <div style="width:38px;height:38px;border-radius:50%;background:rgba(201,168,76,0.1);border:1px solid rgba(201,168,76,0.35);display:flex;align-items:center;justify-content:center;font-size:0.95rem;flex-shrink:0;">${block.icon}</div>
          ${!isLast ? `<div style="width:1px;flex:1;min-height:24px;background:linear-gradient(to bottom,rgba(201,168,76,0.3),rgba(255,255,255,0.03));margin:4px 0;"></div>` : ''}
        </div>
        <div style="flex:1;padding-bottom:${isLast?'0':'20px'};">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px;">
            <input type="time" data-bid="${block.id}" data-field="start" value="${s24}"
              style="background:transparent;border:none;border-bottom:1px solid rgba(201,168,76,0.3);color:var(--gold);font-family:'Montserrat',sans-serif;font-size:0.62rem;font-weight:600;outline:none;width:72px;padding:2px 0;cursor:pointer;"
              onchange="tlEditBlockTime('${block.id}','start',this.value)" />
            <span style="color:var(--muted);font-size:0.6rem;">–</span>
            <input type="time" data-bid="${block.id}" data-field="end" value="${e24}"
              style="background:transparent;border:none;border-bottom:1px solid rgba(201,168,76,0.3);color:var(--gold);font-family:'Montserrat',sans-serif;font-size:0.62rem;font-weight:600;outline:none;width:72px;padding:2px 0;cursor:pointer;"
              onchange="tlEditBlockTime('${block.id}','end',this.value)" />
            <input type="text" data-bid="${block.id}" data-field="label" value="${block.label.replace(/"/g,'&quot;')}"
              style="flex:1;min-width:160px;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,0.06);color:var(--white);font-family:'Cormorant Garamond',serif;font-size:1.25rem;font-weight:300;outline:none;padding:2px 0;cursor:text;"
              onchange="tlEditBlockLabel('${block.id}',this.value)" />
            ${block.custom ? `<button onclick="tlRemoveCustomBlock('${block.id}')" style="background:none;border:none;color:var(--muted);font-size:0.68rem;cursor:pointer;font-family:'Montserrat',sans-serif;letter-spacing:0.1em;flex-shrink:0;">✕</button>` : ''}
          </div>
        </div>
      `;
      out.appendChild(row);
    });
  }

  function tlEditBlockTime(id, field, val) {
    const block = tlBlocks.find(b => b.id === id);
    if (!block) return;
    const mins = tlToMins(val);
    if (field === 'start') block.startMins = mins;
    if (field === 'end')   block.endMins   = mins;
    // Re-sort and re-render
    tlBlocks.sort((a,b) => (a.startMins??9999) - (b.startMins??9999));
    renderTlBlocks();
  }

  function tlEditBlockLabel(id, val) {
    const block = tlBlocks.find(b => b.id === id);
    if (block) block.label = val;
  }

  function tlRemoveCustomBlock(id) {
    tlBlocks = tlBlocks.filter(b => b.id !== id);
    tlCustomEvents = tlCustomEvents.filter(e => e.id !== id);
    renderTlBlocks();
  }

  function tlAddCustomEvent() {
    const id = 'custom_' + (++tlCustomCounter);
    tlCustomEvents.push({ id, label:'Custom Event', mins: null });
    tlBlocks.push({ id, icon:'⭐', label:'Custom Event', startMins: null, endMins: null, custom: true });
    renderTlBlocks();
  }

  function tlRenderOptional() {
    const container = document.getElementById('tlOptionalAccordion');
    container.innerHTML = '';
    tlOptionalDefs.forEach(def => {
      const wrap = document.createElement('div');
      const danceRows = def.isDances ? `
        <div style="margin-bottom:14px;">
          <p style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.15em;color:var(--gold);margin-bottom:10px;">Dances</p>
          <div id="tlDancesWrap" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;"></div>
          <button onclick="tlAddDance()" class="tl-ghost-btn" style="font-size:0.65rem;padding:8px 16px;">+ Add Dance</button>
        </div>
      ` : '';
      wrap.innerHTML = `
        <div class="tl-accordion-header" onclick="tlToggleAccordion('tlOpt_${def.id}',this)">
          <div>
            <p style="font-size:0.85rem;font-weight:600;color:var(--cream);margin-bottom:2px;">${def.title}</p>
            <p style="font-size:0.72rem;color:var(--muted);">${def.desc}</p>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
            <span id="tlPill_${def.id}" class="tl-status-pill tl-pill-blank">Not set</span>
            <span style="color:var(--gold);font-size:0.8rem;transition:transform 0.3s;" id="tlChev_${def.id}">▾</span>
          </div>
        </div>
        <div class="tl-accordion-body" id="tlOpt_${def.id}">
          <div style="padding:20px 20px 12px;">
            <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:14px;font-size:0.8rem;color:var(--cream);align-items:center;">
              <span style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.15em;color:var(--gold);">Happening?</span>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="radio" name="opt_${def.id}" value="yes" onchange="tlUpdatePill('${def.id}','yes')"> Yes</label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="radio" name="opt_${def.id}" value="no" onchange="tlUpdatePill('${def.id}','no')"> No</label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="radio" name="opt_${def.id}" value="maybe" onchange="tlUpdatePill('${def.id}','maybe')"> Not sure</label>
            </div>
            ${def.hasTime ? `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
              <span style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.15em;color:var(--gold);white-space:nowrap;">Approx. Time</span>
              <input type="time" style="background:var(--black);border:1px solid rgba(201,168,76,0.2);color:var(--cream);font-family:'Montserrat',sans-serif;font-size:0.8rem;padding:8px 12px;outline:none;" />
            </div>` : ''}
            ${danceRows}
            <div style="margin-bottom:14px;">
              <p style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.15em;color:var(--gold);margin-bottom:8px;">Notes</p>
              <textarea rows="2" placeholder="Add any details here..." style="width:100%;background:var(--black);border:1px solid rgba(201,168,76,0.2);color:var(--cream);font-family:'Montserrat',sans-serif;font-size:0.8rem;padding:10px 14px;outline:none;resize:vertical;box-sizing:border-box;"></textarea>
            </div>
            <div class="tl-protip">💡 <strong>Pro tip:</strong> ${def.tip}</div>
          </div>
        </div>
      `;
      container.appendChild(wrap);
    });
    tlRenderDances();
  }

  function tlRenderDances() {
    const wrap = document.getElementById('tlDancesWrap');
    if (!wrap) return;
    wrap.innerHTML = '';
    tlDances.forEach(d => {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:center;';
      row.innerHTML = `
        <select class="tl-input" style="padding:8px 12px;" onchange="tlUpdateDance('${d.id}','type',this.value)">
          ${tlDanceTypes.map(t=>`<option ${t===d.type?'selected':''}>${t}</option>`).join('')}
        </select>
        <input type="text" class="tl-input" style="padding:8px 12px;" placeholder="Who (e.g. Dad: Robert)" value="${d.who}" oninput="tlUpdateDance('${d.id}','who',this.value)" />
        <input type="text" class="tl-input" style="padding:8px 12px;" placeholder="Song (optional)" value="${d.song}" oninput="tlUpdateDance('${d.id}','song',this.value)" />
        <button onclick="tlRemoveDance('${d.id}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;padding:6px;">✕</button>
      `;
      wrap.appendChild(row);
    });
  }

  function tlAddDance() {
    tlDances.push({ id:'td'+(tlDanceCounter++), type:'Other', who:'', song:'' });
    tlRenderDances();
    buildTimeline();
  }

  function tlUpdateDance(id, field, val) {
    const d = tlDances.find(x=>x.id===id);
    if (d) { d[field] = val; buildTimeline(); }
  }

  function tlRemoveDance(id) {
    tlDances = tlDances.filter(x=>x.id!==id);
    tlRenderDances();
    buildTimeline();
  }

  function tlToggleAccordion(id, header) {
    const body = document.getElementById(id);
    const chev = document.getElementById('tlChev_' + id.replace('tlOpt_',''));
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    if (chev) chev.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
  }

  function tlUpdatePill(id, value) {
    const pill = document.getElementById('tlPill_' + id);
    if (!pill) return;
    pill.className = 'tl-status-pill';
    if (value==='yes')   { pill.textContent='Yes';      pill.classList.add('tl-pill-yes'); }
    if (value==='no')    { pill.textContent='No';       pill.classList.add('tl-pill-no'); }
    if (value==='maybe') { pill.textContent='Not sure'; pill.classList.add('tl-pill-maybe'); }
  }

  buildTimeline();

    /* ── CLIENT PORTAL ── */
  const portalData = {
    'MARIAH-TROY-2024': {
      name: 'Mariah & Troy',
      date: 'Oglebay, WV · June 2024',
      delivered: true,
      links: [
        { label: 'Wedding Photos', icon: '📷', url: '', placeholder: true },
        { label: 'Highlight Film', icon: '🎬', url: 'https://youtu.be/_SIvkQ6wDwg', placeholder: false },
        { label: '1-Minute Preview', icon: '▶️', url: '', placeholder: true },
      ]
    },
    'JULIA-SAM-2024': {
      name: 'Julia & Sam',
      date: 'Pittsburgh, PA · September 2024',
      delivered: true,
      links: [
        { label: 'Wedding Photos', icon: '📷', url: '', placeholder: true },
        { label: 'Highlight Film', icon: '🎬', url: 'https://youtu.be/GpSEaP6PJxA', placeholder: false },
        { label: '1-Minute Preview', icon: '▶️', url: '', placeholder: true },
      ]
    },
  };

  function accessPortal() {
    const code = document.getElementById('portalCode').value.trim().toUpperCase();
    const result = document.getElementById('portalResult');
    const pending = document.getElementById('portalPending');
    const notFound = document.getElementById('portalNotFound');
    result.style.display = 'none';
    pending.style.display = 'none';
    notFound.style.display = 'none';

    if (portalData[code]) {
      const c = portalData[code];
      if (!c.delivered) { pending.style.display = 'block'; return; }
      document.getElementById('portalCoupleName').textContent = c.name;
      document.getElementById('portalCoupleDate').textContent = c.date;
      const linksEl = document.getElementById('portalLinks');
      linksEl.innerHTML = '';
      c.links.forEach(link => {
        if (link.placeholder) {
          linksEl.innerHTML += `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--warm-dark);border:1px solid rgba(255,255,255,0.04);">
              <span style="font-size:0.82rem;color:var(--muted);">${link.icon}&nbsp;&nbsp;${link.label}</span>
              <span style="font-size:0.62rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);">Coming Soon</span>
            </div>`;
        } else {
          linksEl.innerHTML += `
            <a href="${link.url}" target="_blank"
              style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--warm-dark);border:1px solid rgba(201,168,76,0.2);text-decoration:none;"
              onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='rgba(201,168,76,0.2)'">
              <span style="font-size:0.82rem;color:var(--cream);">${link.icon}&nbsp;&nbsp;${link.label}</span>
              <span style="font-size:0.62rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);">View →</span>
            </a>`;
        }
      });
      result.style.display = 'block';
    } else {
      notFound.style.display = 'block';
    }
  }

  document.getElementById('portalCode').addEventListener('keydown', e => {
    if (e.key === 'Enter') accessPortal();
  });

  /* ── FAQ TOGGLE ── */
  function toggleFaq(btn) {
    const item = btn.parentElement;
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  }

  /* ── NAV SCROLL ── */
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 60);
  });

  /* ── MOBILE MENU ── */
  function toggleMenu() {
    document.getElementById('mobileMenu').classList.toggle('open');
  }

  /* ── PREVIEWS — Cloudinary auto-load ── */
  const previewsTrack = document.getElementById('previewsTrack');

  /* ── REELS — R2 hardcoded ── */
  const R2 = 'https://pub-c5287f1b50564f8680b9e8721ae173aa.r2.dev';
  const reelsData = [
    { name: 'Corry & Caitlyn', file: 'Corry and Cat Reel.mp4' },
    { name: 'Julia & Sam',     file: 'Julia and Sam Short.mp4' },
    { name: 'Matt & Kayla',    file: 'Matt and Kayla-.mp4' },
    { name: 'Paige & Frank',   file: 'Pagie and Frank Short.mp4' },
    { name: 'Preview Reel',    file: 'Preview wedding Reel.mp4' },
    { name: 'Zach & Bailey',   file: 'Zach & Bailey Reel.mp4' },
  ];

  const buildReelUrl = (reel) => `${R2}/Reels/${encodeURIComponent(reel.file)}`;

  // Original film-modal HTML stashed once on page load so we can put it
  // back when the reel modal closes (otherwise openModal() breaks).
  const FILM_MODAL_HTML = document.getElementById('videoModal').innerHTML;

  function openReelModal(startIndex) {
    const modal = document.getElementById('videoModal');
    let escHandler = null;

    function closeReelModal() {
      const v = document.getElementById('reelVideo');
      if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
      // Restore the original film-modal markup so the YouTube/Vimeo iframe
      // path (openModal) still works after using the reel viewer.
      modal.innerHTML = FILM_MODAL_HTML;
      modal.classList.remove('open');
      document.body.style.overflow = '';
      if (escHandler) document.removeEventListener('keydown', escHandler);
    }

    // Build modal structure
    modal.innerHTML = `
      <button class="reel-close" aria-label="Close video">&times;</button>
      <div id="reelInner">
        <video id="reelVideo" controls autoplay playsinline preload="auto"></video>
      </div>
      <p class="reel-current-name" id="reelCurrentName"></p>
      <div class="reel-thumbs" id="reelThumbs"></div>
    `;

    const videoEl = document.getElementById('reelVideo');
    const thumbsEl = document.getElementById('reelThumbs');
    const nameEl = document.getElementById('reelCurrentName');

    function loadReel(i) {
      const reel = reelsData[i];
      videoEl.src = buildReelUrl(reel);
      videoEl.load();             // force the buffering pipeline to start
      videoEl.play().catch(() => {}); // play if browser allows
      nameEl.textContent = reel.name;
      thumbsEl.querySelectorAll('.reel-thumb').forEach((t, idx) => {
        t.classList.toggle('active', idx === i);
      });
      const active = thumbsEl.querySelector('.reel-thumb.active');
      if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }

    reelsData.forEach((reel, i) => {
      const url = buildReelUrl(reel);
      const t = document.createElement('button');
      t.className = 'reel-thumb' + (i === startIndex ? ' active' : '');
      t.setAttribute('aria-label', `Play ${reel.name}`);
      t.innerHTML = `
        <video src="${url}#t=2" muted playsinline preload="metadata"></video>
        <span class="reel-thumb-name">${reel.name}</span>
      `;
      t.addEventListener('click', (e) => { e.stopPropagation(); loadReel(i); });
      thumbsEl.appendChild(t);
    });

    modal.querySelector('.reel-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeReelModal();
    });

    modal.addEventListener('click', (e) => {
      // close when clicking the dark backdrop (not video/thumbs/close-btn)
      if (e.target === modal) closeReelModal();
    });

    escHandler = (e) => { if (e.key === 'Escape') closeReelModal(); };
    document.addEventListener('keydown', escHandler);

    // Open the modal FIRST so the video element is visible/laid-out before
    // play() is called.  iOS Safari rejects play() on display:none videos.
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => { loadReel(startIndex); });
  }

  reelsData.forEach((reel, idx) => {
    const videoUrl = buildReelUrl(reel);

    const card = document.createElement('div');
    card.className = 'preview-card';
    card.innerHTML = `
      <video class="preview-thumb" src="${videoUrl}#t=2" muted playsinline preload="metadata" style="object-fit:cover;width:100%;aspect-ratio:9/16;display:block;"></video>
      <div class="preview-overlay">
        <div class="preview-play">
          <svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>
        </div>
        <p class="preview-names">${reel.name}</p>
      </div>
    `;
    card.addEventListener('click', () => openReelModal(idx));
    previewsTrack.appendChild(card);
  });

  // Drag to scroll
  const trackWrap = document.querySelector('.previews-track-wrap');
  let isDown = false, startX, scrollLeft;
  trackWrap.addEventListener('mousedown', e => {
    isDown = true; startX = e.pageX - trackWrap.offsetLeft; scrollLeft = trackWrap.scrollLeft;
  });
  trackWrap.addEventListener('mouseleave', () => isDown = false);
  trackWrap.addEventListener('mouseup', () => isDown = false);
  trackWrap.addEventListener('mousemove', e => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - trackWrap.offsetLeft;
    trackWrap.scrollLeft = scrollLeft - (x - startX) * 1.5;
  });

  /* ── FILM DATA ── */
  // Replace videoUrl with your Vimeo/YouTube embed URLs
  // Replace thumb with your thumbnail image URLs
  const films = [
    { names: 'Mariah & Troy',      location: 'Oglebay, WV',    thumb: 'https://img.youtube.com/vi/_SIvkQ6wDwg/maxresdefault.jpg', videoUrl: 'https://www.youtube.com/embed/_SIvkQ6wDwg?rel=0&modestbranding=1&showinfo=0' },
    { names: 'Julia & Sam',        location: 'Pittsburgh, PA', thumb: 'https://img.youtube.com/vi/GpSEaP6PJxA/maxresdefault.jpg', videoUrl: 'https://www.youtube.com/embed/GpSEaP6PJxA?rel=0&modestbranding=1&showinfo=0' },
    { names: 'Antonelle & Zack',   location: 'Kingsman, OH',   thumb: 'https://img.youtube.com/vi/J3gghLub5RY/hqdefault.jpg', videoUrl: 'https://www.youtube.com/embed/J3gghLub5RY?rel=0&modestbranding=1&showinfo=0' },
    { names: 'Morgan & Olivia',    location: 'Pittsburgh, PA', thumb: 'https://img.youtube.com/vi/GNssG3TAJXA/maxresdefault.jpg', videoUrl: 'https://www.youtube.com/embed/GNssG3TAJXA?rel=0&modestbranding=1&showinfo=0' },
    { names: 'Eleanor & Landon',   location: 'Oglebay, WV',    thumb: '', videoUrl: '' },
    { names: 'Paige & Frank',      location: 'Indiana, PA',    thumb: '', videoUrl: '' },
    { names: 'Sean & Lauren',      location: 'Pittsburgh, PA', thumb: '', videoUrl: '' },
    { names: 'Monica & Jonathan',  location: 'Pittsburgh, PA', thumb: '', videoUrl: '' },
    { names: 'Kelly & Josh',       location: 'Butler, PA',     thumb: '', videoUrl: '' },
  ];

  const filmsGrid = document.getElementById('filmsGrid');
  films.slice(0, 3).forEach((film, i) => {
    const card = document.createElement('div');
    card.className = 'film-card';
    card.innerHTML = `
      ${film.thumb
        ? `<img class="film-card-thumb" src="${film.thumb}" alt="${film.names} wedding film — Pittsburgh wedding videographer Rockwell Film &amp; Photo" loading="lazy" />`
        : `<div class="thumb-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" stroke-width="0.8">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
           </div>`
      }
      <div class="film-card-overlay">
        <div class="film-play">
          <svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>
        </div>
        <p class="film-location">${film.location}</p>
        <p class="film-names">${film.names}</p>
      </div>
    `;
    if (film.videoUrl) {
      card.addEventListener('click', () => openModal(film.videoUrl));
    }
    filmsGrid.appendChild(card);
  });

  /* ── PHOTO DATA — R2 ── */
  const photoGrid = document.getElementById('photoGrid');
  const photoFiles = [
    'photos for website_343_gr5xfd.webp',
    'photos for website_6Z6A0236_f1lccr.webp',
    'photos for website_Cynthia_m1ap3d.webp',
    'photos for website_DSC05236_a2ujyy.webp',
    'photos for website_DSC05315_d51xwl.webp',
    'photos for website_DSC06304_rtdflj.webp',
    'photos for website_Screenshot_2025-10-13_at_1.14.07_AM_r5abks.webp',
    'photos for website_Screenshot_2026-03-07_at_11.57.29_AM_gigerq.webp',
    'photos for website_Screenshot_2026-03-07_at_11.57.45_AM_i6ntby.webp',
    'photos for website_Screenshot_2026-03-07_at_11.57.58_AM_rot0na.webp',
    'photos for website_Screenshot_2026-03-07_at_11.58.17_AM_fclqwh.webp',
    'photos for website_Screenshot_2026-03-07_at_11.58.31_AM_yeb7nq.webp',
    'photos for website_Screenshot_2026-03-07_at_12.03.20_PM_k6xoxr.webp',
    'Chruch_Group.webp',
    'DIPDark.webp',
  ];
  photoFiles.forEach((file, i) => {
    const item = document.createElement('div');
    item.className = 'photo-item';
    const url = `https://pub-c5287f1b50564f8680b9e8721ae173aa.r2.dev/photos%20for%20website/${encodeURIComponent(file)}`;
    // Derive a short SEO-friendly alt from the filename (strips extension + camelCase split)
    const baseName = file.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    const alt = `${baseName} — wedding photography by Rockwell Film & Photo, Pittsburgh PA wedding photographer`;
    item.innerHTML = `<img src="${url}" alt="${alt}" loading="lazy" />`;
    photoGrid.appendChild(item);
  });

  /* ── VIDEO MODAL ── */
  function openModal(url) {
    // Add autoplay=1 so YouTube starts immediately on open
    const autoUrl = url.includes('?') ? url + '&autoplay=1' : url + '?autoplay=1';
    document.getElementById('modalIframe').src = autoUrl;
    document.getElementById('videoModal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    document.getElementById('modalIframe').src = '';
    document.getElementById('videoModal').classList.remove('open');
    document.body.style.overflow = '';
  }
  document.getElementById('videoModal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });

  /* ── FORM ── */
  document.getElementById('contactForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('.form-submit');
    btn.textContent = 'Sending…';
    btn.disabled = true;
    try {
      const res = await fetch('https://formspree.io/f/mkoqgjzb', {
        method: 'POST',
        body: new FormData(form),
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        window.location.href = 'https://rockwellfilmandphoto.com/thank-you';
      } else {
        btn.textContent = 'Send Inquiry';
        btn.disabled = false;
        alert("Something went wrong. Please try again.");
      }
    } catch(err) {
      btn.textContent = 'Send Inquiry';
      btn.disabled = false;
      alert("Something went wrong. Please try again.");
    }
  });

  /* ── PHOTO TOGGLE (mobile) ── */
  function togglePhotos() {
    const grid = document.getElementById('photoGrid');
    const btn = document.getElementById('photoToggleText');
    const isCollapsed = grid.dataset.collapsed === 'true';
    if (isCollapsed) {
      grid.style.maxHeight = '';
      grid.dataset.collapsed = 'false';
      btn.textContent = 'Show Fewer Photos';
    } else {
      grid.style.maxHeight = '800px';
      grid.style.overflow = 'hidden';
      grid.dataset.collapsed = 'true';
      btn.textContent = 'Show All Photos';
    }
  }

  function initPhotoToggle() {
    if (window.innerWidth > 768) return;
    const grid = document.getElementById('photoGrid');
    const wrap = document.getElementById('photoToggleBtn');
    if (!grid || !wrap) return;
    grid.style.maxHeight = '800px';
    grid.style.overflow = 'hidden';
    grid.dataset.collapsed = 'true';
    wrap.style.display = 'block';
  }

  /* ── SCROLL REVEAL ── */
  setTimeout(() => {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(el => {
        if (el.isIntersecting) {
          el.target.style.opacity = "1";
          el.target.style.transform = "translateY(0)";
          revealObserver.unobserve(el.target);
        }
      });
    }, { threshold: 0.05, rootMargin: "0px 0px -30px 0px" });

    document.querySelectorAll(".pricing-card, .section-title,.section-body, .film-card, .testi-card, .process-step, .photo-item, .pricing-card, .about-inner, .stat-item").forEach(el => {
      el.style.opacity = "0";
      el.style.transform = "translateY(24px)";
      el.style.transition = "opacity 0.7s ease, transform 0.7s ease";
      revealObserver.observe(el);
    });
  }, 100);

  // ── PROMO BANNER ──
  function updateNavForBanner() {
    const banner = document.getElementById('promoBanner');
    const nav = document.getElementById('navbar');
    const mobileMenu = document.getElementById('mobileMenu');
    if (banner && banner.style.display !== 'none') {
      const h = banner.offsetHeight;
      nav.style.top = h + 'px';
      mobileMenu.style.paddingTop = (h + 60) + 'px';
    } else {
      nav.style.top = '0';
      mobileMenu.style.paddingTop = '';
    }
  }

  function closeBanner() {
    const banner = document.getElementById('promoBanner');
    banner.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    banner.style.opacity = '0';
    banner.style.transform = 'translateY(-100%)';
        setTimeout(() => { banner.style.display = 'none'; updateNavForBanner(); }, 400);
  }

  /* ── CLEAN URLs — rewrite /#section to /section in address bar ── */
  (function() {
    // On page load, if URL is /section, scroll to #section
    const path = window.location.pathname.replace(/^\//, '');
    const validSections = ['home','films','photos','pricing','timeline','about','faq','portal','contact','previews','process','testimonials','letter','stats','memory-wall'];
    
    // Helper: scroll to element with nav offset, waiting for layout to settle
    function scrollToSection(el) {
      if (!el) return;
      // Wait two animation frames so any layout shifts (lazy images, fonts) settle
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const navHeight = 88;
          const top = el.getBoundingClientRect().top + window.pageYOffset - navHeight;
          window.scrollTo({ top, behavior: 'smooth' });
        });
      });
    }
    
    if (path && validSections.includes(path)) {
      const el = document.getElementById(path);
      if (el) setTimeout(() => scrollToSection(el), 100);
    }

    // While a nav-click is scrolling toward a section, ignore observer updates
    // so intermediate sections don't overwrite the target URL
    let navLockId = null;
    let navLockTimer = null;

    // On scroll, update the URL to /section (no hash)
    const sections = document.querySelectorAll('section[id], div[id]');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          if (id && validSections.includes(id)) {
            if (navLockId && id !== navLockId) return;
            window.history.replaceState(null, '', '/' + id);
          }
        }
      });
    }, { threshold: 0.4 });
    sections.forEach(s => { if (validSections.includes(s.id)) observer.observe(s); });

    // Override all anchor clicks to use clean URLs
    document.addEventListener('click', function(e) {
      const a = e.target.closest('a[href^="#"]');
      if (a) {
        const id = a.getAttribute('href').replace('#', '');
        if (validSections.includes(id)) {
          e.preventDefault();
          const el = document.getElementById(id);
          navLockId = id;
          clearTimeout(navLockTimer);
          navLockTimer = setTimeout(() => { navLockId = null; }, 1200);
          scrollToSection(el);
          window.history.pushState(null, '', '/' + id);
        }
      }
    });
  })();

  updateNavForBanner();
  window.addEventListener('resize', updateNavForBanner);
