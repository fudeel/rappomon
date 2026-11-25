export const TILE = 24;
const INK = '#1c2038';

function box(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function oval(ctx, color, x, y, rx, ry) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function tint(color, amount) {
  const value = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#ac9ac6';
  return '#' + [1, 3, 5].map(i => Math.max(0, Math.min(255, parseInt(value.slice(i, i + 2), 16) + amount)).toString(16).padStart(2, '0')).join('');
}

const LETTERS = {
  A:[2,5,7,5,5],B:[6,5,6,5,6],C:[3,4,4,4,3],D:[6,5,5,5,6],E:[7,4,6,4,7],F:[7,4,6,4,4],G:[3,4,5,5,3],H:[5,5,7,5,5],I:[7,2,2,2,7],J:[1,1,1,5,2],K:[5,5,6,5,5],L:[4,4,4,4,7],M:[5,7,7,5,5],N:[5,7,7,7,5],O:[7,5,5,5,7],P:[6,5,6,4,4],Q:[2,5,5,3,1],R:[6,5,6,5,5],S:[3,4,2,1,6],T:[7,2,2,2,2],U:[5,5,5,5,7],V:[5,5,5,5,2],W:[5,5,7,7,5],X:[5,5,2,5,5],Y:[5,5,2,2,2],Z:[7,1,2,4,7],'-':[0,0,7,0,0],'.':[0,0,0,0,2],'+':[0,2,7,2,0], '1':[2,6,2,2,7], '2':[6,1,2,4,7], '3':[6,1,2,1,6], ' ':[0,0,0,0,0],
};

function pixelText(ctx, text, x, y, color, size = 1) {
  for (const [index, letter] of [...text].entries()) {
    (LETTERS[letter] || LETTERS[' ']).forEach((row, yy) => {
      for (let xx = 0; xx < 3; xx++) if (row & (4 >> xx)) box(ctx, color, x + (index * 4 + xx) * size, y + yy * size, size, size);
    });
  }
}

function hash(x, y, n = 0) {
  return ((Math.imul(x + 19, 179423857) ^ Math.imul(y + 17, 982451653) ^ Math.imul(n + 51, 15485863)) >>> 0) % 997;
}

function ground(ctx, tile, tx, ty, time) {
  const x = tx * TILE, y = ty * TILE, color = tile.color;
  box(ctx, color, x, y, TILE, TILE);
  switch (tile.art) {
    case 'paving':
    case 'sidewalk': {
      const edge = tile.art === 'sidewalk';
      const pattern = tint(color, edge ? -17 : -9);
      for (let n = 0; n < 3; n++) {
        box(ctx, pattern, x, y + n * 8, 24, 1);
        box(ctx, pattern, x + ((n + ty) % 2 ? 7 : 15), y + n * 8, 1, 8);
      }
      if (edge) box(ctx, tint(color, 24), x, y + 22, 24, 1);
      break;
    }
    case 'road':
    case 'crosswalk':
      for (let n = 0; n < 4; n++) box(ctx, tint(color, -5), x + hash(tx, ty, n) % 21, y + hash(ty, tx, n) % 23, 3, 1);
      if (tile.art === 'crosswalk') for (let n = 2; n < 24; n += 7) box(ctx, '#afacb6', x, y + n, 24, 3);
      else if (ty % 2 === 0 && tx % 3 !== 2) box(ctx, '#8b798c', x + 2, y, 18, 2);
      break;
    case 'grass':
    case 'wild':
      for (let n = 0; n < (tile.art === 'wild' ? 9 : 3); n++) {
        const xx = x + hash(tx, ty, n) % 21, yy = y + hash(ty, tx, n) % 19;
        const shine = n % 4 === 0;
        box(ctx, tint(color, shine ? 28 : -14), xx, yy + 2, 4, 2);
        box(ctx, tint(color, shine ? 35 : 11), xx + 1, yy, 1, 4);
        if (tile.art === 'wild') box(ctx, tint(color, 19), xx + 3, yy - 1, 1, 3);
      }
      if (hash(tx, ty) % 4 === 0) {
        box(ctx, '#e2bd99', x + 8, y + 13, 2, 2);
        box(ctx, '#df91be', x + 11, y + 10, 2, 2);
      }
      break;
    case 'tree':
    case 'hedge':
      box(ctx, '#234942', x, y, 24, 24);
      break;
    case 'water': {
      const wave = Math.floor(time / 350) % 4;
      for (let n = 0; n < 5; n++) {
        const xx = x + (hash(tx, ty, n) + wave) % 16;
        const yy = y + hash(ty, tx, n) % 22;
        box(ctx, tint(color, n % 2 ? 22 : 10), xx, yy, 3 + n, 1);
        if (n % 3 === 0) box(ctx, tint(color, 33), xx + 2, yy + 1, 3, 1);
      }
      break;
    }
    case 'deck':
      box(ctx, '#41384d', x, y, 24, 24);
      for (let n = 0; n < 4; n++) {
        box(ctx, tint(color, n % 2 * 8), x, y + n * 6, 24, 5);
        box(ctx, '#b88985', x + 3 + n * 4, y + n * 6 + 2, 2, 1);
      }
      box(ctx, '#ad7f79', x, y, 2, 23);
      break;
    case 'floor':
    case 'wall':
    case 'carpet':
      box(ctx, tint(color, -11), x, y + 23, 24, 1);
      box(ctx, tint(color, -8), x + 23, y, 1, 24);
      if (tile.art === 'wall') box(ctx, tint(color, 20), x, y + 5, 24, 2);
      if (tile.art === 'carpet') for (let n = 1; n < 4; n++) box(ctx, tint(color, 14), x + n * 6, y + n * 5, 1, 1);
      break;
  }
}

function tree(ctx, x, y, color, variant, hedge) {
  const lift = hedge ? 7 : variant % 3 - 1;
  box(ctx, '#1a3938', x + 2, y + 19, 22, 4);
  box(ctx, '#765b55', x + 10, y + 15, 4, 7);
  box(ctx, '#aa7862', x + 10, y + 17, 1, 4);
  if (variant % 2 === 0 && !hedge) {
    const pine = ['..........####..........','.........######.........','........########........','......############......','.....##############.....','.......##########.......','.....##############.....','....################....','..####################..','.....##############.....','...##################...','.######################.','..####################..','....################....'];
    pine.forEach((row, yy) => {
      const edge = row.indexOf('#'), width = row.lastIndexOf('#') - edge + 1;
      box(ctx, tint(color, yy % 4 === 3 ? -4 : 10 + variant * 3), x + edge, y + lift + yy + 2, width, 2);
    });
    box(ctx, tint(color, 27), x + 11, y + lift + 2, 2, 3);
    box(ctx, tint(color, 21), x + 7, y + lift + 8, 5, 1);
    box(ctx, tint(color, 26), x + 6, y + lift + 15, 8, 1);
    return;
  }
  box(ctx, tint(color, -9), x + 4, y + lift + 3, 16, 14);
  box(ctx, tint(color, 1), x + 2, y + lift + 6, 20, 10);
  box(ctx, tint(color, 8), x + 6, y + lift + 1, 12, 14);
  box(ctx, tint(color, 17), x + 5, y + lift + 5, 13, 7);
  box(ctx, tint(color, 27), x + 7, y + lift + 4, 6, 2);
  box(ctx, tint(color, 21), x + 12, y + lift + 8, 6, 2);
  box(ctx, tint(color, -4), x + 6, y + lift + 14, 12, 3);
  if (variant === 3) box(ctx, '#d497aa', x + 16, y + lift + 9, 2, 2);
}

function windowPane(ctx, x, y, glow, w = 19, h = 17) {
  box(ctx, '#211e35', x, y, w, h);
  box(ctx, tint(glow, -83), x + 2, y + 2, w - 4, h - 4);
  box(ctx, tint(glow, -40), x + 2, y + 3, w - 4, 4);
  box(ctx, tint(glow, -25), x + 3, y + 4, 2, h - 7);
  box(ctx, '#322847', x + Math.floor(w / 2), y + 1, 2, h - 2);
  box(ctx, glow, x - 1, y + h, w + 2, 2);
}

function facade(ctx, entity, x, y) {
  const props = {
    basement: { width: 154, offset: -7, height: 95, roof: '#9c72ce', glow: '#e8c4fc', name: 'BASEMENT RHYTHMS', number: '01' },
    clinic: { width: 127, offset: -10, height: 91, roof: '#4f9f9a', glow: '#a8f1d7', name: 'REVERB CLINIC', number: '+' },
    echo: { width: 155, offset: 0, height: 96, roof: '#c875a5', glow: '#ffd0db', name: 'ECHO HOUSE', number: '03' },
    tape: { width: 129, offset: -12, height: 47, roof: '#b38c74', glow: '#f9cb8d', name: 'TAPE DECK PIER', number: '02' },
    onys: { width: 114, offset: 0, height: 32, roof: '#9462ad', glow: '#efd0fd', name: 'WANDER ONYS', number: '' },
  }[entity.art];
  if (!props) return;
  const { width:w, height:h, offset, glow, name, number } = props;
  const roof = entity.color || props.roof;
  const left = Math.round(x - w / 2 + offset), top = y - h + 12;
  const roofHeight = h > 70 ? 36 : 14;
  box(ctx, '#262439', left - 5, top + 11, w + 10, h + 4);
  box(ctx, tint(roof, -69), left, top + roofHeight, w, h - roofHeight);
  for (let yy = top + roofHeight + 3; yy < top + h; yy += 6) {
    box(ctx, tint(roof, -58), left, yy, w, 1);
    for (let xx = 4; xx < w - 8; xx += 15) box(ctx, tint(roof, -76), left + xx + yy % 6, yy, 1, 4);
  }
  box(ctx, '#2d223f', left - 5, top + 5, w + 10, roofHeight + 5);
  box(ctx, tint(roof, -14), left - 3, top + 3, w + 6, roofHeight);
  box(ctx, roof, left, top, w, roofHeight - 3);
  for (let row = 4; row < roofHeight - 3; row += 6) {
    box(ctx, tint(roof, -21), left, top + row, w, 1);
    for (let xx = 5 + row % 8; xx < w - 7; xx += 14) box(ctx, tint(roof, -22), left + xx, top + row - 4, 1, 4);
  }
  box(ctx, tint(roof, 29), left, top, w, 2);
  box(ctx, tint(roof, 14), left - 3, top + roofHeight - 3, w + 6, 2);
  box(ctx, '#2a233d', left + 7, top + roofHeight + 5, w - 14, 19);
  box(ctx, tint(roof, -30), left + 9, top + roofHeight + 7, w - 18, 15);
  box(ctx, tint(roof, 46), left + 10, top + roofHeight + 7, w - 20, 1);
  const scale = name.length < 18 && h > 70 ? 2 : 1;
  pixelText(ctx, name, left + Math.floor((w - (name.length * 4 - 1) * scale) / 2), top + roofHeight + (scale === 2 ? 10 : 12), glow, scale);
  if (h > 70) {
    windowPane(ctx, left + 12, top + roofHeight + 28, glow, 27, 19);
    windowPane(ctx, left + w - 38, top + roofHeight + 28, glow, 26, 19);
    box(ctx, '#252438', x - 12 + offset, top + h - 28, 24, 28);
    box(ctx, tint(roof, -32), x - 9 + offset, top + h - 25, 18, 25);
    box(ctx, glow, x - 7 + offset, top + h - 23, 14, 3);
    box(ctx, tint(glow, -60), x - 7 + offset, top + h - 19, 14, 9);
    box(ctx, '#433650', x + offset - 1, top + h - 23, 2, 23);
    box(ctx, '#9c8298', x - 16 + offset, top + h, 32, 3);
    box(ctx, tint(roof, -42), left + 12, top - 6, 20, 13);
    box(ctx, '#352e48', left + 14, top - 6, 16, 9);
    box(ctx, tint(roof, 32), left + 15, top - 6, 14, 1);
    for (let n = 0; n < 3; n++) box(ctx, tint(roof, -6), left + 17, top - 4 + n * 2, 10, 1);
    box(ctx, '#352a48', left + w - 27, top + 8, 18, 12);
    pixelText(ctx, number, left + w - 23, top + 11, glow);
  }
  box(ctx, tint(roof, 10), left + 1, top + h - 2, w - 2, 2);
}

function person(ctx, x, y, color, facing, player, time) {
  const bob = player && Math.floor(time / 310) % 2 === 0 ? 1 : 0;
  y -= bob;
  oval(ctx, '#21223890', x, y + 6 + bob, 8, 3);
  box(ctx, INK, x - 7, y - 9, 14, 14);
  box(ctx, '#2b293f', x - 5, y + 3, 4, 5);
  box(ctx, '#2b293f', x + 2, y + 3, 4, 5);
  box(ctx, player ? '#d5dbbd' : '#b7a6bb', x - 5, y + 7, 4, 1);
  box(ctx, player ? '#d5dbbd' : '#b7a6bb', x + 2, y + 7, 4, 1);
  box(ctx, color, x - 5, y - 5, 10, 9);
  box(ctx, tint(color, -38), x - 6, y + 1, 12, 3);
  box(ctx, tint(color, -22), x + 3, y - 5, 3, 6);
  box(ctx, '#edb78f', x - 7, y - 1, 2, 3);
  box(ctx, '#edb78f', x + 6, y - 1, 2, 3);
  box(ctx, INK, x - 6, y - 16, 12, 10);
  box(ctx, '#ecc0a7', x - 4, y - 14, 8, 7);
  box(ctx, '#c88477', x - 4, y - 8, 8, 1);
  box(ctx, color, x - 5, y - 16, 10, 3);
  box(ctx, tint(color, 33), x - 4, y - 17, 8, 2);
  if (facing === 'up') {
    box(ctx, tint(color, -32), x - 4, y - 13, 8, 6);
  } else {
    const side = facing === 'left' ? -2 : facing === 'right' ? 2 : 0;
    box(ctx, '#30263c', x - 3 + side, y - 11, 1, 2);
    box(ctx, '#30263c', x + 2 + side, y - 11, 1, 2);
  }
  if (player) {
    box(ctx, '#d6f295', x - 8, y - 21, 16, 2);
    box(ctx, '#d6f295', x - 4, y - 19, 8, 1);
    box(ctx, '#fcf1ac', x - 1, y - 18, 2, 1);
  }
}

export function itemArt(ctx, icon, x, y, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  if (icon === 'cassette') {
    box(ctx, INK, -8, -5, 16, 11); box(ctx, '#f6b9b3', -7, -4, 14, 9);
    box(ctx, '#9d68a7', -6, -2, 12, 4); box(ctx, '#312840', -4, -1, 8, 2);
    box(ctx, '#faf0c6', -4, -1, 2, 2); box(ctx, '#faf0c6', 2, -1, 2, 2);
  } else if (icon === 'bottle' || icon === 'capsule') {
    box(ctx, INK, -4, -7, 8, 14); box(ctx, '#e9f4e3', -2, -7, 4, 3);
    box(ctx, icon === 'bottle' ? '#77e2d0' : '#ffd0a0', -3, -3, 6, 9); box(ctx, '#fff2d5', -2, -1, 2, 4);
  } else if (icon === 'spark') {
    box(ctx, '#ffc295', -3, -7, 6, 14); box(ctx, '#ffc295', -7, -3, 14, 6);
    box(ctx, '#ffe9be', -2, -5, 4, 10); box(ctx, '#ffe9be', -5, -2, 10, 4);
  } else {
    box(ctx, INK, -7, -6, 14, 13); box(ctx, '#b6a0dc', -6, -5, 12, 11);
    box(ctx, '#5a466f', -4, -3, 8, 7); box(ctx, '#a9e5c9', -2, -1, 4, 3);
    box(ctx, '#e8cbea', -5, -5, 4, 1);
  }
  ctx.restore();
}

function prop(ctx, e, x, y, time, world) {
  if (e.kind === 'light') return;
  if (e.kind === 'item') {
    oval(ctx, '#322642a0', x, y + 6, 9, 3);
    box(ctx, '#ffe5a3', x - 10, y - 8, 2, 2); box(ctx, '#fff0ca', x + 8, y - 3, 2, 2);
    itemArt(ctx, e.art || 'cassette', x, y - 2 - Math.floor(time / 360) % 2);
  } else if (e.kind === 'exit') {
    box(ctx, '#a298c4', x - 7, y + 1, 14, 5); box(ctx, '#e4c8fe', x - 4, y - 2, 8, 2);
    box(ctx, '#f6dba6', x - 1, y - 4, 2, 2);
  } else if (e.kind === 'wild') {
    oval(ctx, '#21223890', x, y + 5, 8, 3);
    sprite(ctx, world.species[e.squad[0]?.species], x, y + 4 - Math.floor(time / 390) % 2, 1);
  } else if (e.kind !== 'decor') {
    person(ctx, x, y, e.color || '#cbd6f2', 'down', false, time);
    if (['label', 'boss'].includes(e.kind)) {
      box(ctx, '#342b47', x - 5, y - 23, 10, 7);
      box(ctx, e.color || '#ffcb9d', x - 3, y - 22, 6, 4);
      box(ctx, '#f9dfb7', x - 1, y - 20, 2, 2);
    }
  } else if (e.art === 'lamp') {
    oval(ctx, '#eebd7750', x, y, 10, 5);
    box(ctx, '#272642', x - 2, y - 26, 4, 31);
    box(ctx, '#827088', x - 1, y - 25, 1, 27);
    box(ctx, '#827088', x - 7, y - 29, 14, 2);
    box(ctx, '#d9a581', x - 7, y - 27, 14, 4);
    box(ctx, '#fff0b4', x - 5, y - 26, 10, 3);
  } else if (e.art === 'planter') {
    box(ctx, '#69596f', x - 10, y - 3, 20, 8); box(ctx, '#c598a2', x - 11, y - 4, 22, 2);
    for (let n = 0; n < 5; n++) {
      box(ctx, '#75ac81', x - 8 + n * 4, y - 8, 3, 4);
      box(ctx, n % 2 ? '#efacbc' : '#f3dba0', x - 8 + n * 4, y - 9, 2, 2);
    }
  } else if (e.art === 'bench') {
    box(ctx, '#312b46', x - 10, y - 7, 20, 10); box(ctx, '#ce9d80', x - 10, y - 7, 20, 2);
    box(ctx, '#a97570', x - 10, y - 2, 20, 3);
    box(ctx, '#49364d', x - 8, y + 1, 2, 4); box(ctx, '#49364d', x + 7, y + 1, 2, 4);
  } else if (e.art === 'mural') {
    box(ctx, '#34304a', x - 2, y - 11, 20, 11); pixelText(ctx, 'FLO', x + 2, y - 9, '#f598bd');
  } else if (['basement', 'clinic', 'echo', 'tape', 'onys'].includes(e.art)) {
    facade(ctx, e, x, y);
  } else {
    box(ctx, '#2d2942', x - 12, y - 12, 24, 17);
    box(ctx, '#77719a', x - 11, y - 11, 22, 2);
    for (const px of [x - 9, x + 2]) {
      box(ctx, '#594c75', px, y - 7, 7, 8); box(ctx, '#b295c0', px + 2, y - 5, 3, 4);
    }
  }
}

function light(ctx, entity, x, y, time) {
  const color = tint(entity.color, 0);
  const radius = (entity.radius || 4) * TILE;
  const strength = entity.strength ?? .35;
  const alpha = value => Math.round(Math.min(1, value) * 255).toString(16).padStart(2, '0');
  const glow = ctx.createRadialGradient(x, y, 1, x, y, radius);
  glow.addColorStop(0, color + alpha(strength));
  glow.addColorStop(.36, color + alpha(strength * .42));
  glow.addColorStop(1, color + '00');
  ctx.fillStyle = glow;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  if (entity.beam) {
    const drift = Math.sin(time / 2700) * radius * .15;
    const cone = ctx.createLinearGradient(x, y - radius * .66, x, y + radius * .45);
    cone.addColorStop(0, color + '00');
    cone.addColorStop(.53, color + alpha(strength * .53));
    cone.addColorStop(1, color + '00');
    ctx.fillStyle = cone;
    ctx.beginPath(); ctx.moveTo(x + drift, y - radius * .66);
    ctx.lineTo(x - radius * .35, y + radius * .45); ctx.lineTo(x + radius * .48, y + radius * .45);
    ctx.fill();
  }
}

export function visible(e, flags, mapId) {
  return Object.entries(e.when || {}).every(([key, value]) => Boolean(flags[key]) === value)
    && !(e.kind === 'item' && flags[`taken:${mapId}/${e.id}`])
    && !(e.kind === 'wild' && flags[`won:${mapId}/${e.id}`]);
}

export function renderMap(canvas, world, save, view = {}) {
  const mapId = view.mapId || save.position.map;
  const map = world.maps[mapId];
  if (!map) return;
  const w = map.rows[0].length, h = map.rows.length;
  const width = view.editor ? w : Math.min(30, w), height = view.editor ? h : Math.min(18, h);
  const extraX = view.editor ? 0 : Math.max(0, Math.floor((30 - width) / 2));
  const extraY = view.editor ? 0 : Math.max(0, Math.floor((18 - height) / 2));
  const cameraX = Math.max(0, Math.min(w - width, save.position.x - Math.floor(width / 2)));
  const cameraY = Math.max(0, Math.min(h - height, save.position.y - Math.floor(height / 2)));
  const canvasWidth = (view.editor ? width : 30) * TILE, canvasHeight = (view.editor ? height : 18) * TILE;
  if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
  if (canvas.height !== canvasHeight) canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d'), time = view.time || 0;
  ctx.imageSmoothingEnabled = false;
  box(ctx, '#1a1e32', 0, 0, canvasWidth, canvasHeight);
  ctx.save();
  ctx.translate((extraX - cameraX) * TILE, (extraY - cameraY) * TILE);
  for (let y = cameraY; y < cameraY + height; y++) {
    for (let x = cameraX; x < cameraX + width; x++) {
      const tile = world.tiles[map.rows[y][x]];
      if (tile) ground(ctx, tile, x, y, time);
    }
  }
  for (let y = cameraY; y < cameraY + height; y++) {
    for (let x = cameraX; x < cameraX + width; x++) {
      const tile = world.tiles[map.rows[y][x]];
      if (tile && ['tree', 'hedge'].includes(tile.art)) tree(ctx, x * TILE, y * TILE, tile.color, hash(x, y) % 4, tile.art === 'hedge');
    }
  }
  const entities = map.entities.filter(e => view.editor || visible(e, save.flags, mapId));
  const base = entities.filter(e => e.kind !== 'light').sort((a, b) => a.y - b.y);
  let drawn = save.position.map !== mapId;
  for (const e of base) {
    if (!drawn && e.y > save.position.y) { drawPlayer(); drawn = true; }
    prop(ctx, e, (e.x + .5) * TILE, (e.y + .5) * TILE, time, world);
  }
  if (!drawn) drawPlayer();
  function drawPlayer() {
    person(ctx, (save.position.x + .5) * TILE, (save.position.y + .5) * TILE, '#c5ed83', save.facing, true, time);
  }
  ctx.globalCompositeOperation = 'screen';
  for (const e of entities.filter(e => e.kind === 'light')) light(ctx, e, (e.x + .5) * TILE, (e.y + .5) * TILE, time);
  ctx.globalCompositeOperation = 'source-over';
  if (view.editor) {
    if (view.grid) {
      ctx.strokeStyle = '#e4ddff30'; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = 0; x <= w; x++) { ctx.moveTo(x * TILE + .5, 0); ctx.lineTo(x * TILE + .5, h * TILE); }
      for (let y = 0; y <= h; y++) { ctx.moveTo(0, y * TILE + .5); ctx.lineTo(w * TILE, y * TILE + .5); }
      ctx.stroke();
    }
    for (const e of entities.filter(e => e.kind === 'light')) {
      const x = (e.x + .5) * TILE, y = (e.y + .5) * TILE;
      box(ctx, '#1b1a2a', x - 5, y - 5, 10, 10); box(ctx, e.color || '#ead9fd', x - 3, y - 3, 6, 6);
    }
    if (view.selected) {
      const entity = entities.find(e => e.id === view.selected);
      if (entity) { ctx.strokeStyle = '#e0fa9b'; ctx.lineWidth = 2; ctx.strokeRect(entity.x * TILE + 1, entity.y * TILE + 1, TILE - 2, TILE - 2); }
    }
  }
  ctx.restore();
}

