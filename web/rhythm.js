// Stage duel — a Guitar Hero–style rhythm battle.
// The track in /music is decoded in the browser, its tempo and beats are detected,
// and a four-lane chart is generated for each difficulty.
import { drawStageBackdrop, drawStagePad, drawCreature } from '/art.js';
import { escapeHtml as e, icon } from '/engine.js';

const LANES = 4;
const LANE_COLORS = ['#7be38d', '#ff6f8e', '#ffd36b', '#6cb8ff'];
const LANE_KEYS = { d: 0, f: 1, j: 2, k: 3, arrowleft: 0, arrowdown: 1, arrowup: 2, arrowright: 3 };
const KEY_LABELS = ['D', 'F', 'J', 'K'];
const JUDGES = [
  { name: 'PERFECT', window: .05, points: 100, weight: 1, color: '#d8fa93' },
  { name: 'GREAT', window: .095, points: 70, weight: .75, color: '#9fe3ff' },
  { name: 'GOOD', window: .145, points: 40, weight: .4, color: '#f6cf8f' },
];
const MISS = { name: 'MISS', color: '#ff7b98' };
const DIFFICULTIES = {
  easy: { label: 'Easy', approach: 2.1, everyOther: true, offbeats: false, threshold: .2, chordEvery: 0, holdEvery: 16, holdUnits: 3, missHurt: 5, heal: 1.4, needed: .55 },
  normal: { label: 'Normal', approach: 1.6, everyOther: false, offbeats: false, threshold: .26, chordEvery: 8, holdEvery: 16, holdUnits: 2, missHurt: 7, heal: 1.1, needed: .62 },
  hard: { label: 'Hard', approach: 1.15, everyOther: false, offbeats: true, threshold: .24, chordEvery: 2, holdEvery: 16, holdUnits: 1.5, missHurt: 8, heal: .9, needed: .68 },
};
const OFFSET_KEY = 'freestylomon.audioOffset';
const DIFFICULTY_KEY = 'freestylomon.stageDifficulty';
const analysisCache = new Map();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

function storedNumber(key, fallback) {
  const raw = storedText(key), value = Number(raw);
  return raw !== null && Number.isFinite(value) ? value : fallback;
}
function storedText(key) { try { return localStorage.getItem(key); } catch { return null; } }
function store(key, value) { try { localStorage.setItem(key, String(value)); } catch { /* storage unavailable */ } }

export function trackTitle(file) {
  return String(file || 'Untitled').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/([a-z])(\d)/gi, '$1 $2').replace(/\b\w/g, c => c.toUpperCase());
}

// ------------------------------------------------------------- analysis ---

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = -2 * Math.PI / len, wr = Math.cos(angle), wi = Math.sin(angle), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const next = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = next;
      }
    }
  }
}

function percentile(values, q) {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] || 0;
}

// Spectral-flux onset envelope plus a per-frame "brightness" used to pick lanes.
function analyze(buffer) {
  const factor = Math.max(1, Math.round(buffer.sampleRate / 22050));
  const sr = buffer.sampleRate / factor;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const length = Math.floor(buffer.length / factor);
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const data of channels) for (let k = 0; k < factor; k++) sum += data[i * factor + k];
    mono[i] = sum / (channels.length * factor);
  }
  const N = 1024, hop = 256, fps = sr / hop, frames = Math.max(1, Math.floor((length - N) / hop));
  const win = new Float32Array(N).map((_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / (N - 1)));
  const bin = hz => Math.max(1, Math.min(N / 2 - 1, Math.round(hz / (sr / N))));
  const lowEnd = bin(160), top = bin(9000);
  const re = new Float32Array(N), im = new Float32Array(N), previous = new Float32Array(N / 2);
  const flux = new Float32Array(frames), low = new Float32Array(frames), bright = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const offset = f * hop;
    for (let i = 0; i < N; i++) { re[i] = mono[offset + i] * win[i]; im[i] = 0; }
    fft(re, im);
    let total = 0, lows = 0, weighted = 0;
    for (let k = 1; k <= top; k++) {
      const magnitude = Math.log1p(Math.hypot(re[k], im[k]) * 20);
      const rise = magnitude - previous[k];
      previous[k] = magnitude;
      if (rise <= 0) continue;
      total += rise; weighted += rise * Math.log2(k);
      if (k < lowEnd) lows += rise;
    }
    flux[f] = total; low[f] = total ? lows / total : 0; bright[f] = total ? weighted / total : 0;
  }
  const env = new Float32Array(frames), span = Math.round(fps * .12);
  let running = 0;
  for (let i = 0; i < frames; i++) {
    running += flux[i] - (i - 2 * span - 1 >= 0 ? flux[i - 2 * span - 1] : 0);
    const centre = i - span;
    if (centre >= 0) env[centre] = Math.max(0, flux[centre] - running / (2 * span + 1));
  }
  const grid = findGrid(env, fps, buffer.duration);
  return { ...grid, fps, env, low, bright, duration: buffer.duration, norm: percentile(env, .985) || 1 };
}

