import { openEngine, mountIcons, escapeHtml as e, exportJson } from '/engine.js';
import { renderMap, TILE, visible } from '/art.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const canvas = $('#editor-map');
const entityKinds = {npc:'NPC', label:'Label boss', rival:'Trainer', boss:'Final boss', shop:'Shop', heal:'Healing station', starter:'Starter station', wild:'Wild mob', item:'Pickup', exit:'Map exit', decor:'Scenery', light:'Light'};
const decorArt = ['lamp','bench','planter','speaker','mural','basement','clinic','echo','tape','onys'];
const tilesArt = ['paving','road','crosswalk','sidewalk','grass','wild','tree','hedge','water','deck','floor','wall','carpet'];
const creatureArt = ['cub','lynx','jackal','frog','fish','cat','moth','bat','ghost'];
const itemArt = ['cassette','bottle','capsule','spark','filter','battery','speaker'];
const effects = ['heal', 'capture', 'revive', 'cleanse', 'repel', 'restore', 'held', 'teach'];
const catalogNames = {species:'Freestylomon', moves:'Flows', items:'Items', styles:'Styles', tiles:'Tiles', setup:'World setup'};
const hints = {paint:'Drag to paint tiles.', fill:'Click to fill a connected area.', select:'Click an entity to select it. Drag to move it.', place:'Click the map to place your selected asset.', spawn:'Click a walkable tile to change the new-game start.', test:'Click a walkable tile to move the player in the current save.'};
let engine, mapId, tab = 'map', tool = 'paint', tile = '.', template = 'npc', selected = '', draft, drawing, importMode;
let catalog = 'species', catalogId = '', dialogueId = '', dialogueDraft, lastWorld, initialFlagMode = false;
const history = [], forward = [];

mountIcons();

function status(message, error = false) {
  const output = $('#studio-status');
  output.classList.toggle('error', error);
  output.querySelector('span').textContent = message;
}

function attempt(action) {
  try { action(); } catch (error) { status(error.message, true); }
}

function world() { return draft || engine.world; }
function activeMap(data = world()) { return data.maps[mapId]; }

function commit(next, message, options = {}) {
  const before = engine.world;
  engine.apply(next);
  lastWorld = JSON.stringify(engine.world);
  if (options.history !== false) {
    history.push(before);
    if (history.length > 30) history.shift();
    forward.length = 0;
  }
  status(message);
  render(options.preserveInspector);
}

function updateWorld(change, message) {
  const next = structuredClone(engine.world);
  change(next);
  commit(next, message);
}

function updateSave(change, message) {
  engine.apply(null, change);
  status(message);
  render();
}

function render(preserveInspector = false) {
  if (!engine.world.maps[mapId]) mapId = engine.save.position.map;
  for (const section of ['map', 'catalog', 'dialogue', 'save']) $(`#${section}-tab`).hidden = tab !== section;
  for (const button of $$('[data-tab]')) button.classList.toggle('active', button.dataset.tab === tab);
  if (tab === 'map') renderEditor(preserveInspector);
  if (tab === 'catalog') renderCatalog();
  if (tab === 'dialogue') renderDialogues();
  if (tab === 'save') renderSave();
}

function mapOptions(data = world(), selectedMap = mapId) {
  return Object.entries(data.maps).map(([id, map]) => `<option value="${e(id)}" ${id === selectedMap ? 'selected' : ''}>${e(map.name)}</option>`).join('');
}

function renderEditor(preserveInspector) {
  const map = activeMap();
  if (!Object.hasOwn(world().tiles, tile)) tile = Object.keys(world().tiles)[0];
  $('#map-picker').innerHTML = mapOptions();
  $('#undo').disabled = history.length === 0;
  $('#redo').disabled = forward.length === 0;
  if (!map.entities.some(entity => entity.id === selected)) selected = '';
  $('#entity-picker').innerHTML = '<option value="">Choose an entity</option>' + map.entities.map(entity => `<option value="${e(entity.id)}" ${entity.id === selected ? 'selected' : ''}>${e(entity.name)} (${entity.x}, ${entity.y})</option>`).join('');
  renderPalette(); updateTools();
  $('#map-dimensions').textContent = `${map.rows[0].length} × ${map.rows.length}`;
  if (!preserveInspector) {
    renderInspector();
    $('#map-settings').innerHTML = `<div class="form-grid">${field('name','Name',map.name)}${field('subtitle','District label',map.subtitle)}${field('width','Width',map.rows[0].length,'number')}${field('height','Height',map.rows.length,'number')}${field('encounter_rate','Encounter rate (%)',map.encounter_rate,'number')}${field('fill_tile','New cell tile',tile,'select',Object.entries(world().tiles).map(([id, item]) => [id, item.name]))}</div>${field('encounters','Wild pool',map.encounters,'json')}<div class="row-actions"><button class="button primary" type="submit">Apply map settings</button>${mapId !== world().start.map ? '<button type="button" class="button danger" data-delete-map>Delete map</button>' : ''}</div>`;
  }
  drawMap();
}