const CREATURES = {
  cub: [
    '....##........##....','...#AB#......#BA#...','...#ABB#....#BBA#...','..#AABB######BBAA#..',
    '..#AAABBBBBBBBAAA#..','...#ABBBCCCCBBBA#...','...#ABBCCDDCCBBA#...','..#ABBCEDCCDECBBA#..',
    '.#F#ABCCDDDDCCBA#F#.','.#F#AACDGGDCDCAA#F#.','.#F#AAACDDCCAAAA#F#.','..##AAAAAAABAAA##...',
    '...#AABBBBBBAAA#....','..#AAABBAABBAAAA#...', '..#AA#BBBBBBA#AA#...', '..#A#AAAABAAAA#A#...',
    '..##AAA######AAA#...', '...####......###....',
  ],
  jackal: [
    '..##............##..','..#A#..........#A#..','..#AB#........#BA#..','..#ABB#......#BBA#..',
    '...#ABB######BBA#...','...#ABBBCCCCBBBA#...','..##ABBCCDDCCBBA##..','.#F#ABCEDCCDECB#F#..',
    '.#F#ABCCDDDDCCB#F#..','..##AAACDGGDCAA##...','...#BAAADDDABA#.....','....#ABBAABBA#......',
    '...#AABBBBBBAA#..#..','...#AABAAABBAA#.#A#.','...#B#BBBBBA#B##B#..','...##AAA##AAA###....','....####..####......',
  ],
  frog: [
    '....####....####....','...#BBBC#..#CBBB#...','..#BCECB####BCECB#..','..#BBCCBBBBBBCCBB#..',
    '.#AABCCCCCCCCCCBAA#.','.#AABCCCDDDCCCCBAA#.','.#AABCDDGGGGDDCBAA#.','..#AABCDDDDDDCAAA#..',
    '..#AABBBBBBBBBAA##..','.#AAABBBBBBBBBAAAAA#','.#AA#BBDDDDDBB#AAAA#','.#A##ABDDDDBAA##AAA#',
    '..###AAAAAAAAA#####.','...####....####.....',
  ],
  fish: [
    '.........##.........','.........#A##.......','...#######BAA#......','..#AABBBBBBBB###....',
    '.#ABCCCBCCCCCCBA#..#','.#ABCEDCCCCCECBBA##A','#AABCCDDDDDDDCCBAAA#','#AABCGGGDDDDDCBAAAA#',
    '.#ABCCDDDDDDCBBA###A','.##BBAABBBBBBAA#..##','...###AAABBAA##.....','......###A###.......',
  ],
  moth: [
    '......##....##......','......#A#..#A#......','..##...#A##A#...##..','.#AB#..#CCCC#..#BA#.','.#ABB###ECCE###BBA#.',
    '#ABBBBA#CCCC#ABBBBA#','#ABBBCB#DDDD#BCBBBA#','#ABCCCB#AAAA#BCCCAA#','.#BBBBB#ABBA#BBBBB#.',
    '..#AABB#ABBA#BBAA#..','...###A#AAAA#A###...','......########......',
  ],
  bat: [
    '#........##........#','##..#...#AA#...#..##','#A###..#ABBA#..###A#','#ABBA###CCCC###ABBA#',
    '#ABBB#BCEDDECB#BBBA#','.#CCCBACCCCCCCBCCB#.','.#BCCBBAAGGABBBCCB#.','..##BABAADDABAB##...',
    '....###AABBA###.....','......#AAABA#.......','.......######.......',
  ],
  ghost: [
    '.........##.........','.......##BA##.......','......#ABCCBA#......','.....#ABCCCCBA#.....',
    '....#ABCDDDD CBA#...','...#ABCECCCCECBA#...','..#AABCCCCCCCCBAA#..','..#AAACDDGGDCAAAA#..',
    '.#AABBAADDDDAABBAA#.','.#ABBAAAAAAAAAABBA#.','..##BAAABBAAABA##...',
    '....##AAABAAA##.....','.....#ABAAB##.......','......#A###.........','.....#A#............','.....##.............',
  ],
};

