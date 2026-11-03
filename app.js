'use strict';
// Fridge Wiring Editor: a small SVG editor for dilution-refrigerator wiring diagrams.
// Everything lives in `state` (serialisable); the canvas is fully re-rendered from it.

const GRID = 10, D = Math.PI / 180;
const NSX = 'http://www.w3.org/2000/svg';
const FONT = 'Segoe UI, Helvetica, Arial, sans-serif';
const INK = '#1d232b', PURPLE = '#9b2a8f', GREEN = '#5aa832', BLUE = '#1aa0dc', YELLOW = '#f2b705';
const SWATCHES = [INK, '#ffffff', GREEN, PURPLE, BLUE, YELLOW, '#e0301e', '#8a8f98', '#d3d3d3'];

const $ = id => document.getElementById(id);
const f = n => Math.round(n * 100) / 100;
const snap = v => Math.round(v / GRID) * GRID;
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fillAttr = it => `fill="${it.noFill ? 'none' : it.fill}"`;

// ---------------------------------------------------------------- symbols

function arrowArc(cx, cy, R, col, sw) {
  // clockwise 270° arc with a filled head, the usual circulator glyph
  const a0 = 110 * D, a1 = 380 * D;
  const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
  const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
  const tx = -Math.sin(a1), ty = Math.cos(a1), nx = Math.cos(a1), ny = Math.sin(a1), h = R * 0.62;
  const pts = [[x1 + tx * h, y1 + ty * h], [x1 + nx * h * 0.6, y1 + ny * h * 0.6], [x1 - nx * h * 0.6, y1 - ny * h * 0.6]];
  return `<path d="M${f(x0)} ${f(y0)} A${f(R)} ${f(R)} 0 1 1 ${f(x1)} ${f(y1)}" fill="none" stroke="${col}" stroke-width="${sw}"/>` +
    `<polygon points="${pts.map(p => p.map(f).join(',')).join(' ')}" fill="${col}"/>`;
}
const circ = (cx, it) => `<circle cx="${cx}" r="${it.r}" ${fillAttr(it)} stroke="${it.stroke}" stroke-width="${it.strokeWidth}"/>` +
  arrowArc(cx, 0, it.r * 0.55, it.stroke, it.strokeWidth);
// square-bodied circulator; `tabs` are x positions of filled squares on top (terminated ports)
function squareCirc(it, w, tabs) {
  const s = it.s, t = s * 0.3, c = it.stroke, sw = it.strokeWidth;
  return `<rect x="${-w / 2}" y="${-s / 2}" width="${w}" height="${s}" ${fillAttr(it)} stroke="${c}" stroke-width="${sw}"/>` +
    tabs.map(x => `<rect x="${f(x - t / 2)}" y="${f(-s / 2 - t)}" width="${f(t)}" height="${f(t)}" fill="${c}" stroke="${c}" stroke-width="${sw}"/>`).join('') +
    arrowArc(0, 0, s * 0.27, c, sw);
}
const four = r =>[[-r, 0], [r, 0], [0, -r], [0, r]];

// Each type: defaults (editable props), ports(it) in local coords, size(it) -> [w,h],
// draw(it, live) -> SVG in local coords, optional textOff(it) for the inner text anchor.
const TYPES = {
  box: {
    name: 'Box',
    defaults: { w: 60, h: 28, r: 6, fill: GREEN, noFill: false, stroke: '#1f4d12', strokeWidth: 1.5,
                text: '10 dB', textColor: '#ffffff', fontSize: 12, bold: false, align: 'middle', upright: false },
    ports: it => [[-it.w / 2, 0], [it.w / 2, 0], [0, -it.h / 2], [0, it.h / 2]],
    size: it => [it.w, it.h],
    textOff: it => it.align === 'start' ? [-it.w / 2 + 8, 0] : [0, 0],
    draw: it => `<rect x="${-it.w / 2}" y="${-it.h / 2}" width="${it.w}" height="${it.h}" rx="${it.r}" ${fillAttr(it)} stroke="${it.stroke}" stroke-width="${it.strokeWidth}"/>`,
  },
  circulator: {
    name: 'Circulator',
    defaults: { r: 18, fill: '#ffffff', noFill: false, stroke: INK, strokeWidth: 2 },
    ports: it => four(it.r), size: it => [2 * it.r, 2 * it.r],
    draw: it => circ(0, it),
  },
  circ2: {
    name: '2-port circulator (isolator)',
    defaults: { s: 30, fill: '#ffffff', noFill: false, stroke: INK, strokeWidth: 1.5 },
    ports: it => [[-it.s / 2, 0], [it.s / 2, 0]],
    size: it => [it.s, it.s * 1.5],
    draw: it => squareCirc(it, it.s, [0]),
  },
  circ3: {
    name: '3-port circulator',
    defaults: { s: 30, fill: '#ffffff', noFill: false, stroke: INK, strokeWidth: 1.5 },
    ports: it => [[-it.s / 2, 0], [it.s / 2, 0], [0, it.s / 2], [0, -it.s / 2]],
    size: it => [it.s, it.s],
    draw: it => squareCirc(it, it.s, []),
  },
  djcirc: {
    name: 'Double-junction circulator',
    defaults: { s: 30, fill: '#ffffff', noFill: false, stroke: INK, strokeWidth: 1.5 },
    ports: it => [[-it.s, 0], [it.s, 0]],
    size: it => [2 * it.s, it.s * 1.5],
    draw: it => squareCirc(it, 2 * it.s, [-it.s / 2, it.s / 2]),
  },
  coupler: {
    name: 'Directional coupler',
    defaults: { w: 46, h: 28, fill: '#ffffff', noFill: false, stroke: INK, strokeWidth: 1.5 },
    ports: it => [[-it.w / 2, 0], [it.w / 2, 0], [-it.w / 2 + 9, -it.h / 2 - 9], [0, it.h / 2]],
    size: it => [it.w, it.h + 18],
    draw: it => {
      // coupled arm curves down from the tab and meets the through line at the arrow tip
      const w = it.w, h = it.h, tx = -w / 2 + 9, sw = it.strokeWidth, c = it.stroke, ax = w / 2 - 5;
      return `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" ${fillAttr(it)} stroke="${c}" stroke-width="${sw}"/>` +
        `<rect x="${tx - 4.5}" y="${-h / 2 - 9}" width="9" height="9" fill="${c}" stroke="${c}" stroke-width="${sw}"/>` +
        `<line x1="${-w / 2}" y1="0" x2="${w / 2}" y2="0" stroke="${c}" stroke-width="${sw}"/>` +
        `<path d="M${tx} ${-h / 2} Q${tx} ${-h / 4} ${f(ax - 10)} ${-3}" fill="none" stroke="${c}" stroke-width="${sw}"/>` +
        `<polygon points="${ax},0 ${ax - 9},${-6} ${ax - 6},${1}" fill="${c}"/>`;
    },
  },
  amp: {
    name: 'Amplifier',
    defaults: { size: 40, fill: '#ffffff', noFill: false, stroke: INK, strokeWidth: 1.5,
                text: '', textColor: INK, fontSize: 10, bold: false, upright: true },
    ports: it => [[-it.size / 2, 0], [it.size / 2, 0]],
    size: it => [it.size, it.size],
    textOff: it => [-it.size / 6, 0],
    draw: it => { const s = it.size / 2;
      return `<polygon points="${-s},${-s} ${-s},${s} ${s},0" ${fillAttr(it)} stroke="${it.stroke}" stroke-width="${it.strokeWidth}" stroke-linejoin="round"/>`; },
  },
  term: {
    name: '50 Ω termination',
    defaults: { fill: '#ffffff', stroke: INK, strokeWidth: 1.5 },
    ports: () => [[0, -16]], size: () => [20, 36],
    draw: it => { const a = `stroke="${it.stroke}" stroke-width="${it.strokeWidth}"`;
      return `<line x1="0" y1="-16" x2="0" y2="-8" ${a}/><rect x="-5" y="-8" width="10" height="14" fill="${it.fill}" ${a}/>` +
        `<line x1="0" y1="6" x2="0" y2="10" ${a}/><line x1="-9" y1="10" x2="9" y2="10" ${a}/>` +
        `<line x1="-6" y1="14" x2="6" y2="14" ${a}/><line x1="-3" y1="18" x2="3" y2="18" ${a}/>`; },
  },
  image: {
    name: 'Image',
    defaults: { w: 240, h: 200, src: '', opacity: 1 },
    ports: it => [[-it.w / 2, 0], [it.w / 2, 0], [0, -it.h / 2], [0, it.h / 2]],
    size: it => [it.w, it.h],
    draw: (it, live) => {
      const url = it.src && (live ? liveUrl(it.src) : state.assets[it.src]);
      if (url) return `<image x="${-it.w / 2}" y="${-it.h / 2}" width="${it.w}" height="${it.h}" href="${url}" xlink:href="${url}" preserveAspectRatio="none" opacity="${it.opacity}"/>`;
      return `<rect x="${-it.w / 2}" y="${-it.h / 2}" width="${it.w}" height="${it.h}" fill="#f4f6fa" stroke="#9aa3ad" stroke-dasharray="6 4"/>` +
        `<text text-anchor="middle" dominant-baseline="central" font-size="13" fill="#6b7480">Choose an image →</text>`;
    },
  },
  text: {
    name: 'Text',
    defaults: { text: 'Label', fontSize: 16, textColor: INK, bold: false, align: 'middle' },
    ports: () => [],
    size: it => { const L = String(it.text).split('\n');
      return [Math.max(...L.map(l => l.length)) * it.fontSize * 0.56 + 6, L.length * it.fontSize * 1.2]; },
    draw: () => '',
  },
};

