import { openEngine, icon, mountIcons, escapeHtml as e, exportJson } from '/engine.js';
import { FieldRenderer, renderBattleScene, renderPortrait, paintItem, drawTransition } from '/art.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const stage = $('#stage');
const ctx = stage.getContext('2d', { alpha: false });
const game = $('#game');
const menu = $('#menu');
const menuButton = $('#menu-button');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const keyDirections = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };
const deltas = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const objectiveIcons = ['vinyl', 'tape', 'mic', 'flag'];
const WALK_MS = 205, RUN_MS = 120, TYPE_CPS = 46;
const renderer = new FieldRenderer();

let engine;
let menuOpen = false, page = null, lastPageKey = '', journalTab = 'quest', bagTarget = 0, battleMode = 'flows';
let talkLine = 0, typing = null;
let toastTimer, sound = false, audio, musicTimer, beat = 0;
let held = [], tapped = null, touchDir = null, touchRun = false, shiftDown = false;
let view = null, fx = null, scene = 'field', shownBattle = null;
let afterStep = null, queuedInteract = false, nextWalkAt = 0, stepsTaken = 0, lastTick = 0, battleLockUntil = 0;
let viewport = { w: 0, h: 0, dpr: 1, ratio: 1, tile: 48 }, needsResize = true, controlsH = 0;
let pixelBudget = 5.2e6, drawCost = 0, slowFrames = 0;
const battleFx = {};
const hpState = {};

mountIcons();
document.body.classList.add('loading-game');

// ----------------------------------------------------------------- sound ---

function playSound(freq = 440, volume = .06, duration = .115, type = 'triangle') {
  if (!sound || !audio || audio.state !== 'running') return;
  const oscillator = audio.createOscillator(), gain = audio.createGain();
  oscillator.frequency.value = freq; oscillator.type = type;
  gain.gain.setValueAtTime(volume, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(); oscillator.stop(audio.currentTime + duration);
}

function music() {
  const notes = [98, 98, 116.5, 130.8, 87.3, 87.3, 103.8, 116.5];
  const index = beat++ % 32;
  if (index % 4 === 0 || index % 8 === 6) playSound(notes[Math.floor(index / 4)], .048, .28, 'triangle');
  if ([3, 11, 15, 19, 27, 31].includes(index)) playSound(notes[Math.floor(index / 4)] * 4, .012, .24, 'sine');
  if (index % 4 === 2) playSound(169, .021, .11, 'triangle');
}

async function toggleSound() {
  if (sound) {
    sound = false;
    clearInterval(musicTimer);
  } else {
    if (!window.AudioContext) { toast('Sound is not available in this browser.'); return; }
    audio ||= new AudioContext();
    await audio.resume();
    sound = true;
    musicTimer = setInterval(music, 185);
    playSound(660, .04, .1, 'sine');
  }
  updateToggles();
}

// ------------------------------------------------------------ fullscreen ---

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    toast('Fullscreen is not available here.');
  }
}

function updateToggles() {
  const soundItem = $('#sound');
  soundItem.setAttribute('aria-checked', sound);
  soundItem.querySelector('.menu-icon').innerHTML = icon(sound ? 'sound' : 'mute');
  $('#fullscreen').setAttribute('aria-checked', Boolean(document.fullscreenElement));
}

if (!document.fullscreenEnabled) $('#fullscreen').hidden = true;
document.addEventListener('fullscreenchange', updateToggles);