function drawMap() {
  renderMap(canvas, world(), engine.save, {editor:true, mapId, grid:$('#grid').checked, selected});
  const map = activeMap();
  const width = map.rows[0].length;
  canvas.style.width = `clamp(${Math.max(220, width * 15)}px, 100%, ${Math.max(440, width * 30)}px)`;
  canvas.setAttribute('aria-label', `${map.name}, ${map.rows[0].length} columns by ${map.rows.length} rows`);
}

function paletteEntries(group) {
  if (group === 'tiles') return Object.entries(world().tiles).map(([id, entry]) => [id, entry.name, entry.color]);
  if (group === 'items') return Object.entries(world().items).map(([id, entry]) => [`item:${id}`, entry.name, '#e6b5a3']);
  if (group === 'species') return Object.entries(world().species).map(([id, entry]) => [`wild:${id}`, entry.name, entry.color]);
  if (group === 'decor') return [...decorArt.map(art => [`decor:${art}`, art[0].toUpperCase() + art.slice(1), '#a68ec4']), ['light','Light / spotlight','#f9cd9e']];
  return Object.entries(entityKinds).filter(([id]) => !['decor','light','item','wild'].includes(id)).map(([id, label]) => [id, label, '#a68ec4']);
}

function renderPalette() {
  const group = $('#palette-group').value;
  const active = group === 'tiles' ? tile : template;
  $('#palette').innerHTML = paletteEntries(group).map(([id, name, color]) => `<button type="button" draggable="true" class="palette-item ${id === active ? 'selected' : ''}" data-palette="${e(id)}"><i style="background:${/^#[\da-f]{6}$/i.test(color) ? color : '#9581b7'}"></i>${e(name)}</button>`).join('');
  $('#palette-hint').textContent = group === 'tiles' ? 'Paint with the brush or drag a tile onto the map.' : 'Drag an asset onto the map or select it and click a tile.';
}

function updateTools() {
  for (const button of $$('[data-tool]')) button.classList.toggle('selected', button.dataset.tool === tool);
  $('#editor-tool-hint').textContent = hints[tool];
  canvas.dataset.tool = tool;
}

function field(name, label, value, type = 'text', options = []) {
  const id = e(name);
  const checked = value ? 'checked' : '';
  if (type === 'checkbox') return `<label class="editor-field toggle"><input type="checkbox" name="${id}" ${checked}> ${e(label)}</label>`;
  let control;
  if (type === 'select') control = `<select name="${id}">${options.map(([option, label]) => `<option value="${e(option)}" ${value === option ? 'selected' : ''}>${e(label)}</option>`).join('')}</select>`;
  else if (type === 'json' || type === 'lines') control = `<textarea rows="${type === 'json' ? 3 : 2}" name="${id}" spellcheck="false">${e(type === 'json' ? JSON.stringify(value === undefined ? {} : value, null, 2) : (value || []).join('\n'))}</textarea>`;
  else control = `<input type="${type}" name="${id}" value="${e(value)}" ${type === 'number' ? 'step="any"' : ''}>`;
  return `<label class="editor-field ${type === 'json' || type === 'lines' ? 'wide-field' : ''}"><span>${e(label)}</span>${control}</label>`;
}

function read(form, name, type = 'text') {
  const field = form.elements.namedItem(name);
  if (!field) return undefined;
  if (type === 'checkbox') return field.checked;
  if (type === 'number') {
    if (field.value === '') throw new Error(`${name} needs a number.`);
    return Number(field.value);
  }
  if (type === 'json') {
    try { return JSON.parse(field.value); } catch { throw new Error(`${name} contains invalid JSON.`); }
  }
  if (type === 'lines') return field.value.split('\n').map(line => line.trim()).filter(Boolean);
  return field.value.trim();
}

function named(entries) { return Object.entries(entries).map(([id, entry]) => [id, entry.name || id]); }
function options(values) { return values.map(value => [value, value]); }
function optional(entries) { return [['', 'None'], ...entries]; }

function renderInspector() {
  const entity = activeMap().entities.find(entry => entry.id === selected);
  const node = $('#inspector');
  if (!entity) {
    node.innerHTML = '<p class="studio-hint">Select an entity on the map to edit its properties.</p>';
    return;
  }
  const data = world();
  const isLight = entity.kind === 'light', isExit = entity.kind === 'exit', isItem = entity.kind === 'item';
  const base = field('name','Name',entity.name) + field('kind','Kind',entity.kind,'select',Object.entries(entityKinds)) + field('x','X',entity.x,'number') + field('y','Y',entity.y,'number');
  const general = field('art','Art',entity.art) + field('color','Color',entity.color || '#c7a4e8','color') + field('solid','Blocks movement',entity.solid,'checkbox');
  const light = field('radius','Radius (tiles)',entity.radius,'number') + field('strength','Intensity (0–1)',entity.strength,'number') + field('beam','Volumetric-style beam',entity.beam,'checkbox');
  const pickup = field('item','Item',entity.item,'select',named(data.items)) + field('quantity','Quantity',entity.quantity,'number');
  const dest = entity.destination || data.start;
  const exit = field('dest_map','Destination map',dest.map,'select',named(data.maps)) + field('dest_x','Destination X',dest.x,'number') + field('dest_y','Destination Y',dest.y,'number');
  const dialogue = field('dialogue','Dialogue',entity.dialogue,'select',optional(named(data.dialogues))) + field('after','After victory',entity.after,'select',optional(named(data.dialogues))) + field('locked','Locked message',entity.locked);
  const battle = field('reward','Reward credits',entity.reward,'number') + field('squad','Opponent squad',entity.squad,'json');
  const shop = field('stock','Stock (item IDs)',entity.stock,'json');
  node.innerHTML = `<form id="entity-form"><p class="entity-id">${e(entity.id)}</p><div class="form-grid">${base}${general}${isLight ? light : ''}${isExit ? exit : ''}${isItem ? pickup : ''}</div>${!isLight && entity.kind !== 'decor' && !isItem ? `<div class="form-grid">${dialogue}</div>` : ''}${['label','rival','boss','wild'].includes(entity.kind) ? battle : ''}${entity.kind === 'shop' ? shop : ''}<details><summary>Conditional flags</summary>${field('when','Visible when',entity.when,'json')}${field('requires','Requires for interaction',entity.requires,'json')}${field('sets','Set upon completion',entity.sets,'json')}</details><div class="row-actions"><button class="button primary" type="submit">Apply entity</button><button class="button" type="button" data-duplicate>Duplicate</button><button class="button danger" type="button" data-delete-entity>Delete</button></div></form>`;
}