// Palette entries: [name, type, type-prop overrides, common overrides]
const PRESETS = [
  ['Attenuator', 'box', {}],
  ['IR filter', 'box', { w: 74, h: 26, fill: PURPLE, stroke: '#3d0f38', text: 'IR Filter' }],
  ['Low-pass filter', 'box', { fill: BLUE, stroke: '#0b4a66', text: 'K&L' }],
  ['Box / device', 'box', { w: 100, h: 60, r: 4, fill: '#d3d3d3', stroke: '#444444', text: 'Device', textColor: INK, fontSize: 14 }],
  ['Title box', 'box', { w: 130, h: 86, r: 0, fill: PURPLE, stroke: PURPLE, text: 'Fridge\nDate\nCooldown', fontSize: 15, align: 'start' }],
  ['2-port circulator', 'circ2', {}],
  ['3-port circulator', 'circ3', {}],
  ['Double-junction circ.', 'djcirc', {}],
  ['Directional coupler', 'coupler', {}],
  ['TWPA', 'amp', { size: 36 }, { label: 'TWPA' }],
  ['HEMT', 'amp', { size: 56, text: 'HEMT', fontSize: 11 }, { rot: -90 }],
  ['Amplifier', 'amp', { size: 24 }],
  ['50 Ω termination', 'term', {}],
  ['Image (chip)', 'image', {}],
  ['Text', 'text', {}],
];
const COMMON = { rot: 0, fx: false, fy: false, label: '', labelDx: 0, labelDy: 0, labelSize: 12, labelColor: INK };

function makeItem(preset, x, y, id) {
  const p = typeof preset === 'number' ? PRESETS[preset] : PRESETS.find(q => q[0] === preset);
  const [, type, props, common] = p;
  const it = { id, type, x: snap(x), y: snap(y), ...clone(COMMON), ...clone(TYPES[type].defaults), ...clone(props), ...clone(common || {}) };
  if (it.label) it.labelDy = TYPES[type].size(it)[1] / 2 + 16;
  return it;
}

// ---------------------------------------------------------------- state

function freshState() {
  return {
    canvas: { w: 1300, h: 760, bg: '#ffffff', grid: true },
    stages: { style: 'dashed', list: '70K\n4K\n1K\n100mK\n10mK', x: 110, y: 40, w: 1150, h: 690,
              spacing: 48, inset: 16, radius: 48, color: INK, strokeWidth: 1.5,
              labelSize: 16, labelColor: INK, labelX: 12, leaders: true },
    items: [], wires: [], assets: {}, nextId: 1,
  };
}
let state = freshState();
let sel = [];                 // keys like 'i12' / 'w3'; last one is the primary selection
let wireMode = false, draft = null, drag = null, zoom = 1, clip = null;
let wireStyle = { color: INK, width: 1.8, dash: false, arrowStart: false, arrowEnd: false };
const history = [], future = [];
const blobUrls = {};

const snapshot = () => JSON.stringify({ ...state, assets: undefined });   // assets are append-only
const restore = s => { const o = JSON.parse(s); o.assets = state.assets; return o; };
function pushHistory() { history.push(snapshot()); if (history.length > 150) history.shift(); future.length = 0; }
function undo() { if (!history.length) return; future.push(snapshot()); state = restore(history.pop()); afterLoad(); }
function redo() { if (!future.length) return; history.push(snapshot()); state = restore(future.pop()); afterLoad(); }