export function sprite(ctx, species, centerX, bottomY, scale = 3, flip = false) {
  if (!species) return;
  const color = species.color;
  const art = ({ lynx: 'cub', cat: 'cub' })[species.art] || species.art;
  const rows = CREATURES[art] || CREATURES.cub;
  const palette = { '#': '#24223b', A: tint(color, -49), B: color, C: tint(color, 42), D: '#fff1d4', E: '#262239', F: '#73638e', G: '#75415d' };
  ctx.save(); ctx.translate(Math.round(centerX), Math.round(bottomY)); ctx.scale(flip ? -scale : scale, scale);
  rows.forEach((row, y) => [...row].forEach((pixel, x) => {
    if (palette[pixel]) box(ctx, palette[pixel], x - 10, y - rows.length, 1, 1);
  }));
  if (species.art === 'lynx' || species.art === 'cat') {
    box(ctx, '#302540', -7, -17, 2, 7); box(ctx, '#302540', 5, -17, 2, 7);
    box(ctx, color, -6, -17, 1, 4); box(ctx, color, 5, -17, 1, 4);
  }
  ctx.restore();
}

// ============================================================================
// Smooth, high-resolution renderer used by the game.
// Backstage keeps using renderMap above, so the editor is unchanged.
// World units: one tile is TILE (24) units; drawing is scaled to device pixels.
// ============================================================================

const CHUNK = 6;
const TAU = Math.PI * 2;
const SKIN = ['#f3cdb0', '#e2ab86', '#c48a63', '#9a6646', '#f6dcc6', '#d79a76'];
const HAIR = ['#2b2238', '#4a3048', '#6b4a3a', '#d6a03c', '#23283f', '#7d4f6e', '#3b2a2a'];
const ROADS = new Set(['road', 'crosswalk']);
const GRASSY = new Set(['grass', 'wild']);
const TALL = new Set(['tree', 'hedge', 'wall']);
const BUILDINGS = new Set(['basement', 'clinic', 'echo', 'tape', 'onys']);
const BEAT = 740;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOut = t => { t = clamp(t, 0, 1); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

function seedOf(text) {
  let h = 2166136261;
  for (const character of String(text)) { h ^= character.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rgba(hex, alpha) {
  const value = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : '#ac9ac6';
  return `rgba(${parseInt(value.slice(1, 3), 16)},${parseInt(value.slice(3, 5), 16)},${parseInt(value.slice(5, 7), 16)},${alpha})`;
}

function rrect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRound(ctx, fill, x, y, w, h, r) { rrect(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); }
function circle(ctx, fill, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); ctx.fillStyle = fill; ctx.fill(); }
function ellipseFill(ctx, fill, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }

function vertical(ctx, y0, y1, stops) {
  const gradient = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  return gradient;
}

function stroke(ctx, color, width, draw) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); draw(); ctx.stroke();
}

function artAt(world, map, x, y) {
  const row = map.rows[y];
  if (!row || x < 0 || x >= row.length) return null;
  return world.tiles[row[x]]?.art ?? null;
}

// ---------------------------------------------------------------- ground ---

function groundSmooth(ctx, world, map, tx, ty) {
  const tile = world.tiles[map.rows[ty]?.[tx]];
  if (!tile) return;
  const x = tx * TILE, y = ty * TILE, c = tile.color, art = tile.art;
  const near = (dx, dy) => artAt(world, map, tx + dx, ty + dy);
  ctx.fillStyle = c;
  ctx.fillRect(x, y, TILE, TILE);
  switch (art) {
    case 'paving': {
      ctx.fillStyle = tint(c, -9); ctx.fillRect(x, y, TILE, TILE);
      for (let i = 0; i < 4; i++) {
        const sx = x + (i % 2) * 12 + .55, sy = y + (i >> 1) * 12 + .55;
        const shade = hash(tx * 2 + i % 2, ty * 2 + (i >> 1), 3) % 9 - 3;
        fillRound(ctx, tint(c, shade + 2), sx, sy, 10.9, 10.9, 2.6);
        fillRound(ctx, 'rgba(255,255,255,.05)', sx + 1, sy + .7, 8.9, 2, 1);
      }
      break;
    }
    case 'sidewalk': {
      ctx.fillStyle = tint(c, -13); ctx.fillRect(x, y, TILE, TILE);
      const shift = ty % 2 ? 6 : 0;
      for (let i = -1; i < 2; i++) {
        const sx = x + shift + i * 12 + .5;
        const left = Math.max(x, sx), right = Math.min(x + TILE, sx + 11);
        if (right - left > 1) fillRound(ctx, tint(c, hash(tx, ty, i + 4) % 7 - 2), left, y + .5, right - left, 23, 2);
      }
      ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(x, y + 1, TILE, 1.2);
      if (ROADS.has(near(0, 1))) {
        fillRound(ctx, tint(c, 20), x - .5, y + 20.4, TILE + 1, 3.6, 1.4);
        ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(x, y + 20.6, TILE, .8);
      }
      if (ROADS.has(near(0, -1))) fillRound(ctx, tint(c, 14), x - .5, y, TILE + 1, 3, 1.2);
      break;
    }
    case 'road':
    case 'crosswalk': {
      for (let n = 0; n < 7; n++) {
        circle(ctx, n % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.07)', x + hash(tx, ty, n) % 23 + .5, y + hash(ty, tx, n) % 23 + .5, .55 + (n % 3) * .25);
      }
      if (!ROADS.has(near(0, -1))) { ctx.fillStyle = vertical(ctx, y, y + 6, [[0, 'rgba(6,4,16,.34)'], [1, 'rgba(6,4,16,0)']]); ctx.fillRect(x, y, TILE, 6); }
      if (art === 'crosswalk') {
        for (let k = 0; k < 3; k++) fillRound(ctx, 'rgba(226,221,236,.78)', x + 1.6, y + 2 + k * 8, 20.8, 4.3, 1.3);
      } else if (near(0, -1) === 'road') {
        fillRound(ctx, 'rgba(236,214,152,.62)', x + 5, y - .95, 14, 1.9, .95);
      }
      break;
    }
    case 'grass':
    case 'wild': {
      const wild = art === 'wild';
      if (wild) { ctx.fillStyle = tint(c, -8); ctx.fillRect(x, y, TILE, TILE); }
      ellipseFill(ctx, 'rgba(255,255,255,.035)', x + hash(tx, ty, 1) % 20 + 2, y + hash(tx, ty, 2) % 18 + 3, 8, 5);
      ellipseFill(ctx, 'rgba(0,0,0,.05)', x + hash(tx, ty, 3) % 20 + 2, y + hash(tx, ty, 4) % 18 + 4, 7, 4.5);
      const tufts = wild ? 2 : 4;
      for (let k = 0; k < tufts; k++) {
        const bx = x + hash(tx, ty, k + 7) % 19 + 2.5, by = y + hash(ty, tx, k + 7) % 17 + 5.5;
        stroke(ctx, tint(c, wild ? 8 : 24), 1.05, () => {
          ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx - 1, by - 2.4, bx - 2.4, by - 4);
          ctx.moveTo(bx, by); ctx.lineTo(bx + .2, by - 5);
          ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + 1, by - 2.4, bx + 2.4, by - 3.8);
        });
      }
      if (!wild && hash(tx, ty) % 4 === 0) {
        const fx = x + 6 + hash(tx, ty, 11) % 12, fy = y + 7 + hash(tx, ty, 12) % 11;
        const petal = hash(tx, ty, 13) % 2 ? '#f2a8c8' : '#f4dc9c';
        for (let p = 0; p < 5; p++) circle(ctx, petal, fx + Math.cos(p * TAU / 5) * 1.3, fy + Math.sin(p * TAU / 5) * 1.3, 1);
        circle(ctx, '#fff3cf', fx, fy, .75);
      }
      ctx.strokeStyle = 'rgba(8,20,18,.26)'; ctx.lineWidth = 1.3;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const other = near(dx, dy);
        if (!other || GRASSY.has(other) || other === 'tree' || other === 'hedge') continue;
        ctx.beginPath();
        if (dy === -1) { ctx.moveTo(x, y + .65); ctx.lineTo(x + TILE, y + .65); }
        if (dy === 1) { ctx.moveTo(x, y + TILE - .65); ctx.lineTo(x + TILE, y + TILE - .65); }
        if (dx === -1) { ctx.moveTo(x + .65, y); ctx.lineTo(x + .65, y + TILE); }
        if (dx === 1) { ctx.moveTo(x + TILE - .65, y); ctx.lineTo(x + TILE - .65, y + TILE); }
        ctx.stroke();
      }
      break;
    }
    case 'tree':
    case 'hedge':
      ctx.fillStyle = tint(c, -9); ctx.fillRect(x, y, TILE, TILE);
      break;
    case 'water': {
      ctx.fillStyle = vertical(ctx, y, y + TILE, [[0, tint(c, 6)], [1, tint(c, -6)]]); ctx.fillRect(x, y, TILE, TILE);
      const shore = (dx, dy) => { const other = near(dx, dy); return other && other !== 'water'; };
      const band = (x0, y0, x1, y1, rx, ry, rw, rh) => {
        const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
        gradient.addColorStop(0, 'rgba(130,206,232,.22)'); gradient.addColorStop(1, 'rgba(130,206,232,0)');
        ctx.fillStyle = gradient; ctx.fillRect(rx, ry, rw, rh);
      };
      if (shore(0, -1)) band(0, y, 0, y + 8, x, y, TILE, 8);
      if (shore(0, 1)) band(0, y + TILE, 0, y + TILE - 7, x, y + TILE - 7, TILE, 7);
      if (shore(-1, 0)) band(x, 0, x + 7, 0, x, y, 7, TILE);
      if (shore(1, 0)) band(x + TILE, 0, x + TILE - 7, 0, x + TILE - 7, y, 7, TILE);
      break;
    }
    case 'deck': {
      ctx.fillStyle = tint(c, -30); ctx.fillRect(x, y, TILE, TILE);
      for (let k = 0; k < 4; k++) {
        const py = y + .4 + k * 6, shade = hash(tx, ty, k) % 5 - 2 + (k % 2) * 3;
        fillRound(ctx, vertical(ctx, py, py + 5.3, [[0, tint(c, shade + 10)], [1, tint(c, shade - 4)]]), x - .5, py, TILE + 1, 5.3, 1.6);
        stroke(ctx, 'rgba(40,20,36,.1)', .4, () => { ctx.moveTo(x + 1, py + 3.1); ctx.bezierCurveTo(x + 8, py + 2.5, x + 15, py + 3.6, x + 23, py + 2.9); });
        if (hash(tx, ty, k + 9) % 3 === 0) {
          const seam = x + 5 + hash(tx, ty, k + 12) % 14;
          ctx.fillStyle = tint(c, -26); ctx.fillRect(seam, py + .3, .7, 4.7);
          circle(ctx, 'rgba(255,230,214,.22)', seam - 1.5, py + 2.6, .45);
          circle(ctx, 'rgba(255,230,214,.22)', seam + 2.2, py + 2.6, .45);
        }
      }
      if (near(0, 1) === 'water') { fillRound(ctx, tint(c, -28), x - .5, y + 21.8, TILE + 1, 2.4, 1); }
      if (near(-1, 0) === 'water') { ctx.fillStyle = tint(c, -24); ctx.fillRect(x, y, 1.5, TILE); }
      if (near(1, 0) === 'water') { ctx.fillStyle = tint(c, -24); ctx.fillRect(x + TILE - 1.5, y, 1.5, TILE); }
      break;
    }
    case 'floor': {
      for (let i = 0; i < 4; i++) {
        const sx = x + (i % 2) * 12, sy = y + (i >> 1) * 12;
        ctx.fillStyle = (tx * 2 + i % 2 + ty * 2 + (i >> 1)) % 2 ? tint(c, 5) : tint(c, -2);
        ctx.fillRect(sx, sy, 12, 12);
      }
      ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = .5; ctx.strokeRect(x + .25, y + .25, TILE - .5, TILE - .5);
      const sheen = ctx.createLinearGradient(x, y, x + TILE, y + TILE);
      sheen.addColorStop(0, 'rgba(255,255,255,.035)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen; ctx.fillRect(x, y, TILE, TILE);
      break;
    }
    case 'wall': {
      ctx.fillStyle = vertical(ctx, y, y + TILE, [[0, tint(c, 16)], [1, tint(c, -6)]]); ctx.fillRect(x, y, TILE, TILE);
      rrect(ctx, x + 2.5, y + 5, 19, 13, 2); ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = .8; ctx.stroke();
      ctx.fillStyle = tint(c, 34); ctx.fillRect(x, y, TILE, 1.6);
      if (near(0, 1) && near(0, 1) !== 'wall') {
        ctx.fillStyle = tint(c, -16); ctx.fillRect(x, y + 20, TILE, 4);
        ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(x, y + 20, TILE, .7);
      }
      break;
    }
    case 'carpet': {
      for (let k = 0; k < 2; k++) {
        const cx = x + 6 + k * 12, cy = y + 12 + (k ? -6 : 6) * 0;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4);
        fillRound(ctx, 'rgba(255,214,236,.09)', -3, -3, 6, 6, 1); ctx.restore();
      }
      const trim = '#e8c37e';
      ctx.fillStyle = rgba(trim, .62);
      if (near(-1, 0) !== 'carpet') ctx.fillRect(x + 1, y, 1.5, TILE);
      if (near(1, 0) !== 'carpet') ctx.fillRect(x + TILE - 2.5, y, 1.5, TILE);
      if (near(0, -1) !== 'carpet') ctx.fillRect(x, y + 1, TILE, 1.5);
      if (near(0, 1) !== 'carpet') ctx.fillRect(x, y + TILE - 2.5, TILE, 1.5);
      break;
    }
  }
  if (!TALL.has(art) && TALL.has(near(0, -1))) {
    ctx.fillStyle = vertical(ctx, y, y + 8, [[0, 'rgba(6,5,16,.38)'], [1, 'rgba(6,5,16,0)']]);
    ctx.fillRect(x, y, TILE, 8);
  }
}