function getEntity(payload, x, y) {
  const data = world();
  const [kind, id] = payload.split(':');
  const isLight = kind === 'light', isWild = kind === 'wild', isPickup = kind === 'item';
  const name = isWild ? data.species[id]?.name : isPickup ? data.items[id]?.name : kind === 'decor' ? id : entityKinds[kind];
  if (!name) throw new Error('Choose a valid asset from the palette.');
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || kind;
  const entity = {id:uniqueEntity(slug), kind, name, x, y, art:'person', color:'#c7a4e8', solid:!['light','item','exit','decor'].includes(kind)};
  if (isLight) Object.assign(entity, {art:'', radius:4.0, strength:.35, color:'#d6adfa', beam:true});
  if (isWild) Object.assign(entity, {art:data.species[id].art, color:data.species[id].color, squad:[{species:id,level:4}]});
  if (isPickup) Object.assign(entity, {item:id, art:data.items[id].icon, quantity:1});
  if (kind === 'decor') entity.art = id;
  if (kind === 'exit') Object.assign(entity, {art:'portal', destination:structuredClone(data.start)});
  if (['label','rival','boss'].includes(kind)) Object.assign(entity, {squad:[{species:data.starter,level:5}], reward:120});
  if (kind === 'shop') entity.stock = Object.keys(data.items);
  return entity;
}

function uniqueEntity(base) {
  const ids = new Set(activeMap().entities.map(entity => entity.id));
  if (!ids.has(base)) return base;
  let next = 2;
  while (ids.has(`${base}-${next}`)) next++;
  return `${base}-${next}`;
}

function coords(event) {
  const bounds = canvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - bounds.left) * canvas.width / bounds.width / TILE);
  const y = Math.floor((event.clientY - bounds.top) * canvas.height / bounds.height / TILE);
  const map = activeMap();
  return x >= 0 && y >= 0 && x < map.rows[0].length && y < map.rows.length ? {x, y} : null;
}

function place(payload, position) {
  const entity = getEntity(payload, position.x, position.y);
  selected = entity.id;
  tool = 'select';
  updateWorld(next => next.maps[mapId].entities.push(entity), `${entity.name} placed. Game updated.`);
}

function tileAt(map, x, y, symbol) {
  const row = map.rows[y];
  if (row[x] === symbol) return false;
  map.rows[y] = row.slice(0, x) + symbol + row.slice(x + 1);
  return true;
}

function fill(position) {
  const target = activeMap().rows[position.y][position.x];
  if (target === tile) return;
  updateWorld(next => {
    const map = next.maps[mapId];
    const cells = [position];
    for (let i = 0; i < cells.length; i++) {
      const { x, y } = cells[i];
      if (map.rows[y]?.[x] !== target) continue;
      tileAt(map, x, y, tile);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) cells.push({x:x+dx,y:y+dy});
    }
  }, 'Area painted. Game updated.');
}

function walkable(position) {
  const map = activeMap();
  if (world().tiles[map.rows[position.y][position.x]].blocked || map.entities.some(entity => entity.solid && entity.x === position.x && entity.y === position.y && visible(entity, engine.save.flags, mapId))) {
    throw new Error('Choose an unoccupied, walkable tile.');
  }
}