function normalize(o) {
  const d = freshState();
  const s = { ...d, ...o, canvas: { ...d.canvas, ...o.canvas }, stages: { ...d.stages, ...o.stages }, assets: o.assets || {} };
  s.items = (s.items || []).filter(it => TYPES[it.type]).map(it => ({ ...clone(COMMON), ...clone(TYPES[it.type].defaults), ...it }));
  const ids = new Set(s.items.map(it => it.id));
  s.wires = (s.wires || []).map(w => ({ ...wireStyle, ...w, pts: (w.pts || []).filter(p => !('id' in p) || ids.has(p.id)) }))
    .filter(w => w.pts.length > 1);
  return s;
}
function afterLoad() { sel = sel.filter(k => objOf(k)); draft = null; syncStagePanel(); drawProps(); draw(); }

const byId = id => state.items.find(i => i.id === id);
const wireById = id => state.wires.find(w => w.id === id);
const objOf = k => k[0] === 'i' ? byId(+k.slice(1)) : wireById(+k.slice(1));
const selItems = () => sel.filter(k => k[0] === 'i').map(objOf).filter(Boolean);
const selWires = () => sel.filter(k => k[0] === 'w').map(objOf).filter(Boolean);

function liveUrl(key) {
  if (!blobUrls[key] && state.assets[key]) {
    const [head, b64] = state.assets[key].split(','), mime = head.match(/:(.*?);/)[1];
    const bin = atob(b64), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    blobUrls[key] = URL.createObjectURL(new Blob([arr], { type: mime }));
  }
  return blobUrls[key];
}

// ---------------------------------------------------------------- geometry

function toWorld(it, px, py) {
  if (it.fx) px = -px; if (it.fy) py = -py;
  const a = it.rot * D, c = Math.cos(a), s = Math.sin(a);
  return [it.x + px * c - py * s, it.y + px * s + py * c];
}
function portWorld(it, k) {
  const p = TYPES[it.type].ports(it)[k];
  return p ? toWorld(it, p[0], p[1]) : [it.x, it.y];
}
function resolve(ref) {
  if (ref.id != null) { const it = byId(ref.id); return it ? portWorld(it, ref.port) : null; }
  return [ref.x, ref.y];
}
function distSeg([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// ---------------------------------------------------------------- rendering

function textBlock(x, y, str, size, color, bold, anchor) {
  const lines = String(str).split('\n'), lh = size * 1.2, y0 = y - (lines.length - 1) * lh / 2;
  return `<text x="${f(x)}" y="${f(y0)}" font-size="${size}" fill="${color}" text-anchor="${anchor || 'middle'}" dominant-baseline="central"${bold ? ' font-weight="bold"' : ''}>` +
    lines.map((l, i) => `<tspan x="${f(x)}"${i ? ` dy="${f(lh)}"` : ''}>${esc(l) || ' '}</tspan>`).join('') + '</text>';
}

function stageList() {
  return state.stages.list.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [n, v] = l.split('|');
    return { name: n.trim(), v: v !== undefined && v.trim() !== '' ? +v : null };
  });
}

function stagesSvg() {
  const S = state.stages, list = stageList();
  if (S.style === 'none' || !list.length) return '';
  const st = `stroke="${S.color}" stroke-width="${S.strokeWidth}" fill="none"`;
  const dash = `stroke="${S.color}" stroke-width="1.2" stroke-dasharray="6 4"`;
  const lbl = (x, y, t, a) => textBlock(x, y, t, S.labelSize, S.labelColor, false, a || 'start');
  let s = '';
  if (S.style === 'dashed') {
    list.forEach((g, i) => {
      const y = S.y + (g.v ?? i * S.spacing), tx = S.labelX + g.name.length * S.labelSize * 0.58 + 6;
      s += lbl(S.labelX, y, g.name) +
        `<line x1="${f(tx)}" y1="${y}" x2="${S.x + S.w}" y2="${y}" stroke="${S.color}" stroke-width="${S.strokeWidth}" stroke-dasharray="7 5"/>`;
    });
  } else if (S.style === 'nested' || S.style === 'lines') {
    list.forEach((g, i) => {
      const top = S.y + (g.v ?? i * S.spacing);
      const x0 = S.style === 'nested' ? S.x + i * S.inset : S.x;
      if (S.style === 'nested') {
        const x1 = S.x + S.w - i * S.inset, y1 = S.y + S.h - i * S.inset;
        s += `<rect x="${x0}" y="${top}" width="${x1 - x0}" height="${y1 - top}" rx="${S.radius}" ${st}/>`;
      } else {
        s += `<line x1="${S.x}" y1="${top}" x2="${S.x + S.w}" y2="${top}" ${st}/>`;
      }
      s += lbl(S.labelX, top, g.name);
      const tx = S.labelX + g.name.length * S.labelSize * 0.58 + 6;
      const ex = S.style === 'nested' ? x0 + Math.min(S.radius, (S.w - 2 * i * S.inset) / 2) : S.x;
      if (S.leaders && ex > tx + 4) s += `<line x1="${f(tx)}" y1="${top}" x2="${f(ex)}" y2="${top}" ${dash}/>`;
    });
  } else if (S.style === 'columns') {
    let x = S.x;
    const xs = list.map(g => { const w = g.v ?? S.spacing, o = [x, w]; x += w; return o; });
    s += `<line x1="${S.x}" y1="${S.y}" x2="${x}" y2="${S.y}" ${dash}/>`;
    list.forEach((g, i) => {
      const [x0, w] = xs[i];
      s += lbl(x0 + w / 2, S.y - S.labelSize * 0.9, g.name, 'middle');
      if (i < list.length - 1) s += `<line x1="${x0 + w}" y1="${S.y}" x2="${x0 + w}" y2="${S.y + S.h}" ${dash}/>`;
    });
  }
  return s;
}

function arrowHead(a, b, w) {
  if (!a || !b) return '';
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const s = 5 + w.width * 2.2, bx = b[0] - ux * s, by = b[1] - uy * s;
  const pts = [[b[0], b[1]], [bx - uy * s * 0.5, by + ux * s * 0.5], [bx + uy * s * 0.5, by - ux * s * 0.5]];
  return `<polygon points="${pts.map(p => p.map(f).join(',')).join(' ')}" fill="${w.color}"/>`;
}

function wireSvg(w, live) {
  const P = w.pts.map(resolve).filter(Boolean);
  if (P.length < 2) return '';
  const d = 'M' + P.map(p => f(p[0]) + ' ' + f(p[1])).join(' L');
  let s = `<g data-wire="${w.id}">`;
  if (live) s += `<path d="${d}" fill="none" stroke="transparent" stroke-width="12" style="cursor:pointer"/>`;
  s += `<path d="${d}" fill="none" stroke="${w.color}" stroke-width="${w.width}" stroke-linejoin="round"` +
       (w.dash ? ` stroke-dasharray="${f(w.width * 4)} ${f(w.width * 3)}"` : '') + (live ? ' pointer-events="none"' : '') + '/>';
  if (w.arrowEnd) s += arrowHead(P[P.length - 2], P[P.length - 1], w);
  if (w.arrowStart) s += arrowHead(P[1], P[0], w);
  return s + '</g>';
}