function findGrid(env, fps, duration) {
  const maxLag = Math.ceil(fps * 4);
  const ac = new Float32Array(maxLag + 2);
  for (let lag = Math.floor(fps * .3); lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = lag; i < env.length; i++) sum += env[i] * env[i - lag];
    ac[lag] = sum / (env.length - lag);
  }
  const at = lag => { const i = Math.floor(lag), t = lag - i; return i + 1 < ac.length ? ac[i] * (1 - t) + ac[i + 1] * t : 0; };
  let bpm = 120, bestScore = -1;
  for (let candidate = 60; candidate <= 200; candidate += .5) {
    const lag = fps * 60 / candidate;
    const score = (at(lag) + .5 * at(lag * 2) + .25 * at(lag * 4)) * Math.exp(-.5 * Math.pow(Math.log2(candidate / 120) / .9, 2));
    if (score > bestScore) { bestScore = score; bpm = candidate; }
  }
  const fit = (tempo, phase) => {
    const period = 60 / tempo;
    let sum = 0, count = 0;
    for (let t = phase; t < duration; t += period) {
      const i = Math.round(t * fps);
      sum += Math.max(env[i - 1] || 0, env[i] || 0, env[i + 1] || 0); count++;
    }
    return count ? sum / count : 0;
  };
  let best = { score: -1, bpm, offset: 0 };
  for (let tempo = bpm * .97; tempo <= bpm * 1.03; tempo += .02) {
    const period = 60 / tempo;
    for (let phase = 0; phase < period; phase += period / 48) {
      const score = fit(tempo, phase);
      if (score > best.score) best = { score, bpm: tempo, offset: phase };
    }
  }
  const rounded = Math.round(best.bpm);
  if (Math.abs(best.bpm - rounded) < .15) {
    const period = 60 / rounded;
    let snapped = { score: -1, bpm: rounded, offset: 0 };
    for (let phase = 0; phase < period; phase += period / 96) {
      const score = fit(rounded, phase);
      if (score > snapped.score) snapped = { score, bpm: rounded, offset: phase };
    }
    if (snapped.score >= best.score * .985) best = snapped;
  }
  return { bpm: best.bpm, offset: best.offset };
}

// Builds a chart: notes on the beat grid wherever the music has a real onset.
export function buildChart(analysis, difficulty) {
  const cfg = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  const { bpm, offset, duration, fps, env, low, bright, norm } = analysis;
  const beat = 60 / bpm, unit = bpm < 100 ? beat / 2 : beat;
  const peak = t => {
    const i = Math.round(t * fps);
    let value = 0, frame = i;
    for (let k = -3; k <= 3; k++) { const v = env[i + k] || 0; if (v > value) { value = v; frame = i + k; } }
    return { value: value / norm, frame };
  };
  const sub = cfg.offbeats ? 2 : 1, step = unit / sub;
  const slots = [];
  for (let k = 0; ; k++) {
    const time = offset + k * step;
    if (time > duration - .12) break;
    const onGrid = k % sub === 0, index = Math.floor(k / sub);
    if (cfg.everyOther && index % 2) continue;
    const p = peak(time);
    if (p.value < (onGrid ? cfg.threshold : cfg.threshold * 1.8)) continue;
    slots.push({ time, index, onGrid, strength: p.value, frame: p.frame });
  }
  if (!slots.length) return [];
  // Lanes follow each phrase's own contour: darker hits to the left, brighter to the right.
  const brightness = slots.map(slot => bright[slot.frame] - 1.5 * low[slot.frame]);
  const lanes = new Array(slots.length);
  const phrases = new Map();
  slots.forEach((slot, i) => {
    const phrase = Math.floor(slot.index / 8);
    if (!phrases.has(phrase)) phrases.set(phrase, []);
    phrases.get(phrase).push(i);
  });
  for (const [phrase, members] of phrases) {
    const ordered = [...members].sort((a, b) => brightness[a] - brightness[b] || a - b);
    ordered.forEach((slot, order) => {
      const lane = Math.min(LANES - 1, Math.floor(order / ordered.length * LANES));
      lanes[slot] = Math.floor(phrase / 2) % 2 ? LANES - 1 - lane : lane;
    });
  }
  let notes = slots.map((slot, i) => ({ time: slot.time, lane: lanes[i], length: 0, index: slot.index, onGrid: slot.onGrid, strength: slot.strength }));
  for (let i = 1; i < notes.length; i++) {
    const previous = notes[i - 1], note = notes[i];
    if (note.lane === previous.lane && note.time - previous.time < unit * .55) note.lane = (note.lane + (i % 2 ? 1 : 3)) % LANES;
  }
  const extras = [];
  for (const note of notes) {
    if (cfg.holdEvery && note.onGrid && note.index % cfg.holdEvery === 0 && note.index > 0 && note.strength > .3) {
      note.length = Math.min(cfg.holdUnits * unit, duration - note.time - .3);
      if (note.length < unit * .8) note.length = 0;
    } else if (cfg.chordEvery && note.onGrid && note.index % cfg.chordEvery === 0 && note.strength > (cfg.chordEvery <= 2 ? .5 : .55)) {
      extras.push({ ...note, lane: (note.lane + 2) % LANES, length: 0 });
    }
  }
  notes = notes.concat(extras).sort((a, b) => a.time - b.time || a.lane - b.lane);
  const kept = [];
  for (const note of notes) {
    const blocked = kept.some(other => other.length > 0 && note.time > other.time + .01 && note.time < other.time + other.length + .12 && (difficulty !== 'hard' || other.lane === note.lane));
    if (!blocked) kept.push(note);
  }
  return kept.map((note, id) => ({ id, time: note.time, lane: note.lane, length: note.length }));
}