function startPointer(event) {
  if (event.button !== 0) return;
  const position = coords(event);
  if (!position) return;
  if (tool === 'place') { place(template, position); return; }
  if (tool === 'fill') { fill(position); return; }
  if (tool === 'spawn') {
    walkable(position);
    updateWorld(next => { next.start = {...position, map:mapId}; }, 'New-game start updated.');
    return;
  }
  if (tool === 'test') {
    walkable(position);
    updateSave(save => { save.position = {...position, map:mapId}; save.battle = null; }, 'Player moved in the live game.');
    return;
  }
  if (tool === 'select') {
    const matches = activeMap().entities.filter(entity => entity.x === position.x && entity.y === position.y);
    const current = matches.findIndex(entity => entity.id === selected);
    if (matches.length && current < 0) selected = matches.at(-1).id;
    else if (!matches.length) selected = '';
    renderEditor(false);
    if (!selected) return;
    drawing = {type:'entity', id:selected, previous:position, matches, current, changed:false};
  } else {
    drawing = {type:'tile', previous:position, changed:false};
  }
  draft = structuredClone(engine.world);
  canvas.setPointerCapture(event.pointerId);
  if (drawing.type === 'tile') drawing.changed = tileAt(activeMap(), position.x, position.y, tile);
  drawMap();
}

function movePointer(event) {
  const position = coords(event);
  if (!position) return;
  $('#map-coordinates').textContent = `X ${position.x}  Y ${position.y}`;
  if (!drawing || (position.x === drawing.previous.x && position.y === drawing.previous.y)) return;
  if (drawing.type === 'entity') {
    const entity = activeMap().entities.find(entry => entry.id === drawing.id);
    const {x, y} = position;
    entity.x = x; entity.y = y;
    drawing.changed = true;
  } else {
    const origin = drawing.previous;
    const steps = Math.max(Math.abs(position.x - origin.x), Math.abs(position.y - origin.y));
    for (let i = 1; i <= steps; i++) {
      const x = Math.round(origin.x + (position.x - origin.x) * i / steps);
      const y = Math.round(origin.y + (position.y - origin.y) * i / steps);
      drawing.changed = tileAt(activeMap(), x, y, tile) || drawing.changed;
    }
  }
  drawing.previous = position;
  drawMap();
}

function endPointer(event) {
  if (!drawing) return;
  const pending = drawing, next = draft;
  draft = null; drawing = null;
  if (event.type === 'pointerup' && pending.changed) {
    try { commit(next, pending.type === 'entity' ? 'Entity moved. Game updated.' : 'Tiles painted. Game updated.'); }
    catch (error) { renderEditor(false); throw error; }
  } else {
    if (pending.type === 'entity' && pending.current >= 0 && pending.matches.length > 1) selected = pending.matches[(pending.current + 1) % pending.matches.length].id;
    renderEditor(false);
  }
}

const definitions = {
  species: {
    defaults: () => ({name:'New Freestylomon',style:Object.keys(world().styles)[0],art:'cub',color:'#c496ef',description:'',hp:20,attack:12,defense:10,speed:10,catch_rate:50,learns:[{at:1,move:Object.keys(world().moves)[0]}],evolves:null}),
    fields: () => [['name','Name'],['description','Description'],['style','Style','select',named(world().styles)],['art','Sprite','select',options(creatureArt)],['color','Color','color'],['hp','Base HP','number'],['attack','Attack','number'],['defense','Defense','number'],['speed','Speed','number'],['catch_rate','Signing rate (%)','number'],['learns','Level-up flows','json'],['evolves','Evolution (or null)','json']],
  },
  moves: {
    defaults: () => ({name:'New Flow',style:Object.keys(world().styles)[0],description:'',power:25,accuracy:100,pp:15,effect:'',chance:0,priority:0}),
    fields: () => [['name','Name'],['description','Description'],['style','Style','select',named(world().styles)],['power','Power','number'],['accuracy','Accuracy (%)','number'],['pp','PP','number'],['effect','Effect','select',optional(options(['burn','stun','tempo','heal','drain']))],['chance','Effect chance (%)','number'],['priority','Priority','number']],
  },
  items: {
    defaults: () => ({name:'New Item',description:'',effect:'heal',amount:20,price:45,icon:'bottle',flow:''}),
    fields: () => [['name','Name'],['description','Description'],['effect','Effect','select',options(effects)],['amount','Amount / bonus','number'],['price','Price','number'],['icon','Icon','select',options(itemArt)],['flow','Teaches this flow','select',optional(named(world().moves))]],
  },
  styles: {
    defaults: () => ({name:'New Style',color:'#c496ef',strong:[],weak:[]}),
    fields: () => [['name','Name'],['color','Color','color'],['strong','Strong against (style IDs)','json'],['weak','Weak against (style IDs)','json']],
  },
  tiles: {
    defaults: () => ({name:'New Tile',color:'#74618a',art:'paving',blocked:false,encounters:false}),
    fields: () => [['name','Name'],['color','Color','color'],['art','Art','select',options(tilesArt)],['blocked','Blocks movement','checkbox'],['encounters','Allows wild encounters','checkbox']],
  },
};