function itemSvg(it, live) {
  const t = TYPES[it.type], [w, h] = t.size(it);
  let s = `<g data-item="${it.id}" class="item"><g transform="translate(${f(it.x)} ${f(it.y)}) rotate(${it.rot})">`;
  if (live) s += `<rect x="${f(-w / 2 - 4)}" y="${f(-h / 2 - 4)}" width="${f(w + 8)}" height="${f(h + 8)}" fill="transparent"/>`;
  s += `<g transform="scale(${it.fx ? -1 : 1} ${it.fy ? -1 : 1})">${t.draw(it, live)}</g>`;
  let upright = '';
  if (it.text) {
    // text follows rotation but never mirroring; `upright` keeps it horizontal
    let [ox, oy] = t.textOff ? t.textOff(it) : [0, 0];
    if (it.fx) ox = -ox; if (it.fy) oy = -oy;
    if (it.upright) {
      const [wx, wy] = toWorld({ ...it, fx: false, fy: false }, ox, oy);
      upright = textBlock(wx, wy, it.text, it.fontSize, it.textColor, it.bold, it.align);
    } else s += textBlock(ox, oy, it.text, it.fontSize, it.textColor, it.bold, it.align);
  }
  s += '</g>' + upright;
  if (it.label) s += textBlock(it.x + it.labelDx, it.y + it.labelDy, it.label, it.labelSize, it.labelColor, false, 'middle');
  if (live) t.ports(it).forEach((_, k) => {
    const [px, py] = portWorld(it, k);
    s += `<circle class="port" cx="${f(px)}" cy="${f(py)}" r="4.5" data-port="${it.id}:${k}"/>`;
  });
  return s + '</g>';
}

const contentSvg = live => stagesSvg() + state.wires.map(w => wireSvg(w, live)).join('') + state.items.map(it => itemSvg(it, live)).join('');

const svg = $('canvas');
function draw() {
  const C = state.canvas;
  svg.setAttribute('viewBox', `0 0 ${C.w} ${C.h}`);
  svg.setAttribute('width', C.w * zoom);
  svg.setAttribute('height', C.h * zoom);
  svg.classList.toggle('wiremode', wireMode || !!draft);
  let o = `<defs><pattern id="grid" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse">` +
    `<path d="M${GRID} 0 L0 0 0 ${GRID}" fill="none" stroke="#eef0f3" stroke-width="1"/></pattern></defs>` +
    `<rect width="${C.w}" height="${C.h}" fill="${C.bg}"/>`;
  if (C.grid) o += `<rect width="${C.w}" height="${C.h}" fill="url(#grid)" pointer-events="none"/>`;
  o += `<g id="content">${contentSvg(true)}</g><g id="overlay">${overlaySvg()}</g>`;
  svg.innerHTML = o;
}

function overlaySvg() {
  let s = '';
  for (const it of selItems()) {
    const [w, h] = TYPES[it.type].size(it);
    s += `<rect class="selbox" x="${f(-w / 2 - 6)}" y="${f(-h / 2 - 6)}" width="${f(w + 12)}" height="${f(h + 12)}" transform="translate(${f(it.x)} ${f(it.y)}) rotate(${it.rot})"/>`;
  }
  for (const w of selWires()) w.pts.forEach((p, i) => {
    const r = resolve(p); if (!r) return;
    s += `<circle class="vtx${p.id != null ? ' att' : ''}" cx="${f(r[0])}" cy="${f(r[1])}" r="5" data-vtx="${w.id}:${i}"/>`;
  });
  if (draft) {
    const P = draft.pts.map(resolve).filter(Boolean);
    if (draft.cursor) P.push([draft.cursor.x, draft.cursor.y]);
    if (P.length > 1) s += `<path d="M${P.map(p => f(p[0]) + ' ' + f(p[1])).join(' L')}" fill="none" stroke="${wireStyle.color}" stroke-width="${wireStyle.width}" stroke-dasharray="5 4" pointer-events="none"/>`;
  }
  if (drag && drag.kind === 'band') {
    const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1);
    s += `<rect class="band" x="${x}" y="${y}" width="${Math.abs(drag.x1 - drag.x0)}" height="${Math.abs(drag.y1 - drag.y0)}"/>`;
  }
  return s;
}

// ---------------------------------------------------------------- property panel

const FIELDS = {
  x: ['X', 'num'], y: ['Y', 'num'], rot: ['Rotation (°)', 'num'],
  w: ['Width', 'num'], h: ['Height', 'num'], r: ['Radius', 'num'], size: ['Size', 'num'],
  text: ['Text (inside)', 'area'], fontSize: ['Font size', 'num'], textColor: ['Text color', 'color'],
  align: ['Text align', 'sel', [['middle', 'Center'], ['start', 'Left']]],
  bold: ['Bold', 'bool'], upright: ['Keep text horizontal', 'bool'],
  fill: ['Fill', 'color'], noFill: ['No fill', 'bool'], stroke: ['Outline', 'color'], strokeWidth: ['Outline width', 'num'],
  src: ['Image file', 'img'], opacity: ['Opacity (0–1)', 'num'],
  label: ['Label (outside, always horizontal)', 'area'], labelDx: ['Label dx', 'num'], labelDy: ['Label dy', 'num'],
  labelSize: ['Label size', 'num'], labelColor: ['Label color', 'color'],
  color: ['Color', 'color'], width: ['Width', 'num'], dash: ['Dashed', 'bool'],
  arrowStart: ['Arrow at start', 'bool'], arrowEnd: ['Arrow at end', 'bool'],
};

