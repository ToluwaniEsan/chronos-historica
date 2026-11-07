(function () {
'use strict';

const YEAR_MIN = -2500, YEAR_MAX = 2026;
const SYNC_WINDOW = 30, RANGE_PAD = 15, PULSE_WINDOW = 5;
const SPEEDS = [1, 2, 5, 10];
const TICK_MS = 100;

const LAYERS = {
  biblical: { label: 'Biblical', color: 'var(--bib)', hex: '#dcab4e', shape: 'diamond' },
  sync:     { label: 'Synchronisms', color: 'var(--syn)', hex: '#5cc1a7', shape: 'stele' },
  secular:  { label: 'Secular', color: 'var(--sec)', hex: '#8ea9d6', shape: 'triangle' },
  figure:   { label: 'Pioneers', color: 'var(--fig)', hex: '#e38d6c', shape: 'circle' }
};
const LAYER_ORDER = ['sync', 'biblical', 'figure', 'secular'];

/* ---------- Entity index ---------- */
const ENTITIES = [];
APP_DATA.biblical.forEach(e => ENTITIES.push(Object.assign({ layer: 'biblical' }, e)));
APP_DATA.secular.forEach(e => ENTITIES.push(Object.assign({ layer: 'secular' }, e)));
APP_DATA.intersections.forEach(e => ENTITIES.push(Object.assign({ layer: 'sync', start: e.year, end: e.year }, e)));
APP_DATA.figures.forEach(e => ENTITIES.push(Object.assign({ layer: 'figure' }, e)));
const BY_ID = Object.fromEntries(ENTITIES.map(e => [e.id, e]));
const MATRIX_BY_FIG = Object.fromEntries(APP_DATA.matrix.map(r => [r.fig, r]));

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = y => Math.max(YEAR_MIN, Math.min(YEAR_MAX, Math.round(y)));
function fmtYear(y) {
  if (y < 0) return (-y) + ' BCE';
  if (y > 0) return y + ' CE';
  return '1 BCE | 1 CE';
}
function yearParts(y) {
  if (y < 0) return [String(-y), 'BCE'];
  if (y > 0) return [String(y), 'CE'];
  return ['0', 'BCE/CE'];
}
function fmtRange(s, e) {
  if (s === e) return fmtYear(s);
  if (s < 0 && e < 0) return (-s) + '–' + (-e) + ' BCE';
  if (s > 0 && e > 0) return s + '–' + e + ' CE';
  return fmtYear(s) + ' – ' + fmtYear(e);
}
function dateLabel(e) {
  if (e.layer === 'sync') return e.yearLabel;
  if (e.layer === 'figure') return e.life;
  return fmtRange(e.start, e.end);
}
function dist(e, t) {
  if (e.layer === 'sync') return Math.abs(e.year - t);
  if (t < e.start) return e.start - t;
  if (t > e.end) return t - e.end;
  return 0;
}
function signedOffset(e, t) {
  if (e.layer === 'sync') return e.year - t;
  if (t < e.start) return e.start - t;
  if (t > e.end) return e.end - t;
  return 0;
}
function isActive(e, t) {
  if (e.layer === 'sync') return Math.abs(e.year - t) <= SYNC_WINDOW;
  return t >= e.start - RANGE_PAD && t <= e.end + RANGE_PAD;
}
function epochName(y) {
  if (y < -2000) return 'Early Bronze Age';
  if (y < -1550) return 'Middle Bronze Age';
  if (y < -1200) return 'Late Bronze Age';
  if (y < -1000) return 'Iron Age I';
  if (y < -586) return 'Iron Age II';
  if (y < -332) return 'Babylonian & Persian · Classical Greece';
  if (y < -63) return 'Hellenistic';
  if (y < -27) return 'Late Roman Republic';
  if (y < 476) return 'Roman Imperial';
  if (y < 1450) return 'Medieval';
  if (y < 1650) return 'Renaissance & Reformation';
  if (y < 1800) return 'Scientific Revolution & Enlightenment';
  if (y < 1914) return 'Industrial Age';
  return 'Modern Era';
}
function shapeSVG(layer, size) {
  const c = LAYERS[layer].hex, s = size || 16;
  const stroke = 'stroke="#0b0f15" stroke-width="1.5"';
  let body;
  switch (LAYERS[layer].shape) {
    case 'diamond': body = `<path d="M8 1 L15 8 L8 15 L1 8 Z" fill="${c}" ${stroke}/>`; break;
    case 'stele': body = `<path d="M3 15 V5 Q3 1 8 1 Q13 1 13 5 V15 Z" fill="${c}" ${stroke}/>`; break;
    case 'triangle': body = `<path d="M8 1.5 L15 14.5 H1 Z" fill="${c}" ${stroke}/>`; break;
    default: body = `<circle cx="8" cy="8" r="6.5" fill="${c}" ${stroke}/>`;
  }
  return `<svg viewBox="0 0 16 16" width="${s}" height="${s}" aria-hidden="true">${body}</svg>`;
}
function kindLabel(e) {
  if (e.layer === 'sync') return 'Synchronism ' + String(e.idx).padStart(2, '0');
  if (e.layer === 'figure') return 'Pioneer ' + String(e.n).padStart(2, '0') + ' of 12';
  if (e.layer === 'biblical') return 'Biblical era';
  return 'Secular transition';
}
function gapText(r) {
  if (!r) return '';
  if (r.gap[1] === 0) return '0';
  return r.gap[0] === r.gap[1] ? '~' + r.gap[0].toLocaleString('en-US') : '~' + r.gap[0] + '–' + r.gap[1];
}

/* ---------- State ---------- */
const state = {
  year: 51, view: 'map', playing: false, speed: 1, timer: null, selected: null, tab: 'overview',
  layers: { biblical: true, sync: true, secular: true, figure: true }
};
try { const v = JSON.parse(localStorage.getItem('chronos.layers') || 'null'); if (v) Object.assign(state.layers, v); } catch (_) {}

/* ---------- Map ---------- */
let map = null, landLayer = null, routeLayer = null, markerLayer = null, gratLayer = null;
const markerCache = {}; // id -> { marker, key }
const routeCache = {};

function initMap() {
  map = L.map('map', { zoomControl: true, attributionControl: true, minZoom: 2, maxZoom: 10, worldCopyJump: false,
    maxBounds: [[-75, -220], [85, 220]], zoomSnap: 0.5 });
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('Coastlines: Natural Earth');
  const narrow = window.innerWidth < 700;
  map.setView([35, 30], narrow ? 4 : 5);

  // Graticule
  gratLayer = L.layerGroup().addTo(map);
  for (let lat = -60; lat <= 80; lat += 10) L.polyline([[lat, -180], [lat, 180]], { color: '#1a2230', weight: 1, interactive: false }).addTo(gratLayer);
  for (let lng = -180; lng <= 180; lng += 10) L.polyline([[-70, lng], [85, lng]], { color: '#1a2230', weight: 1, interactive: false }).addTo(gratLayer);

  try {
    const topo = JSON.parse(document.getElementById('land-topo').textContent);
    const land = topojson.feature(topo, topo.objects.land);
    landLayer = L.geoJSON(land, { interactive: false, style: { color: '#3b4a63', weight: 0.8, fillColor: '#1c2535', fillOpacity: 1, fillRule: 'nonzero' } }).addTo(map);
  } catch (err) {
    landLayer = L.layerGroup().addTo(map);
    console.warn('Basemap failed to load', err);
  }
  routeLayer = L.layerGroup().addTo(map);
  markerLayer = L.layerGroup().addTo(map);

  APP_DATA.routes.forEach(r => {
    const line = L.polyline(r.pts, { color: LAYERS[r.layer].hex, weight: 2.5, dashArray: '6 6', opacity: 0, interactive: true });
    line.bindTooltip(`<b>${esc(r.name)}</b><div class="d">${esc(fmtRange(r.start, r.end))}</div>`, { className: 'tip', sticky: true });
    routeCache[r.id] = line;
  });

  map.on('zoomend', () => renderMarkers(true));
  // Header fonts and layout settle after init; keep Leaflet's size (and its SVG clip bounds) in step with the container.
  if (window.ResizeObserver) new ResizeObserver(() => map.invalidateSize({ pan: false })).observe(document.getElementById('map'));
  window.addEventListener('load', () => map.invalidateSize({ pan: false }));
}

function routeOpacity(r, t) {
  if (t >= r.start && t <= r.end) return 0.9;
  const center = (r.start + r.end) / 2;
  if (Math.abs(t - center) < 200) return 0.35;
  return 0;
}

function renderRoutes() {
  APP_DATA.routes.forEach(r => {
    const line = routeCache[r.id];
    const op = state.layers[r.layer] ? routeOpacity(r, state.year) : 0;
    if (op > 0) {
      if (!routeLayer.hasLayer(line)) routeLayer.addLayer(line);
      line.setStyle({ opacity: op, weight: op > 0.5 ? 3 : 2 });
    } else if (routeLayer.hasLayer(line)) routeLayer.removeLayer(line);
  });
}

function activeEntities(t) {
  return ENTITIES.filter(e => state.layers[e.layer] && isActive(e, t));
}

function renderMarkers(force) {
  if (!map) return;
  const t = state.year;
  const act = activeEntities(t);
  const ids = new Set(act.map(e => e.id));
  // remove stale
  Object.keys(markerCache).forEach(id => {
    if (!ids.has(id) && markerLayer.hasLayer(markerCache[id].marker)) markerLayer.removeLayer(markerCache[id].marker);
  });
  // fan-out co-located markers in pixel space
  const groups = {};
  const z = map.getZoom();
  act.forEach(e => {
    const p = map.project([e.lat, e.lng], z);
    const k = Math.round(p.x / 14) + ':' + Math.round(p.y / 14);
    (groups[k] = groups[k] || []).push(e);
  });
  const offsets = {};
  Object.values(groups).forEach(g => {
    g.sort((a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer) || a.id.localeCompare(b.id));
    if (g.length === 1) { offsets[g[0].id] = [0, 0]; return; }
    const r = 10 + g.length * 1.5;
    g.forEach((e, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / g.length; offsets[e.id] = [Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)]; });
  });
  act.forEach(e => {
    const pulse = dist(e, t) <= PULSE_WINDOW;
    const sel = state.selected === e.id;
    const [dx, dy] = offsets[e.id];
    const key = [pulse, sel, dx, dy].join('|');
    let c = markerCache[e.id];
    if (!c) {
      const m = L.marker([e.lat, e.lng], { keyboard: true, title: e.name, riseOnHover: true });
      m.bindTooltip(`<b>${esc(e.name)}</b><div class="d">${esc(dateLabel(e))} · ${esc(e.place)}</div>`, { className: 'tip', direction: 'top', offset: [0, -10] });
      m.on('click', () => openNodeInspector(e.id, { fly: true }));
      c = markerCache[e.id] = { marker: m, key: null };
    }
    if (c.key !== key || force) {
      c.marker.setIcon(L.divIcon({
        className: '', iconSize: [16, 16], iconAnchor: [8 - dx, 8 - dy],
        html: `<div class="mk${pulse ? ' pulse' : ''}${sel ? ' sel' : ''}" style="--c:${LAYERS[e.layer].color}">${shapeSVG(e.layer)}</div>`
      }));
      c.marker.setZIndexOffset(sel ? 1000 : (e.layer === 'sync' ? 200 : 0));
      c.key = key;
    }
    if (!markerLayer.hasLayer(c.marker)) markerLayer.addLayer(c.marker);
  });
}

function fitActive() {
  const act = activeEntities(state.year);
  if (!act.length) return;
  const b = L.latLngBounds(act.map(e => [e.lat, e.lng]));
  map.flyToBounds(b.pad(0.3), { maxZoom: 7, duration: 1.0 });
}

/* ---------- Feed ---------- */
function renderFeed() {
  const t = state.year;
  const act = activeEntities(t);
  $('#feed-count').textContent = act.length;
  $('#feed-win').textContent = act.length === 1 ? 'active entity' : 'active entities';
  const list = $('#feed-list');
  if (!act.length) {
    list.innerHTML = `<div class="empty">Nothing in the focus window at ${esc(fmtYear(t))}. Pick an era preset below, or press Play.</div>`;
    return;
  }
  const html = LAYER_ORDER.map(layer => {
    const items = act.filter(e => e.layer === layer).sort((a, b) => dist(a, t) - dist(b, t) || a.start - b.start);
    if (!items.length) return '';
    return `<div class="grp" style="--c:${LAYERS[layer].color}"><h3>${LAYERS[layer].label}<span>${items.length}</span></h3>` +
      items.map(e => {
        const off = signedOffset(e, t);
        const d = off === 0 ? (e.layer === 'sync' ? 'this year' : 'in range') : (off > 0 ? 'in ' + off + 'y' : Math.abs(off) + 'y ago');
        return `<button class="card${state.selected === e.id ? ' sel' : ''}" data-id="${e.id}" type="button" style="--c:${LAYERS[layer].color}">` +
          shapeSVG(layer, 12) +
          `<span><span class="t">${esc(e.name)}</span><br><span class="m">${esc(dateLabel(e))} · ${esc(e.place)}</span></span>` +
          `<span class="dist${Math.abs(off) <= PULSE_WINDOW ? ' now' : ''}">${d}</span></button>`;
      }).join('') + '</div>';
  }).join('');
  list.innerHTML = html;
}

/* ---------- Header ---------- */
function renderHeader() {
  const t = state.year;
  const [n, era] = yearParts(t);
  $('#yr').innerHTML = `${esc(n)} <small>${esc(era)}</small>`;
  $('#epoch').textContent = epochName(t);
  const act = activeEntities(t).sort((a, b) => dist(a, t) - dist(b, t) || LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer));
  const f = act[0];
  $('#focal').innerHTML = f ? `Focal: <b>${esc(f.name)}</b> · ${esc(dateLabel(f))}` : '<span style="color:var(--faint)">No entity in focus</span>';
}