function renderCatalog() {
  const data = world();
  const container = $('#catalog-tab');
  const tabs = `<div class="mini-tabs">${Object.entries(catalogNames).map(([id, label]) => `<button class="${id === catalog ? 'selected' : ''}" data-catalog="${id}">${e(label)}</button>`).join('')}</div>`;
  if (catalog === 'setup') {
    container.innerHTML = `<header><h2>Catalogs</h2></header>${tabs}<form id="setup-form"><div class="form-grid">${field('starter','Default starter',data.starter,'select',named(data.species))}${field('starters','Starter auditions (species IDs)',data.starters,'json')}${field('initial_bag','Starting bag (item ID and count)',data.initial_bag,'json')}${field('objectives','Ordered objectives',data.objectives,'json')}</div><button class="button primary" type="submit">Apply world setup</button></form>`;
    return;
  }
  const records = data[catalog];
  if (!Object.hasOwn(records, catalogId)) catalogId = Object.keys(records)[0] || '';
  const selectedRecord = records[catalogId];
  const form = selectedRecord ? `<form id="catalog-form"><p class="entity-id">${e(catalogId)}</p><div class="form-grid">${definitions[catalog].fields().map(([id, label, type, list]) => field(id,label,selectedRecord[id],type,list)).join('')}</div><div class="row-actions"><button class="button primary" type="submit">Apply ${e(catalogNames[catalog].toLowerCase())}</button><button class="button danger" type="button" data-delete-catalog>Delete</button></div></form>` : '<p class="studio-hint">Add an entry to this catalog.</p>';
  container.innerHTML = `<header><h2>Catalogs</h2></header>${tabs}<div class="data-layout"><div class="data-selector" role="group" aria-label="Catalog entries">${Object.entries(records).map(([id, record]) => `<button class="palette-item ${id === catalogId ? 'selected' : ''}" data-record="${e(id)}">${e(record.name)} <small>${e(id)}</small></button>`).join('')}<button class="button" data-new-catalog>Add entry</button></div><div>${form}</div></div>`;
}

function renderDialogues() {
  const entries = world().dialogues;
  if (!Object.hasOwn(entries, dialogueId)) { dialogueId = Object.keys(entries)[0] || ''; dialogueDraft = null; }
  const branches = dialogueDraft || entries[dialogueId];
  const editor = branches ? `<form id="dialogue-form"><p class="studio-hint">The first branch whose flags match is shown. Leave the final branch unconditional as a fallback.</p>${branches.map((branch, i) => `<section class="dialogue-branch"><div class="branch-head"><h3>Branch ${i + 1}</h3><div class="row-actions"><button type="button" class="button" data-branch-raise="${i}" ${i === 0 ? 'disabled' : ''}>Move up</button><button type="button" class="button danger" data-branch-delete="${i}" ${branches.length === 1 ? 'disabled' : ''}>Remove</button></div></div><div class="form-grid">${field(`b${i}_when`,'Requires flags',branch.when,'json')}${field(`b${i}_sets`,'Sets flags after dialogue',branch.sets,'json')}${field(`b${i}_lines`,'Lines, one per page',branch.lines,'lines')}</div><div class="dialogue-choices">${branch.choices.map((choice, j) => `<details class="choice-card" open><summary>Choice ${j + 1}</summary><div class="form-grid">${field(`b${i}c${j}_label`,'Button label',choice.label)}${field(`b${i}c${j}_next`,'Next dialogue',choice.next,'select',optional(named(entries)))}${field(`b${i}c${j}_give`,'Give item',choice.give,'select',optional(named(world().items)))}${field(`b${i}c${j}_action`,'Action',choice.action,'select',optional(options(['battle','shop','heal','starter','exit'])))}${field(`b${i}c${j}_when`,'Visible when',choice.when,'json')}${field(`b${i}c${j}_sets`,'Set flags',choice.sets,'json')}</div><button class="button danger" type="button" data-choice-delete="${i}:${j}">Remove choice</button></details>`).join('')}</div><button class="button" type="button" data-choice-add="${i}">Add choice</button></section>`).join('')}<div class="row-actions"><button class="button primary" type="submit">Apply dialogue</button><button class="button" type="button" data-branch-add>Add branch</button><button class="button danger" type="button" data-delete-dialogue>Delete dialogue</button></div></form>` : '<p class="studio-hint">Add a dialogue to write lines and choices.</p>';
  $('#dialogue-tab').innerHTML = `<header><h2>Dialogue</h2></header><div class="data-layout"><div class="data-selector" role="group" aria-label="Dialogues">${Object.keys(entries).map(id => `<button class="palette-item ${dialogueId === id ? 'selected' : ''}" data-dialogue="${e(id)}">${e(id)}</button>`).join('')}<button class="button" data-new-dialogue>Add dialogue</button></div><div>${editor}</div></div>`;
}

function readDialogue() {
  const form = $('#dialogue-form');
  const branches = dialogueDraft || world().dialogues[dialogueId];
  return branches.map((branch, i) => ({
    when:read(form,`b${i}_when`,'json'), sets:read(form,`b${i}_sets`,'json'), lines:read(form,`b${i}_lines`,'lines'),
    choices:branch.choices.map((_, j) => Object.fromEntries(['label','next','give','action','when','sets'].map(key => [key, read(form,`b${i}c${j}_${key}`, ['when','sets'].includes(key) ? 'json' : 'text')]))),
  }));
}