function fieldHtml(k, v, attr = 'data-k', def = FIELDS[k]) {
  const [label, kind, opts] = def;
  switch (kind) {
    case 'num': return `<label class="f"><span>${label}</span><input type="number" step="any" ${attr}="${k}" value="${v}"></label>`;
    case 'text': return `<label class="f wide"><span>${label}</span><input type="text" ${attr}="${k}" value="${esc(v)}"></label>`;
    case 'area': return `<label class="f wide"><span>${label}</span><textarea rows="2" ${attr}="${k}">${esc(v)}</textarea></label>`;
    case 'bool': return `<label class="f bool"><input type="checkbox" ${attr}="${k}" ${v ? 'checked' : ''}>${label}</label>`;
    case 'sel': return `<label class="f"><span>${label}</span><select ${attr}="${k}">${opts.map(([o, t]) => `<option value="${o}" ${o === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
    case 'color': return `<div class="f wide"><span>${label}</span><div class="crow"><input type="color" ${attr}="${k}" value="${v}">` +
      `<input type="text" class="hex" data-hex="${k}" value="${v}" maxlength="7" spellcheck="false" title="Hex code, e.g. #9b2a8f or #fff">` +
      `<div class="sw">${SWATCHES.map(c => `<button class="swb" title="${c}" data-sw="${c}" data-for="${k}" style="background:${c}"></button>`).join('')}</div></div></div>`;
    case 'img': return `<div class="f wide"><span>${label}</span><input type="file" accept="image/*" data-img></div>`;
  }
}

function drawProps() {
  const body = $('propBody'), items = selItems(), wires = selWires();
  const prim = sel.length ? objOf(sel[sel.length - 1]) : null;
  if (!prim) {
    body.innerHTML = `<p class="hint">Nothing selected.<br>Click a part or wire to edit it, drag on empty canvas to select several, or Shift+click to add to the selection.</p>`;
    return;
  }
  const n = items.length + wires.length;
  let h;
  if (prim.pts) {
    h = `<div class="ptitle">Wire${n > 1 ? ` <small>(${n} selected)</small>` : ''}</div><div class="fields">` +
      ['color', 'width', 'dash', 'arrowStart', 'arrowEnd'].map(k => fieldHtml(k, prim[k])).join('') + '</div>' +
      `<p class="hint">Double-click the wire to add a bend; drag bends to move them; drag an end onto a port to attach it.</p>`;
  } else {
    const keys = ['x', 'y', 'rot', ...Object.keys(TYPES[prim.type].defaults), 'label', 'labelDx', 'labelDy', 'labelSize', 'labelColor'];
    h = `<div class="ptitle">${TYPES[prim.type].name}${n > 1 ? ` <small>(${n} selected)</small>` : ''}</div>` +
      `<div class="btnrow"><button data-act="rotL">⟲ 90°</button><button data-act="rotR">⟳ 90°</button>` +
      `<button data-act="fx" class="${prim.fx ? 'on' : ''}">Mirror H</button><button data-act="fy" class="${prim.fy ? 'on' : ''}">Mirror V</button></div>` +
      (items.length > 1 ? `<h2>Align</h2><div class="btnrow align">` +
        ALIGN.map(([a, t, tip]) => `<button data-act="${a}" title="${tip}">${t}</button>`).join('') + '</div>' : '') +
      `<div class="fields">${keys.map(k => fieldHtml(k, prim[k])).join('')}</div>` +
      `<div class="btnrow" style="margin-top:12px"><button data-act="front">Bring to front</button><button data-act="back">Send to back</button></div>`;
  }
  body.innerHTML = h;
  bindFields(body, 'data-k', (k, v) => {
    for (const key of sel) { const o = objOf(key); if (o && k in o) o[k] = v; }
    if (prim.pts) wireStyle = { color: prim.color, width: prim.width, dash: prim.dash, arrowStart: prim.arrowStart, arrowEnd: prim.arrowEnd };
    draw();
  });
  body.querySelectorAll('[data-act]').forEach(b => b.onclick = () => act(b.dataset.act));
  const img = body.querySelector('[data-img]');
  if (img) img.onchange = () => loadImage(img.files[0]);
}

function bindFields(root, attr, apply) {
  const pushed = new WeakSet();
  const set = (el, v) => {
    if (!pushed.has(el)) { pushHistory(); pushed.add(el); }
    const k = el.getAttribute(attr);
    apply(k, v);
    const hex = el.type === 'color' && root.querySelector(`[data-hex="${k}"]`);
    if (hex && document.activeElement !== hex) hex.value = v;
  };
  root.querySelectorAll('[data-hex]').forEach(hex => {
    const inp = root.querySelector(`[${attr}="${hex.dataset.hex}"]`);
    hex.addEventListener('input', () => {
      let v = hex.value.trim().replace(/^#?/, '#').toLowerCase();
      if (/^#[0-9a-f]{3}$/.test(v)) v = '#' + [...v.slice(1)].map(c => c + c).join('');
      if (/^#[0-9a-f]{6}$/.test(v)) { inp.value = v; set(inp, v); }
    });
    hex.addEventListener('blur', () => { hex.value = inp.value; });
    hex.addEventListener('keydown', e => { if (e.key === 'Enter') hex.blur(); });
  });
  root.querySelectorAll(`[${attr}]`).forEach(el => {
    const ev = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      if (el.type === 'number' && el.value === '') return;
      set(el, el.type === 'checkbox' ? el.checked : el.type === 'number' ? +el.value : el.value);
    });
  });
  root.querySelectorAll('[data-sw]').forEach(b => b.onclick = () => {
    const inp = root.querySelector(`[${attr}="${b.dataset.for}"]`);
    inp.value = b.dataset.sw; pushed.delete(inp); set(inp, b.dataset.sw);
  });
}

function loadImage(file) {
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    const key = 'a' + Date.now().toString(36);
    state.assets[key] = rd.result;
    const im = new Image();
    im.onload = () => {
      pushHistory();
      for (const it of selItems()) if (it.type === 'image') { it.src = key; it.h = Math.round(it.w * im.naturalHeight / im.naturalWidth); }
      drawProps(); draw();
    };
    im.src = rd.result;
  };
  rd.readAsDataURL(file);
}

const ALIGN = [
  ['alL', '⇤ Left', 'Align left edges'], ['alC', '↔ Center', 'Align horizontal centers'], ['alR', 'Right ⇥', 'Align right edges'],
  ['alT', '⤒ Top', 'Align top edges'], ['alM', '↕ Middle', 'Align vertical centers'], ['alB', '⤓ Bottom', 'Align bottom edges'],
  ['distH', '⋯ Space H', 'Distribute evenly left to right'], ['distV', '⋮ Space V', 'Distribute evenly top to bottom'],
];

// world-space half extents of a part, accounting for rotation
function halfExtents(it) {
  const [w, h] = TYPES[it.type].size(it), a = it.rot * D, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  return [(w * c + h * s) / 2, (w * s + h * c) / 2];
}

function alignItems(items, a) {
  const E = items.map(it => { const [hx, hy] = halfExtents(it); return { it, hx, hy }; });
  const min = k => Math.min(...E.map(k)), max = k => Math.max(...E.map(k));
  const left = min(e => e.it.x - e.hx), right = max(e => e.it.x + e.hx);
  const top = min(e => e.it.y - e.hy), bottom = max(e => e.it.y + e.hy);
  for (const e of E) {
    if (a === 'alL') e.it.x = left + e.hx;
    if (a === 'alR') e.it.x = right - e.hx;
    if (a === 'alC') e.it.x = (left + right) / 2;
    if (a === 'alT') e.it.y = top + e.hy;
    if (a === 'alB') e.it.y = bottom - e.hy;
    if (a === 'alM') e.it.y = (top + bottom) / 2;
  }
  if ((a === 'distH' || a === 'distV') && E.length > 2) {
    const k = a === 'distH' ? 'x' : 'y';
    E.sort((p, q) => p.it[k] - q.it[k]);
    const first = E[0].it[k], step = (E[E.length - 1].it[k] - first) / (E.length - 1);
    E.forEach((e, i) => { e.it[k] = first + i * step; });
  }
}

function act(a) {
  const items = selItems(); if (!items.length) return;
  pushHistory();
  for (const it of items) {
    if (a === 'rotL') it.rot = ((it.rot - 90) % 360 + 360) % 360;
    if (a === 'rotR') it.rot = (it.rot + 90) % 360;
    if (a === 'fx') it.fx = !it.fx;
    if (a === 'fy') it.fy = !it.fy;
  }
  if (a.startsWith('al') || a.startsWith('dist')) alignItems(items, a);
  if (a === 'front' || a === 'back') {
    const rest = state.items.filter(it => !items.includes(it));
    state.items = a === 'front' ? [...rest, ...items] : [...items, ...rest];
  }
  drawProps(); draw();
}

// ---------------------------------------------------------------- stages & canvas panel

const STAGE_FIELDS = {
  style: ['Stage style', 'sel', [['dashed', 'Dashed lines'], ['nested', 'Nested cans'], ['lines', 'Horizontal plates'], ['columns', 'Columns (left → right)'], ['none', 'None']]],
  list: ['Stages, one per line. Optional "| offset" sets the top offset (or column width)', 'area'],
  x: ['X', 'num'], y: ['Y', 'num'], w: ['Width', 'num'], h: ['Height', 'num'],
  spacing: ['Spacing', 'num'], inset: ['Nest inset', 'num'], radius: ['Corner radius', 'num'],
  strokeWidth: ['Line width', 'num'], color: ['Line color', 'color'],
  labelSize: ['Label size', 'num'], labelX: ['Label x', 'num'], labelColor: ['Label color', 'color'],
  leaders: ['Dashed label leaders', 'bool'],
};
const CANVAS_FIELDS = { w: ['Canvas width', 'num'], h: ['Canvas height', 'num'], bg: ['Background', 'color'], grid: ['Show grid', 'bool'] };

function syncStagePanel() {
  const body = $('stageBody'), S = state.stages, C = state.canvas;
  body.innerHTML = `<h2>Fridge stages</h2><div class="fields">` +
    Object.keys(STAGE_FIELDS).map(k => fieldHtml(k, S[k], 'data-s', STAGE_FIELDS[k])).join('') +
    `</div><h2 style="margin-top:18px">Canvas</h2><div class="fields">` +
    Object.keys(CANVAS_FIELDS).map(k => fieldHtml(k, C[k], 'data-c', CANVAS_FIELDS[k])).join('') + '</div>';
  bindFields(body.children[1], 'data-s', (k, v) => { state.stages[k] = v; draw(); });
  bindFields(body.children[3], 'data-c', (k, v) => { state.canvas[k] = v; draw(); });
}

// ---------------------------------------------------------------- interaction

const pt = e => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom]; };
const portOf = el => el && el.dataset && el.dataset.port ? el.dataset.port.split(':').map(Number) : null;

