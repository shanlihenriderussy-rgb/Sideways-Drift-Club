// ===== Atelier : voitures, carrosserie, peinture, roues, performances, réglages =====
// Toute pièce non possédée se prévisualise d'un toucher ; l'achat se confirme dans la barre du bas.
// api : { profile, save(), preview(kind, cfg), setView(tab), close(), sound, toast(text, cls) }
function createShop(api) {
  const $ = (id) => document.getElementById(id);
  const E = Economy;
  const TABS = [['car', 'Voiture'], ['body', 'Carrosserie'], ['paint', 'Peinture'], ['wheels', 'Roues'], ['perf', 'Perfs'], ['tune', 'Réglages']];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  const SW = { paint: E.PAINTS, accent: E.PAINTS, rim: E.RIMS, smoke: E.SMOKES, neon: E.NEONS };
  let tab = 'car', kind = null, pending = null, draft = null;

  const P = () => api.profile;
  const owned = () => P().cars[kind] || null;
  const base = () => owned() || E.defaultCar(kind);
  function refresh() {
    draft = clone(base());
    if (pending && pending.key) draft[pending.key] = pending.id;
    api.preview(kind, draft);
    render();
  }
  const fmt = E.fmt;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function statBars(st, up) {
    const row = (lbl, k) => {
      const a = st[k] / 5 * 100, b = up ? Math.max(0, (up[k] - st[k]) / 5 * 100) : 0;
      return `<div class="stat"><span>${lbl}</span><span class="sbar"><i style="width:${a.toFixed(0)}%"></i><i class="up" style="width:${b.toFixed(0)}%"></i></span></div>`;
    };
    return `<div class="stats">${row('Puissance', 'power')}${row('Agilité', 'grip')}${row('Angle', 'angle')}</div>`;
  }
  function chip(key, id, name, price, cfg) {
    const has = cfg ? E.owns(cfg, key, id) : price === 0;
    const on = draft[key] === id;
    const equipped = cfg && cfg[key] === id;
    const list = SW[key];
    const sw = list ? (list.find((x) => x.id === id) || null) : null;
    const dot = sw ? `<span class="dot" style="background:${hex(sw.hex)}"></span>` : key === 'neon' || key === 'accent' ? '<span class="dot none"></span>' : '';
    const tag = equipped ? '<small class="own">Équipé</small>' : has ? '<small class="own">Possédé</small>' : `<small class="price">${fmt(price)}</small>`;
    return `<button class="chip${sw || key === 'neon' || key === 'accent' ? ' swatch' : ''}" data-key="${key}" data-id="${id}" aria-pressed="${on}" title="${esc(name)}" aria-label="${esc(name)}${has ? '' : ', ' + fmt(price)}">${dot}<b>${esc(name)}</b>${tag}</button>`;
  }

  function render() {
    const cfg = owned();
    $('garTitle').textContent = CAR_SPECS[kind].name;
    $('garWallet').textContent = fmt(P().money);
    for (const b of $('shopTabs').children) { const on = b.dataset.tab === tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
    let h = '';
    if (tab === 'car') {
      for (const [k, s] of Object.entries(CAR_SPECS)) {
        const mine = P().cars[k];
        const st = E.carStats(s, (mine || E.defaultCar(k)).perf);
        const tag = k === P().current ? '<small class="own">Au volant</small>' : mine ? '<small class="own">Au garage</small>' : `<small class="price">${fmt(E.CAR_PRICES[k])}</small>`;
        h += `<button class="carpick" data-car="${k}" aria-pressed="${k === kind}"><span class="cp-head"><b>${s.name}</b>${tag}</span><small>${s.tag}</small>${statBars(st)}</button>`;
      }
    } else if (!cfg) {
      h = `<p class="sub">Achète la ${CAR_SPECS[kind].name} pour la modifier. Tu peux déjà la voir sous tous les angles.</p>`;
    } else if (tab === 'perf') {
      const now = E.carStats(CAR_SPECS[kind], cfg.perf);
      let up = null;
      if (pending && pending.perf) { const p2 = clone(cfg.perf); p2[pending.perf]++; up = E.carStats(CAR_SPECS[kind], p2); }
      h += statBars(now, up);
      for (const pf of E.PERF) {
        const lvl = cfg.perf[pf.key], price = E.perfPrice(cfg, pf.key);
        const pips = [1, 2, 3].map((i) => `<i class="${i <= lvl ? 'on' : ''}${pending && pending.perf === pf.key && i === lvl + 1 ? ' next' : ''}"></i>`).join('');
        h += `<div class="perf-row"><div><b>${pf.label}</b><small>${pf.desc}</small><span class="pips" aria-label="Niveau ${lvl} sur 3">${pips}</span></div>`
          + (price == null ? '<span class="maxed">MAX</span>' : `<button class="chip" data-perf="${pf.key}" aria-pressed="${!!(pending && pending.perf === pf.key)}"><b>Niveau ${lvl + 1}</b><small class="price">${fmt(price)}</small></button>`) + '</div>';
      }
    } else if (tab === 'tune') {
      for (const t of E.TUNE) {
        const v = Math.round(cfg.tune[t.key] * 100);
        h += `<label class="rng tune" for="tn-${t.key}"><span>${t.label} <output>${v} %</output></span><input type="range" id="tn-${t.key}" data-tune="${t.key}" min="0" max="100" step="1" value="${v}"><span class="ends"><small>${t.lo}</small><small>${t.hi}</small></span></label>`;
      }
      h += '<p class="sub">Réglages gratuits et réversibles : ils changent l’allure de la voiture, pas sa tenue de route.</p>';
    } else {
      for (const e of E.SHOP.filter((x) => x.tab === tab)) {
        h += `<div class="shop-row"><div class="label">${e.label}</div><div class="chips">${e.items.map(([id, name, price]) => chip(e.key, id, name, price, cfg)).join('')}</div></div>`;
        if (e.key === 'livery') h += `<div class="shop-row"><div class="label">Numéro</div><div class="stepper"><button data-num="-1" aria-label="Numéro précédent">−</button><output>${cfg.number}</output><button data-num="1" aria-label="Numéro suivant">+</button></div></div>`;
      }
    }
    $('shopBody').innerHTML = h;
    renderFoot();
  }

  function pendingInfo() {
    if (!pending) return null;
    if (pending.car) return { label: CAR_SPECS[pending.car].name, price: E.CAR_PRICES[pending.car] };
    const cfg = owned();
    if (pending.perf) { const pf = E.PERF.find((x) => x.key === pending.perf); return { label: `${pf.label} niv. ${cfg.perf[pf.key] + 1}`, price: E.perfPrice(cfg, pf.key) }; }
    const e = E.SHOP.find((x) => x.key === pending.key);
    return { label: e.items.find((i) => i[0] === pending.id)[1], price: E.itemPrice(pending.key, pending.id) };
  }
  function renderFoot() {
    const info = pendingInfo();
    const buy = $('shopBuy'), cancel = $('shopCancel'), msg = $('shopMsg');
    buy.hidden = cancel.hidden = !info;
    $('shopDone').hidden = !!info;
    if (info) {
      const can = P().money >= info.price;
      buy.disabled = !can;
      buy.firstElementChild.textContent = `Acheter · ${fmt(info.price)}`;
      msg.textContent = can ? info.label : `${info.label} : il manque ${fmt(info.price - P().money)}`;
      msg.classList.toggle('warn', !can);
    } else { msg.textContent = ''; msg.classList.remove('warn'); }
  }

  function setPending(p) { pending = p; refresh(); api.sound.ui(); }
  function equipOwned(key, id) {
    const r = E.equip(P(), kind, key, id);
    if (!r.ok) return;
    pending = null; api.save(); refresh(); api.sound.ui();
  }
  function buy() {
    const info = pendingInfo();
    if (!info) return;
    let r;
    if (pending.car) r = E.buyCar(P(), pending.car);
    else if (pending.perf) r = E.buyPerf(P(), kind, pending.perf);
    else r = E.buyItem(P(), kind, pending.key, pending.id);
    if (!r.ok) { api.sound.lost(); renderFoot(); return; }
    api.save(); api.sound.cash();
    api.toast(`${info.label} : acheté · −${fmt(info.price)}`, 'buy');
    for (const c of r.challenges || []) api.toast(`Défi réussi : ${c.label} · +${fmt(c.reward)}`, 'chal');
    const wasCar = !!pending.car;
    pending = null;
    if (wasCar) api.carChanged();
    refresh();
  }

  // ---------- évènements ----------
  $('shopTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    tab = b.dataset.tab; if (pending && !pending.car) pending = null;
    api.setView(tab); refresh(); api.sound.ui();
  });
  $('shopTabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = TABS.findIndex((t) => t[0] === tab), n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0];
    $('shopTabs').querySelector(`[data-tab="${n}"]`).click(); $('shopTabs').querySelector(`[data-tab="${n}"]`).focus();
  });
  $('shopBody').addEventListener('click', (e) => {
    const car = e.target.closest('[data-car]');
    if (car) {
      kind = car.dataset.car;
      if (P().cars[kind]) { if (P().current !== kind) { P().current = kind; api.save(); api.carChanged(); } pending = null; refresh(); api.sound.ui(); }
      else setPending({ car: kind });
      return;
    }
    const num = e.target.closest('[data-num]');
    if (num && owned()) { const c = owned(); c.number = ((c.number - 1 + Number(num.dataset.num) + 99) % 99) + 1; api.save(); refresh(); api.sound.ui(); return; }
    const pf = e.target.closest('[data-perf]');
    if (pf) { setPending(pending && pending.perf === pf.dataset.perf ? null : { perf: pf.dataset.perf }); return; }
    const c = e.target.closest('[data-key]');
    if (!c || !owned()) return;
    const key = c.dataset.key, id = c.dataset.id;
    if (E.owns(owned(), key, id)) equipOwned(key, id); else setPending({ key, id });
  });
  let tuneRaf = 0;
  $('shopBody').addEventListener('input', (e) => {
    const t = e.target.dataset && e.target.dataset.tune;
    if (!t || !owned()) return;
    E.setTune(P(), kind, t, e.target.value / 100);
    e.target.parentElement.querySelector('output').textContent = e.target.value + ' %';
    if (!tuneRaf) tuneRaf = requestAnimationFrame(() => { tuneRaf = 0; draft = clone(base()); api.preview(kind, draft); });
  });
  $('shopBody').addEventListener('change', (e) => { if (e.target.dataset && e.target.dataset.tune) api.save(); });
  $('shopBuy').addEventListener('click', buy);
  $('shopCancel').addEventListener('click', () => setPending(null));
  $('shopDone').addEventListener('click', () => api.close());

  return {
    open() { kind = P().current; pending = null; tab = 'car'; api.setView(tab); refresh(); },
    leave() { pending = null; kind = null; draft = null; },
    get tab() { return tab; },
    refreshWallet() { $('garWallet').textContent = fmt(P().money); renderFoot(); },
  };
}