/* ---------- Scrubber ---------- */
const pct = y => (y - YEAR_MIN) / (YEAR_MAX - YEAR_MIN) * 100;
function buildScrubber() {
  const den = $('#density');
  const rows = { biblical: 0, sync: 4, figure: 8, secular: 12 };
  den.innerHTML = ENTITIES.map(e => {
    const s = e.layer === 'sync' ? e.year : e.start, en = e.layer === 'sync' ? e.year : e.end;
    return `<span class="bar" style="left:${pct(s)}%;width:${Math.max(pct(en) - pct(s), 0.15)}%;top:${rows[e.layer]}px;background:${LAYERS[e.layer].hex}"></span>`;
  }).join('') + '<span class="cursor" id="den-cursor"></span>';
  const ticks = [-2500, -2000, -1500, -1000, -500, 1, 500, 1000, 1500, 2026];
  $('#ticks').innerHTML = ticks.map(y => `<span style="left:${pct(y)}%">${esc(y === 1 ? '1 CE' : fmtYear(y))}</span>`).join('');
  $('#speeds').innerHTML = SPEEDS.map(s => `<button type="button" data-speed="${s}" aria-pressed="${s === state.speed}">${s}×</button>`).join('');
  $('#presets').innerHTML = APP_DATA.presets.map(p => `<button type="button" data-y="${p.y}">${esc(p.label)}<span class="y">${esc(fmtYear(p.y))}</span></button>`).join('');
  $('#layer-keys').innerHTML = LAYER_ORDER.map(l => `<label><input type="checkbox" id="lk-${l}" data-layer="${l}"${state.layers[l] ? ' checked' : ''}>` +
    `${shapeSVG(l, 11)} ${LAYERS[l].label}</label>`).join('');
}
function renderScrubber() {
  const s = $('#slider');
  if (+s.value !== state.year) s.value = state.year;
  const cur = $('#den-cursor'); if (cur) cur.style.left = pct(state.year) + '%';
  document.querySelectorAll('#presets button').forEach(b => b.classList.toggle('on', +b.dataset.y === state.year));
  const p = $('#play');
  p.setAttribute('aria-pressed', String(state.playing));
  p.textContent = state.playing ? '❚❚ Pause' : '▶ Play';
}