function constrained(mx, my, e) {
  let x = snap(mx), y = snap(my);
  if (draft && draft.pts.length && !e.altKey) {
    const L = resolve(draft.pts[draft.pts.length - 1]);
    if (L) { if (Math.abs(x - L[0]) > Math.abs(y - L[1])) y = L[1]; else x = L[0]; }
  }
  return { x, y };
}

function finishDraft() {
  if (!draft) return;
  const pts = [];
  for (const p of draft.pts) {
    const a = resolve(p), b = pts.length && resolve(pts[pts.length - 1]);
    if (!b || Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.5) pts.push(p);
  }
  draft = null;
  if (pts.length >= 2) {
    pushHistory();
    const w = { id: state.nextId++, pts, ...clone(wireStyle) };
    state.wires.push(w); sel = ['w' + w.id];
  }
  drawProps(); draw();
}

function setWireMode(v) { wireMode = v; if (!v) finishDraft(); $('bWire').classList.toggle('on', v); draw(); }

svg.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const [mx, my] = pt(e), tg = e.target, port = portOf(tg);
  if (draft || wireMode || port) {
    if (!draft) draft = { pts: [] };
    if (port) {
      draft.pts.push({ id: port[0], port: port[1] });
      if (draft.pts.length > 1) { finishDraft(); e.preventDefault(); return; }
    } else draft.pts.push(constrained(mx, my, e));
    draw(); e.preventDefault(); return;
  }
  if (tg.dataset.vtx) {
    const [wid, idx] = tg.dataset.vtx.split(':').map(Number);
    drag = { kind: 'vtx', wid, idx, moved: false }; e.preventDefault(); return;
  }
  const itemEl = tg.closest('[data-item]'), wireEl = tg.closest('[data-wire]');
  const key = itemEl ? 'i' + itemEl.dataset.item : wireEl ? 'w' + wireEl.dataset.wire : null;
  if (key) {
    if (e.shiftKey && sel.includes(key)) sel = sel.filter(k => k !== key);
    else if (e.shiftKey) sel.push(key);
    else if (!sel.includes(key)) sel = [key];
    else sel = [...sel.filter(k => k !== key), key];
    if (sel.includes(key)) {
      const pts = [];
      for (const w of selWires()) for (const p of w.pts) if (p.id == null) pts.push({ p, x: p.x, y: p.y });
      drag = { kind: 'move', sx: mx, sy: my, moved: false, items: selItems().map(it => ({ it, x: it.x, y: it.y })), pts };
    }
    drawProps(); draw(); e.preventDefault(); return;
  }
  if (!e.shiftKey) sel = [];
  drag = { kind: 'band', x0: mx, y0: my, x1: mx, y1: my };
  drawProps(); draw();
});

window.addEventListener('mousemove', e => {
  const [mx, my] = pt(e);
  if (draft) {
    const port = portOf(e.target);
    if (port) { const [x, y] = portWorld(byId(port[0]), port[1]); draft.cursor = { x, y }; }
    else draft.cursor = constrained(mx, my, e);
    draw(); return;
  }
  if (!drag) return;
  if (drag.kind === 'band') { drag.x1 = mx; drag.y1 = my; draw(); return; }
  if (!drag.moved) { pushHistory(); drag.moved = true; }
  if (drag.kind === 'move') {
    const dx = snap(mx - drag.sx), dy = snap(my - drag.sy);
    for (const o of drag.items) { o.it.x = o.x + dx; o.it.y = o.y + dy; }
    for (const o of drag.pts) { o.p.x = o.x + dx; o.p.y = o.y + dy; }
  } else if (drag.kind === 'vtx') {
    wireById(drag.wid).pts[drag.idx] = { x: snap(mx), y: snap(my) };
  }
  draw();
});