function flagNames() {
  const data = world();
  const flags = new Set([...Object.keys(data.initial_flags), ...Object.keys(engine.save.flags)]);
  const add = object => Object.keys(object || {}).forEach(key => flags.add(key));
  for (const objective of data.objectives) flags.add(objective.flag);
  for (const [id, map] of Object.entries(data.maps)) {
    for (const entity of map.entities) {
      if (entity.kind === 'item') flags.add(`taken:${id}/${entity.id}`);
      if (['label','rival','boss','wild'].includes(entity.kind)) flags.add(`won:${id}/${entity.id}`);
      for (const field of ['when','requires','sets']) add(entity[field]);
      for (const member of entity.squad) add(member.when);
    }
    for (const encounter of map.encounters) add(encounter.when);
  }
  for (const branches of Object.values(data.dialogues)) {
    for (const branch of branches) {
      add(branch.when); add(branch.sets);
      for (const choice of branch.choices) { add(choice.when); add(choice.sets); }
    }
  }
  return [...flags].sort();
}

function renderSave() {
  const flags = initialFlagMode ? world().initial_flags : engine.save.flags;
  const renderFlag = key => `<div class="flag-row"><label class="toggle"><input type="checkbox" data-flag="${e(key)}" ${flags[key] ? 'checked' : ''}><code>${e(key)}</code></label>${Object.hasOwn(flags,key) ? `<button class="button" data-flag-remove="${e(key)}">Remove</button>` : ''}</div>`;
  $('#save-tab').innerHTML = `<header><h2>Flags &amp; save</h2></header><div class="data-layout save-layout"><div><div class="mini-tabs"><button data-flag-mode="current" class="${initialFlagMode ? '' : 'selected'}">Current flags</button><button data-flag-mode="initial" class="${initialFlagMode ? 'selected' : ''}">New-game defaults</button></div><p class="studio-hint">${initialFlagMode ? 'These defaults apply when starting a new game.' : 'Toggle flags to test dialogue, unlock labels, or restore pickups.'}</p><div class="flags-list">${flagNames().map(renderFlag).join('')}</div><form id="add-flag" class="inline-form">${field('key','New flag','')}<button class="button" type="submit">Add flag</button></form></div><div class="save-actions"><h3>Game data files</h3><p class="studio-hint">Export or import the game bundle, world, save state, or flag file.</p><div class="file-actions">${[['game','Game bundle'],['world','World'],['save','Save state'],['flags','Flags']].map(([id, name]) => `<div class="flag-row"><strong>${name}</strong><div class="row-actions"><button class="button" data-download="${id}">Export</button><button class="button" data-upload="${id}">Import</button></div></div>`).join('')}</div><details><summary>Edit raw save</summary><form id="raw-save">${field('data','Save JSON',engine.save,'json')}<button class="button primary" type="submit">Apply save</button></form></details><details><summary>Edit raw world</summary><form id="raw-world">${field('data','World JSON',world(),'json')}<button class="button primary" type="submit">Apply world</button></form></details><button class="button danger" data-default-world>Restore bundled world</button></div></div>`;
}

function setFlag(key, value, remove = false) {
  if (!key || key.length > 160) throw new Error('Enter a flag name of up to 160 characters.');
  const change = flags => { if (remove) delete flags[key]; else Object.defineProperty(flags, key, {value, enumerable:true, configurable:true, writable:true}); };
  if (initialFlagMode) updateWorld(next => change(next.initial_flags), 'New-game defaults updated.');
  else updateSave(save => change(save.flags), 'Live flags updated.');
}

const assertFlags = payload => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.values(payload).some(value => typeof value !== 'boolean')) throw new Error('The flag file must contain a JSON object of true or false values.');
};

function download(mode) {
  const { world, save } = engine;
  const payload = {game:{version:1,world,save}, world, save, flags:initialFlagMode ? world.initial_flags : save.flags}[mode];
  exportJson(`freestylomon-${mode}.json`, payload);
}

function applyImport(mode, payload) {
  if (mode === 'world') {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Choose a valid world file.');
    commit(payload, 'World imported. Game updated.');
  }
  if (mode === 'save') {
    if (!payload || typeof payload !== 'object') throw new Error('Choose a valid save file.');
    updateSave(() => payload, 'Save imported. Game updated.');
  }
  if (mode === 'flags') {
    assertFlags(payload);
    if (initialFlagMode) updateWorld(next => { next.initial_flags = payload; }, 'Default flags imported.');
    else updateSave(save => { save.flags = payload; }, 'Live flags imported.');
  }
  if (mode === 'game') {
    if (payload?.version !== 1 || !payload.world || !payload.save) throw new Error('Choose a Freestylomon game bundle.');
    engine.apply(payload.world, () => payload.save);
    lastWorld = JSON.stringify(engine.world);
    history.length = 0; forward.length = 0;
    status('Game bundle imported.'); render();
  }
}