function treeSmooth(ctx, world, map, tx, ty, shadow = true) {
  const art = artAt(world, map, tx, ty);
  if (art !== 'tree' && art !== 'hedge') return;
  const c = world.tiles[map.rows[ty][tx]].color, x = tx * TILE, y = ty * TILE;
  if (art === 'hedge') {
    const left = artAt(world, map, tx - 1, ty) === 'hedge', right = artAt(world, map, tx + 1, ty) === 'hedge';
    const x0 = x + (left ? -1 : 1.5), x1 = x + TILE + (right ? 1 : -1.5);
    if (shadow) ellipseFill(ctx, 'rgba(6,14,18,.38)', x + 12, y + 21, 12.5, 3.6);
    const fill = vertical(ctx, y + 2, y + 22, [[0, tint(c, 30)], [.55, tint(c, 6)], [1, tint(c, -16)]]);
    fillRound(ctx, fill, x0, y + 6, x1 - x0, 15, left && right ? 2 : 7);
    for (let k = 0; k < 3; k++) circle(ctx, fill, x + 4 + k * 8, y + 8 + (k % 2) * .8, 4.8);
    for (let k = 0; k < 5; k++) circle(ctx, 'rgba(255,255,255,.07)', x + 3 + hash(tx, ty, k) % 18, y + 7 + hash(ty, tx, k) % 9, 1.3);
    return;
  }
  const variant = hash(tx, ty) % 4;
  const cx = x + 12 + (hash(tx, ty, 4) % 5 - 2) * .6;
  if (shadow) ellipseFill(ctx, 'rgba(6,14,18,.42)', cx, y + 20.5, 11.5, 4);
  if (variant % 2 === 0) {
    fillRound(ctx, '#6b4a42', cx - 1.6, y + 14, 3.2, 7, 1.2);
    const tiers = [[y + 15.5, 11.6, 9.5], [y + 10, 9.6, 9], [y + 4.6, 7.2, 8.6]];
    for (const [base, w, h] of tiers) {
      const gradient = ctx.createLinearGradient(cx - w, 0, cx + w, 0);
      gradient.addColorStop(0, tint(c, 34)); gradient.addColorStop(.45, tint(c, 10)); gradient.addColorStop(1, tint(c, -18));
      ctx.beginPath();
      ctx.moveTo(cx - w, base);
      ctx.quadraticCurveTo(cx - w * .45, base - h * .42, cx, base - h);
      ctx.quadraticCurveTo(cx + w * .45, base - h * .42, cx + w, base);
      ctx.quadraticCurveTo(cx, base + 2.8, cx - w, base);
      ctx.fillStyle = tint(c, -22); ctx.save(); ctx.translate(0, 1.2); ctx.fill(); ctx.restore();
      ctx.fillStyle = gradient; ctx.fill();
    }
    circle(ctx, 'rgba(255,255,255,.1)', cx - 1.5, y - 1.5, 1.4);
    return;
  }
  const top = y - 3 + (variant === 3 ? 1 : 0);
  fillRound(ctx, vertical(ctx, y + 11, y + 21, [[0, '#8b6656'], [1, '#553a3c']]), cx - 2.2, y + 11.5, 4.4, 9.5, 1.6);
  const blobs = [[0, 8, 9.4], [-5.4, 11, 6.2], [5.6, 10.6, 6.4], [.4, 4, 6.8]];
  ctx.fillStyle = tint(c, -20);
  for (const [bx, by, r] of blobs) { ctx.beginPath(); ctx.arc(cx + bx, top + by + 1.5, r + .5, 0, TAU); ctx.fill(); }
  const gradient = ctx.createRadialGradient(cx - 4, top + 3, 1, cx, top + 9, 15);
  gradient.addColorStop(0, tint(c, 48)); gradient.addColorStop(.5, tint(c, 16)); gradient.addColorStop(1, tint(c, -8));
  ctx.fillStyle = gradient;
  for (const [bx, by, r] of blobs) { ctx.beginPath(); ctx.arc(cx + bx, top + by, r, 0, TAU); ctx.fill(); }
  ellipseFill(ctx, 'rgba(255,255,255,.09)', cx - 3.5, top + 3.4, 3.4, 2);
  ellipseFill(ctx, 'rgba(255,255,255,.06)', cx + 4.5, top + 8.2, 2.4, 1.5);
  if (variant === 3) for (let k = 0; k < 4; k++) circle(ctx, '#e7a2bd', cx - 6 + hash(tx, ty, k) % 12, top + 4 + hash(ty, tx, k) % 10, 1.1);
}

// ------------------------------------------------------------- characters --

function personSmooth(ctx, x, y, o) {
  const seed = o.seed || 0;
  const skin = o.skin || SKIN[seed % SKIN.length];
  const hair = o.player ? '#2a2236' : HAIR[(seed >> 4) % HAIR.length];
  const color = o.color || '#cbd6f2';
  const facing = o.facing || 'down';
  const side = facing === 'left' || facing === 'right';
  const dir = facing === 'left' ? -1 : 1;
  const swing = o.moving ? Math.sin(o.phase) : 0;
  const lift = o.moving ? Math.abs(Math.sin(o.phase)) : 0;
  const breathe = o.moving ? 0 : Math.sin(o.time / 560 + seed) * .35;
  const bob = -lift * 1.3 + breathe * .4;
  const feet = y + 8;
  const ink = 'rgba(22,17,38,.62)';
  ellipseFill(ctx, 'rgba(10,8,22,.36)', x, feet + .4, 6.6 - lift * .7, 2.3);

  const pants = o.pants || '#2e2b46', shoe = o.player ? '#ecf8c8' : '#dcd2e6';
  ctx.lineCap = 'round';
  const leg = (hx, fx, fy, shade) => {
    stroke(ctx, shade ? tint(pants, -14) : pants, 3.3, () => { ctx.moveTo(hx, y + .8 + bob); ctx.lineTo(fx, fy); });
    ellipseFill(ctx, shade ? tint(shoe, -30) : shoe, fx + (side ? dir * .7 : 0), fy + .5, side ? 2.4 : 1.9, 1.3);
  };
  if (side) {
    leg(x - dir * .3, x - swing * 3 * dir, feet - Math.max(0, -swing) * 1.6, true);
    leg(x + dir * .3, x + swing * 3 * dir, feet - Math.max(0, swing) * 1.6, false);
  } else {
    leg(x - 2.3, x - 2.4, feet - Math.max(0, swing) * 2, false);
    leg(x + 2.3, x + 2.4, feet - Math.max(0, -swing) * 2, false);
  }

  const bodyW = side ? 8.6 : 11.4, bodyTop = y - 8.6 + bob;
  const arm = (sx, hx, hy, back) => {
    stroke(ctx, back ? tint(color, -34) : tint(color, -12), 2.7, () => { ctx.moveTo(sx, bodyTop + 2); ctx.lineTo(hx, hy); });
    circle(ctx, back ? tint(skin, -18) : skin, hx, hy + .3, 1.35);
  };
  if (side) arm(x - dir * .6, x - swing * 3.2 * dir, y + .8 + bob, true);
  const body = vertical(ctx, bodyTop, bodyTop + 11, [[0, tint(color, 26)], [.55, color], [1, tint(color, -32)]]);
  fillRound(ctx, body, x - bodyW / 2, bodyTop, bodyW, 11, 4.2);
  rrect(ctx, x - bodyW / 2, bodyTop, bodyW, 11, 4.2); ctx.strokeStyle = ink; ctx.lineWidth = .7; ctx.stroke();
  if (!side && facing !== 'up') {
    stroke(ctx, tint(color, -40), .7, () => { ctx.moveTo(x, bodyTop + 3); ctx.lineTo(x, bodyTop + 10); });
    fillRound(ctx, tint(color, 40), x - 3.4, bodyTop - .2, 6.8, 2.2, 1.1);
  }
  if (side) arm(x + dir * .6, x + swing * 3.2 * dir, y + .8 + bob, false);
  else {
    arm(x - bodyW / 2 + .4, x - bodyW / 2 - .6, y + .6 + bob + swing * 1.4, false);
    arm(x + bodyW / 2 - .4, x + bodyW / 2 + .6, y + .6 + bob - swing * 1.4, false);
  }

  const hy = y - 14.6 + bob, r = 6.7;
  circle(ctx, skin, x, hy, r);
  ctx.beginPath(); ctx.arc(x, hy, r, 0, TAU); ctx.strokeStyle = ink; ctx.lineWidth = .7; ctx.stroke();
  if (facing === 'up') {
    ctx.beginPath(); ctx.arc(x, hy - .4, r - .1, 0, TAU); ctx.fillStyle = hair; ctx.fill();
    ellipseFill(ctx, 'rgba(255,255,255,.08)', x - 2, hy - 3.6, 2.6, 1.4);
  } else {
    ctx.beginPath();
    if (side) {
      ctx.arc(x, hy, r, Math.PI * .95, Math.PI * 2.05);
      ctx.quadraticCurveTo(x - dir * 2, hy - 1, x - dir * (r - .2), hy + 3);
    } else {
      ctx.arc(x, hy, r, Math.PI, 0);
      ctx.quadraticCurveTo(x + 3, hy - 2.6, x, hy - 2.2);
      ctx.quadraticCurveTo(x - 3.4, hy - 2.8, x - r, hy);
    }
    ctx.closePath(); ctx.fillStyle = hair; ctx.fill();
    ellipseFill(ctx, 'rgba(255,255,255,.1)', x - 2.2 * (side ? -dir : 1), hy - 4.4, 2.2, 1);
    const blink = (o.time + seed * 37) % 3900 < 130;
    const eyes = side ? [x + dir * 3.1] : [x - 2.5, x + 2.5];
    for (const ex of eyes) {
      if (blink) stroke(ctx, '#2a2236', .8, () => { ctx.moveTo(ex - .9, hy + 1); ctx.lineTo(ex + .9, hy + 1); });
      else { ellipseFill(ctx, '#2a2236', ex, hy + .9, .95, 1.35); circle(ctx, 'rgba(255,255,255,.85)', ex + .3, hy + .4, .35); }
    }
    if (!side) {
      ellipseFill(ctx, 'rgba(240,120,140,.28)', x - 4, hy + 2.8, 1.4, .8);
      ellipseFill(ctx, 'rgba(240,120,140,.28)', x + 4, hy + 2.8, 1.4, .8);
    }
  }
  if (o.player) {
    const cap = '#c9f080', capDark = '#8fb653';
    ctx.beginPath(); ctx.arc(x, hy - .8, r + .3, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath();
    ctx.fillStyle = vertical(ctx, hy - r, hy, [[0, '#e6ffb0'], [1, cap]]); ctx.fill();
    if (facing === 'down') ellipseFill(ctx, capDark, x, hy - 1.2, 6.6, 1.6);
    else if (side) ellipseFill(ctx, capDark, x + dir * 5.4, hy - 1.4, 4.2, 1.3);
    else fillRound(ctx, capDark, x - 2.5, hy - 1.8, 5, 1.6, .8);
    circle(ctx, '#fff6c2', x, hy - r + .4, .9);
  }
  if (o.badge) {
    const fy = hy - r - 7 + Math.sin(o.time / 420 + seed) * 1.3;
    const glow = ctx.createRadialGradient(x, fy, 0, x, fy, 7);
    glow.addColorStop(0, rgba(o.badge, .55)); glow.addColorStop(1, rgba(o.badge, 0));
    ctx.fillStyle = glow; ctx.fillRect(x - 7, fy - 7, 14, 14);
    circle(ctx, '#251e38', x, fy, 3.6);
    circle(ctx, o.badge, x, fy, 2.8);
    circle(ctx, '#251e38', x, fy, 1);
    circle(ctx, 'rgba(255,255,255,.7)', x - 1, fy - 1.2, .55);
  }
}

// ---------------------------------------------------------------- creatures -

const pixelCache = new Map();
const smoothCache = new Map();

function scale2x(source) {
  const w = source.width, h = source.height;
  const s = new Uint32Array(source.data.buffer.slice(0));
  const out = new ImageData(w * 2, h * 2), d = new Uint32Array(out.data.buffer);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = s[y * w + x];
      const a = y > 0 ? s[(y - 1) * w + x] : p, b = x < w - 1 ? s[y * w + x + 1] : p;
      const c = x > 0 ? s[y * w + x - 1] : p, dd = y < h - 1 ? s[(y + 1) * w + x] : p;
      const o = y * 2 * w * 2 + x * 2;
      d[o] = c === a && c !== dd && a !== b ? a : p;
      d[o + 1] = a === b && a !== c && b !== dd ? b : p;
      d[o + w * 2] = dd === c && dd !== b && c !== a ? c : p;
      d[o + w * 2 + 1] = b === dd && b !== a && dd !== c ? dd : p;
    }
  }
  return out;
}