window.addEventListener('mouseup', e => {
  if (!drag) return;
  if (drag.kind === 'band') {
    const x0 = Math.min(drag.x0, drag.x1), x1 = Math.max(drag.x0, drag.x1), y0 = Math.min(drag.y0, drag.y1), y1 = Math.max(drag.y0, drag.y1);
    const inside = p => p && p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
    if (x1 - x0 > 3 || y1 - y0 > 3) {
      for (const it of state.items) if (inside([it.x, it.y]) && !sel.includes('i' + it.id)) sel.push('i' + it.id);
      for (const w of state.wires) if (w.pts.every(p => inside(resolve(p))) && !sel.includes('w' + w.id)) sel.push('w' + w.id);
    }
    drawProps();
  } else if (drag.kind === 'vtx' && drag.moved) {
    const pe = document.elementsFromPoint(e.clientX, e.clientY).map(portOf).find(Boolean);
    if (pe) wireById(drag.wid).pts[drag.idx] = { id: pe[0], port: pe[1] };
  } else if (drag.kind === 'move' && drag.moved) drawProps();
  drag = null; draw();
});

svg.addEventListener('dblclick', e => {
  if (draft) { finishDraft(); return; }
  const tg = e.target;
  if (tg.dataset.vtx) {
    const [wid, idx] = tg.dataset.vtx.split(':').map(Number), w = wireById(wid);
    if (w.pts.length > 2) { pushHistory(); w.pts.splice(idx, 1); draw(); }
    return;
  }
  const wireEl = tg.closest('[data-wire]');
  if (wireEl) {
    const w = wireById(+wireEl.dataset.wire), m = pt(e), P = w.pts.map(resolve);
    let best = 0, bd = Infinity;
    for (let i = 0; i < P.length - 1; i++) { const d = distSeg(m, P[i], P[i + 1]); if (d < bd) { bd = d; best = i; } }
    pushHistory(); w.pts.splice(best + 1, 0, { x: snap(m[0]), y: snap(m[1]) });
    sel = ['w' + w.id]; draw();
    return;
  }
  if (tg.closest('[data-item]')) {
    showTab('props');
    const el = document.querySelector('#propBody [data-k="text"]') || document.querySelector('#propBody [data-k="label"]');
    if (el) { el.focus(); el.select(); }
  }
});

function deleteSel() {
  if (!sel.length) return;
  pushHistory();
  const ids = new Set(selItems().map(i => i.id)), wids = new Set(selWires().map(w => w.id));
  // wires attached to deleted parts keep their shape as free points
  for (const w of state.wires) w.pts = w.pts.map(p => p.id != null && ids.has(p.id) ? (([x, y]) => ({ x, y }))(resolve(p)) : p);
  state.items = state.items.filter(i => !ids.has(i.id));
  state.wires = state.wires.filter(w => !wids.has(w.id));
  sel = []; drawProps(); draw();
}

function copySel() {
  const items = selItems(), ids = new Set(items.map(i => i.id));
  const wires = state.wires.filter(w => sel.includes('w' + w.id) ||
    (w.pts.some(p => p.id != null) && w.pts.every(p => p.id == null ? false : ids.has(p.id))));
  if (!items.length && !wires.length) return null;
  return clone({ items, wires: wires.map(w => ({ ...w, pts: w.pts.map(p => p.id != null && !ids.has(p.id) ? (([x, y]) => ({ x, y }))(resolve(p)) : p) })) });
}
function paste(c, dx = 20, dy = 20) {
  if (!c) return;
  pushHistory();
  const map = {}; sel = [];
  for (const it of c.items) { const n = { ...clone(it), id: state.nextId++, x: it.x + dx, y: it.y + dy }; map[it.id] = n.id; state.items.push(n); sel.push('i' + n.id); }
  for (const w of c.wires) {
    const n = { ...clone(w), id: state.nextId++, pts: w.pts.map(p => p.id != null ? { id: map[p.id], port: p.port } : { x: p.x + dx, y: p.y + dy }) };
    state.wires.push(n); sel.push('w' + n.id);
  }
  // shift the clipboard so repeated pastes cascade
  for (const it of c.items) { it.x += dx; it.y += dy; }
  for (const w of c.wires) for (const p of w.pts) if (p.id == null) { p.x += dx; p.y += dy; }
  drawProps(); draw();
}

window.addEventListener('keydown', e => {
  const tag = document.activeElement.tagName;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && k === 'z') { e.shiftKey ? redo() : undo(); e.preventDefault(); }
  else if (mod && k === 'y') { redo(); e.preventDefault(); }
  else if (mod && k === 'd') { paste(copySel()); e.preventDefault(); }
  else if (mod && k === 'c') { clip = copySel(); }
  else if (mod && k === 'v') { paste(clip); }
  else if (mod && k === 'a') { sel = [...state.items.map(i => 'i' + i.id), ...state.wires.map(w => 'w' + w.id)]; drawProps(); draw(); e.preventDefault(); }
  else if (mod && k === 's') { saveJson(); e.preventDefault(); }
  else if (mod) return;
  else if (k === 'escape') { if (draft) finishDraft(); else { sel = []; drawProps(); } setWireMode(false); }
  else if (k === 'enter') finishDraft();
  else if (k === 'delete' || k === 'backspace') {
    if (draft) { draft.pts.pop(); if (!draft.pts.length) draft = null; draw(); } else deleteSel();
    e.preventDefault();
  }
  else if (k === 'r') act(e.shiftKey ? 'rotL' : 'rotR');
  else if (k === 'h') act('fx');
  else if (k === 'v') act('fy');
  else if (k === 'w') setWireMode(!wireMode);
  else if (k.startsWith('arrow') && sel.length) {
    const s = e.shiftKey ? 1 : GRID, dx = k === 'arrowleft' ? -s : k === 'arrowright' ? s : 0, dy = k === 'arrowup' ? -s : k === 'arrowdown' ? s : 0;
    pushHistory();
    for (const it of selItems()) { it.x += dx; it.y += dy; }
    for (const w of selWires()) for (const p of w.pts) if (p.id == null) { p.x += dx; p.y += dy; }
    drawProps(); draw(); e.preventDefault();
  }
});

// ---------------------------------------------------------------- palette

