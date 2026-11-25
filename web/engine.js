const DATA_KEY = 'freestylomon.v1';
const encoder = new TextEncoder(), decoder = new TextDecoder();

export function storedGame() {
  try { return JSON.parse(localStorage.getItem(DATA_KEY)) || {}; }
  catch { return {}; }
}

export async function openEngine(onExternal) {
  const source = await fetch('/freestylomon.wasm');
  if (!source.ok) throw new Error('The Rust game could not be loaded.');
  const { instance } = await WebAssembly.instantiate(await source.arrayBuffer());
  const wasm = instance.exports;
  const call = command => {
    const bytes = encoder.encode(JSON.stringify(command));
    const destination = wasm.input_buffer(bytes.length);
    new Uint8Array(wasm.memory.buffer, destination, bytes.length).set(bytes);
    const output = wasm.dispatch();
    const result = JSON.parse(decoder.decode(new Uint8Array(wasm.memory.buffer, output, wasm.output_length())));
    if (result.error) throw new Error(result.error);
    return result;
  };
  const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
  let record = storedGame();
  let result = call({op:'load', world:record.world, save:record.save, seed:seed()});
  let { world } = result;
  let save = result.save;
  function update(next) {
    world = next.world || world;
    save = next.save;
    result = next;
    return next;
  }
  function write(next) {
    const nextRecord = {version:1, revision:crypto.randomUUID(), world:next.world || world, save:next.save};
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(nextRecord));
    } catch {
      update(call({op:'load', world, save}));
      throw new Error('Browser storage could not save these changes. Export your game and free up space before retrying.');
    }
    record = nextRecord;
  }
  function receive(latest) {
    if (!latest.revision || latest.revision === record.revision) return false;
    const next = call({op:'load', world:latest.world, save:latest.save, seed:seed()});
    record = latest;
    update(next);
    return true;
  }
  window.addEventListener('storage', event => {
    if (event.key === DATA_KEY && receive(storedGame())) onExternal?.(result);
  });
  return {
    get world() { return world; }, get save() { return save; }, get result() { return result; },
    action(command) {
      receive(storedGame());
      const oldSave = JSON.stringify(save);
      const next = call({...command, seed:command.op === 'reset' ? seed() : undefined});
      if (JSON.stringify(next.save) !== oldSave) write(next);
      return update(next);
    },
    apply(newWorld, mutateSave) {
      const latest = storedGame();
      if (latest.revision && latest.revision !== record.revision) {
        const previousWorld = JSON.stringify(world);
        receive(latest);
        if (newWorld && previousWorld !== JSON.stringify(world)) throw new Error('The world changed in another tab. Reload this editor before applying again.');
      }
      let nextSave = structuredClone(save);
      if (mutateSave) nextSave = mutateSave(nextSave) || nextSave;
      const next = call({op:'load', world:newWorld || world, save:nextSave});
      write(next);
      return update(next);
    },
    defaults() {
      const bundled = call({op:'load', seed:seed()});
      call({op:'load', world, save});
      return bundled.world;
    },
  };
}

const glyphs = {
  wave:'<path d="M3 9v6m4-10v14m5-17v20m5-17v14m4-10v6"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  crew:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4m-3-12a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
  bag:'<rect x="4" y="7" width="16" height="14" rx="3"/><path d="M8 7V5a4 4 0 0 1 8 0v2m-8 7h8v4H8z"/>',
  journal:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5Z M8 7h8m-8 4h6"/>',
  sliders:'<path d="M4 7h16M4 17h16"/><rect x="7" y="4" width="4" height="6" rx="1" fill="currentColor"/><rect x="14" y="14" width="4" height="6" rx="1" fill="currentColor"/>',
  pin:'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  coin:'<circle cx="12" cy="12" r="9"/><path d="M15 8h-4a2 2 0 1 0 0 4h2a2 2 0 0 1 0 4H9m3-10v2m0 8v2"/>',
  crosshair:'<circle cx="12" cy="12" r="6"/><path d="M12 2v6m0 8v6M2 12h6m8 0h6"/>',
  flag:'<path d="M5 22V4m0 0c5-5 9 4 15 0v11c-6 4-10-5-15 0"/>',
  vinyl:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M6.5 11a6 6 0 0 1 4.5-4.5m6.5 6.5a6 6 0 0 1-4.5 4.5"/>',
  tape:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 19l2-4h6l2 4M7 9h10v2H7z"/>',
  mic:'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-3 0h6"/>',
  talk:'<path d="M20 15a2 2 0 0 1-2 2H9l-5 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2zM8 8h8m-8 4h5"/>',
  external:'<path d="M14 4h6v6m0-6-9 9m8-1v7H5V5h7"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  mute:'<path d="M3 9h4l5-5v16l-5-5H3zM16 9l5 6m0-6-5 6"/>',
  sound:'<path d="M3 9h4l5-5v16l-5-5H3zm13 0a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/>',
  brush:'<path d="m14 6 4-4 4 4-4 4m-4-4 4 4-7 7-4-4zm-7 7c-4 0-4 3-5 8 5-1 8-1 8-5"/>',
  move:'<path d="M12 2v20M2 12h20M9 5l3-3 3 3m-6 14 3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3"/>',
  back:'<path d="M15 5l-7 7 7 7"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  disk:'<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
  expand:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  light:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[name] || ''}</svg>`;
}

export function mountIcons(root = document) {
  for (const element of root.querySelectorAll('[data-icon]')) element.innerHTML = icon(element.dataset.icon);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[character]);
}

export function exportJson(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], {type:'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