// Rounds the upscaled sprite: blurs colour and coverage, then re-sharpens the edge.
function soften(image, radius) {
  const { width: w, height: h } = image;
  const src = image.data, n = w * h;
  let a = new Float32Array(n * 4), b = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const alpha = src[i * 4 + 3] / 255;
    a[i * 4] = src[i * 4] * alpha; a[i * 4 + 1] = src[i * 4 + 1] * alpha; a[i * 4 + 2] = src[i * 4 + 2] * alpha; a[i * 4 + 3] = alpha;
  }
  const pass = (from, to, horizontal) => {
    const span = radius * 2 + 1;
    for (let line = 0; line < (horizontal ? h : w); line++) {
      const length = horizontal ? w : h;
      const sum = [0, 0, 0, 0];
      const at = k => (horizontal ? line * w + clamp(k, 0, w - 1) : clamp(k, 0, h - 1) * w + line) * 4;
      for (let k = -radius; k <= radius; k++) { const o = at(k); for (let c = 0; c < 4; c++) sum[c] += from[o + c]; }
      for (let k = 0; k < length; k++) {
        const o = at(k);
        for (let c = 0; c < 4; c++) to[o + c] = sum[c] / span;
        const add = at(k + radius + 1), remove = at(k - radius);
        for (let c = 0; c < 4; c++) sum[c] += from[add + c] - from[remove + c];
      }
    }
  };
  for (let i = 0; i < 2; i++) { pass(a, b, true); pass(b, a, false); }
  const out = new ImageData(w, h), d = out.data;
  for (let i = 0; i < n; i++) {
    const alpha = a[i * 4 + 3];
    const edge = clamp((alpha - .4) / .2, 0, 1);
    if (src[i * 4 + 3] > 0) {
      d[i * 4] = src[i * 4]; d[i * 4 + 1] = src[i * 4 + 1]; d[i * 4 + 2] = src[i * 4 + 2];
    } else if (alpha > 0.001) {
      d[i * 4] = a[i * 4] / alpha; d[i * 4 + 1] = a[i * 4 + 1] / alpha; d[i * 4 + 2] = a[i * 4 + 2] / alpha;
    }
    d[i * 4 + 3] = Math.round(edge * edge * (3 - 2 * edge) * 255);
  }
  return out;
}

function creatureKey(species) { return `${species.art}|${species.color}`; }

function smoothCreature(species) {
  const key = creatureKey(species);
  if (smoothCache.has(key)) return smoothCache.get(key);
  const art = ({ lynx: 'cub', cat: 'cub' })[species.art] || species.art;
  const rows = CREATURES[art] || CREATURES.cub;
  const base = document.createElement('canvas');
  base.width = 22; base.height = rows.length + 2;
  const bctx = base.getContext('2d');
  bctx.translate(11, rows.length + 1);
  sprite(bctx, species, 0, 0, 1);
  let image = bctx.getImageData(0, 0, base.width, base.height);
  for (let i = 0; i < 4; i++) image = scale2x(image);
  image = soften(image, 4);
  const canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  canvas.getContext('2d').putImageData(image, 0, 0);
  const white = document.createElement('canvas');
  white.width = canvas.width; white.height = canvas.height;
  const wctx = white.getContext('2d');
  wctx.drawImage(canvas, 0, 0); wctx.globalCompositeOperation = 'source-in';
  wctx.fillStyle = '#ffffff'; wctx.fillRect(0, 0, white.width, white.height);
  const result = { canvas, white, rows: rows.length + 2, factor: 16 };
  smoothCache.set(key, result);
  return result;
}

// Draws a creature with its feet at (cx, bottom). `unit` is the size of one source pixel.
export function drawCreature(ctx, species, cx, bottom, unit, options = {}) {
  if (!species) return;
  const art = smoothCreature(species);
  const w = 22 * unit, h = art.rows * unit;
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.translate(cx, bottom + unit);
  if (options.flip) ctx.scale(-1, 1);
  if (options.squash) ctx.scale(1 + (1 - options.squash) * .5, options.squash);
  ctx.globalAlpha *= options.alpha ?? 1;
  ctx.drawImage(art.canvas, -w / 2, -h, w, h);
  if (options.flash > 0) { ctx.globalAlpha *= clamp(options.flash, 0, 1); ctx.drawImage(art.white, -w / 2, -h, w, h); }
  ctx.restore();
}

export function renderPortrait(canvas, species) {
  const size = 96;
  if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  if (species) drawCreature(ctx, species, size / 2, size - 8, 4.1);
}

// -------------------------------------------------------------- item icons -

export function itemIcon(ctx, name, x, y, size = 16) {
  const k = size / 16;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const ink = '#221c36';
  if (name === 'cassette') {
    fillRound(ctx, ink, -8.6, -5.8, 17.2, 11.6, 2.4);
    fillRound(ctx, vertical(ctx, -5, 5, [[0, '#ffc9c2'], [1, '#ef98a4']]), -7.6, -4.8, 15.2, 9.6, 1.8);
    fillRound(ctx, '#9a6bb0', -6, -3.2, 12, 4.4, 1.2);
    fillRound(ctx, '#2f2742', -3.8, -2.2, 7.6, 2.4, 1.2);
    circle(ctx, '#fff1c9', -2.6, -1, 1.2); circle(ctx, '#fff1c9', 2.6, -1, 1.2);
    fillRound(ctx, 'rgba(255,255,255,.35)', -6.6, -4.3, 6, 1, .5);
  } else if (name === 'bottle') {
    fillRound(ctx, ink, -4.6, -8.2, 9.2, 16.4, 3);
    fillRound(ctx, '#e8f2e6', -2.2, -8, 4.4, 3, 1);
    fillRound(ctx, vertical(ctx, -4, 7, [[0, '#98f0de'], [1, '#3fbaa7']]), -3.6, -4.4, 7.2, 11.4, 2.6);
    fillRound(ctx, 'rgba(255,255,255,.55)', -2.4, -3, 1.4, 6, .7);
  } else if (name === 'capsule') {
    ctx.rotate(-.65);
    fillRound(ctx, ink, -8, -4, 16, 8, 4);
    fillRound(ctx, '#ffd3a6', -7, -3, 7.4, 6, 3);
    fillRound(ctx, '#fff4e4', -.4, -3, 7.4, 6, 3);
    fillRound(ctx, 'rgba(255,255,255,.6)', -5.6, -2.2, 4, 1.2, .6);
  } else if (name === 'spark') {
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 9);
    glow.addColorStop(0, 'rgba(255,214,150,.6)'); glow.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = glow; ctx.fillRect(-9, -9, 18, 18);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4 - Math.PI / 2, radius = i % 2 ? 2.6 : 7.6;
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath(); ctx.fillStyle = vertical(ctx, -8, 8, [[0, '#fff0c4'], [1, '#ffab73']]); ctx.fill();
    ctx.strokeStyle = 'rgba(80,40,30,.35)'; ctx.lineWidth = .8; ctx.stroke();
  } else if (name === 'battery') {
    fillRound(ctx, ink, -5.4, -7.6, 10.8, 15.6, 2.6);
    fillRound(ctx, '#3a3352', -4.4, -6.6, 8.8, 13.6, 2);
    fillRound(ctx, '#e6e0f0', -2, -9, 4, 2, .8);
    for (let i = 0; i < 3; i++) fillRound(ctx, '#c9f080', -3.2, 2.4 - i * 3.6, 6.4, 2.6, 1);
  } else if (name === 'speaker') {
    fillRound(ctx, ink, -6.4, -8, 12.8, 16, 2.6);
    fillRound(ctx, vertical(ctx, -7, 7, [[0, '#4a4166'], [1, '#2b2540']]), -5.4, -7, 10.8, 14, 2);
    circle(ctx, '#171324', 0, 2, 3.8); circle(ctx, '#7b6aa3', 0, 2, 2.6); circle(ctx, '#d6c6ff', 0, 2, 1);
    circle(ctx, '#171324', 0, -4, 1.8); circle(ctx, '#bba9e6', 0, -4, .9);
  } else if (name === 'filter') {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) ctx.lineTo(Math.cos(i * TAU / 6 + Math.PI / 6) * 7.6, Math.sin(i * TAU / 6 + Math.PI / 6) * 7.6);
    ctx.closePath(); ctx.fillStyle = ink; ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < 6; i++) ctx.lineTo(Math.cos(i * TAU / 6 + Math.PI / 6) * 6.2, Math.sin(i * TAU / 6 + Math.PI / 6) * 6.2);
    ctx.closePath(); ctx.fillStyle = vertical(ctx, -6, 6, [[0, '#c6b0f0'], [1, '#7c64ad']]); ctx.fill();
    stroke(ctx, 'rgba(40,26,70,.5)', .7, () => { for (let i = -3; i <= 3; i += 2) { ctx.moveTo(i, -5); ctx.lineTo(i, 5); ctx.moveTo(-5, i); ctx.lineTo(5, i); } });
  } else {
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(7, -1); ctx.lineTo(0, 8); ctx.lineTo(-7, -1); ctx.closePath();
    ctx.fillStyle = vertical(ctx, -8, 8, [[0, '#d9c6ff'], [1, '#8a6fc4']]); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.restore();
}

export function paintItem(canvas, name) {
  const size = 72;
  if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  itemIcon(ctx, name, size / 2, size / 2, 54);
}

// ---------------------------------------------------------------- buildings -

const FACADES = {
  basement: { width: 154, offset: -7, height: 95, roof: '#9c72ce', glow: '#e8c4fc', name: 'BASEMENT RHYTHMS', number: '01' },
  clinic: { width: 127, offset: -10, height: 91, roof: '#4f9f9a', glow: '#a8f1d7', name: 'REVERB CLINIC', number: '+' },
  echo: { width: 155, offset: 0, height: 96, roof: '#c875a5', glow: '#ffd0db', name: 'ECHO HOUSE', number: '03' },
  tape: { width: 129, offset: -12, height: 47, roof: '#b38c74', glow: '#f9cb8d', name: 'TAPE DECK PIER', number: '02' },
  onys: { width: 114, offset: 0, height: 32, roof: '#9462ad', glow: '#efd0fd', name: 'WANDER ONYS', number: '' },
};

function facadeBox(art) {
  const p = FACADES[art];
  const left = -p.width / 2 + p.offset, top = -p.height + 12;
  return { ...p, left, top, right: left + p.width, bottom: 12, pad: 16 };
}