function addPreset(i, x, y) {
  pushHistory();
  const it = makeItem(i, x, y, state.nextId++);
  state.items.push(it); sel = ['i' + it.id];
  showTab('props'); drawProps(); draw();
}
PRESETS.forEach((p, i) => {
  const it = makeItem(i, 0, 0, 0), [w, h] = TYPES[it.type].size(it), m = Math.max(w + 14, (h + 14) * 1.5);
  it.label = '';
  const b = document.createElement('button');
  b.className = 'pal'; b.draggable = true;
  b.innerHTML = `<svg viewBox="${f(-m / 2)} ${f(-m / 3)} ${f(m)} ${f(m / 1.5)}" font-family="${FONT}">${itemSvg(it, false)}</svg>${p[0]}`;
  b.onclick = () => {
    const wr = $('wrap');
    addPreset(i, (wr.scrollLeft + wr.clientWidth / 2) / zoom, (wr.scrollTop + wr.clientHeight / 2) / zoom);
  };
  b.ondragstart = e => e.dataTransfer.setData('text/preset', i);
  $('palList').appendChild(b);
});
svg.addEventListener('dragover', e => e.preventDefault());
svg.addEventListener('drop', e => {
  const i = e.dataTransfer.getData('text/preset'); if (i === '') return;
  e.preventDefault(); const [x, y] = pt(e); addPreset(+i, x, y);
});

// ---------------------------------------------------------------- tabs, zoom, files

function showTab(t) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $('tab-props').hidden = t !== 'props'; $('tab-stages').hidden = t !== 'stages';
}
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));

function setZoom(z) { zoom = Math.min(4, Math.max(0.25, z)); $('bZoom').textContent = Math.round(zoom * 100) + '%'; draw(); }
$('bZoomIn').onclick = () => setZoom(zoom * 1.2);
$('bZoomOut').onclick = () => setZoom(zoom / 1.2);
$('bZoom').onclick = () => setZoom(1);
$('wrap').addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); } }, { passive: false });

function download(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportSvg() {
  const C = state.canvas;
  let [x, y, w, h] = [0, 0, C.w, C.h];
  if ($('crop').checked && state.items.length + state.wires.length) {
    const b = $('content').getBBox();
    [x, y, w, h] = [Math.floor(b.x - 16), Math.floor(b.y - 16), Math.ceil(b.width + 32), Math.ceil(b.height + 32)];
  }
  return { w, h, text: `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="${NSX}" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}" font-family="${FONT}">` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.bg}"/>${contentSvg(false)}</svg>` };
}
function saveJson() { download('fridge_wiring.json', new Blob([JSON.stringify(state)], { type: 'application/json' })); }

$('bSvg').onclick = () => download('fridge_wiring.svg', new Blob([exportSvg().text], { type: 'image/svg+xml' }));
$('bPng').onclick = () => {
  const { w, h, text } = exportSvg(), scale = 3, img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale;
    const ctx = c.getContext('2d'); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, w, h);
    c.toBlob(b => download('fridge_wiring.png', b));
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
};
$('bSave').onclick = saveJson;
$('bOpen').onclick = () => $('fileOpen').click();
$('fileOpen').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try { pushHistory(); state = normalize(JSON.parse(await file.text())); sel = []; afterLoad(); }
  catch (err) { alert('Could not read that file: ' + err.message); }
  e.target.value = '';
};
$('bNew').onclick = () => { if (!confirm('Start a new, empty diagram?')) return; pushHistory(); state = freshState(); sel = []; afterLoad(); };
$('bExample').onclick = () => { pushHistory(); buildExample(); sel = []; afterLoad(); };
$('bWire').onclick = () => setWireMode(!wireMode);
$('bUndo').onclick = undo; $('bRedo').onclick = redo;
$('bDel').onclick = deleteSel;
$('bDup').onclick = () => paste(copySel());

// ---------------------------------------------------------------- example diagram

function buildExample() {
  state = freshState();
  const A = (name, x, y, o = {}) => { const it = makeItem(name, x, y, state.nextId++); Object.assign(it, o); state.items.push(it); return it; };
  const W = (pts, color, o = {}) => state.wires.push({ id: state.nextId++, ...clone(wireStyle), pts, color, ...o });
  const bands = [64, 112, 160, 208];
  const column = (x, name, extra) => {
    A('Text', x, 22, { text: name, fontSize: 15 });
    bands.forEach(y => A('Attenuator', x, y));
    A('IR filter', x, 262);
    extra.forEach(([p, o], i) => A(p, x, 302 + 40 * i, o));
  };
  const dev = A('Box / device', 640, 520, { w: 220, h: 160, text: 'Device\n(drop a chip image here)', fontSize: 13 });
  column(300, 'IN 1', [['Attenuator', { text: '20 dB' }], ['Low-pass filter', {}]]);
  W([{ x: 300, y: 32 }, { x: 300, y: 520 }, { id: dev.id, port: 0 }], PURPLE);
  column(420, 'IN 20', [['Low-pass filter', {}]]);
  W([{ x: 420, y: 32 }, { x: 420, y: 640 }, { x: 640, y: 640 }, { id: dev.id, port: 3 }], YELLOW);
  column(980, 'IN 19', [['Low-pass filter', { text: 'VLF 8.4' }]]);
  const cp = A('Directional coupler', 994, 520);
  W([{ x: 980, y: 32 }, { id: cp.id, port: 2 }], INK);
  A('Text', 1140, 16, { text: 'OUT 1', fontSize: 15 });
  const hemt = A('HEMT', 1140, 62, { size: 48 });
  A('IR filter', 1140, 262);
  A('Low-pass filter', 1140, 302, { text: 'VLF 8.4' });
  A('Low-pass filter', 1140, 342);
  A('2-port circulator', 1140, 400, { rot: 90 }); A('2-port circulator', 1140, 450, { rot: 90 });
  A('3-port circulator', 860, 520);
  A('Double-junction circ.', 920, 520);
  A('TWPA', 1070, 520, { label: 'TWPA\n1061', labelDy: 36 });
  W([{ id: dev.id, port: 1 }, { x: 1140, y: 520 }, { id: hemt.id, port: 0 }], PURPLE);
  A('Title box', 90, 680, { text: 'Bashful\nNOV 04 2025\nCooldown' });
}

// ---------------------------------------------------------------- boot

setInterval(() => { try { localStorage.setItem('fridgeWiring.v3', JSON.stringify(state)); } catch {} }, 3000);
try { const s = localStorage.getItem('fridgeWiring.v3'); if (s) state = normalize(JSON.parse(s)); else buildExample(); }
catch { buildExample(); }
syncStagePanel(); drawProps(); draw();