function handleForm(form) {
  const get = (name, type) => read(form,name,type);
  if (form.id === 'map-settings') {
    const width = get('width','number'), height = get('height','number'), fill = get('fill_tile');
    if (![width,height].every(value => Number.isInteger(value) && value >= 4 && value <= 160)) throw new Error('Map dimensions must be whole numbers between 4 and 160.');
    updateWorld(next => {
      const map = next.maps[mapId];
      map.rows = Array.from({length:height}, (_, y) => (map.rows[y] || '').slice(0,width).padEnd(width,fill));
      for (const key of ['name','subtitle']) map[key] = get(key);
      map.encounter_rate = get('encounter_rate','number');
      map.encounters = get('encounters','json');
    }, 'Map settings applied.');
  } else if (form.id === 'entity-form') {
    updateWorld(next => {
      const entity = next.maps[mapId].entities.find(entity => entity.id === selected);
      for (const field of ['name','kind','art','color','dialogue','after','locked','item']) entity[field] = get(field) ?? entity[field];
      for (const field of ['x','y','reward','radius','strength','quantity']) entity[field] = get(field,'number') ?? entity[field];
      for (const field of ['solid','beam']) entity[field] = get(field,'checkbox') ?? entity[field];
      for (const field of ['when','requires','sets','squad','stock']) entity[field] = get(field,'json') ?? entity[field];
      if (get('dest_map')) entity.destination = {map:get('dest_map'),x:get('dest_x','number'),y:get('dest_y','number')};
      if (entity.kind === 'exit' && !entity.destination) entity.destination = structuredClone(next.start);
      if (entity.kind === 'item' && !entity.item) entity.item = Object.keys(next.items)[0];
      if (['label','rival','boss','wild'].includes(entity.kind) && !entity.squad.length) entity.squad = [{species:next.starter,level:5}];
    }, 'Entity settings applied.');
  } else if (form.id === 'catalog-form') {
    updateWorld(next => { for (const [id,,type] of definitions[catalog].fields()) next[catalog][catalogId][id] = get(id,type); }, 'Catalog entry applied.');
  } else if (form.id === 'setup-form') {
    updateWorld(next => {
      next.starter = get('starter');
      for (const key of ['starters','initial_bag','objectives']) next[key] = get(key,'json');
    }, 'World setup applied.');
  } else if (form.id === 'dialogue-form') {
    const branches = readDialogue();
    updateWorld(next => { next.dialogues[dialogueId] = branches; }, 'Dialogue applied.');
    dialogueDraft = null;
    renderDialogues();
  } else if (form.id === 'add-flag') setFlag(get('key'), false);
  else if (form.id === 'raw-save') applyImport('save', get('data','json'));
  else if (form.id === 'raw-world') applyImport('world', get('data','json'));
}

function requestId(message, existing, forTile = false) {
  const id = prompt(message)?.trim();
  if (!id) return '';
  if (forTile ? !/^[\x21-\x7e]$/.test(id) : !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id)) throw new Error(forTile ? 'Use a single printable ASCII character.' : 'Use lowercase letters, numbers, dashes, or underscores.');
  if (Object.hasOwn(existing,id)) throw new Error('That ID already exists.');
  return id;
}

function historyStep(redo = false) {
  const from = redo ? forward : history, to = redo ? history : forward;
  if (!from.length) return;
  const previous = engine.world;
  commit(from.at(-1), redo ? 'Redid world edit.' : 'Undid world edit.', {history:false});
  from.pop(); to.push(previous); renderEditor(false);
}