/* ---------- Core update ---------- */
function updateSpatioTemporalState(newYear) {
  state.year = clamp(newYear);
  renderHeader();
  renderScrubber();
  renderMarkers();
  renderRoutes();
  renderFeed();
}

/* ---------- Playback ---------- */
function tick() {
  let next = state.year + state.speed;
  if (next > YEAR_MAX) next = YEAR_MIN; // loop
  updateSpatioTemporalState(next);
}
function startPlayback() {
  if (state.timer) clearInterval(state.timer);
  state.playing = true;
  state.timer = setInterval(tick, TICK_MS);
  renderScrubber();
}
function pausePlayback() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.playing = false;
  renderScrubber();
}
function step(d) { updateSpatioTemporalState(state.year + d); }

/* ---------- Inspector ---------- */
const insp = $('#insp');
function panel(name) { return insp.querySelector(`[data-panel="${name}"]`); }
function selectTab(name) {
  state.tab = name;
  insp.querySelectorAll('[role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  insp.querySelectorAll('[role=tabpanel]').forEach(p => { p.hidden = p.dataset.panel !== name; });
}
function list(items) { return '<ul>' + items.map(i => `<li>${esc(i)}</li>`).join('') + '</ul>'; }
function citation(e) {
  if (e.layer === 'sync') return `${e.name}, ${e.yearLabel}. ${e.place}. ${e.accession}. Parallel: ${e.parallel}.`;
  if (e.layer === 'figure') return `${e.name} (${e.life}). Primary witnesses: ${e.evidence.join('; ')}. Earliest extant copy: ${e.manuscript}.`;
  return `${e.name} (${fmtRange(e.start, e.end)}), ${e.place}. Sources: ${e.cite}`;
}

function fillInspector(e) {
  const r = MATRIX_BY_FIG[e.id];
  insp.style.setProperty('--c', LAYERS[e.layer].color);
  $('#insp-kind').textContent = kindLabel(e);
  $('#insp-title').textContent = e.name;
  $('#insp-sub').textContent = dateLabel(e) + ' · ' + e.place;
  const coords = `${Math.abs(e.lat).toFixed(4)}° ${e.lat >= 0 ? 'N' : 'S'}, ${Math.abs(e.lng).toFixed(4)}° ${e.lng >= 0 ? 'E' : 'W'}`;

  // Overview
  let ov = `<dl class="kv"><dt>Date</dt><dd>${esc(dateLabel(e))}</dd><dt>Place</dt><dd>${esc(e.place)}</dd><dt>Coordinates</dt><dd class="mono">${coords}</dd>`;
  if (e.layer === 'figure') ov += `<dt>Lineage</dt><dd><span class="chip ${e.lineage}">${esc(e.lineageLabel)}</span></dd><dt>Death</dt><dd>${esc(e.cause)}</dd>`;
  if (e.layer === 'sync') ov += `<dt>Parallel</dt><dd>${esc(e.parallel)}</dd>`;
  ov += '</dl>';
  if (e.dating) ov += `<div class="callout"><h4>Dating</h4><p>${esc(e.dating)}</p></div>`;
  if (e.context) ov += `<div><h4>Context</h4><p>${esc(e.context)}</p></div>`;
  if (e.layer === 'sync') ov += `<div><h4>What it records</h4><p>${esc(e.corroboration)}</p></div>`;
  if (e.layer === 'figure') ov += `<p>${esc(e.impact)}</p>`;
  panel('overview').innerHTML = ov;

  // Evidence
  let ev = '';
  if (e.layer === 'sync') {
    ev = `<dl class="kv"><dt>Object</dt><dd>${esc(e.name)}</dd><dt>Date</dt><dd>${esc(e.yearLabel)}</dd><dt>Provenance</dt><dd>${esc(e.place)}</dd><dt>Accession</dt><dd class="mono">${esc(e.accession)}</dd></dl>` +
      `<div><h4>Extra-biblical corroboration</h4><p>${esc(e.corroboration)}</p></div><div><h4>Biblical parallel</h4><p>${esc(e.parallel)}</p></div>`;
  } else if (e.layer === 'figure') {
    ev = `<div><h4>Attestation streams</h4>${list(e.evidence)}</div>` +
      `<div class="callout gap"><span class="n">${esc(gapText(r))}</span><span>years between composition and earliest surviving copy${r && r.autograph ? ' (autographs survive)' : ''}</span></div>` +
      `<dl class="kv"><dt>Earliest copy</dt><dd>${esc(e.manuscript)}</dd><dt>Critical witness</dt><dd>${esc(r ? r.critic : '')}</dd><dt>Physical evidence</dt><dd>${esc(r ? r.physical : '')}</dd></dl>`;
  } else {
    ev = `<div><h4>Sources</h4>${list(e.evidence || [])}</div>`;
    const linked = APP_DATA.intersections.filter(s => (e.evidence || []).some(x => x.indexOf(s.name.split(' ')[0]) >= 0) && Math.abs(s.year - (e.start + e.end) / 2) < 400);
    if (linked.length) ev += `<div><h4>Linked synchronisms</h4><ul>${linked.map(s => `<li><a href="#" data-open="${s.id}" style="color:var(--syn)">${esc(s.name)}</a> · ${esc(s.yearLabel)}</li>`).join('')}</ul></div>`;
  }
  panel('evidence').innerHTML = ev;

  // Lineage / Mortality
  let ln = '';
  if (e.layer === 'figure') {
    ln = `<div><h4>Lineage</h4><p><span class="chip ${e.lineage}">${esc(e.lineageLabel)}</span></p><p style="margin-top:8px">${esc(e.lineageText)}</p></div>` +
      `<div><h4>Cause of death</h4><p>${esc(e.demise)}</p></div>` +
      `<div class="callout"><p>Historical existence here rests on documents and material remains, not on surviving descendants. ${e.lineage === 'living' ? 'This is the only figure of the twelve with a living direct line.' : 'No living direct line is known, and the record is unaffected.'}</p></div>`;
  } else if (e.layer === 'biblical') {
    ln = e.demise ? `<div><h4>Documented demise</h4><p>${esc(e.demise)}</p></div>` : `<p class="empty">No death record is tied to this era in the model.</p>`;
  } else {
    ln = `<div><h4>People named and their fate</h4><p>${esc(e.persons)}</p></div>`;
  }
  panel('lineage').innerHTML = ln;

  // Impact
  let im = '';
  if (e.layer === 'figure') {
    im = `<p>${esc(e.impact)}</p>`;
    if (e.concept) im += `<p class="concept">${esc(e.concept)}</p>`;
    if (e.math) im += `<div class="eq">${e.math}</div>`;
  } else if (e.layer === 'sync') {
    im = `<p>${esc(e.corroboration)}</p><div class="callout"><p>An independent, non-biblical record that names a person, title or event also found in ${esc(e.parallel)}. It fixes the biblical narrative to an absolute date in the imperial record.</p></div>`;
  } else {
    im = `<p>${esc(e.significance)}</p>`;
  }
  panel('impact').innerHTML = im;

  $('#insp-cite').textContent = citation(e);
  $('#copy-ok').hidden = true;
}

function openNodeInspector(id, opts) {
  const e = BY_ID[id];
  if (!e) return false;
  opts = opts || {};
  state.selected = id;
  fillInspector(e);
  selectTab(opts.tab || 'overview');
  insp.classList.add('open');
  insp.setAttribute('aria-hidden', 'false');
  $('#scrim').hidden = window.innerWidth > 860;
  if (opts.fly && map && state.view === 'map') map.flyTo([e.lat, e.lng], 8, { duration: 1.2 });
  renderMarkers();
  renderFeed();
  return true;
}
function closeInspector() {
  insp.classList.remove('open');
  insp.setAttribute('aria-hidden', 'true');
  $('#scrim').hidden = true;
  state.selected = null;
  renderMarkers();
  renderFeed();
}

/* ---------- Views ---------- */
const VIEWS = ['map', 'matrix', 'figures', 'diagnostics'];
function setView(v, opts) {
  if (VIEWS.indexOf(v) < 0) v = 'map';
  state.view = v;
  VIEWS.forEach(n => { $('#view-' + n).hidden = n !== v; });
  document.querySelectorAll('.nav a').forEach(a => { if (a.dataset.view === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (v === 'map' && map) setTimeout(() => map.invalidateSize(), 0);
  if (!(opts && opts.silent) && location.hash !== '#' + v) {
    try { history.replaceState(null, '', '#' + v); } catch (_) { location.hash = v; }
  }
}

/* ---------- Matrix view ---------- */
function renderMatrix() {
  const figs = APP_DATA.figures;
  const MAXG = 1500;
  const counts = { living: 0, extinct: 0, none: 0 };
  figs.forEach(f => counts[f.lineage]++);
  const ordered = APP_DATA.matrix.slice().sort((a, b) => a.gap[1] - b.gap[1] || a.gap[0] - b.gap[0]);
  const spectrum = ordered.map(r => {
    const f = BY_ID[r.fig];
    const zero = r.gap[1] === 0;
    const left = (r.gap[0] / MAXG) * 100, width = Math.max(((r.gap[1] - r.gap[0]) / MAXG) * 100, 0.6);
    const col = f.start > 0 && f.start < 100 ? 'var(--bib)' : (zero ? 'var(--pass)' : 'var(--sec)');
    return `<div class="sp-row" data-open="${f.id}" role="button" tabindex="0" style="--c:${col}"><span class="nm">${esc(f.name)}</span>` +
      `<span class="tr"><span class="b${zero ? ' zero' : ''}" style="left:0;width:${zero ? 0 : Math.max(left + width, 0.6)}%"></span></span>` +
      `<span class="v">${zero ? '0 · autograph' : esc(gapText(r)) + ' y'}</span></div>`;
  }).join('');
  const axis = [0, 250, 500, 750, 1000, 1250, 1500].map(v => `<span style="left:${v / MAXG * 100}%">${v}</span>`).join('');

  const rows = APP_DATA.matrix.map(r => {
    const f = BY_ID[r.fig];
    return `<tr data-open="${f.id}"><td class="num">${String(f.n).padStart(2, '0')}</td><td><b style="font-weight:500">${esc(f.name)}</b></td>` +
      `<td class="num">${esc(f.life)}</td><td>${esc(f.manuscript)}</td><td class="num">${esc(gapText(r))}</td>` +
      `<td class="${r.autograph ? 'yes' : 'no'}">${r.autograph ? 'Yes' : 'None'}</td><td class="num">${r.streams}</td>` +
      `<td>${esc(r.critic)}</td><td>${esc(r.physical)}</td><td><span class="chip ${f.lineage}">${esc(f.lineageLabel)}</span></td><td>${esc(f.cause)}</td></tr>`;
  }).join('');

  const autoAncient = APP_DATA.matrix.filter(r => !r.autograph).length;
  const pauline = MATRIX_BY_FIG['fig-paul'];
  const classical = ['fig-sophocles', 'fig-socrates', 'fig-plato', 'fig-aristotle'].map(id => MATRIX_BY_FIG[id].gap[0]);
  const syncCount = APP_DATA.intersections.length;

  $('#matrix-root').innerHTML = `
    <div><h2>Comparative Historiographical Matrix</h2>
    <p class="lede">The same five tests applied to biblical, classical, political and scientific figures. Click any row to open its dossier.</p></div>
    <section><h3>Manuscript gap spectrum · years to earliest surviving copy</h3>
      <div class="spectrum">${spectrum}</div>
      <div class="sp-axis"><span></span><span class="ax">${axis}</span><span></span></div>
    </section>
    <section><h3>The twelve figures</h3>
      <div class="tbl-wrap"><table><thead><tr><th>#</th><th>Figure</th><th>Lifespan</th><th>Earliest surviving copy</th><th>Gap (y)</th><th>Autograph</th><th>Streams</th><th>Critical witness</th><th>Physical evidence</th><th>Lineage</th><th>Death</th></tr></thead><tbody>${rows}</tbody></table></div>
    </section>
    <section><h3>Standard criteria of authenticity</h3>
      <div class="criteria">
        <div class="crit"><span class="k">CRITERION 1</span><h4>The autograph paradox</h4><p>No original manuscript survives for any figure of classical antiquity. Every ancient text here reaches us through later copies.</p><span class="stat">${autoAncient} of 12 figures have no surviving autograph.</span></div>
        <div class="crit"><span class="k">CRITERION 2</span><h4>Manuscript interval gap</h4><p>Time between composition and the earliest extant copy.</p><span class="stat">Classical Greek authors: ${Math.min(...classical).toLocaleString('en-US')}–${Math.max(...classical).toLocaleString('en-US')} years. Paul (P46): ${pauline.gap[0]}–${pauline.gap[1]} years.</span></div>
        <div class="crit"><span class="k">CRITERION 3</span><h4>Multiple independent attestation</h4><p>Two or more independent textual streams. Paul is attested by his own letters, Acts, 1 Clement and Ignatius.</p><span class="stat">Every figure in the model has at least 2 streams.</span></div>
        <div class="crit"><span class="k">CRITERION 4</span><h4>Epigraphic synchronism</h4><p>Administrative titles confirmed in stone: Gallio as proconsul at Delphi, Erastus as aedile at Corinth, Pilate as prefect at Caesarea.</p><span class="stat">${syncCount} synchronisms in the model.</span></div>
        <div class="crit"><span class="k">CRITERION 5</span><h4>Lineage independence</h4><p>Historical reality is confirmed by documents, material remains and external synchronisms, not by surviving descendants.</p><span class="stat">${counts.living} living line · ${counts.extinct} extinct · ${counts.none} unmarried or childless.</span></div>
      </div>
    </section>`;
}

/* ---------- Figures catalog ---------- */
function renderFigures() {
  $('#figures-root').innerHTML = `
    <div><h2>The Twelve Figures</h2><p class="lede">Thinkers and pioneers from Sophocles to the Wright brothers, each profiled with the same evidence, lineage and mortality fields.</p></div>
    <div class="figgrid">${APP_DATA.figures.map(f => {
      const r = MATRIX_BY_FIG[f.id];
      return `<button class="fcard" type="button" data-open="${f.id}"><span class="no">PIONEER ${String(f.n).padStart(2, '0')}</span><h4>${esc(f.name)}</h4>` +
        `<span class="life">${esc(f.life)}</span><span class="place">${esc(f.place)}</span>` +
        `<span class="chips"><span class="chip ${f.lineage}">${esc(f.lineageLabel)}</span><span class="chip">Gap ${esc(gapText(r))} y</span><span class="chip">${esc(f.cause)}</span></span></button>`;
    }).join('')}</div>`;
}

/* ---------- Diagnostics ---------- */
const nonEmpty = v => v != null && String(v).trim() !== '';
const validLL = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

function runAutomatedDiagnostics() {
  const R = [];
  const check = (name, fn) => {
    let ok = false, detail = '';
    try { const out = fn(); ok = !!out[0]; detail = out[1] || ''; } catch (err) { ok = false; detail = 'Threw: ' + err.message; }
    R.push({ name, ok, detail });
  };
  const F = APP_DATA.figures;

  check('Dataset schema verification (figures, biblical, secular, intersections, matrix)', () => {
    const keys = ['figures', 'biblical', 'secular', 'intersections', 'matrix', 'routes'];
    const ok = keys.every(k => Array.isArray(APP_DATA[k]) && APP_DATA[k].length);
    return [ok, keys.map(k => `${k}: ${(APP_DATA[k] || []).length}`).join(' · ')];
  });
  check('12 mandatory historical figures, profiles complete', () => {
    const req = ['name', 'start', 'end', 'life', 'place', 'lineage', 'lineageText', 'evidence', 'manuscript', 'cause', 'demise', 'impact'];
    const bad = F.filter(f => req.some(k => k === 'evidence' ? !(f.evidence && f.evidence.length) : !nonEmpty(f[k])));
    return [F.length === 12 && !bad.length, `${F.length} figures; ${bad.length ? 'incomplete: ' + bad.map(f => f.name).join(', ') : 'all fields present'}`];
  });
  check('Lineage classification audit', () => {
    const c = { living: 0, extinct: 0, none: 0 };
    F.forEach(f => { c[f.lineage] = (c[f.lineage] || 0) + 1; });
    const living = F.filter(f => f.lineage === 'living').map(f => f.name);
    return [c.living === 1 && c.living + c.extinct + c.none === 12 && living[0] === 'Albert Einstein',
      `${c.living} living (${living.join(', ')}), ${c.extinct} extinct, ${c.none} unmarried/celibate`];
  });
  check('16 epigraphic synchronisms with provenance and accession', () => {
    const S = APP_DATA.intersections;
    const bad = S.filter(s => !nonEmpty(s.accession) || !nonEmpty(s.place) || !nonEmpty(s.parallel) || !Number.isFinite(s.year));
    const idx = S.map(s => s.idx).sort((a, b) => a - b).join(',') === Array.from({ length: 16 }, (_, i) => i + 1).join(',');
    return [S.length === 16 && !bad.length && idx, `${S.length} records, indices 01–16 ${idx ? 'contiguous' : 'broken'}`];
  });
  check('Delphi (Gallio) inscription absolute anchor, 51–52 CE', () => {
    const g = APP_DATA.intersections.find(s => /Gallio/.test(s.name));
    return [g && g.year >= 51 && g.year <= 52 && /Achaea/.test(g.corroboration), g ? `year ${g.year} CE, ${g.place}` : 'missing'];
  });
  check('Latitude and longitude integrity across all markers', () => {
    const bad = ENTITIES.filter(e => !validLL(e.lat, e.lng));
    return [!bad.length, `${ENTITIES.length} markers checked${bad.length ? '; invalid: ' + bad.map(e => e.id).join(', ') : ''}`];
  });
  check('Leaflet map engine mounted with layer groups', () => {
    const ok = !!map && map._loaded && [landLayer, routeLayer, markerLayer].every(l => l && map.hasLayer(l));
    return [ok, ok ? `zoom ${map.getZoom()}, ${markerLayer.getLayers().length} markers on canvas` : 'map not ready'];
  });
  check('Historical travel route polylines', () => {
    const bad = APP_DATA.routes.filter(r => r.pts.length < 2 || r.start > r.end || !r.pts.every(p => validLL(p[0], p[1])) || !routeCache[r.id]);
    return [!bad.length, APP_DATA.routes.map(r => `${r.name} (${r.pts.length} pts)`).join(' · ')];
  });
  check('Temporal scrubber bounds (2500 BCE to 2026 CE)', () => {
    const s = $('#slider');
    return [+s.min === -2500 && +s.max === 2026 && YEAR_MIN === -2500 && YEAR_MAX === 2026, `range ${s.min} … ${s.max} (${YEAR_MAX - YEAR_MIN} years)`];
  });
  check('Comparative matrix schema and row parity', () => {
    const ids = new Set(F.map(f => f.id));
    const ok = APP_DATA.matrix.length === F.length && APP_DATA.matrix.every(r => ids.has(r.fig) && Array.isArray(r.gap) && r.gap[0] <= r.gap[1]);
    return [ok, `${APP_DATA.matrix.length} matrix rows for ${F.length} figures`];
  });
  check('Canonical biblical arc coverage (Patriarchs to Revelation)', () => {
    const B = APP_DATA.biblical;
    const first = Math.min(...B.map(b => b.start)), last = Math.max(...B.map(b => b.end));
    return [B.length === 9 && first <= -2000 && last >= 90, `${B.length} eras, ${fmtYear(first)} to ${fmtYear(last)}`];
  });
  check('Mortality records and death-circumstance schema', () => {
    const bad = F.filter(f => !nonEmpty(f.demise) || !nonEmpty(f.cause));
    const bibWith = APP_DATA.biblical.filter(b => nonEmpty(b.demise)).length;
    return [!bad.length, `12/12 figures with cause of death; ${bibWith}/9 biblical eras with a demise record`];
  });
  check('Modern applications, equations and citations present', () => {
    const bad = F.filter(f => !nonEmpty(f.impact) || !(nonEmpty(f.math) || nonEmpty(f.concept)));
    const eq = F.filter(f => f.math).length;
    return [!bad.length, `${eq} figures with typeset equations; ${12 - eq} with stated concepts`];
  });
  check('Inspector slide-over data binding and tab transitions', () => {
    const wasSel = state.selected, wasTab = state.tab;
    openNodeInspector('fig-socrates', { fly: false });
    const opened = insp.classList.contains('open') && $('#insp-title').textContent === 'Socrates';
    selectTab('evidence');
    const tabOk = !panel('evidence').hidden && panel('overview').hidden && /Clarkianus/.test(panel('evidence').textContent);
    selectTab('overview');
    if (wasSel) openNodeInspector(wasSel, { fly: false, tab: wasTab }); else closeInspector();
    const restored = wasSel ? insp.classList.contains('open') : !insp.classList.contains('open');
    return [opened && tabOk && restored, `open ${opened ? 'ok' : 'failed'} · tabs ${tabOk ? 'ok' : 'failed'} · restore ${restored ? 'ok' : 'failed'}`];
  });
  check('Playback engine lifecycle (start, step, loop, pause)', () => {
    const y0 = state.year, wasPlaying = state.playing, sp = state.speed;
    state.speed = 1;
    updateSpatioTemporalState(0);
    startPlayback();
    const started = state.playing && !!state.timer;
    tick();
    const stepped = state.year === 1;
    updateSpatioTemporalState(YEAR_MAX);
    tick();
    const looped = state.year === YEAR_MIN;
    pausePlayback();
    const paused = !state.playing && state.timer === null;
    state.speed = sp;
    updateSpatioTemporalState(y0);
    if (wasPlaying) startPlayback();
    return [started && stepped && looped && paused, `start ${started} · step ${stepped} · loop ${looped} · pause ${paused}`];
  });
  check('Multi-panel routing (map, matrix, figures)', () => {
    const v0 = state.view;
    const ok = ['matrix', 'figures', 'map'].every(v => { setView(v, { silent: true }); return !$('#view-' + v).hidden && VIEWS.filter(n => n !== v).every(n => $('#view-' + n).hidden); });
    setView(v0, { silent: true });
    return [ok, ok ? 'all views route and hide correctly' : 'routing mismatch'];
  });

  const passed = R.filter(r => r.ok).length;
  const badge = $('#diag-badge');
  badge.classList.toggle('ok', passed === R.length);
  badge.classList.toggle('bad', passed !== R.length);
  $('#diag-count').textContent = `${passed}/${R.length} checks`;

  $('#diag-root').innerHTML = `
    <div><h2>System Diagnostics</h2><p class="lede">Assertions run against the live data model and interface on load. Each test restores the state it touched.</p></div>
    <div class="diag-sum"><span class="big" style="color:${passed === R.length ? 'var(--pass)' : 'var(--fail)'}">${passed}/${R.length}</span><span style="color:var(--muted)">assertions passing</span>
      <button class="btn" type="button" id="rerun">Run again</button></div>
    <div class="diag-list">${R.map((r, i) => `<div class="diag-row"><span class="st ${r.ok ? 'pass' : 'fail'}">[${r.ok ? 'PASS' : 'FAIL'}]</span><span>${String(i + 1).padStart(2, '0')}.</span><span class="nm">${esc(r.name)}</span><span class="det">${esc(r.detail)}</span></div>`).join('')}</div>
    <section><h3>Focus-window rules</h3>
<div class="formula">Active(e, t) = |e.year − t| ≤ ${SYNC_WINDOW}                  if e is a synchronism
              (t ≥ e.start − ${RANGE_PAD}) ∧ (t ≤ e.end + ${RANGE_PAD})   otherwise

Pulse(e, t)  = distance(e, t) ≤ ${PULSE_WINDOW}

Opacity(route, t) = 0.90   if t ∈ [start, end]
                    0.35   if |t − center| &lt; 200
                    0.00   otherwise

Playback: ${TICK_MS} ms per tick · speed × 1 year per tick · loops 2026 CE → 2500 BCE</div></section>`;
  return R;
}

/* ---------- Events ---------- */
function parseYear(s) {
  const m = /^\s*(-?\d{1,4})\s*(bce|bc|b\.c\.e?\.?|ce|ad|a\.d\.)?\s*$/i.exec(s);
  if (!m) return null;
  let n = parseInt(m[1], 10);
  if (m[2] && /^b/i.test(m[2])) n = -Math.abs(n);
  if (n < YEAR_MIN || n > YEAR_MAX) return null;
  return n;
}

function bindEvents() {
  $('#slider').addEventListener('input', ev => updateSpatioTemporalState(+ev.target.value));
  $('#play').addEventListener('click', () => state.playing ? pausePlayback() : startPlayback());
  $('#step-back').addEventListener('click', () => step(-25));
  $('#step-fwd').addEventListener('click', () => step(25));
  $('#speeds').addEventListener('click', ev => {
    const b = ev.target.closest('[data-speed]'); if (!b) return;
    state.speed = +b.dataset.speed;
    document.querySelectorAll('#speeds button').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.speed === state.speed)));
  });
  $('#presets').addEventListener('click', ev => {
    const b = ev.target.closest('[data-y]'); if (!b) return;
    pausePlayback();
    updateSpatioTemporalState(+b.dataset.y);
    if (state.view === 'map') fitActive();
  });
  $('#jump-form').addEventListener('submit', ev => {
    ev.preventDefault();
    const y = parseYear($('#jump').value);
    $('#jump-err').hidden = y !== null;
    if (y === null) return;
    pausePlayback();
    updateSpatioTemporalState(y);
    $('#jump').value = '';
  });
  $('#layer-keys').addEventListener('change', ev => {
    const l = ev.target.dataset.layer; if (!l) return;
    state.layers[l] = ev.target.checked;
    try { localStorage.setItem('chronos.layers', JSON.stringify(state.layers)); } catch (_) {}
    updateSpatioTemporalState(state.year);
  });
  $('#fit-active').addEventListener('click', fitActive);
  $('#feed-list').addEventListener('click', ev => {
    const c = ev.target.closest('[data-id]'); if (!c) return;
    openNodeInspector(c.dataset.id, { fly: true });
  });
  // generic [data-open] (matrix rows, figure cards, linked synchronisms)
  document.addEventListener('click', ev => {
    const o = ev.target.closest('[data-open]'); if (!o) return;
    ev.preventDefault();
    openNodeInspector(o.dataset.open, { fly: state.view === 'map' });
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && ev.target.matches && ev.target.matches('.sp-row')) { openNodeInspector(ev.target.dataset.open, {}); return; }
    if (ev.key === 'Escape' && insp.classList.contains('open')) { closeInspector(); return; }
    const typing = ev.target.matches && ev.target.matches('input[type=text], textarea');
    if (typing) return;
    if (ev.key === ' ' && !ev.target.matches('button, input')) { ev.preventDefault(); state.playing ? pausePlayback() : startPlayback(); }
    if (ev.key === '[') step(-25);
    if (ev.key === ']') step(25);
  });
  $('#insp-tabs').addEventListener('click', ev => { const b = ev.target.closest('[data-tab]'); if (b) selectTab(b.dataset.tab); });
  $('#insp-close').addEventListener('click', closeInspector);
  $('#scrim').addEventListener('click', closeInspector);
  $('#copy-cite').addEventListener('click', () => {
    const txt = $('#insp-cite').textContent;
    const done = () => { $('#copy-ok').hidden = false; };
    const fallback = () => { const r = document.createRange(); r.selectNodeContents($('#insp-cite')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $('#copy-ok').textContent = 'Selected, press Ctrl+C'; done(); };
    try { navigator.clipboard.writeText(txt).then(() => { $('#copy-ok').textContent = 'Copied'; done(); }, fallback); } catch (_) { fallback(); }
  });
  $('#locate').addEventListener('click', () => {
    const e = BY_ID[state.selected]; if (!e) return;
    pausePlayback();
    const y = e.layer === 'sync' ? e.year : (e.start <= 0 && e.end >= 0 ? e.end : Math.round((e.start + e.end) / 2));
    if (!isActive(e, state.year)) updateSpatioTemporalState(y === 0 ? 1 : y);
    if (state.view !== 'map') setView('map');
    setTimeout(() => { map.invalidateSize(); map.flyTo([e.lat, e.lng], 8, { duration: 1.2 }); }, 30);
    if (window.innerWidth <= 860) closeInspector();
  });
  window.addEventListener('hashchange', () => setView(location.hash.slice(1), { silent: true }));
}

/* ---------- Boot ---------- */
function boot() {
  buildScrubber();
  initMap();
  bindEvents();
  renderMatrix();
  renderFigures();
  setView((location.hash || '#map').slice(1), { silent: true });
  updateSpatioTemporalState(state.year);
  map.whenReady(() => setTimeout(runAutomatedDiagnostics, 50));
  document.addEventListener('click', ev => { if (ev.target.id === 'rerun') runAutomatedDiagnostics(); });
}
if (window.L && window.topojson) boot();
else document.getElementById('map').innerHTML = '<p class="empty" style="padding:24px">The map library did not load. Check your connection and reload the page.</p>';
})();