// --------------------------------------------------------------- helpers ---

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function menuVisible() { return Boolean(menuOpen || page || engine?.result.shop); }
function safeColor(color) { return /^#[a-f\d]{6}$/i.test(color || '') ? color : '#c7b3ff'; }
function hpColor(percent) { return percent <= 25 ? '#ed86a2' : percent <= 50 ? '#e9bb7c' : '#c7ef84'; }

function toast(message) {
  if (!message) return;
  const inPanel = menuVisible() && (page || engine?.result.shop);
  const element = inPanel ? $('#panel-message') : $('#stage-message');
  clearTimeout(toastTimer);
  if (inPanel) {
    element.textContent = message; element.hidden = false;
    toastTimer = setTimeout(() => { element.hidden = true; }, Math.max(2600, message.length * 34));
  } else {
    element.textContent = message; element.classList.add('show');
    toastTimer = setTimeout(() => element.classList.remove('show'), Math.max(2800, message.length * 38));
  }
}

function hideToast() { clearTimeout(toastTimer); $('#stage-message').classList.remove('show'); }

function hpBar(monster, full = false) {
  const percent = Math.round(monster.hp / monster.max_hp * 100);
  return `<div class="hp-line"><span class="hp-track" role="meter" aria-label="HP" aria-valuenow="${monster.hp}" aria-valuemax="${monster.max_hp}" aria-valuemin="0"><i style="width:${percent}%;--hp-color:${hpColor(percent)}"></i></span>${full ? `<span>${monster.hp} / ${monster.max_hp} HP</span>` : ''}</div>`;
}

function badge(world, style) {
  const definition = world.styles[style];
  return definition ? `<span class="style-badge" style="--style-color:${safeColor(definition.color)}">${e(definition.name)}</span>` : '';
}

function portrait(id) { return `<canvas class="portrait" data-portrait="${e(id)}" aria-hidden="true"></canvas>`; }

function paintPortraits(root) {
  for (const canvas of root.querySelectorAll('[data-portrait]')) renderPortrait(canvas, engine.world.species[canvas.dataset.portrait]);
  for (const canvas of root.querySelectorAll('[data-item-art]')) paintItem(canvas, canvas.dataset.itemArt);
}

function setMarkup(element, markup) {
  if (element.renderedMarkup === markup) return false;
  element.innerHTML = markup;
  element.renderedMarkup = markup;
  paintPortraits(element);
  return true;
}

function moveFocus(selector, step) {
  const items = $$(selector).filter(element => !element.disabled && !element.hidden && element.offsetParent !== null);
  if (!items.length) return;
  const index = items.indexOf(document.activeElement);
  const next = index === -1 ? (step > 0 ? items[0] : items.at(-1)) : items[(index + step + items.length) % items.length];
  next.focus();
  if (menuOpen && !page) playSound(760, .02, .04, 'sine');
}

function questInfo() {
  const { world, save } = engine;
  const labels = world.objectives.slice(0, -1);
  const done = labels.filter(objective => save.flags[objective.flag]).length;
  const last = world.objectives.at(-1);
  const next = world.objectives.find(objective => !save.flags[objective.flag]);
  const title = next ? (next === last ? 'Challenge Wander Onys' : 'Unite the indie labels') : 'Dockside is independent';
  const detail = !next ? 'The district’s artists own their masters.' : (done ? next.detail : 'Earn three co-signs to challenge Wander Onys Co.');
  return { labels, done, next, title, detail };
}

// ------------------------------------------------------------------- HUD ---

function showLocation() {
  const element = $('#location');
  element.classList.remove('enter');
  void element.offsetWidth;
  element.classList.add('enter');
}

function hud() {
  const { world, save } = engine;
  const mapId = view?.map || save.position.map;
  const map = world.maps[mapId];
  if (map) {
    $('#district').textContent = map.name;
    $('#region').textContent = map.subtitle;
  }
  const quest = questInfo();
  setMarkup($('#hud-quest'), quest.next ? `<i></i><span><b>${e(quest.next.name)}</b> · ${quest.done} / ${quest.labels.length} co-signs</span>` : `<i></i><span><b>${e(quest.title)}</b></span>`);
}

function menuSummary() {
  const { world, save } = engine;
  const quest = questInfo();
  const signed = save.owned.filter(id => world.species[id]).length;
  const lead = save.battle?.active ?? 0;
  setMarkup($('#menu-summary'), `<div class="trainer-card"><div class="trainer-stats"><div><small>CREDITS</small><strong><span>${save.money.toLocaleString()}</span> CR</strong></div><div><small>CO-SIGNS</small><strong>${quest.done} / ${quest.labels.length}</strong></div><div><small>SIGNED</small><strong>${signed} / ${Object.keys(world.species).length}</strong></div></div><div class="trainer-quest"><i></i><span><b>${e(quest.title)}</b>${e(quest.detail)}</span></div><div class="party-strip">${save.party.map((monster, index) => {
    const percent = Math.round(monster.hp / monster.max_hp * 100);
    return `<span class="party-chip ${index === lead ? 'lead' : ''}" title="${e(world.species[monster.species].name)} · LV ${monster.level} · ${monster.hp}/${monster.max_hp} HP">${portrait(monster.species)}<i><b style="width:${percent}%;--hp-color:${hpColor(percent)}"></b></i></span>`;
  }).join('')}</div></div>`);
  $('#menu-crew-sub').textContent = `${save.party.length} / 6 in your crew`;
  const items = Object.entries(save.bag).filter(([id, count]) => count > 0 && world.items[id]).reduce((sum, [, count]) => sum + count, 0);
  $('#menu-bag-sub').textContent = `${items} item${items === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------- dialog ---

function renderDialog() {
  const result = engine.result, layer = $('#dialog');
  let markup = '', focusChoice = false;
  if (result.talk && scene === 'field') {
    const talk = result.talk, index = Math.min(talkLine, talk.lines.length - 1), line = talk.lines[index] ?? '';
    const key = `${talk.speaker}\u0000${index}\u0000${line}`;
    if (!typing || typing.key !== key) typing = { key, text: line, start: performance.now(), shown: -1, done: reduceMotion.matches || !line };
    const choices = index >= talk.lines.length - 1 && talk.choices.length > 0;
    const actions = typing.done && choices ? talk.choices.map((choice, i) => `<button class="button ${i === 0 ? 'primary' : ''}" data-choice="${i}" style="--n:${i}">${e(choice.label)}</button>`).join('') : '';
    focusChoice = Boolean(actions);
    markup = `<div class="dialog-box ${choices ? '' : 'clickable'}" data-advance-box><div class="dialog-speaker">${icon('talk')}${e(talk.speaker)}</div><p class="dialog-text"><span class="sr-only">${e(line)}</span><span class="typed" aria-hidden="true"></span></p>${typing.done && !choices ? '<i class="dialog-next" aria-hidden="true"></i>' : ''}<div class="dialog-actions">${actions}</div></div>`;
  } else if (result.starters && scene === 'field') {
    typing = null;
    markup = `<div class="dialog-box"><div class="dialog-speaker">${icon('talk')}MIRA VERSE</div><p class="dialog-text">Who takes the first mic?</p><div class="starter-grid">${engine.world.starters.map((id, index) => {
      const species = engine.world.species[id];
      return `<button class="starter-choice" data-starter="${e(id)}" style="--n:${index}">${portrait(id)}<strong>${e(species.name)}</strong>${badge(engine.world, species.style)}</button>`;
    }).join('')}</div><div class="dialog-actions"><button class="button" data-dismiss>Back</button></div></div>`;
  }
  if (!markup) {
    typing = null;
    if (!layer.hidden) { layer.hidden = true; layer.classList.remove('open'); layer.renderedMarkup = ''; layer.innerHTML = ''; delete layer.dataset.kind; }
    document.body.classList.remove('has-dialog');
    return;
  }
  const opening = layer.hidden;
  layer.hidden = false;
  document.body.classList.add('has-dialog');
  const changed = setMarkup(layer, markup);
  paintTyping(performance.now(), true);
  if (opening) {
    layer.classList.remove('open');
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('open')));
  }
  const kind = result.starters && !result.talk ? 'starters' : 'talk';
  if (kind === 'starters' && layer.dataset.kind !== 'starters') setTimeout(() => layer.querySelector('.starter-choice')?.focus({ preventScroll: true }), 80);
  layer.dataset.kind = kind;
  if (changed && focusChoice) layer.querySelector('[data-choice]')?.focus({ preventScroll: true });
}

function paintTyping(now, force = false) {
  if (!typing) return;
  const element = $('#dialog .typed');
  if (!element) return;
  if (!typing.done && Math.floor((now - typing.start) * TYPE_CPS / 1000) >= typing.text.length) {
    typing.done = true;
    renderDialog();
    return;
  }
  const count = typing.done ? typing.text.length : Math.floor((now - typing.start) * TYPE_CPS / 1000);
  if (count === typing.shown && !force) return;
  if (!typing.done && count > typing.shown && count % 3 === 0 && /\S/.test(typing.text[count - 1] || '')) playSound(880 + (count % 5) * 40, .012, .03, 'square');
  typing.shown = count;
  element.textContent = typing.text.slice(0, count);
}

function advance() {
  const talk = engine?.result.talk;
  if (!talk) return;
  if (typing && !typing.done) { typing.done = true; renderDialog(); return; }
  if (talkLine < talk.lines.length - 1) { talkLine++; typing = null; renderDialog(); playSound(620, .025, .05, 'sine'); }
  else if (!talk.choices.length) run({ op: 'close' });
}

// ---------------------------------------------------------------- battle ---

function battleData() {
  if (scene !== 'battle') return null;
  if (engine.save.battle) return { battle: engine.save.battle, party: engine.save.party };
  return shownBattle;
}

function paintHp(side) {
  const state = hpState[side];
  if (!state?.bar) return;
  const percent = clamp(state.shown / state.max * 100, 0, 100);
  state.bar.style.width = `${percent}%`;
  state.bar.style.setProperty('--hp-color', hpColor(percent));
  const value = Math.round(state.shown);
  state.text.textContent = `${value} / ${state.max} HP`;
  state.meter.setAttribute('aria-valuenow', value);
}

function tickHp(now, dt) {
  for (const side of ['enemy', 'player']) {
    const state = hpState[side];
    if (!state || state.shown === state.target || now < state.delayUntil) continue;
    const step = Math.max(.4, state.max * dt / 700);
    state.shown = state.shown > state.target ? Math.max(state.target, state.shown - step) : Math.min(state.target, state.shown + step);
    paintHp(side);
  }
}

function updateCard(side, monster, key) {
  const species = engine.world.species[monster.species];
  const slot = $(`#battle-overlay [data-card=${side}]`);
  let state = hpState[side];
  if (!state || state.key !== key || !slot.firstElementChild) {
    const sameMonster = state && state.key.split('|').slice(0, 2).join() === key.split('|').slice(0, 2).join();
    slot.innerHTML = `<div class="battle-stat ${side}-stat"><div class="stat-head"><strong>${e(species.name)}</strong><span>LV ${monster.level}</span></div><div class="stat-status"></div><div class="hp-line"><span class="hp-track" role="meter" aria-label="${e(species.name)} HP" aria-valuemin="0" aria-valuemax="${monster.max_hp}"><i></i></span><span class="hp-text"></span></div></div>`;
    state = hpState[side] = {
      key, shown: sameMonster ? state.shown : monster.hp, target: monster.hp, max: monster.max_hp,
      delayUntil: sameMonster ? state.delayUntil : 0,
      bar: slot.querySelector('.hp-track > i'), meter: slot.querySelector('.hp-track'), text: slot.querySelector('.hp-text'),
    };
    paintHp(side);
  }
  state.target = monster.hp; state.max = monster.max_hp;
  const status = monster.status ? `<span class="status-label">${monster.status === 'burn' ? 'HOARSE' : 'STUNNED'}</span>` : '';
  const holder = slot.querySelector('.stat-status');
  if (holder.innerHTML !== status) holder.innerHTML = status;
}

function renderBattleUI() {
  const overlay = $('#battle-overlay'), controls = $('#battle-controls');
  const data = battleData();
  overlay.hidden = !data;
  controls.hidden = !(data && engine.save.battle);
  if (!data) {
    if (overlay.innerHTML) { overlay.innerHTML = ''; delete hpState.enemy; delete hpState.player; controls.renderedMarkup = ''; controls.innerHTML = ''; }
    return;
  }
  const { world } = engine, battle = data.battle;
  const enemy = battle.enemies[battle.enemy], player = data.party[battle.active];
  if (!overlay.querySelector('.turn-label')) overlay.innerHTML = '<span class="turn-label"></span><div data-card="enemy"></div><div data-card="player"></div>';
  overlay.querySelector('.turn-label').textContent = `${battle.wild ? 'WILD SESSION' : battle.name.toUpperCase()} · ROUND ${battle.turn}`;
  updateCard('enemy', enemy, `${battle.enemy}|${enemy.species}|${enemy.level}`);
  updateCard('player', player, `${battle.active}|${player.species}|${player.level}`);
  if (!engine.save.battle) return;
  const forced = player.hp === 0;
  if (forced) battleMode = 'crew';
  let choices = '';
  if (battleMode === 'flows') {
    choices = `<div class="flow-grid">${player.moves.map((slot, index) => {
      const flow = world.moves[slot.id];
      return `<button class="flow" data-flow="${index}" ${slot.pp ? '' : 'disabled'} title="${e(flow.description)}" style="--style-color:${safeColor(world.styles[flow.style]?.color)}"><kbd>${index + 1}</kbd><strong>${e(flow.name)}</strong><span>${badge(world, flow.style)}<small>${slot.pp}/${flow.pp} PP</small></span></button>`;
    }).join('')}${player.moves.some(slot => slot.pp) ? '' : '<button class="flow" data-flow="999"><strong>Off the Dome</strong><span><small>Improvise</small></span></button>'}</div>`;
  } else if (battleMode === 'crew') {
    choices = `<div class="battle-options">${data.party.map((monster, index) => `<button class="button" data-switch="${index}" ${index === battle.active || !monster.hp ? 'disabled' : ''}>${portrait(monster.species)} ${e(world.species[monster.species].name)} <small>${monster.hp} HP</small></button>`).join('')}</div>`;
  } else {
    choices = `<label class="battle-target">Target <select data-bag-target>${targetOptions(engine.save, battle.active)}</select></label><div class="battle-options">${Object.entries(engine.save.bag).filter(([id, count]) => count > 0 && world.items[id] && !['repel', 'held', 'teach'].includes(world.items[id].effect) && (battle.wild || world.items[id].effect !== 'capture')).map(([id, count]) => `<button class="button" data-use="${e(id)}" title="${e(world.items[id].description)}">${e(world.items[id].name)} ×${count}</button>`).join('') || '<p class="muted">No usable items.</p>'}</div>`;
  }
  setMarkup(controls, `<div class="battle-logs" aria-live="polite">${battle.log.slice(-4).map((line, index) => `<div style="--n:${index}">${e(line)}</div>`).join('')}</div><div class="battle-choices"><div class="mini-tabs" aria-label="Battle action">${['flows', 'crew', 'bag'].map(tab => `<button data-battle-mode="${tab}" class="${battleMode === tab ? 'selected' : ''}" ${forced && tab !== 'crew' ? 'disabled' : ''}>${tab}</button>`).join('')}${battle.wild ? '<button data-flee>Run</button>' : ''}</div>${choices}</div>`);
}

function targetOptions(save, fallback = 0) {
  const active = bagTarget < save.party.length ? bagTarget : fallback;
  return save.party.map((monster, index) => `<option value="${index}" ${index === active ? 'selected' : ''}>${e(engine.world.species[monster.species].name)} (${monster.hp} HP)</option>`).join('');
}

function snapshotBattle() {
  const battle = engine.save.battle;
  if (!battle) return null;
  const enemy = battle.enemies[battle.enemy], player = engine.save.party[battle.active];
  return { enemyIndex: battle.enemy, enemyHp: enemy.hp, enemySpecies: enemy.species, active: battle.active, playerHp: player.hp, playerSpecies: player.species, battle: structuredClone(battle), party: structuredClone(engine.save.party) };
}

function detectHits(before, after, now) {
  const enemy = after.enemies[after.enemy], player = engine.save.party[after.active];
  const playerName = engine.world.species[before.playerSpecies]?.name || '';
  const sameEnemy = before.enemyIndex === after.enemy, samePlayer = before.active === after.active;
  const enemyNow = sameEnemy ? enemy.hp : after.enemies[before.enemyIndex]?.hp ?? before.enemyHp;
  const enemyHurt = enemyNow < before.enemyHp;
  const playerHurt = samePlayer && player.hp < before.playerHp;
  const playerFirst = (after.log[0] || '').startsWith(`${playerName} used`);
  const t0 = now + 140;
  let enemyAt = t0, playerAt = t0;
  if (enemyHurt && playerHurt) { if (playerFirst) playerAt = t0 + 560; else enemyAt = t0 + 560; }
  if (enemyHurt) {
    battleFx.enemyHit = enemyAt;
    if (hpState.enemy && sameEnemy) hpState.enemy.delayUntil = enemyAt;
    if (enemyNow === 0) battleFx.enemyFaint = enemyAt + 380;
  }
  if (playerHurt) {
    battleFx.playerHit = playerAt;
    if (hpState.player) hpState.player.delayUntil = playerAt;
    if (player.hp === 0) battleFx.playerFaint = playerAt + 380;
  }
  if (!sameEnemy) {
    const defeated = after.enemies[before.enemyIndex];
    battleFx.enemyOverride = { monster: { ...defeated, hp: 0 }, until: enemyAt + 1000 };
    battleFx.enemyFaint = enemyAt + 380;
    battleFx.enemyIn = enemyAt + 1000;
  }
  if (!samePlayer) battleFx.playerIn = now;
  battleLockUntil = Math.max(enemyHurt ? enemyAt : 0, playerHurt ? playerAt : 0, now) + 520;
}

function startBattleTransition(now = performance.now()) {
  hideToast();
  const reduced = reduceMotion.matches;
  fx = {
    kind: 'battle', reduced, start: now, dur: reduced ? 500 : 1100, mid: reduced ? 250 : 680,
    onMid(time) {
      scene = 'battle'; shownBattle = null;
      Object.assign(battleFx, { start: time, enemyIn: time, playerIn: time + 120, enemyHit: 0, playerHit: 0, enemyFaint: 0, playerFaint: 0, enemyOverride: null });
      delete hpState.enemy; delete hpState.player;
      render();
    },
  };
}

function endBattle(before, notice, now) {
  const battle = before.battle, party = before.party;
  let delay = 250;
  if (/won|Signed/.test(notice)) {
    battle.enemies[battle.enemy].hp = 0;
    Object.assign(battleFx, { enemyHit: now + 80, enemyFaint: now + 420, enemyOverride: null });
    if (hpState.enemy) { hpState.enemy.target = 0; hpState.enemy.delayUntil = now + 80; }
    delay = 1500;
  } else if (/lost the set/.test(notice)) {
    party[battle.active].hp = 0;
    Object.assign(battleFx, { playerHit: now + 80, playerFaint: now + 420 });
    delay = 1500;
  }
  shownBattle = { battle, party };
  fx = { kind: 'fade', start: now + delay, dur: 760, mid: 360, onMid() { scene = 'field'; shownBattle = null; snapView(); render(); showLocation(); } };
}

// ------------------------------------------------------------------ menu ---

function renderMenu() {
  const shop = engine.result.shop;
  const pageVisible = Boolean(page || shop);
  menu.classList.toggle('is-open', menuOpen);
  menu.classList.toggle('has-page', pageVisible);
  menu.inert = !(menuOpen || pageVisible);
  game.inert = menuOpen || pageVisible;
  document.body.classList.toggle('menu-visible', menuOpen || pageVisible);
  document.body.classList.toggle('shop-open', Boolean(shop) && !menuOpen);
  menuButton.setAttribute('aria-expanded', menuOpen);
  menuButton.setAttribute('aria-label', menuOpen ? 'Close menu' : 'Open menu');
  for (const item of $$('.menu-item[data-page]')) item.classList.toggle('current', item.dataset.page === page);
  if (menuOpen) menuSummary();
  if (pageVisible) renderPage();
  else lastPageKey = '';
}

function inventoryRow(item, count, actions, index) {
  return `<article class="inventory-row rise" style="--n:${index}"><div class="item-frame"><canvas data-item-art="${e(item.icon)}" aria-hidden="true"></canvas></div><div><strong>${e(item.name)} <small>×${count}</small></strong><p>${e(item.description)}</p></div><div class="row-actions">${actions}</div></article>`;
}

function renderPage() {
  const shop = engine.result.shop;
  const content = $('#panel-content');
  const { world, save } = engine;
  const key = shop ? `shop:${shop.id}` : page;
  $('#panel-eyebrow').textContent = shop ? 'CRATE MARKET' : 'THE INDEPENDENT CIRCUIT';
  let markup = '';
  if (shop) {
    $('#panel-title').textContent = shop.name;
    markup = `<p class="panel-intro">You have <strong>${save.money.toLocaleString()}</strong> credits.</p><div class="inventory-list">${shop.stock.map((id, index) => {
      const item = world.items[id];
      return inventoryRow(item, save.bag[id] || 0, `<button class="button primary" data-buy="${e(id)}" ${save.money < item.price ? 'disabled' : ''}>Buy ${item.price} CR</button>${save.bag[id] && item.price > 0 ? `<button class="button" data-sell="${e(id)}">Sell ${Math.floor(item.price / 2)} CR</button>` : ''}`, index);
    }).join('')}</div>`;
  } else if (page === 'crew') {
    $('#panel-title').textContent = 'Your crew';
    markup = `<p class="panel-intro">${save.party.length} / 6 active crewmates. Your lead takes the opening verse.</p><div class="party-list">${save.party.map((monster, index) => {
      const species = world.species[monster.species];
      return `<article class="party-row rise" style="--n:${index}"><div class="portrait-frame">${portrait(monster.species)}</div><div class="party-detail"><strong>${e(species.name)} <small>LV ${monster.level}</small></strong>${badge(world, species.style)}${hpBar(monster, true)}<small>${monster.xp} / ${monster.level * 12} XP${monster.held ? ` · ${e(world.items[monster.held]?.name)}` : ''}</small><div class="learned-flows">${monster.moves.map(slot => `<span title="${e(world.moves[slot.id].description)}">${e(world.moves[slot.id].name)} · ${slot.pp} PP</span>`).join('')}</div></div><div class="row-actions">${index && monster.hp ? `<button class="button" data-switch="${index}">Lead</button>` : ''}${save.party.length > 1 ? `<button class="button" data-store="${index}">Reserve</button>` : ''}${monster.held ? `<button class="button" data-unequip="${index}">Unequip</button>` : ''}</div></article>`;
    }).join('')}</div><h3>Reserve</h3><div class="party-list">${save.reserve.map((monster, index) => `<article class="party-row rise" style="--n:${index + save.party.length}"><div class="portrait-frame">${portrait(monster.species)}</div><strong>${e(world.species[monster.species].name)} <small>LV ${monster.level}</small></strong><button class="button" data-withdraw="${index}" ${save.party.length >= 6 ? 'disabled' : ''}>Add to crew</button></article>`).join('') || '<p class="muted">Your reserve is empty.</p>'}</div>`;
  } else if (page === 'bag') {
    $('#panel-title').textContent = 'Your bag';
    markup = `<label class="panel-intro inline-label">Use on <select data-bag-target>${targetOptions(save)}</select></label><div class="inventory-list">${Object.entries(save.bag).filter(([id, count]) => count > 0 && world.items[id]).map(([id, count], index) => {
      const item = world.items[id];
      return inventoryRow(item, count, `<button class="button" data-use="${e(id)}" ${item.effect === 'capture' ? 'disabled' : ''}>${({ held: 'Equip', teach: 'Teach' })[item.effect] || 'Use'}</button>`, index);
    }).join('') || '<p class="muted">Your bag is empty.</p>'}</div>`;
  } else if (page === 'save') {
    $('#panel-title').textContent = 'Save & data';
    markup = `<p class="panel-intro">Progress saves automatically in this browser. Export the world and your save to carry them to another browser, or start a new game.</p><div class="save-actions-row rise"><button class="button primary" data-export>${icon('disk')} Export game</button><button class="button danger" data-reset>New game</button></div>`;
  } else {
    $('#panel-title').textContent = 'Circuit journal';
    let journal;
    if (journalTab === 'dex') {
      journal = `<p class="panel-intro">${save.owned.filter(id => world.species[id]).length} / ${Object.keys(world.species).length} species signed</p><div class="dex-grid">${Object.entries(world.species).map(([id, species], index) => {
        const seen = save.seen.includes(id);
        return `<article class="rise" style="--n:${index}">${seen ? portrait(id) : '<div class="unknown-sprite">?</div>'}<strong>${seen ? e(species.name) : 'Undiscovered'}</strong>${seen ? badge(world, species.style) : ''}<p>${seen ? e(species.description) : 'Look for unsigned artists in wild sound patches.'}</p>${save.owned.includes(id) ? '<span class="signed-tag">SIGNED</span>' : ''}</article>`;
      }).join('')}</div>`;
    } else {
      journal = `<div class="journal-objectives">${world.objectives.map((objective, index) => `<article class="rise" style="--n:${index}"><span class="objective-icon ${save.flags[objective.flag] ? 'lime' : ''}">${icon(save.flags[objective.flag] ? 'check' : objectiveIcons[index % 4])}</span><div><strong>${e(objective.name)}</strong><p>${e(objective.detail)}</p></div></article>`).join('')}</div>`;
    }
    markup = `<div class="mini-tabs journal-tabs"><button data-journal="quest" class="${journalTab === 'quest' ? 'selected' : ''}">Objectives</button><button data-journal="dex" class="${journalTab === 'dex' ? 'selected' : ''}">Archive</button></div>${journal}`;
  }
  setMarkup(content, markup);
  if (key !== lastPageKey) {
    content.classList.remove('swap'); void content.offsetWidth; content.classList.add('swap');
    content.scrollTop = 0;
    lastPageKey = key;
  }
}

function openMenu() {
  if (!engine || scene !== 'field' || fx || engine.save.battle || engine.result.talk || engine.result.starters) return;
  if (engine.result.shop) run({ op: 'close' });
  menuOpen = true; page = null;
  playSound(520, .04, .09, 'sine');
  render();
  setTimeout(() => { if (menuOpen && !page) $('.menu-item')?.focus({ preventScroll: true }); }, 60);
}

function closeMenu() {
  if (engine.result.shop) run({ op: 'close' });
  $('#panel-message').hidden = true;
  const wasOpen = menuOpen || page;
  menuOpen = false; page = null;
  if (wasOpen) playSound(390, .035, .08, 'sine');
  render();
  game.focus({ preventScroll: true });
}

function openPage(next) {
  if (!engine || engine.save.battle) return;
  if (engine.result.shop) run({ op: 'close' });
  page = next;
  if (page === 'bag') bagTarget = 0;
  $('#panel-message').hidden = true;
  playSound(600, .035, .07, 'sine');
  render();
  setTimeout(() => (menuOpen ? $('#page-back') : $('#close-panel')).focus({ preventScroll: true }), 60);
}

function closePage() {
  if (engine.result.shop) {
    run({ op: 'close' });
    page = null;
    if (!menuOpen) { render(); game.focus({ preventScroll: true }); return; }
  }
  const previous = page;
  page = null;
  $('#panel-message').hidden = true;
  render();
  if (menuOpen) $(`.menu-item[data-page="${previous}"]`)?.focus({ preventScroll: true });
  else game.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- render ---

function render() {
  if (!engine) return;
  document.body.dataset.scene = scene;
  hud(); renderDialog(); renderBattleUI(); renderMenu();
}

function run(command) {
  if (!engine) return null;
  const now = performance.now();
  const oldBattle = engine.save.battle, oldTalk = engine.result.talk, oldShop = engine.result.shop;
  const before = snapshotBattle();
  let next;
  try {
    next = engine.action(command);
  } catch (error) {
    toast(error.message); render();
    return null;
  }
  if (oldTalk !== next.talk) { talkLine = 0; typing = null; }
  if (!oldBattle && next.save.battle) {
    battleMode = 'flows'; bagTarget = next.save.battle.active;
    hideToast();
    playSound(128, .09, .28);
    if (command.op !== 'walk') startBattleTransition(now);
  } else if (oldBattle && next.save.battle && before) {
    detectHits(before, next.save.battle, now);
  } else if (oldBattle && !next.save.battle && before) {
    endBattle(before, next.notice || '', now);
  }
  if (command.op === 'move') playSound(295, .08, .13);
  if (next.notice) toast(next.notice);
  render();
  if (!oldShop && next.shop) setTimeout(() => $('#close-panel').focus({ preventScroll: true }), 80);
  return next;
}

// -------------------------------------------------------------- movement ---

function snapView() {
  const position = engine.save.position;
  view = { map: position.map, x: position.x, y: position.y, fromX: position.x, fromY: position.y, toX: position.x, toY: position.y, start: 0, dur: 1, endAt: 0, moving: false, steps: view?.steps || 0, bump: null };
}

function viewPos(now) {
  if (!view.moving) return { x: view.x, y: view.y, t: 0 };
  const t = clamp((now - view.start) / view.dur, 0, 1);
  return { x: view.fromX + (view.toX - view.fromX) * t, y: view.fromY + (view.toY - view.fromY) * t, t };
}

function startMove(fromX, fromY, toX, toY, now, dur) {
  const chained = now - view.endAt < 40;
  const start = chained ? view.endAt : now;
  Object.assign(view, { fromX, fromY, toX, toY, x: fromX, y: fromY, start, dur, endAt: start + dur, moving: true });
}

function currentDirection() { return touchDir || held.at(-1) || tapped || null; }

function canWalk() {
  return engine && !menuVisible() && scene === 'field' && !fx && !engine.save.battle && !engine.result.talk && !engine.result.starters;
}

function step(direction, now) {
  const before = { ...engine.save.position };
  const hadBattle = Boolean(engine.save.battle);
  const result = run({ op: 'walk', direction });
  if (!result) { nextWalkAt = now + 200; return; }
  const position = engine.save.position, [dx, dy] = deltas[direction];
  const dur = shiftDown || touchRun ? RUN_MS : WALK_MS;
  if (position.map === before.map && position.x === before.x + dx && position.y === before.y + dy) {
    startMove(before.x, before.y, position.x, position.y, now, dur);
    renderer.rustle(position.map, position.x, position.y, now);
    playSound(150 + (view.steps % 2) * 30, .016, .045, 'triangle');
    if (++stepsTaken === 14) $('#key-hints').classList.add('hide');
  } else if (position.map === before.map && position.x === before.x && position.y === before.y) {
    if (!view.bump || now - view.bump.at > 300) playSound(92, .045, .09, 'square');
    view.bump = { at: now, dir: direction };
    view.endAt = 0;
    nextWalkAt = now + 230;
  } else {
    startMove(before.x, before.y, before.x + dx, before.y + dy, now, dur);
    afterStep = time => mapTransition(time);
  }
  if (!hadBattle && engine.save.battle) {
    if (view.moving) afterStep = time => startBattleTransition(time);
    else startBattleTransition(now);
  }
}

function mapTransition(now = performance.now()) {
  fx = { kind: 'fade', start: now, dur: 600, mid: 270, onMid() { snapView(); render(); showLocation(); playSound(330, .03, .14, 'sine'); } };
}

function updateMovement(now) {
  if (view.moving && now >= view.start + view.dur) {
    view.moving = false; view.x = view.toX; view.y = view.toY; view.steps++;
    const callback = afterStep; afterStep = null;
    callback?.(now);
  }
  if (view.moving || fx || !engine) return;
  const position = engine.save.position;
  if (scene === 'field' && !engine.save.battle && (position.map !== view.map || position.x !== view.x || position.y !== view.y)) { mapTransition(now); return; }
  if (queuedInteract) { queuedInteract = false; interact(); return; }
  const direction = currentDirection();
  if (direction && canWalk() && now >= nextWalkAt) { tapped = null; step(direction, now); }
  else if (tapped && !canWalk()) tapped = null;
}

function updateFx(now) {
  if (!fx) return;
  const t = now - fx.start;
  if (!fx.midDone && t >= fx.mid) { fx.midDone = true; fx.onMid?.(now); }
  if (t >= fx.dur) { fx = null; render(); }
}

function resize() {
  const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight;
  const ratio = window.devicePixelRatio || 1;
  const dpr = clamp(Math.min(ratio, Math.sqrt(pixelBudget / (w * h))), .6, 2);
  const width = Math.round(w * dpr), height = Math.round(h * dpr);
  if (stage.width !== width) stage.width = width;
  if (stage.height !== height) stage.height = height;
  const tile = clamp(Math.max(Math.sqrt(w * h / 300), Math.min(w / 8, h / 16)), 34, 96);
  viewport = { w, h, dpr, ratio, tile: Math.round(tile * dpr) };
  needsResize = false;
}

function draw(now) {
  if (needsResize || viewport.ratio !== (window.devicePixelRatio || 1)) resize();
  const { width, height } = stage;
  const data = battleData();
  if (data) {
    renderBattleScene(ctx, { world: engine.world, battle: data.battle, party: data.party, width, height, reserve: (controlsH + 24) * viewport.dpr, time: now, fx: battleFx });
  } else {
    const position = viewPos(now);
    renderer.draw(ctx, {
      world: engine.world, flags: engine.save.flags, mapId: view.map, width, height, T: viewport.tile, time: now,
      px: position.x, py: position.y, facing: engine.save.facing, phase: (view.steps + position.t) * Math.PI, moving: view.moving,
      bump: view.bump, talkingTo: engine.result.talk?.entity?.id, player: true,
    });
  }
  if (fx) drawTransition(ctx, width, height, fx, now);
}

// Lowers the canvas resolution on machines that cannot draw a frame comfortably within budget.
function adaptQuality(cost) {
  if (document.hidden || fx) return;
  drawCost = drawCost ? drawCost * .92 + cost * .08 : cost;
  slowFrames = drawCost > 10 ? slowFrames + 1 : 0;
  if (slowFrames > 45 && pixelBudget > 1.1e6) {
    pixelBudget = Math.max(1.1e6, viewport.w * viewport.h * viewport.dpr * viewport.dpr * .7);
    slowFrames = 0; drawCost = 0; needsResize = true;
  }
}

function tick(now) {
  const dt = Math.min(64, now - (lastTick || now));
  lastTick = now;
  if (engine && view) {
    updateMovement(now);
    updateFx(now);
    paintTyping(now);
    tickHp(now, dt);
    const controls = $('#battle-controls');
    controls.classList.toggle('busy', now < battleLockUntil);
    const started = performance.now();
    draw(now);
    adaptQuality(performance.now() - started);
  }
  requestAnimationFrame(tick);
}

// ----------------------------------------------------------------- input ---

function interact() {
  if (!engine || menuVisible() || scene !== 'field' || fx || engine.save.battle) return;
  if (engine.result.talk) { advance(); return; }
  if (engine.result.starters) return;
  if (view.moving) { queuedInteract = true; return; }
  playSound(410); run({ op: 'interact' });
}

function press(direction) { held = held.filter(item => item !== direction); held.push(direction); }
function release(direction) { held = held.filter(item => item !== direction); }

document.addEventListener('keydown', event => {
  if (!engine || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === 'shift') shiftDown = true;
  if (/SELECT|INPUT|TEXTAREA/.test(event.target.tagName)) { if (key === 'escape') event.target.blur(); return; }
  const overlay = menuVisible();
  if (key === 'escape' || (key === 'backspace' && overlay)) {
    event.preventDefault();
    if (page || engine.result.shop) closePage();
    else if (menuOpen) closeMenu();
    else if (engine.result.talk || engine.result.starters) run({ op: 'close' });
    else if (scene === 'field' && key === 'escape') openMenu();
    return;
  }
  if (key === 'm' && !event.repeat) {
    event.preventDefault();
    if (overlay) closeMenu(); else openMenu();
    return;
  }
  if (key === 'f' && !event.repeat && document.fullscreenEnabled) { event.preventDefault(); toggleFullscreen(); return; }
  if (overlay) {
    if (key === 'arrowdown' || key === 'arrowup' || ((key === 's' || key === 'w') && menuOpen && !page)) {
      event.preventDefault();
      const step = key === 'arrowdown' || key === 's' ? 1 : -1;
      moveFocus(page || engine.result.shop ? '#menu-page button, #menu-page select' : '.menu-item', step);
    }
    return;
  }
  if (scene === 'battle' && engine.save.battle) {
    if (/^[1-4]$/.test(key) && battleMode === 'flows' && !event.repeat) { event.preventDefault(); battleAction({ op: 'move', index: Number(key) - 1 }); return; }
    if (keyDirections[key] && key.startsWith('arrow')) { event.preventDefault(); moveFocus('#battle-controls button', key === 'arrowdown' || key === 'arrowright' ? 1 : -1); }
    return;
  }
  const dialogOpen = engine.result.talk || engine.result.starters;
  if (dialogOpen && keyDirections[key] && $('#dialog button')) {
    event.preventDefault();
    moveFocus('#dialog .dialog-actions button, #dialog .starter-choice', key === 'arrowdown' || key === 'arrowright' || key === 's' || key === 'd' ? 1 : -1);
    return;
  }
  if (keyDirections[key]) { event.preventDefault(); press(keyDirections[key]); if (!event.repeat) tapped = keyDirections[key]; }
  if (key === ' ' || key === 'e' || key === 'enter' || key === 'z') {
    if (event.target.closest?.('button, a') && key !== 'e' && key !== 'z') return;
    event.preventDefault();
    if (!event.repeat) interact();
  }
});

document.addEventListener('keyup', event => {
  const key = event.key.toLowerCase();
  if (key === 'shift') shiftDown = false;
  if (keyDirections[key]) release(keyDirections[key]);
});

window.addEventListener('blur', () => { held = []; tapped = null; shiftDown = false; touchDir = null; touchRun = false; resetKnob(); });

const dpad = $('#dpad'), knob = $('#dpad-knob');
function resetKnob() { dpad.classList.remove('active'); knob.style.transform = ''; }
function updateTouch(event) {
  const rect = dpad.getBoundingClientRect();
  const dx = event.clientX - (rect.left + rect.width / 2), dy = event.clientY - (rect.top + rect.height / 2);
  const distance = Math.hypot(dx, dy), limit = rect.width * .32;
  const scale = distance > limit ? limit / distance : 1;
  knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
  touchDir = distance < 12 ? null : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  touchRun = distance > rect.width * .42;
}
dpad.addEventListener('pointerdown', event => { event.preventDefault(); dpad.setPointerCapture(event.pointerId); dpad.classList.add('active'); updateTouch(event); });
dpad.addEventListener('pointermove', event => { if (dpad.hasPointerCapture(event.pointerId)) updateTouch(event); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) dpad.addEventListener(type, () => { touchDir = null; touchRun = false; resetKnob(); });
$('#interact').addEventListener('pointerdown', event => { event.preventDefault(); interact(); });
$('#interact').addEventListener('click', event => { if (event.detail === 0) interact(); });
$('#touch-controls').addEventListener('contextmenu', event => event.preventDefault());

function battleAction(command) {
  const now = performance.now();
  if (now < battleLockUntil || fx || scene !== 'battle') return;
  run(command);
}

menuButton.addEventListener('click', () => { if (menuOpen) closeMenu(); else openMenu(); });
$('#sound').addEventListener('click', toggleSound);
$('#fullscreen').addEventListener('click', toggleFullscreen);
$('#page-back').addEventListener('click', closePage);
$('#close-panel').addEventListener('click', () => { if (engine.result.shop && !menuOpen) closePage(); else closeMenu(); });
document.addEventListener('change', event => { if (event.target.matches('[data-bag-target]')) bagTarget = Number(event.target.value); });

document.addEventListener('click', event => {
  if (!engine) return;
  if (event.target.closest('[data-close-menu]')) { closeMenu(); return; }
  const button = event.target.closest('button');
  if (!button) {
    if (event.target.closest('[data-advance-box]')) advance();
    return;
  }
  if (button.disabled) return;
  const data = button.dataset;
  if (data.page) openPage(data.page);
  else if (data.dismiss !== undefined) run({ op: 'close' });
  else if (data.choice !== undefined) run({ op: 'choice', index: Number(data.choice) });
  else if (data.starter) run({ op: 'select_starter', id: data.starter });
  else if (data.flow !== undefined) battleAction({ op: 'move', index: Number(data.flow) });
  else if (data.battleMode) {
    battleMode = data.battleMode;
    if (battleMode === 'bag') bagTarget = engine.save.battle.active;
    renderBattleUI();
  } else if (data.flee !== undefined) battleAction({ op: 'flee' });
  else if (data.switch !== undefined) {
    if (engine.save.battle) { battleMode = 'flows'; battleAction({ op: 'switch', index: Number(data.switch) }); }
    else run({ op: 'switch', index: Number(data.switch) });
  } else if (data.use) {
    if (engine.save.battle) battleAction({ op: 'item', id: data.use, index: bagTarget });
    else run({ op: 'item', id: data.use, index: bagTarget });
  } else if (data.buy) run({ op: 'buy', id: data.buy });
  else if (data.sell) run({ op: 'sell', id: data.sell });
  else if (data.store !== undefined) run({ op: 'store', index: Number(data.store) });
  else if (data.withdraw !== undefined) run({ op: 'withdraw', index: Number(data.withdraw) });
  else if (data.unequip !== undefined) run({ op: 'unequip', index: Number(data.unequip) });
  else if (data.journal) { journalTab = data.journal; renderPage(); }
  else if (data.export !== undefined) exportJson('freestylomon-game.json', { version: 1, world: engine.world, save: engine.save });
  else if (data.reset !== undefined && confirm('Start a new save? This clears your current progress.')) { closeMenu(); run({ op: 'reset' }); }
});

new ResizeObserver(() => { needsResize = true; }).observe(stage);
new ResizeObserver(entries => {
  controlsH = entries[0].target.offsetHeight;
  game.style.setProperty('--controls-h', `${controlsH}px`);
}).observe($('#battle-controls'));

// ------------------------------------------------------------------ boot ---

try {
  engine = await openEngine(() => { talkLine = 0; typing = null; render(); });
  snapView();
  if (engine.save.battle) {
    scene = 'battle';
    const now = performance.now();
    Object.assign(battleFx, { start: now, enemyIn: now, playerIn: now + 120 });
  }
  render();
  updateToggles();
  showLocation();
  $('#loading').classList.add('done');
  document.body.classList.remove('loading-game');
  requestAnimationFrame(tick);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/offline.js').catch(() => {});
} catch (error) {
  $('#loading strong').textContent = error.message;
}