function clickAction(button) {
  const data = button.dataset;
  if (data.tab) { tab = data.tab; render(); }
  else if (data.tool) { tool = data.tool; updateTools(); }
  else if (data.palette) {
    if ($('#palette-group').value === 'tiles') { tile = data.palette; if (tool !== 'fill') tool = 'paint'; }
    else { template = data.palette; tool = 'place'; }
    renderPalette(); updateTools();
  } else if (button.id === 'add-map') {
    const id = requestId('Map ID',engine.world.maps);
    if (!id) return;
    const base = Object.keys(world().tiles).find(key => !world().tiles[key].blocked);
    mapId = id; selected = '';
    updateWorld(next => { next.maps[id] = {name:id.replaceAll('-',' '),subtitle:'NEW DISTRICT',rows:Array(14).fill(base.repeat(22)),entities:[],encounters:[],encounter_rate:14}; }, 'Map created. Connect it with a map exit.');
  } else if (data.deleteMap !== undefined && confirm(`Delete ${activeMap().name}?`)) {
    updateWorld(next => { delete next.maps[mapId]; }, 'Map deleted.');
  } else if (button.id === 'undo') historyStep();
  else if (button.id === 'redo') historyStep(true);
  else if (button.id === 'clear-selection') { selected = ''; renderEditor(false); }
  else if (data.deleteEntity !== undefined && selected) {
    updateWorld(next => { next.maps[mapId].entities = next.maps[mapId].entities.filter(entity => entity.id !== selected); }, 'Entity removed.');
  } else if (data.duplicate !== undefined && selected) {
    const entity = structuredClone(activeMap().entities.find(entity => entity.id === selected));
    entity.id = uniqueEntity(entity.id); selected = entity.id;
    entity.x = (entity.x + 1) % activeMap().rows[0].length;
    updateWorld(next => next.maps[mapId].entities.push(entity), 'Entity duplicated.');
  } else if (data.catalog) { catalog = data.catalog; catalogId = ''; renderCatalog(); }
  else if (data.record) { catalogId = data.record; renderCatalog(); }
  else if (data.newCatalog !== undefined) {
    const id = requestId('Catalog entry ID',world()[catalog],catalog === 'tiles');
    if (!id) return;
    catalogId = id;
    const record = definitions[catalog].defaults();
    updateWorld(next => { next[catalog][id] = record; }, 'Catalog entry created.');
  } else if (data.deleteCatalog !== undefined && confirm(`Delete ${catalogId}?`)) {
    updateWorld(next => { delete next[catalog][catalogId]; }, 'Catalog entry deleted.');
  } else if (data.dialogue) { dialogueId = data.dialogue; dialogueDraft = null; renderDialogues(); }
  else if (data.newDialogue !== undefined) {
    const id = requestId('Dialogue ID',world().dialogues);
    if (!id) return;
    dialogueId = id; dialogueDraft = null;
    updateWorld(next => { next.dialogues[id] = [{lines:['Hey.']}]; }, 'Dialogue created.');
  } else if (data.deleteDialogue !== undefined && confirm(`Delete ${dialogueId}?`)) {
    updateWorld(next => { delete next.dialogues[dialogueId]; }, 'Dialogue deleted.');
    dialogueDraft = null;
  } else if (Object.keys(data).some(key => ['branchAdd','branchRaise','branchDelete','choiceAdd','choiceDelete'].includes(key))) {
    const branches = readDialogue();
    if (data.branchAdd !== undefined) branches.push({when:{}, sets:{}, lines:[''], choices:[]});
    if (data.branchDelete !== undefined) branches.splice(Number(data.branchDelete),1);
    if (data.branchRaise !== undefined) {
      const index = Number(data.branchRaise);
      [branches[index-1], branches[index]] = [branches[index], branches[index-1]];
    }
    if (data.choiceAdd !== undefined) branches[Number(data.choiceAdd)].choices.push({label:'',when:{},sets:{},next:'',give:'',action:''});
    if (data.choiceDelete !== undefined) {
      const [index, choice] = data.choiceDelete.split(':').map(Number);
      branches[index].choices.splice(choice,1);
    }
    dialogueDraft = branches; renderDialogues();
  } else if (data.flagMode) { initialFlagMode = data.flagMode === 'initial'; renderSave(); }
  else if (data.flagRemove) setFlag(data.flagRemove, false, true);
  else if (data.download) download(data.download);
  else if (data.upload) { importMode = data.upload; $('#import').click(); }
  else if (data.defaultWorld !== undefined && confirm('Replace the current world with the bundled district?')) commit(engine.defaults(), 'Bundled world restored.');
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (engine && button && !button.disabled) attempt(() => clickAction(button));
});
document.addEventListener('submit', event => {
  event.preventDefault(); if (engine) attempt(() => handleForm(event.target));
});
document.addEventListener('change', event => {
  if (!engine) return;
  const target = event.target;
  if (target.id === 'map-picker') { mapId = target.value; selected = ''; renderEditor(false); }
  if (target.id === 'entity-picker') { selected = target.value; tool = 'select'; renderEditor(false); }
  if (target.id === 'palette-group') renderPalette();
  if (target.id === 'grid') drawMap();
  if (target.dataset.flag) attempt(() => setFlag(target.dataset.flag,target.checked));
});
$('#import').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  const mode = importMode;
  event.target.value = '';
  try { applyImport(mode, JSON.parse(await file.text())); }
  catch (error) { status(error.message, true); }
});
$('#palette').addEventListener('dragstart', event => {
  const button = event.target.closest('[data-palette]');
  if (!button) return;
  event.dataTransfer.setData('application/x-freestylomon', JSON.stringify({group:$('#palette-group').value,id:button.dataset.palette}));
  event.dataTransfer.effectAllowed = 'copy';
});
canvas.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
canvas.addEventListener('drop', event => {
  event.preventDefault();
  const position = coords(event);
  const data = event.dataTransfer.getData('application/x-freestylomon');
  if (!position || !data) return;
  attempt(() => {
    const {group,id} = JSON.parse(data);
    if (group === 'tiles') {
      tile = id;
      updateWorld(next => tileAt(next.maps[mapId],position.x,position.y,id), 'Tile painted. Game updated.');
    } else place(id,position);
  });
});
canvas.addEventListener('pointerdown', event => attempt(() => startPointer(event)));
canvas.addEventListener('pointermove', event => attempt(() => movePointer(event)));
canvas.addEventListener('pointerup', event => attempt(() => endPointer(event)));
canvas.addEventListener('pointercancel', event => attempt(() => endPointer(event)));
document.addEventListener('keydown', event => {
  if (!engine || tab !== 'map' || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  if ((event.ctrlKey || event.metaKey) && ['z','y'].includes(event.key.toLowerCase())) {
    event.preventDefault(); attempt(() => historyStep(event.shiftKey || event.key.toLowerCase() === 'y'));
  }
});

try {
  engine = await openEngine(() => {
    const incoming = JSON.stringify(engine.world);
    if (incoming !== lastWorld) {
      lastWorld = incoming; drawing = null; draft = null; history.length = 0; forward.length = 0; dialogueDraft = null;
      status('World updated from another tab.'); render();
    } else if (tab === 'map') drawMap();
    else if (tab === 'save' && !$('#save-tab').contains(document.activeElement)) renderSave();
  });
  lastWorld = JSON.stringify(engine.world);
  mapId = engine.save.position.map;
  status('Live game connected'); render();
} catch (error) { status(error.message, true); }