function neonText(ctx, text, x, y, maxWidth, size, glow) {
  ctx.save();
  ctx.font = `800 ${size}px "Segoe UI", system-ui, sans-serif`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(size * .12).toFixed(2)}px`;
  const width = ctx.measureText(text).width;
  if (width > maxWidth) { size *= maxWidth / width; ctx.font = `800 ${size}px "Segoe UI", system-ui, sans-serif`; }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = glow; ctx.shadowBlur = size * .9;
  ctx.fillStyle = glow; ctx.fillText(text, x, y);
  ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.fillText(text, x, y);
  ctx.restore();
}

function glowWindow(ctx, x, y, w, h, glow, roof) {
  fillRound(ctx, '#1e1a2f', x - 1, y - 1, w + 2, h + 2, 3);
  const pane = ctx.createLinearGradient(x, y, x, y + h);
  pane.addColorStop(0, tint(glow, -30)); pane.addColorStop(.6, tint(glow, -70)); pane.addColorStop(1, tint(glow, -95));
  fillRound(ctx, pane, x, y, w, h, 2.4);
  ctx.save(); rrect(ctx, x, y, w, h, 2.4); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,.13)';
  ctx.beginPath(); ctx.moveTo(x + w * .15, y + h); ctx.lineTo(x + w * .45, y); ctx.lineTo(x + w * .62, y); ctx.lineTo(x + w * .32, y + h); ctx.fill();
  ctx.restore();
  ctx.fillStyle = tint(roof, -60); ctx.fillRect(x + w / 2 - .8, y, 1.6, h); ctx.fillRect(x, y + h * .45, w, 1.2);
  fillRound(ctx, tint(roof, 12), x - 2, y + h, w + 4, 2.2, 1);
  const spill = ctx.createLinearGradient(0, y + h, 0, y + h + 10);
  spill.addColorStop(0, rgba(glow, .2)); spill.addColorStop(1, rgba(glow, 0));
  ctx.fillStyle = spill; ctx.fillRect(x - 2, y + h + 2, w + 4, 10);
}

function facadeSmooth(ctx, art, color) {
  const b = facadeBox(art);
  const { width: w, height: h, left, top, bottom, glow, name, number } = b;
  const roof = color || b.roof, tall = h > 70, roofH = tall ? 34 : 14;
  const centre = left + w / 2;
  ellipseFill(ctx, 'rgba(8,6,18,.45)', centre, bottom - 1, w / 2 + 8, 6);
  const wallTop = top + roofH - 4;
  fillRound(ctx, vertical(ctx, wallTop, bottom, [[0, tint(roof, -52)], [1, tint(roof, -80)]]), left, wallTop, w, bottom - wallTop, 4);
  ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = .6;
  for (let yy = wallTop + 8; yy < bottom - 3; yy += 6) { ctx.beginPath(); ctx.moveTo(left + 3, yy); ctx.lineTo(left + w - 3, yy); ctx.stroke(); }
  fillRound(ctx, 'rgba(10,6,20,.4)', left - 5, top + 5, w + 10, roofH, 7);
  fillRound(ctx, vertical(ctx, top, top + roofH, [[0, tint(roof, 30)], [.5, roof], [1, tint(roof, -22)]]), left - 4, top, w + 8, roofH - 2, 7);
  ctx.save(); rrect(ctx, left - 4, top, w + 8, roofH - 2, 7); ctx.clip();
  ctx.strokeStyle = 'rgba(30,10,40,.16)'; ctx.lineWidth = .8;
  for (let row = top + 5; row < top + roofH - 3; row += 5.5) { ctx.beginPath(); ctx.moveTo(left - 4, row); ctx.lineTo(left + w + 4, row); ctx.stroke(); }
  ctx.restore();
  stroke(ctx, 'rgba(255,255,255,.32)', 1, () => { ctx.moveTo(left + 3, top + 1); ctx.lineTo(left + w - 3, top + 1); });
  const signY = tall ? wallTop + 7 : wallTop + 3, signH = tall ? 19 : 13;
  fillRound(ctx, '#1b1729', left + 8, signY, w - 16, signH, 4);
  rrect(ctx, left + 8, signY, w - 16, signH, 4); ctx.strokeStyle = rgba(glow, .35); ctx.lineWidth = .8; ctx.stroke();
  neonText(ctx, name, centre, signY + signH / 2 + .4, w - 30, tall ? 10.5 : 7, glow);
  if (!tall) {
    for (const px of [left + 4, left + w - 7]) fillRound(ctx, tint(roof, -40), px, wallTop, 3, bottom - wallTop, 1.4);
    for (let k = 0; k < 6; k++) circle(ctx, rgba(glow, .85), left + 14 + k * (w - 28) / 5, bottom - 4, 1.1);
    return;
  }
  glowWindow(ctx, left + 12, wallTop + 31, 27, 19, glow, roof);
  glowWindow(ctx, left + w - 38, wallTop + 31, 26, 19, glow, roof);
  const doorX = b.offset - 11 + 0;
  const doorTop = bottom - 28;
  fillRound(ctx, '#1d1a2d', doorX - 1.5, doorTop - 1.5, 25, 30, 5);
  fillRound(ctx, vertical(ctx, doorTop, bottom, [[0, tint(roof, -24)], [1, tint(roof, -46)]]), doorX, doorTop, 22, 28, 4);
  fillRound(ctx, glow, doorX + 3, doorTop + 2.5, 16, 3, 1.5);
  fillRound(ctx, rgba(glow, .35), doorX + 3, doorTop + 7, 16, 9, 2);
  ctx.fillStyle = 'rgba(20,14,30,.6)'; ctx.fillRect(doorX + 10.4, doorTop + 2.5, 1.2, 25.5);
  circle(ctx, '#f6e2b0', doorX + 14.5, doorTop + 17, .9);
  fillRound(ctx, '#8d7690', doorX - 4, bottom - 1, 30, 3, 1.4);
  fillRound(ctx, tint(roof, -40), left + 12, top - 7, 20, 13, 2.5);
  fillRound(ctx, '#332b46', left + 14, top - 5, 16, 8, 1.6);
  for (let n = 0; n < 3; n++) fillRound(ctx, tint(roof, -4), left + 16, top - 3.6 + n * 2.2, 12, .9, .45);
  if (number) {
    fillRound(ctx, '#2c243f', left + w - 28, top + 7, 19, 13, 3);
    neonText(ctx, number, left + w - 18.5, top + 13.8, 15, 8, glow);
  }
}

// ----------------------------------------------------------- decor & props --

function lampSmooth(ctx, x, y, time, seed) {
  const flicker = .92 + Math.sin(time / 90 + seed) * .03 + (hash(seed, Math.floor(time / 120)) % 23 === 0 ? -.25 : 0);
  const pool = ctx.createRadialGradient(x, y + 5, 0, x, y + 5, 16);
  pool.addColorStop(0, `rgba(255,214,150,${.22 * flicker})`); pool.addColorStop(1, 'rgba(255,214,150,0)');
  ctx.fillStyle = pool; ctx.beginPath(); ctx.ellipse(x, y + 5, 16, 7, 0, 0, TAU); ctx.fill();
  ellipseFill(ctx, 'rgba(10,8,22,.45)', x, y + 6, 4, 1.6);
  fillRound(ctx, '#2a2742', x - 2.6, y + 2, 5.2, 4.5, 1.6);
  fillRound(ctx, vertical(ctx, y - 28, y + 4, [[0, '#8a7a9c'], [1, '#3a3452']]), x - 1.2, y - 27, 2.4, 31, 1.2);
  fillRound(ctx, '#3a3452', x - 7, y - 31, 14, 3.2, 1.6);
  fillRound(ctx, '#d4a37f', x - 6, y - 28.4, 12, 3.4, 1.4);
  const bulb = ctx.createRadialGradient(x, y - 26, 0, x, y - 26, 13);
  bulb.addColorStop(0, `rgba(255,236,180,${.75 * flicker})`); bulb.addColorStop(.35, `rgba(255,210,150,${.25 * flicker})`); bulb.addColorStop(1, 'rgba(255,200,140,0)');
  ctx.fillStyle = bulb; ctx.fillRect(x - 13, y - 39, 26, 26);
  fillRound(ctx, `rgba(255,246,200,${flicker})`, x - 4.6, y - 26.6, 9.2, 2.2, 1.1);
}

function planterSmooth(ctx, x, y, seed) {
  ellipseFill(ctx, 'rgba(10,8,22,.4)', x, y + 5.5, 12, 2.6);
  fillRound(ctx, vertical(ctx, y - 3, y + 5, [[0, '#8b7a92'], [1, '#56485f']]), x - 11, y - 3, 22, 8.5, 2.4);
  fillRound(ctx, '#c79ca6', x - 11.6, y - 4.4, 23.2, 2.4, 1.2);
  for (let n = 0; n < 6; n++) circle(ctx, n % 2 ? '#5f9c74' : '#79b689', x - 8.5 + n * 3.4, y - 6.2 + (n % 2), 2.8);
  for (let n = 0; n < 5; n++) {
    const fx = x - 8 + n * 4, fy = y - 8.6 + (hash(seed, n) % 3) * .6, petal = n % 2 ? '#f2a8c8' : '#f6dca0';
    for (let p = 0; p < 5; p++) circle(ctx, petal, fx + Math.cos(p * TAU / 5) * 1.1, fy + Math.sin(p * TAU / 5) * 1.1, .85);
    circle(ctx, '#fff4d0', fx, fy, .6);
  }
}

function benchSmooth(ctx, x, y) {
  ellipseFill(ctx, 'rgba(10,8,22,.42)', x, y + 5, 12, 2.4);
  for (const lx of [x - 8.5, x + 6.5]) fillRound(ctx, '#3e3150', lx, y - 1, 2, 6, .8);
  fillRound(ctx, vertical(ctx, y - 9, y - 4, [[0, '#d9a98a'], [1, '#a37466']]), x - 11, y - 9, 22, 3, 1.4);
  fillRound(ctx, vertical(ctx, y - 5, y - 2, [[0, '#d0a080'], [1, '#9b6c60']]), x - 11, y - 5, 22, 2.6, 1.2);
  fillRound(ctx, vertical(ctx, y - 2, y + 1, [[0, '#c69478'], [1, '#8b5f58']]), x - 11.5, y - 1.6, 23, 3.4, 1.4);
}

function muralSmooth(ctx, x, y) {
  fillRound(ctx, vertical(ctx, y - 12, y, [[0, '#3c3654'], [1, '#2a2540']]), x - 3, y - 12, 22, 12, 2);
  ctx.save();
  ctx.font = '900 8px "Segoe UI", system-ui, sans-serif'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 2.2; ctx.strokeStyle = '#1a1528';
  ctx.strokeText('FLO', x + .5, y - 6);
  ctx.shadowColor = '#f598bd'; ctx.shadowBlur = 4; ctx.fillStyle = '#f7a4c6'; ctx.fillText('FLO', x + .5, y - 6);
  ctx.restore();
  for (const [dx, len] of [[3, 3], [9, 4.5], [13, 2.5]]) fillRound(ctx, '#f598bd', x + dx, y - 3.5, .8, len, .4);
}

function speakerSmooth(ctx, x, y, time) {
  const kick = Math.exp(-(time % BEAT) / 110);
  ellipseFill(ctx, 'rgba(10,8,22,.45)', x, y + 5.5, 11, 2.6);
  fillRound(ctx, vertical(ctx, y - 17, y + 5, [[0, '#4c4366'], [1, '#272238']]), x - 9.5, y - 17, 19, 22, 3);
  rrect(ctx, x - 9.5, y - 17, 19, 22, 3); ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = .7; ctx.stroke();
  const woofer = 6 + kick * .9;
  circle(ctx, '#15111f', x, y - 1.5, woofer + .8);
  const cone = ctx.createRadialGradient(x - 1.5, y - 3, .5, x, y - 1.5, woofer);
  cone.addColorStop(0, '#8b7ab5'); cone.addColorStop(1, '#2f2746');
  circle(ctx, cone, x, y - 1.5, woofer);
  circle(ctx, '#d8c8ff', x, y - 1.5, 1.4 + kick * .4);
  circle(ctx, '#15111f', x, y - 12, 2.6); circle(ctx, '#a99bd0', x, y - 12, 1.4);
  circle(ctx, kick > .5 ? '#d8fa93' : '#6f8a4a', x + 6.6, y - 14.6, .8);
  if (kick > .05) {
    ctx.strokeStyle = `rgba(216,200,255,${kick * .35})`; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.arc(x, y - 1.5, woofer + 2 + (1 - kick) * 4, 0, TAU); ctx.stroke();
  }
}

function portalSmooth(ctx, x, y, time) {
  const pulse = .5 + Math.sin(time / 380) * .5;
  const glow = ctx.createRadialGradient(x, y + 3, 0, x, y + 3, 13);
  glow.addColorStop(0, `rgba(214,190,255,${.32 + pulse * .2})`); glow.addColorStop(1, 'rgba(214,190,255,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(x, y + 3, 13, 7, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = `rgba(228,206,255,${.55 + pulse * .35})`; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(x, y + 3, 8 + pulse, 3.6 + pulse * .4, 0, 0, TAU); ctx.stroke();
  for (let k = 0; k < 4; k++) {
    const t = ((time / 1400) + k / 4) % 1;
    circle(ctx, `rgba(236,220,255,${(1 - t) * .8})`, x - 5 + k * 3.4, y + 3 - t * 16, .9 - t * .4);
  }
}

function pickupSmooth(ctx, x, y, name, time, seed) {
  const bob = Math.sin(time / 380 + seed) * 1.6;
  ellipseFill(ctx, `rgba(10,8,22,${.32 - bob * .03})`, x, y + 6, 6 - bob * .3, 2);
  const glow = ctx.createRadialGradient(x, y - 3 + bob, 0, x, y - 3 + bob, 12);
  glow.addColorStop(0, 'rgba(255,232,170,.42)'); glow.addColorStop(1, 'rgba(255,232,170,0)');
  ctx.fillStyle = glow; ctx.fillRect(x - 12, y - 15 + bob, 24, 24);
  itemIcon(ctx, name || 'cassette', x, y - 3 + bob, 13);
  for (let k = 0; k < 2; k++) {
    const twinkle = Math.max(0, Math.sin(time / 300 + seed + k * 2.1));
    const sx = x + (k ? 8 : -9), sy = y - 9 + (k ? 4 : 0) + bob * .5, r = 2.2 * twinkle;
    if (r < .2) continue;
    ctx.fillStyle = `rgba(255,244,210,${twinkle})`;
    ctx.beginPath(); ctx.moveTo(sx, sy - r); ctx.lineTo(sx + r * .3, sy - r * .3); ctx.lineTo(sx + r, sy); ctx.lineTo(sx + r * .3, sy + r * .3);
    ctx.lineTo(sx, sy + r); ctx.lineTo(sx - r * .3, sy + r * .3); ctx.lineTo(sx - r, sy); ctx.lineTo(sx - r * .3, sy - r * .3); ctx.fill();
  }
}

function crateSmooth(ctx, x, y) {
  ellipseFill(ctx, 'rgba(10,8,22,.4)', x, y + 5, 12, 2.4);
  fillRound(ctx, vertical(ctx, y - 12, y + 5, [[0, '#4a4366'], [1, '#2b2640']]), x - 12, y - 12, 24, 17, 3);
  for (const px of [x - 9, x + 2]) { fillRound(ctx, '#5b4e7a', px, y - 7, 7, 8, 1.6); fillRound(ctx, '#b398c4', px + 2, y - 5, 3, 4, 1); }
}

// ------------------------------------------------------------ transitions ---

export function drawTransition(ctx, width, height, fx, now) {
  const t = now - fx.start;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (fx.kind === 'battle' && !fx.reduced) {
    if (t < 330) {
      const flash = Math.abs(Math.sin(t / 330 * TAU)) * .8;
      ctx.fillStyle = `rgba(250,246,255,${flash})`; ctx.fillRect(0, 0, width, height);
    }
    const bars = 9, barH = Math.ceil(height / bars);
    for (let i = 0; i < bars; i++) {
      const delay = i * 22;
      const close = easeInOut((t - 300 - delay) / 300), open = easeInOut((t - 700 - delay) / 380);
      const cover = t < 700 ? close : 1 - open;
      if (cover <= 0) continue;
      const w = width * cover, x = i % 2 ? width - w : 0;
      ctx.fillStyle = '#0d0b17'; ctx.fillRect(x, i * barH, w, barH + 1);
      ctx.fillStyle = 'rgba(216,250,147,.85)'; ctx.fillRect(i % 2 ? x : x + w - 3, i * barH, 3, barH + 1);
    }
    return;
  }
  const alpha = t < fx.mid ? t / fx.mid : 1 - (t - fx.mid) / Math.max(1, fx.dur - fx.mid);
  ctx.fillStyle = `rgba(11,9,21,${clamp(alpha, 0, 1)})`;
  ctx.fillRect(0, 0, width, height);
}

// ----------------------------------------------------------- field renderer -

export class FieldRenderer {
  constructor() {
    this.chunks = new Map();
    this.buildings = new Map();
    this.rustles = new Map();
    this.key = '';
  }

  rustle(mapId, x, y, time) { this.rustles.set(`${mapId}:${x},${y}`, time); }

  reset(world, mapId, T) {
    this.world = world; this.mapId = mapId; this.T = T;
    this.chunks.clear();
    const map = world.maps[mapId];
    this.wild = []; this.water = []; this.overTrees = [];
    if (!map) return;
    const animated = (x, y) => ['water', 'wild'].includes(artAt(world, map, x, y));
    map.rows.forEach((row, y) => [...row].forEach((_, x) => {
      const art = artAt(world, map, x, y);
      if (art === 'water') this.water.push([x, y]);
      if (art === 'wild') this.wild.push({ x, y, clumps: this.clumps(x, y, world.tiles[row[x]].color) });
      if ((art === 'tree' || art === 'hedge') && [[-1, -1], [0, -1], [1, -1]].some(([dx, dy]) => animated(x + dx, y + dy))) this.overTrees.push([x, y]);
    }));
  }

  clumps(tx, ty, color) {
    const list = [];
    const rows = [[8.5, 3], [14.5, 3], [21, 3]];
    rows.forEach(([ry, count], row) => {
      for (let i = 0; i < count; i++) {
        const seed = hash(tx, ty, row * 5 + i);
        list.push({
          x: tx * TILE + 3 + i * 8 + (row % 2) * 3 + seed % 3,
          y: ty * TILE + ry + (seed >> 3) % 2,
          h: 7.5 + (seed >> 5) % 3,
          lean: ((seed >> 7) % 5 - 2) * .5,
          seed,
          front: row === 2,
          light: tint(color, 26 + row * 6), dark: tint(color, -2 + row * 4),
        });
      }
    });
    return list;
  }

  chunk(cx, cy) {
    const key = `${cx},${cy}`;
    let entry = this.chunks.get(key);
    if (!entry) {
      const { world, T } = this, map = world.maps[this.mapId];
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = CHUNK * T;
      const ctx = canvas.getContext('2d');
      const s = T / TILE;
      ctx.setTransform(s, 0, 0, s, -cx * CHUNK * T, -cy * CHUNK * T);
      const x0 = cx * CHUNK - 1, x1 = (cx + 1) * CHUNK, y0 = cy * CHUNK - 1, y1 = (cy + 1) * CHUNK + 1;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) groundSmooth(ctx, world, map, x, y);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) treeSmooth(ctx, world, map, x, y);
      entry = { canvas };
      this.chunks.set(key, entry);
    }
    entry.used = performance.now();
    return entry.canvas;
  }

  building(entity, s) {
    const key = `${entity.art}|${entity.color}|${s}`;
    let entry = this.buildings.get(key);
    if (!entry) {
      const b = facadeBox(entity.art);
      const x0 = b.left - b.pad, y0 = b.top - b.pad - 8, x1 = b.right + b.pad, y1 = b.bottom + b.pad;
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil((x1 - x0) * s); canvas.height = Math.ceil((y1 - y0) * s);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
      facadeSmooth(ctx, entity.art, entity.color);
      entry = { canvas, x0, y0 };
      if (this.buildings.size > 24) this.buildings.clear();
      this.buildings.set(key, entry);
    }
    return entry;
  }

  addClump(paths, clump, time) {
    const rustleAt = this.rustles.get(clump.key);
    let sway = Math.sin(time / 760 + clump.seed) * 1.1;
    if (rustleAt !== undefined) {
      const age = time - rustleAt;
      if (age < 700) sway += Math.sin(age / 48) * 2.6 * (1 - age / 700);
    }
    for (let i = 0; i < 3; i++) {
      const color = i === 1 ? clump.light : clump.dark;
      let path = paths.get(color);
      if (!path) { path = new Path2D(); paths.set(color, path); }
      const bx = clump.x + (i - 1) * 1.9, by = clump.y;
      const tipX = bx + clump.lean + sway * (.7 + i * .2) + (i - 1) * 1.7;
      const tipY = by - clump.h * (i === 1 ? 1 : .82);
      path.moveTo(bx - 1.15, by);
      path.quadraticCurveTo(bx - .4 + (tipX - bx) * .3, by - clump.h * .55, tipX, tipY);
      path.quadraticCurveTo(bx + .6 + (tipX - bx) * .3, by - clump.h * .5, bx + 1.15, by);
      path.closePath();
    }
  }

  fillPaths(ctx, paths) {
    for (const [color, path] of paths) { ctx.fillStyle = color; ctx.fill(path); }
  }

  draw(ctx, o) {
    const { world, flags, mapId, width, height, T, time } = o;
    const map = world.maps[mapId];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0e0c19'; ctx.fillRect(0, 0, width, height);
    if (!map) return;
    if (this.world !== world || this.mapId !== mapId || this.T !== T) this.reset(world, mapId, T);
    const s = T / TILE, mw = map.rows[0].length, mh = map.rows.length;
    const viewW = width / T, viewH = height / T;
    const camX = mw <= viewW ? mw / 2 : clamp(o.px + .5, viewW / 2, mw - viewW / 2);
    const camY = mh <= viewH ? mh / 2 : clamp(o.py + .5, viewH / 2, mh - viewH / 2);
    const offX = Math.round(width / 2 - camX * T), offY = Math.round(height / 2 - camY * T);
    const tx0 = Math.max(0, Math.floor(-offX / T) - 1), tx1 = Math.min(mw - 1, Math.ceil((width - offX) / T));
    const ty0 = Math.max(0, Math.floor(-offY / T) - 2), ty1 = Math.min(mh - 1, Math.ceil((height - offY) / T) + 1);

    if (mw < viewW || mh < viewH) {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(offX - 6, offY + 10, mw * T + 12, mh * T + 6);
    }
    const cx0 = Math.floor(tx0 / CHUNK), cx1 = Math.floor(tx1 / CHUNK), cy0 = Math.floor(ty0 / CHUNK), cy1 = Math.floor(ty1 / CHUNK);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      ctx.drawImage(this.chunk(cx, cy), offX + cx * CHUNK * T, offY + cy * CHUNK * T);
    }

    ctx.setTransform(s, 0, 0, s, offX, offY);
    const inView = (x, y) => x >= tx0 && x <= tx1 && y >= ty0 && y <= ty1;
    this.waterLayer(ctx, world, map, inView, time);
    const frontRows = new Map(), back = new Map();
    for (const tile of this.wild) {
      if (!inView(tile.x, tile.y)) continue;
      for (const clump of tile.clumps) {
        clump.key = `${mapId}:${tile.x},${tile.y}`;
        if (clump.front) {
          if (!frontRows.has(tile.y)) frontRows.set(tile.y, new Map());
          this.addClump(frontRows.get(tile.y), clump, time);
        } else this.addClump(back, clump, time);
      }
    }
    this.fillPaths(ctx, back);

    const items = [];
    for (const entity of map.entities) {
      if (entity.kind === 'light' || !visible(entity, flags, mapId)) continue;
      if (entity.x < tx0 - 5 || entity.x > tx1 + 5 || entity.y < ty0 - 1 || entity.y > ty1 + 5) continue;
      items.push({ depth: entity.y + .5, entity });
    }
    if (o.player) items.push({ depth: o.py + .5, player: true });
    for (const [row, paths] of frontRows) items.push({ depth: row + .62, paths });
    for (const [x, y] of this.overTrees) if (inView(x, y)) items.push({ depth: y + .3, tree: [x, y] });
    items.sort((a, b) => a.depth - b.depth);
    for (const item of items) {
      if (item.paths) { this.fillPaths(ctx, item.paths); continue; }
      if (item.player) { this.drawPlayer(ctx, o); continue; }
      if (item.tree) { treeSmooth(ctx, world, map, item.tree[0], item.tree[1], false); continue; }
      this.drawEntity(ctx, item.entity, o, s, offX, offY);
    }

    ctx.globalCompositeOperation = 'screen';
    for (const entity of map.entities) {
      if (entity.kind !== 'light' || !visible(entity, flags, mapId)) continue;
      light(ctx, entity, (entity.x + .5) * TILE, (entity.y + .5) * TILE, time);
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.prefetch(cx0 - 1, cx1 + 1, cy0 - 1, cy1 + 1, mw, mh);
    this.evict(time);
  }

  prefetch(cx0, cx1, cy0, cy1, mw, mh) {
    const maxX = Math.floor((mw - 1) / CHUNK), maxY = Math.floor((mh - 1) / CHUNK);
    for (let cy = Math.max(0, cy0); cy <= Math.min(maxY, cy1); cy++) for (let cx = Math.max(0, cx0); cx <= Math.min(maxX, cx1); cx++) {
      if (!this.chunks.has(`${cx},${cy}`)) { this.chunk(cx, cy); return; }
    }
  }

  evict(time) {
    if (this.chunks.size < 20) return;
    for (const [key, entry] of this.chunks) if (time - entry.used > 4000) this.chunks.delete(key);
  }

  waterLayer(ctx, world, map, inView, time) {
    const LEVELS = 5;
    const waves = Array.from({ length: LEVELS }, () => new Path2D());
    const foams = Array.from({ length: LEVELS }, () => new Path2D());
    const sparkles = [];
    const land = (tx, ty) => { const other = artAt(world, map, tx, ty); return other && other !== 'water'; };
    for (const [tx, ty] of this.water) {
      if (!inView(tx, ty)) continue;
      const x = tx * TILE, y = ty * TILE;
      for (let k = 0; k < 2; k++) {
        const seed = hash(tx, ty, k + 20);
        const travel = (time * .005 + seed) % 12;
        const level = Math.floor(Math.sin(travel / 12 * Math.PI) * LEVELS);
        if (level < 1) continue;
        const wx = x + travel, wy = y + 6 + k * 10 + Math.sin(time / 900 + tx * .8 + k) * 1.2;
        const path = waves[Math.min(LEVELS - 1, level)];
        path.moveTo(wx, wy);
        path.quadraticCurveTo(wx + 3, wy - 1.4, wx + 6, wy);
        path.quadraticCurveTo(wx + 9, wy + 1.4, wx + 12, wy);
      }
      const seed = hash(tx, ty, 31);
      if (seed % 4 === 0) {
        const twinkle = Math.pow(Math.max(0, Math.sin(time / 520 + seed)), 8);
        if (twinkle > .05) sparkles.push([x + seed % 20 + 2, y + (seed >> 4) % 20 + 2, twinkle]);
      }
      const foam = foams[Math.floor((.5 + Math.sin(time / 620 + tx + ty) * .5) * (LEVELS - .01))];
      const wobble = Math.sin(time / 700 + tx * 1.7 + ty) * .7;
      if (land(tx, ty - 1)) { const yy = y + 1.8 + wobble; foam.moveTo(x, yy); foam.quadraticCurveTo(x + 6, yy + 1, x + 12, yy); foam.quadraticCurveTo(x + 18, yy - 1, x + 24, yy); }
      if (land(tx, ty + 1)) { const yy = y + 22.2 - wobble; foam.moveTo(x, yy); foam.quadraticCurveTo(x + 6, yy - 1, x + 12, yy); foam.quadraticCurveTo(x + 18, yy + 1, x + 24, yy); }
      if (land(tx - 1, ty)) { const xx = x + 1.8 + wobble; foam.moveTo(xx, y); foam.quadraticCurveTo(xx + 1, y + 6, xx, y + 12); foam.quadraticCurveTo(xx - 1, y + 18, xx, y + 24); }
      if (land(tx + 1, ty)) { const xx = x + 22.2 - wobble; foam.moveTo(xx, y); foam.quadraticCurveTo(xx - 1, y + 6, xx, y + 12); foam.quadraticCurveTo(xx + 1, y + 18, xx, y + 24); }
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = .9;
    waves.forEach((path, level) => { if (level) { ctx.strokeStyle = `rgba(196,232,255,${(level / LEVELS * .24).toFixed(3)})`; ctx.stroke(path); } });
    ctx.lineWidth = 1.1;
    foams.forEach((path, level) => { ctx.strokeStyle = `rgba(226,244,255,${(.14 + level / LEVELS * .26).toFixed(3)})`; ctx.stroke(path); });
    for (const [sx, sy, twinkle] of sparkles) circle(ctx, `rgba(240,250,255,${twinkle * .85})`, sx, sy, .5 + twinkle * .7);
  }

  drawPlayer(ctx, o) {
    let x = (o.px + .5) * TILE, y = (o.py + .5) * TILE;
    if (o.bump) {
      const age = o.time - o.bump.at;
      if (age >= 0 && age < 170) {
        const push = Math.sin(age / 170 * Math.PI) * 1.8, [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[o.bump.dir] || [0, 0];
        x += dx * push; y += dy * push;
      }
    }
    personSmooth(ctx, x, y, { color: '#c5ed83', facing: o.facing, phase: o.phase, moving: o.moving, time: o.time, player: true, seed: 3, skin: '#f0c7a6' });
  }

  drawEntity(ctx, e, o, s, offX, offY) {
    const time = o.time, x = (e.x + .5) * TILE, y = (e.y + .5) * TILE;
    const seed = seedOf(e.id);
    if (e.kind === 'item') return pickupSmooth(ctx, x, y, e.art, time, seed % 100);
    if (e.kind === 'exit') return portalSmooth(ctx, x, y, time);
    if (e.kind === 'wild') {
      const species = o.world.species[e.squad?.[0]?.species];
      const bob = Math.sin(time / 420 + seed) * 1.2;
      ellipseFill(ctx, 'rgba(10,8,22,.36)', x, y + 7, 7.5 - bob * .4, 2.4);
      const flip = Math.floor((time + seed) / 2600) % 2 === 0;
      return drawCreature(ctx, species, x, y + 6 + Math.min(0, bob), 1.05, { flip, squash: 1 + Math.sin(time / 420 + seed) * .02 });
    }
    if (e.kind === 'decor') {
      if (BUILDINGS.has(e.art)) {
        const sprite = this.building(e, s);
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(sprite.canvas, Math.round(offX + (x + sprite.x0) * s), Math.round(offY + (y + sprite.y0) * s));
        ctx.restore();
        const b = facadeBox(e.art), flicker = .07 + Math.max(0, Math.sin(time / 1300 + seed)) * .07;
        const signY = y + b.top + (b.height > 70 ? 30 + 7 : 10 + 3);
        ctx.globalCompositeOperation = 'screen';
        const glow = ctx.createRadialGradient(x + b.offset, signY + 8, 2, x + b.offset, signY + 8, b.width * .55);
        glow.addColorStop(0, rgba(b.glow, flicker)); glow.addColorStop(1, rgba(b.glow, 0));
        ctx.fillStyle = glow; ctx.fillRect(x + b.left - 10, signY - 30, b.width + 20, 70);
        ctx.globalCompositeOperation = 'source-over';
        return;
      }
      if (e.art === 'lamp') return lampSmooth(ctx, x, y, time, seed % 97);
      if (e.art === 'planter') return planterSmooth(ctx, x, y, seed % 89);
      if (e.art === 'bench') return benchSmooth(ctx, x, y);
      if (e.art === 'mural') return muralSmooth(ctx, x, y);
      if (e.art === 'speaker') return speakerSmooth(ctx, x, y, time);
      return crateSmooth(ctx, x, y);
    }
    let facing = 'down';
    if (o.talkingTo === e.id) {
      const dx = o.px - e.x, dy = o.py - e.y;
      facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    } else {
      const slot = Math.floor((time + seed % 5000) / 3600);
      facing = ['down', 'down', 'left', 'down', 'right', 'down', 'up'][hash(seed % 1000, slot) % 7];
    }
    const badge = ['label', 'boss'].includes(e.kind) ? (e.color || '#ffcb9d') : '';
    personSmooth(ctx, x, y, { color: e.color || '#cbd6f2', facing, time, seed, badge, moving: false, phase: 0 });
  }
}

// ------------------------------------------------------------ battle scene --

export function renderBattleScene(ctx, o) {
  const { world, battle, party, width: W, height: H, reserve = 0, time: now, fx = {} } = o;
  if (!battle) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  const areaH = Math.max(H * .45, H - reserve);
  const narrow = W < areaH * .95, VW = narrow ? 460 : 720;
  const k = Math.min(W / VW, areaH / 420);
  const ox = (W - VW * k) / 2, oy = Math.max(0, (areaH - 420 * k) / 2);
  const horizon = oy + 238 * k;

  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#15122b'); sky.addColorStop(.7, '#2f2150'); sky.addColorStop(1, '#5a3266');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon);
  for (let i = 0; i < 70; i++) {
    const sx = (hash(i, 1) / 997) * W, sy = (hash(i, 2) / 997) * horizon * .8;
    const twinkle = .35 + Math.sin(now / 700 + i) * .3;
    circle(ctx, `rgba(240,232,255,${twinkle})`, sx, sy, (hash(i, 3) % 3 === 0 ? 1.3 : .8) * Math.max(1, k * .8));
  }
  const moonX = ox + (narrow ? 380 : 600) * k, moonY = oy + 62 * k;
  const moon = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 90 * k);
  moon.addColorStop(0, 'rgba(255,214,240,.35)'); moon.addColorStop(1, 'rgba(255,214,240,0)');
  ctx.fillStyle = moon; ctx.fillRect(moonX - 90 * k, moonY - 90 * k, 180 * k, 180 * k);
  circle(ctx, '#f7dcef', moonX, moonY, 17 * k);
  circle(ctx, 'rgba(200,160,210,.35)', moonX - 5 * k, moonY - 3 * k, 4 * k);

  const skyline = (layer, color, windowColor, minH, maxH, speed) => {
    const bw = 34 * k, drift = (now * speed) % bw;
    const count = Math.ceil(W / bw) + 2;
    for (let i = -1; i < count; i++) {
      const id = i + Math.floor((now * speed) / bw);
      const bh = (minH + hash(id, layer) % (maxH - minH)) * k;
      const x = i * bw - drift, w = bw - 5 * k;
      fillRound(ctx, color, x, horizon - bh, w, bh + 2, 3 * k);
      for (let row = 0; row < bh / (11 * k) - 1; row++) for (let col = 0; col < 3; col++) {
        if (hash(id, row, col + layer * 7) % 5 !== 0) continue;
        fillRound(ctx, windowColor, x + 5 * k + col * 9 * k, horizon - bh + 7 * k + row * 11 * k, 4 * k, 5 * k, 1 * k);
      }
    }
  };
  skyline(1, '#2a2045', 'rgba(232,170,214,.5)', 50, 150, .004);
  const haze = ctx.createLinearGradient(0, horizon - 60 * k, 0, horizon);
  haze.addColorStop(0, 'rgba(240,130,200,0)'); haze.addColorStop(1, 'rgba(240,130,200,.22)');
  ctx.fillStyle = haze; ctx.fillRect(0, horizon - 60 * k, W, 60 * k);
  skyline(2, '#1d1734', 'rgba(255,214,150,.55)', 30, 90, .009);

  const floor = ctx.createLinearGradient(0, horizon, 0, H);
  floor.addColorStop(0, '#3a2551'); floor.addColorStop(1, '#130f22');
  ctx.fillStyle = floor; ctx.fillRect(0, horizon, W, H - horizon);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, horizon, W, H - horizon); ctx.clip();
  ctx.strokeStyle = 'rgba(244,140,210,.16)'; ctx.lineWidth = Math.max(1, k);
  const vanishX = W / 2;
  for (let i = -14; i <= 14; i++) { ctx.beginPath(); ctx.moveTo(vanishX + i * 12 * k, horizon); ctx.lineTo(vanishX + i * 130 * k, H); ctx.stroke(); }
  const scroll = (now / 2600) % 1;
  for (let i = 0; i < 9; i++) {
    const t = (i + scroll) / 9, yy = horizon + Math.pow(t, 2.2) * (H - horizon);
    ctx.globalAlpha = t; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  ctx.globalCompositeOperation = 'screen';
  for (const [sx, color, phase] of [[.12, '157,215,229', 0], [.88, '241,168,215', 2]]) {
    const angle = Math.sin(now / 2400 + phase) * .25;
    const bx = sx * W, length = H * 1.1;
    ctx.save(); ctx.translate(bx, -10); ctx.rotate(angle + (sx < .5 ? -.35 : .35));
    const beam = ctx.createLinearGradient(0, 0, 0, length);
    beam.addColorStop(0, `rgba(${color},.32)`); beam.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(-6 * k, 0); ctx.lineTo(6 * k, 0); ctx.lineTo(90 * k, length); ctx.lineTo(-90 * k, length); ctx.fill();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';

  const stagePad = (x, y, w, color) => {
    ellipseFill(ctx, 'rgba(6,4,14,.55)', x, y + 14 * k, w * 1.06, w * .24);
    const top = ctx.createLinearGradient(0, y - w * .2, 0, y + w * .2);
    top.addColorStop(0, '#8a6a93'); top.addColorStop(1, '#4b3352');
    ellipseFill(ctx, '#2c2038', x, y + 6 * k, w, w * .22);
    ellipseFill(ctx, top, x, y, w, w * .2);
    ctx.strokeStyle = `rgba(${color},.75)`; ctx.lineWidth = 2 * k;
    ctx.setLineDash([10 * k, 8 * k]); ctx.lineDashOffset = -now / 30;
    ctx.beginPath(); ctx.ellipse(x, y + 2 * k, w * .86, w * .16, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, w);
    glow.addColorStop(0, `rgba(${color},.25)`); glow.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(x, y, w, w * .2, 0, 0, TAU); ctx.fill();
  };
  const enemyX = ox + (narrow ? 334 : 530) * k, enemyY = oy + 214 * k, playerX = ox + (narrow ? 126 : 186) * k, playerY = oy + 352 * k;
  stagePad(enemyX, enemyY, (narrow ? 86 : 108) * k, '241,168,215');
  stagePad(playerX, playerY, (narrow ? 100 : 124) * k, '157,215,229');

  const override = fx.enemyOverride && now < fx.enemyOverride.until ? fx.enemyOverride.monster : null;
  const enemy = override || battle.enemies[battle.enemy], player = party[battle.active];
  const draw = (monster, x, y, unit, flip, side) => {
    if (!monster) return;
    const species = world.species[monster.species];
    const enter = easeOut((now - (fx[`${side}In`] || 0)) / 650);
    const hit = now - (fx[`${side}Hit`] || -1e9);
    const shake = hit >= 0 && hit < 420 ? Math.sin(hit / 22) * 7 * k * (1 - hit / 420) : 0;
    const flash = hit >= 0 && hit < 420 ? (Math.floor(hit / 70) % 2 === 0 ? .85 : .15) * (1 - hit / 420) : 0;
    const fainted = monster.hp <= 0;
    const faintT = fainted ? easeOut((now - (fx[`${side}Faint`] || now)) / 500) : 0;
    const slide = (1 - enter) * (side === 'enemy' ? 260 : -260) * k;
    const breathe = 1 + Math.sin(now / 430 + (side === 'enemy' ? 0 : 1.7)) * .025;
    const hop = Math.abs(Math.sin(now / 430 + (side === 'enemy' ? 0 : 1.7))) * 3 * k;
    ellipseFill(ctx, `rgba(10,6,20,${.35 * (1 - faintT)})`, x + slide, y + 2 * k, unit * 9, unit * 2.2);
    ctx.save();
    if (fainted) { ctx.beginPath(); ctx.rect(0, 0, W, y + 4 * k); ctx.clip(); }
    drawCreature(ctx, species, x + slide + shake, y - hop * (1 - faintT) + faintT * unit * 20, unit, { flip, squash: breathe, alpha: enter * (1 - faintT), flash });
    ctx.restore();
  };
  draw(enemy, enemyX, enemyY, 5 * k, false, 'enemy');
  draw(player, playerX, playerY, 6.2 * k, true, 'player');
}