export async function analyzeTrack(url, context) {
  if (!analysisCache.has(url)) {
    analysisCache.set(url, (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Couldn’t load ${url.replace(/^\//, '')}. Restart the local server so it can serve the music folder.`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      await new Promise(resolve => setTimeout(resolve, 0));
      return { buffer, analysis: analyze(buffer) };
    })());
    analysisCache.get(url).catch(() => analysisCache.delete(url));
  }
  return analysisCache.get(url);
}

// ---------------------------------------------------------------- duel ---

export class StageDuel {
  constructor({ root, canvas, world, entity, party, best = 0, onFinish, onQuit }) {
    Object.assign(this, { root, canvas, world, entity, party, best, onFinish, onQuit });
    this.state = 'loading';
    this.difficulty = DIFFICULTIES[storedText(DIFFICULTY_KEY)] ? storedText(DIFFICULTY_KEY) : 'normal';
    this.hits = { you: -1e9, foe: -1e9 };
    this.offset = clamp(storedNumber(OFFSET_KEY, 0), -250, 250);
    this.pressed = new Array(LANES).fill(0);
    this.pointers = new Map();
    this.effects = [];
    this.charts = {};
    this.lead = party.find(monster => monster.hp > 0) || party[0];
    this.rival = entity.squad?.[0] || { species: this.lead.species, level: this.lead.level };
    this.context = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    this.master = this.context.createGain();
    this.master.connect(this.context.destination);
    this.onPointerDown = event => this.pointer(event, true);
    this.onPointerUp = event => this.pointer(event, false);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, this.onPointerUp);
    root.hidden = false;
    root.innerHTML = this.hudMarkup() + '<div class="duel-panel" data-panel></div>';
    root.addEventListener('click', this.onClick = event => this.click(event));
    this.panel = root.querySelector('[data-panel]');
    this.renderPanel();
    this.load();
  }

  hudMarkup() {
    const you = this.world.species[this.lead.species], foe = this.world.species[this.rival.species];
    return `<div class="duel-hud"><div class="duel-side you"><span class="duel-who"><b>YOU</b> ${e(you?.name || '')} <small>LV ${this.lead.level}</small></span><span class="duel-bar"><i data-bar="you"></i></span></div><div class="duel-score"><strong data-score>0</strong><span><b data-mult>×1</b><span data-combo>0 combo</span><span data-acc>—</span></span></div><div class="duel-side foe"><span class="duel-who"><b>${e(this.entity.name.toUpperCase())}</b> ${e(foe?.name || '')} <small>LV ${this.rival.level}</small></span><span class="duel-bar"><i data-bar="foe"></i></span></div></div>`;
  }

  async load() {
    try {
      const { buffer, analysis } = await analyzeTrack(`/music/${encodeURIComponent(this.entity.track)}`, this.context);
      if (this.destroyed) return;
      this.buffer = buffer; this.analysis = analysis;
      this.beat = 60 / analysis.bpm;
      for (const id of Object.keys(DIFFICULTIES)) this.charts[id] = buildChart(analysis, id);
      this.state = 'intro';
    } catch (error) {
      this.error = error.message || 'The track could not be played.';
      this.state = 'error';
    }
    this.renderPanel();
  }

  // ------------------------------------------------------------ panels ---

  renderPanel() {
    const panel = this.panel;
    panel.className = `duel-panel ${this.state}`;
    const title = trackTitle(this.entity.track);
    const keys = `<span class="duel-keys">${KEY_LABELS.map((key, lane) => `<kbd style="--lane:${LANE_COLORS[lane]}">${key}</kbd>`).join('')}<span>or arrow keys · Esc pauses</span></span>`;
    if (this.state === 'loading' || this.state === 'error' || this.state === 'intro') {
      const meta = this.analysis ? `${Math.round(this.analysis.bpm)} BPM · ${Math.floor(this.analysis.duration / 60)}:${String(Math.round(this.analysis.duration % 60)).padStart(2, '0')}` : 'Reading the track…';
      const body = this.state === 'error' ? `<p class="duel-error">${e(this.error)}</p>`
        : this.state === 'loading' ? '<p class="duel-loading"><i></i>Tuning the stage…</p>'
          : `<div class="duel-difficulty" role="radiogroup" aria-label="Difficulty">${Object.entries(DIFFICULTIES).map(([id, cfg]) => `<button type="button" role="radio" aria-checked="${id === this.difficulty}" data-difficulty="${id}"><strong>${cfg.label}</strong><small>${this.charts[id].length} notes</small></button>`).join('')}</div>
             <p class="duel-rules">Hit notes as they cross the line. Clean hits drain ${e(this.entity.name)}’s hype. Miss too many and the crowd boos you off.</p>
             ${keys}
             <div class="duel-offset"><span>Audio sync <small>Raise it if notes feel early</small></span><button type="button" data-offset="-10" aria-label="Lower audio offset">−</button><output data-offset-value>${this.offset > 0 ? '+' : ''}${this.offset} ms</output><button type="button" data-offset="10" aria-label="Raise audio offset">+</button></div>`;
      panel.innerHTML = `<div class="duel-card intro"><div class="eyebrow">STAGE DUEL</div><h2>vs ${e(this.entity.name)}</h2><p class="duel-track"><span>${icon('wave')}</span>${e(title)} <small>${e(meta)}</small></p>${body}<div class="duel-actions">${this.best ? `<span class="duel-best">Best ${this.best.toLocaleString()}</span>` : ''}<button type="button" class="button" data-quit>Leave</button>${this.state === 'intro' ? '<button type="button" class="button primary" data-start>Take the stage <kbd>Enter</kbd></button>' : ''}</div></div>`;
      if (this.state === 'intro') setTimeout(() => panel.querySelector('[data-start]')?.focus({ preventScroll: true }), 50);
    } else if (this.state === 'paused') {
      panel.innerHTML = '<div class="duel-card small"><div class="eyebrow">PAUSED</div><h2>Catch your breath</h2><div class="duel-actions stack"><button type="button" class="button primary" data-resume>Resume <kbd>Esc</kbd></button><button type="button" class="button" data-restart>Restart</button><button type="button" class="button danger" data-quit>Leave the duel</button></div></div>';
      setTimeout(() => panel.querySelector('[data-resume]')?.focus({ preventScroll: true }), 50);
    } else if (this.state === 'results') {
      const r = this.result;
      const heading = r.cleared ? 'Victory' : r.booed ? 'Booed off' : 'So close';
      const sub = r.cleared ? `${this.entity.name} hands you the pier.` : r.booed ? 'The crowd lost the thread. Run it back.' : `${this.entity.name} kept a little hype. Run it back.`;
      panel.innerHTML = `<div class="duel-card results ${r.cleared ? 'won' : 'lost'}"><div class="eyebrow">STAGE DUEL · ${DIFFICULTIES[this.difficulty].label.toUpperCase()}</div><div class="duel-result-head"><span class="duel-grade">${r.grade}</span><div><h2>${heading}</h2><p>${e(sub)}</p></div></div><p class="duel-final"><strong data-final-score>0</strong> points ${r.score > this.best ? '<span class="duel-new">New best</span>' : ''}</p><div class="duel-stats">${[['Perfect', r.counts.PERFECT, JUDGES[0].color], ['Great', r.counts.GREAT, JUDGES[1].color], ['Good', r.counts.GOOD, JUDGES[2].color], ['Miss', r.counts.MISS, MISS.color], ['Max combo', r.maxCombo], ['Accuracy', `${r.accuracy.toFixed(1)}%`]].map(([label, value, color]) => `<div><small>${label}</small><strong ${color ? `style="color:${color}"` : ''}>${value}</strong></div>`).join('')}</div><div class="duel-actions"><button type="button" class="button" data-restart>Retry <kbd>R</kbd></button><button type="button" class="button primary" data-continue>Continue <kbd>Enter</kbd></button></div></div>`;
      const scoreEl = panel.querySelector('[data-final-score]'), started = performance.now();
      const count = now => {
        if (!scoreEl.isConnected) return;
        const t = easeOut((now - started) / 1100);
        scoreEl.textContent = Math.round(r.score * t).toLocaleString();
        if (t < 1) requestAnimationFrame(count);
      };
      requestAnimationFrame(count);
      setTimeout(() => panel.querySelector('[data-continue]')?.focus({ preventScroll: true }), 50);
    } else {
      panel.innerHTML = '';
    }
  }

  click(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    const data = button.dataset;
    if (data.difficulty) { this.difficulty = data.difficulty; store(DIFFICULTY_KEY, this.difficulty); this.renderPanel(); }
    else if (data.offset) this.nudgeOffset(Number(data.offset));
    else if (data.start !== undefined || data.restart !== undefined) this.start();
    else if (data.resume !== undefined) this.resume();
    else if (data.continue !== undefined) this.finishDuel();
    else if (data.quit !== undefined) this.quit();
  }

  nudgeOffset(step) {
    this.offset = clamp(this.offset + step, -250, 250);
    store(OFFSET_KEY, this.offset);
    const output = this.panel.querySelector('[data-offset-value]');
    if (output) output.textContent = `${this.offset > 0 ? '+' : ''}${this.offset} ms`;
  }

  // ----------------------------------------------------------- playing ---

  async start() {
    if (!this.buffer) return;
    this.stopAudio();
    try { await this.context.resume(); } catch { /* resumed later by the browser */ }
    const cfg = DIFFICULTIES[this.difficulty];
    this.cfg = cfg;
    this.notes = this.charts[this.difficulty].map(note => ({ ...note }));
    this.stats = { score: 0, combo: 0, maxCombo: 0, weight: 0, counts: { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 } };
    this.hp = { you: 100, foe: 100 };
    this.shown = { you: 100, foe: 100 };
    this.damage = 100 / Math.max(1, cfg.needed * this.notes.length);
    this.holding = new Array(LANES).fill(null);
    this.effects = []; this.hits = { you: -1e9, foe: -1e9 };
    this.result = null;
    const lead = Math.max(cfg.approach + .6, this.beat * 4 + .3);
    this.play(this.context.currentTime + lead, 0);
    for (let k = 4; k >= 1; k--) {
      const at = this.startAt + this.analysis.offset - k * this.beat;
      if (at > this.context.currentTime + .02) this.click4(at, k === 4 ? 1320 : 880);
    }
    this.state = 'playing';
    this.renderPanel();
    this.lastScore = -1;
  }

  play(when, from) {
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.master);
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setValueAtTime(1, this.context.currentTime);
    source.start(when, from);
    this.source = source;
    this.startAt = when - from;
  }

  stopAudio() {
    if (!this.source) return;
    try { this.source.stop(); } catch { /* already stopped */ }
    this.source.disconnect();
    this.source = null;
  }

  click4(at, freq) {
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.frequency.value = freq; oscillator.type = 'triangle';
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(.12, at + .005);
    gain.gain.exponentialRampToValueAtTime(.0001, at + .09);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(at); oscillator.stop(at + .1);
  }

  thud() {
    const at = this.context.currentTime;
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = 'square'; oscillator.frequency.setValueAtTime(140, at); oscillator.frequency.exponentialRampToValueAtTime(70, at + .12);
    gain.gain.setValueAtTime(.05, at); gain.gain.exponentialRampToValueAtTime(.0001, at + .14);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(at); oscillator.stop(at + .15);
  }

  songTime(perfNow = performance.now()) {
    const context = this.context;
    let audioNow;
    const stamp = context.getOutputTimestamp?.();
    if (stamp && stamp.performanceTime > 0 && context.state === 'running') audioNow = stamp.contextTime + (perfNow - stamp.performanceTime) / 1000;
    else audioNow = context.currentTime - (context.outputLatency || context.baseLatency || 0);
    return audioNow - this.startAt - this.offset / 1000;
  }

  pause() {
    if (this.state !== 'playing') return;
    this.pausedAt = this.songTime();
    this.stopAudio();
    for (let lane = 0; lane < LANES; lane++) this.release(lane, this.pausedAt);
    this.state = 'paused';
    this.renderPanel();
  }

  resume() {
    if (this.state !== 'paused') return;
    const rewind = Math.max(this.beat * 2, 1.2);
    const from = this.pausedAt - rewind;
    const when = this.context.currentTime + .08;
    if (from >= 0) this.play(when, from);
    else this.play(when - from, 0);
    this.state = 'playing';
    this.renderPanel();
  }

  quit() {
    this.stopAudio();
    this.state = 'leaving';
    this.onQuit?.();
  }

  finishDuel() {
    if (!this.result) return;
    this.state = 'leaving';
    this.onFinish?.({ score: this.result.score, accuracy: Math.round(this.result.accuracy), cleared: this.result.cleared });
  }

  end(booed) {
    if (this.state !== 'playing') return;
    const total = Math.max(1, this.notes.length);
    const accuracy = this.stats.weight / total * 100;
    const cleared = !booed && this.hp.foe <= .001;
    const grade = accuracy >= 95 && !this.stats.counts.MISS ? 'S' : accuracy >= 92 ? 'A' : accuracy >= 82 ? 'B' : accuracy >= 70 ? 'C' : 'D';
    this.result = { score: Math.round(this.stats.score), accuracy, cleared, booed, grade, counts: { ...this.stats.counts }, maxCombo: this.stats.maxCombo };
    if (booed) {
      const at = this.context.currentTime;
      if (this.source) {
        this.source.playbackRate.setValueAtTime(1, at);
        this.source.playbackRate.linearRampToValueAtTime(.35, at + .9);
      }
      this.master.gain.setValueAtTime(1, at);
      this.master.gain.linearRampToValueAtTime(0, at + 1);
      setTimeout(() => this.stopAudio(), 1100);
    } else {
      const at = this.context.currentTime;
      this.master.gain.setValueAtTime(this.master.gain.value, at);
      this.master.gain.linearRampToValueAtTime(0, at + 1.2);
      setTimeout(() => this.stopAudio(), 1300);
    }
    this.state = 'ending';
    setTimeout(() => { if (this.state === 'ending') { this.state = 'results'; this.renderPanel(); } }, booed ? 1100 : 900);
  }

  multiplier() { return Math.min(4, 1 + Math.floor(this.stats.combo / 10)); }

  judgePress(lane, perfTime) {
    const t = this.songTime(perfTime);
    let target = null, best = Infinity;
    for (const note of this.notes) {
      if (note.lane !== lane || note.judged) continue;
      const delta = Math.abs(note.time - t);
      if (note.time - t > JUDGES[2].window) break;
      if (delta <= JUDGES[2].window && delta < best) { best = delta; target = note; }
    }
    if (!target) return;
    const judge = JUDGES.find(item => best <= item.window);
    target.judged = judge.name;
    target.delta = t - target.time;
    const stats = this.stats;
    stats.combo++;
    stats.maxCombo = Math.max(stats.maxCombo, stats.combo);
    stats.score += judge.points * this.multiplier();
    stats.weight += judge.weight;
    stats.counts[judge.name]++;
    this.hp.foe = Math.max(0, this.hp.foe - this.damage * judge.weight);
    if (judge.weight >= .75) this.hp.you = Math.min(100, this.hp.you + this.cfg.heal);
    this.hits.foe = performance.now();
    this.effects.push({ kind: 'burst', lane, start: performance.now(), color: LANE_COLORS[lane], strong: judge.name === 'PERFECT' });
    this.effects.push({ kind: 'text', text: judge.name, color: judge.color, start: performance.now(), late: target.delta > .025 ? 'LATE' : target.delta < -.025 ? 'EARLY' : '' });
    if (stats.combo && stats.combo % 25 === 0) this.effects.push({ kind: 'combo', start: performance.now(), value: stats.combo });
    if (target.length > 0) { target.holding = true; this.holding[lane] = target; }
  }

  release(lane, t = this.songTime()) {
    const note = this.holding[lane];
    if (!note) return;
    this.holding[lane] = null;
    note.holding = false;
    const end = note.time + note.length;
    const fraction = clamp((t - note.time) / note.length, 0, 1);
    if (end - t > .14) note.broken = true;
    else note.complete = true;
    this.stats.score += Math.round(note.length * 60 * (note.complete ? 1 : fraction)) * this.multiplier();
  }

  miss(note) {
    note.judged = 'MISS';
    this.stats.combo = 0;
    this.stats.counts.MISS++;
    this.hp.you = Math.max(0, this.hp.you - this.cfg.missHurt);
    this.hits.you = performance.now();
    this.effects.push({ kind: 'text', text: 'MISS', color: MISS.color, start: performance.now() });
    this.thud();
  }

  update(now) {
    if (this.state !== 'playing') return;
    const t = this.songTime(now);
    for (const note of this.notes) {
      if (note.time - t > 0) break;
      if (!note.judged && t - note.time > JUDGES[2].window) this.miss(note);
    }
    for (let lane = 0; lane < LANES; lane++) {
      const note = this.holding[lane];
      if (note && t >= note.time + note.length) this.release(lane, t);
      if (note && note.holding && Math.floor(t * 10) !== note.tick) { note.tick = Math.floor(t * 10); this.effects.push({ kind: 'spark', lane, start: now }); }
    }
    if (this.hp.you <= 0) { this.end(true); return; }
    const last = this.notes.at(-1);
    const finish = Math.max(last ? last.time + last.length + .9 : 0, Math.min(this.analysis.duration - .05, (last ? last.time + last.length : 0) + 2.5));
    if (t > finish) this.end(false);
  }

  // ------------------------------------------------------------- input ---

  key(event, down) {
    const key = event.key.toLowerCase();
    if (down && key === 'escape') {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      else if (this.state === 'intro' || this.state === 'error' || this.state === 'loading') this.quit();
      return true;
    }
    if (this.state === 'playing') {
      const lane = LANE_KEYS[key];
      if (lane === undefined) return false;
      if (down && !event.repeat) { this.pressed[lane] = performance.now(); this.judgePress(lane, event.timeStamp || performance.now()); }
      if (!down) { this.pressed[lane] = 0; this.release(lane, this.songTime(event.timeStamp || performance.now())); }
      return true;
    }
    if (!down) return false;
    if (this.state === 'intro') {
      const order = Object.keys(DIFFICULTIES);
      if (key === 'arrowleft' || key === 'arrowright') {
        const index = clamp(order.indexOf(this.difficulty) + (key === 'arrowright' ? 1 : -1), 0, order.length - 1);
        this.difficulty = order[index]; store(DIFFICULTY_KEY, this.difficulty); this.renderPanel();
        return true;
      }
      if ((key === 'enter' || key === ' ') && !event.target.closest?.('button')) { this.start(); return true; }
    }
    if (this.state === 'results') {
      if (key === 'r') { this.start(); return true; }
      if ((key === 'enter' || key === ' ') && !event.target.closest?.('button')) { this.finishDuel(); return true; }
    }
    return false;
  }

  laneAt(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const scale = this.canvas.width / rect.width;
    const x = (clientX - rect.left) * scale, y = (clientY - rect.top) * scale;
    const g = this.geometry;
    if (!g || y < g.farY) return -1;
    return clamp(Math.floor((x - (g.cx - g.nearW / 2)) / (g.nearW / LANES)), 0, LANES - 1);
  }

  pointer(event, down) {
    if (this.state !== 'playing') return;
    if (down) {
      const lane = this.laneAt(event.clientX, event.clientY);
      if (lane < 0) return;
      event.preventDefault();
      this.pointers.set(event.pointerId, lane);
      this.pressed[lane] = performance.now();
      this.judgePress(lane, event.timeStamp || performance.now());
    } else if (this.pointers.has(event.pointerId)) {
      const lane = this.pointers.get(event.pointerId);
      this.pointers.delete(event.pointerId);
      this.pressed[lane] = 0;
      this.release(lane, this.songTime(event.timeStamp || performance.now()));
    }
  }

  // ------------------------------------------------------------ render ---

  updateHud() {
    if (!this.stats) return;
    const bars = this.root.querySelectorAll('[data-bar]');
    for (const bar of bars) {
      const side = bar.dataset.bar;
      this.shown[side] += (this.hp[side] - this.shown[side]) * .18;
      bar.style.width = `${clamp(this.shown[side], 0, 100)}%`;
    }
    if (this.lastScore !== this.stats.score) {
      this.lastScore = this.stats.score;
      this.root.querySelector('[data-score]').textContent = Math.round(this.stats.score).toLocaleString();
    }
    const judged = this.notes.filter(note => note.judged).length;
    const accuracy = judged ? this.stats.weight / judged * 100 : 100;
    const mult = this.root.querySelector('[data-mult]');
    const value = `×${this.multiplier()}`;
    if (mult.textContent !== value) { mult.textContent = value; mult.dataset.level = this.multiplier(); }
    this.root.querySelector('[data-acc]').textContent = `${accuracy.toFixed(1)}%`;
    const combo = `${this.stats.combo} combo`, comboEl = this.root.querySelector('[data-combo]');
    if (comboEl.textContent !== combo) comboEl.textContent = combo;
  }

  draw(ctx, W, H, now) {
    this.update(now);
    const narrow = W < H * .95;
    const k = Math.min(W / (narrow ? 460 : 720), H / 420);
    const ox = (W - (narrow ? 460 : 720) * k) / 2, oy = Math.max(0, (H - 420 * k) / 2);
    const playing = ['playing', 'ending', 'paused'].includes(this.state);
    const t = playing ? (this.state === 'paused' ? this.pausedAt : this.songTime(now)) : -10;
    const beatPhase = this.analysis && t > -5 ? (((t - this.analysis.offset) / this.beat) % 1 + 1) % 1 : 0;
    const pulse = playing && t > 0 && this.state !== 'paused' ? Math.exp(-beatPhase * 5) : 0;
    drawStageBackdrop(ctx, { width: W, height: H, k, ox, oy, horizon: oy + (narrow ? 200 : 210) * k, time: now, narrow, pulse });

    const unit = Math.min(W, H) / 1000;
    const hitY = H - (narrow ? .14 : .12) * H, farY = narrow ? H * .3 : H * .18;
    const nearW = narrow ? W * .94 : Math.min(W * .44, H * .92), cx = W / 2, K = 3;
    this.geometry = { hitY, farY, nearW, cx };
    const pFar = 1 / (1 + K);
    const project = (lx, z) => {
      const p = 1 / (1 + K * z);
      return { x: cx + lx * nearW * p, y: farY + (hitY - farY) * (p - pFar) / (1 - pFar), p };
    };

    this.drawCreatures(ctx, W, H, k, now, narrow, pulse, unit);

    const zNear = -.09;
    const corners = [project(-.5, zNear), project(-.5, 1), project(.5, 1), project(.5, zNear)];
    ctx.save();
    ctx.beginPath(); corners.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y))); ctx.closePath();
    const board = ctx.createLinearGradient(0, farY, 0, hitY);
    board.addColorStop(0, 'rgba(26,20,46,.35)'); board.addColorStop(.5, 'rgba(18,14,32,.78)'); board.addColorStop(1, 'rgba(14,11,26,.92)');
    ctx.fillStyle = board; ctx.fill();
    ctx.clip();
    for (let lane = 0; lane < LANES; lane++) {
      const a = project(-.5 + lane / LANES, zNear), b = project(-.5 + lane / LANES, 1), c = project(-.5 + (lane + 1) / LANES, 1), d = project(-.5 + (lane + 1) / LANES, zNear);
      const lit = this.pressed[lane] ? .1 : .035;
      const stripe = ctx.createLinearGradient(0, farY, 0, hitY);
      stripe.addColorStop(0, `${LANE_COLORS[lane]}00`); stripe.addColorStop(1, LANE_COLORS[lane] + Math.round(lit * 255).toString(16).padStart(2, '0'));
      ctx.fillStyle = stripe;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
    }
    ctx.lineWidth = Math.max(1, 1.2 * unit);
    for (let i = 1; i < LANES; i++) {
      const a = project(-.5 + i / LANES, zNear), b = project(-.5 + i / LANES, 1);
      ctx.strokeStyle = 'rgba(220,210,255,.12)'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    if (this.analysis && playing) {
      const approach = this.cfg.approach;
      const first = Math.ceil((t - this.analysis.offset) / this.beat);
      for (let n = first; ; n++) {
        const time = this.analysis.offset + n * this.beat, z = (time - t) / approach;
        if (z > 1) break;
        if (z < zNear) continue;
        const left = project(-.5, z), right = project(.5, z);
        const bar = ((n % 4) + 4) % 4 === 0;
        ctx.strokeStyle = bar ? `rgba(236,226,255,${.28 * left.p + .05})` : `rgba(236,226,255,${.12 * left.p})`;
        ctx.lineWidth = Math.max(1, (bar ? 3 : 1.4) * unit * left.p);
        ctx.beginPath(); ctx.moveTo(left.x, left.y); ctx.lineTo(right.x, right.y); ctx.stroke();
      }
    }
    const fade = ctx.createLinearGradient(0, farY, 0, farY + (hitY - farY) * .35);
    fade.addColorStop(0, 'rgba(18,14,34,.95)'); fade.addColorStop(1, 'rgba(18,14,34,0)');
    ctx.fillStyle = fade; ctx.fillRect(0, farY - 2, W, (hitY - farY) * .35 + 2);
    ctx.restore();

    const mult = this.stats ? this.multiplier() : 1;
    const railColor = ['#e8e0ff', '#e8e0ff', '#7be38d', '#6cb8ff', '#d39bff'][mult];
    for (const side of [-.5, .5]) {
      const a = project(side, zNear), b = project(side, 1);
      ctx.lineCap = 'round';
      ctx.strokeStyle = railColor + '40'; ctx.lineWidth = 9 * unit; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = railColor; ctx.lineWidth = 2.4 * unit; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    const laneX = lane => -.5 + (lane + .5) / LANES;
    const laneW = nearW / LANES;
    const hitLeft = project(-.5, 0), hitRight = project(.5, 0);
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 10 * unit;
    ctx.beginPath(); ctx.moveTo(hitLeft.x, hitY); ctx.lineTo(hitRight.x, hitY); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${.55 + pulse * .35})`; ctx.lineWidth = 2.5 * unit;
    ctx.beginPath(); ctx.moveTo(hitLeft.x, hitY); ctx.lineTo(hitRight.x, hitY); ctx.stroke();

    for (let lane = 0; lane < LANES; lane++) {
      const { x } = project(laneX(lane), 0), r = laneW * .3, color = LANE_COLORS[lane];
      const pressed = this.pressed[lane] > 0;
      ctx.beginPath(); ctx.ellipse(x, hitY + 2 * unit, r * 1.06, r * .5, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, hitY - (pressed ? 0 : 3 * unit), r, r * .48, 0, 0, Math.PI * 2);
      ctx.fillStyle = pressed ? color : 'rgba(22,18,38,.95)'; ctx.fill();
      ctx.lineWidth = 4 * unit; ctx.strokeStyle = color; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x, hitY - (pressed ? 0 : 3 * unit), r * .55, r * .24, 0, 0, Math.PI * 2);
      ctx.fillStyle = pressed ? 'rgba(255,255,255,.7)' : `${color}55`; ctx.fill();
      if (!narrow || !matchMedia('(pointer: coarse)').matches) {
        ctx.font = `800 ${Math.round(15 * unit)}px ui-monospace, "Cascadia Mono", Consolas, monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(230,222,245,.6)'; ctx.fillText(KEY_LABELS[lane], x, hitY + r * .62);
      }
    }

    if (this.notes && playing) {
      const approach = this.cfg.approach;
      for (let i = this.notes.length - 1; i >= 0; i--) {
        const note = this.notes[i];
        const z = (note.time - t) / approach;
        const zEnd = (note.time + note.length - t) / approach;
        if (z > 1.02 || zEnd < zNear - .05) continue;
        const hit = note.judged && note.judged !== 'MISS';
        if (hit && !note.holding && !note.length) continue;
        if (hit && note.length && !note.holding && (note.complete || note.broken)) continue;
        const color = note.judged === 'MISS' || note.broken ? '#6d6880' : LANE_COLORS[note.lane];
        if (note.length) {
          const z0 = note.holding ? 0 : Math.max(z, zNear), z1 = Math.min(zEnd, 1);
          if (z1 > z0) {
            const steps = 10;
            ctx.beginPath();
            for (let s = 0; s <= steps; s++) {
              const zz = z0 + (z1 - z0) * s / steps, wobble = note.holding ? Math.sin(now / 40 + s) * .006 : 0;
              const point = project(laneX(note.lane) - .045 + wobble, zz);
              s ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y);
            }
            for (let s = steps; s >= 0; s--) {
              const zz = z0 + (z1 - z0) * s / steps, wobble = note.holding ? Math.sin(now / 40 + s) * .006 : 0;
              const point = project(laneX(note.lane) + .045 + wobble, zz);
              ctx.lineTo(point.x, point.y);
            }
            ctx.closePath();
            ctx.fillStyle = note.holding ? color : color + 'aa'; ctx.fill();
          }
        }
        const zz = note.holding ? 0 : z;
        if (zz < (note.judged === 'MISS' ? -.025 : zNear)) continue;
        const { x, y, p } = project(laneX(note.lane), zz);
        const rx = laneW * .36 * p, ry = rx * .5;
        const alpha = note.judged === 'MISS' ? clamp(.6 + zz * 24, 0, .6) : 1;
        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.ellipse(x, y + ry * .35, rx * 1.04, ry * 1.04, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fill();
        const gem = ctx.createLinearGradient(0, y - ry, 0, y + ry);
        gem.addColorStop(0, '#ffffff'); gem.addColorStop(.25, color); gem.addColorStop(1, shade(color));
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = gem; ctx.fill();
        ctx.lineWidth = Math.max(1, 2.2 * unit * p); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(x, y - ry * .2, rx * .5, ry * .32, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    this.drawEffects(ctx, project, laneX, laneW, hitY, farY, cx, now, unit);
    if (playing && t < (this.analysis?.offset ?? 0) && this.state === 'playing') {
      const beatsLeft = Math.ceil(((this.analysis?.offset ?? 0) - t) / this.beat);
      if (beatsLeft <= 4 && beatsLeft >= 1) {
        const frac = (((this.analysis.offset - t) / this.beat) % 1 + 1) % 1;
        ctx.save();
        ctx.globalAlpha = clamp(frac * 1.4, 0, 1);
        ctx.font = `900 ${Math.round(120 * unit * (1 + (1 - frac) * .25))}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f4efff'; ctx.shadowColor = '#d8fa93'; ctx.shadowBlur = 30 * unit;
        ctx.fillText(beatsLeft === 4 ? 'READY' : String(beatsLeft), cx, farY + (hitY - farY) * .45);
        ctx.restore();
      }
    }
    if (this.stats) this.updateHud();
  }

  drawCreatures(ctx, W, H, k, now, narrow, pulse, unit) {
    const you = this.world.species[this.lead.species], foe = this.world.species[this.rival.species];
    const size = narrow ? W / 120 : Math.min(W, H) / 105;
    const youX = narrow ? W * .2 : W * .15, youY = narrow ? H * .27 : H * .74;
    const foeX = narrow ? W * .8 : W * .85, foeY = narrow ? H * .27 : H * .58;
    const bop = (side, phase) => {
      const hit = now - this.hits[side];
      return { shake: hit < 300 ? Math.sin(hit / 20) * 6 * unit * (1 - hit / 300) : 0, flash: hit < 260 ? (1 - hit / 260) * .8 : 0, hop: pulse * 7 * unit * phase };
    };
    if (!narrow) {
      drawStagePad(ctx, youX, youY + 4 * unit, 90 * unit * 1.1, '157,215,229', k, now);
      drawStagePad(ctx, foeX, foeY + 4 * unit, 80 * unit * 1.1, '241,168,215', k, now);
    }
    const y = bop('you', 1), f = bop('foe', .8);
    const foeFaint = this.hp && this.hp.foe <= 0 ? .55 : 1;
    drawCreature(ctx, you, youX + y.shake, youY - y.hop, size, { flip: true, squash: 1 + pulse * .04, flash: y.flash });
    drawCreature(ctx, foe, foeX + f.shake, foeY - f.hop, size * .92, { squash: 1 + pulse * .035, flash: f.flash, alpha: foeFaint });
  }

  drawEffects(ctx, project, laneX, laneW, hitY, farY, cx, now, unit) {
    this.effects = this.effects.filter(effect => now - effect.start < (effect.kind === 'combo' ? 900 : 520));
    for (const effect of this.effects) {
      const age = now - effect.start;
      if (effect.kind === 'burst') {
        const { x } = project(laneX(effect.lane), 0), t = age / 520, r = laneW * (.3 + t * (effect.strong ? .55 : .4));
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = effect.color; ctx.lineWidth = 5 * unit * (1 - t);
        ctx.beginPath(); ctx.ellipse(x, hitY, r, r * .5, 0, 0, Math.PI * 2); ctx.stroke();
        for (let s = 0; s < 8; s++) {
          const angle = s / 8 * Math.PI * 2 + effect.lane;
          const d1 = laneW * (.25 + t * .5), d2 = laneW * (.32 + t * .75);
          ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * d1, hitY + Math.sin(angle) * d1 * .5 - t * 20 * unit); ctx.lineTo(x + Math.cos(angle) * d2, hitY + Math.sin(angle) * d2 * .5 - t * 20 * unit); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (effect.kind === 'spark') {
        const { x } = project(laneX(effect.lane), 0), t = age / 520;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = LANE_COLORS[effect.lane];
        for (let s = 0; s < 3; s++) {
          ctx.beginPath(); ctx.arc(x + (s - 1) * laneW * .12 * (1 + t), hitY - t * 60 * unit - s * 6 * unit, 3 * unit * (1 - t), 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (effect.kind === 'text' && effect === this.effects.filter(item => item.kind === 'text').at(-1)) {
        const t = age / 520, scale = 1 + (1 - easeOut(t * 3)) * .35;
        ctx.save();
        ctx.globalAlpha = 1 - Math.max(0, t - .5) * 2;
        ctx.translate(cx, hitY - (hitY - farY) * .22 - t * 12 * unit);
        ctx.scale(scale, scale);
        ctx.font = `900 ${Math.round(38 * unit)}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 6 * unit; ctx.strokeStyle = 'rgba(14,10,26,.85)'; ctx.strokeText(effect.text, 0, 0);
        ctx.fillStyle = effect.color; ctx.fillText(effect.text, 0, 0);
        if (effect.late) {
          ctx.font = `800 ${Math.round(14 * unit)}px ui-monospace, Consolas, monospace`;
          ctx.fillStyle = 'rgba(230,222,245,.75)'; ctx.fillText(effect.late, 0, 30 * unit);
        }
        ctx.restore();
      } else if (effect.kind === 'combo') {
        const t = age / 900;
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.font = `900 ${Math.round(64 * unit * (1 + t * .3))}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#d8fa93'; ctx.shadowColor = '#d8fa93'; ctx.shadowBlur = 24 * unit;
        ctx.fillText(`${effect.value} COMBO`, cx, farY + (hitY - farY) * .38);
        ctx.restore();
      }
    }
  }

  destroy() {
    this.destroyed = true;
    this.stopAudio();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    for (const type of ['pointerup', 'pointercancel']) this.canvas.removeEventListener(type, this.onPointerUp);
    this.root.removeEventListener('click', this.onClick);
    this.root.innerHTML = '';
    this.root.hidden = true;
    this.context.close().catch(() => {});
  }
}

function shade(hex) {
  const value = parseInt(hex.slice(1), 16);
  const channel = shift => Math.max(0, ((value >> shift) & 255) - 70);
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}
