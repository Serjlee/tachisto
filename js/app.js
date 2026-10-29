import { syllabify, syllableLabel } from './syllabify.js';
import { Presentation, applyCase } from './presentation.js';
import { store } from './storage.js';

const $ = (selector) => document.querySelector(selector);

/** Crea un elemento: h('li', { className: 'x' }, 'testo', figlio) */
const h = (tag, props = {}, ...children) => {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...children);
  return el;
};

const DEFAULT_WORDS = 'CANE\nGATTO\nCASA\nTAVOLO\nPALLA\nSOLE\nBANANA\nFARFALLA';

const FONTS = {
  sans: 'Arial, Helvetica, "Liberation Sans", sans-serif',
  verdana: 'Verdana, "DejaVu Sans", Geneva, sans-serif',
  serif: '"Times New Roman", Times, "Liberation Serif", serif',
  mono: '"Courier New", Courier, "Liberation Mono", monospace',
};

const form = $('#settings');
const wordsEl = $('#words');
const listSelect = $('#savedLists');
const deleteBtn = $('#deleteList');
const resultsDialog = $('#results');

// ---------- Impostazioni ----------

/** Tutti i controlli con un nome appartenenti al form (anche esterni, via form="settings"). */
const settingNames = () => [...new Set([...form.elements].map((el) => el.name).filter(Boolean))];

function readSettings() {
  const settings = {};
  for (const name of settingNames()) {
    const el = form.elements.namedItem(name);
    if (el instanceof RadioNodeList) {
      settings[name] = el.value;
    } else if (el.type === 'checkbox') {
      settings[name] = el.checked;
    } else if (el.type === 'number' || el.type === 'range') {
      const n = Number.parseFloat(el.value.replace(',', '.'));
      const value = Number.isFinite(n) ? n : Number.parseFloat(el.defaultValue);
      settings[name] = Math.min(Number(el.max || Infinity), Math.max(Number(el.min || 0), value));
    } else {
      settings[name] = el.value;
    }
  }
  return settings;
}

function restoreSettings() {
  const saved = store.get('settings', {});
  for (const [name, value] of Object.entries(saved)) {
    const el = form.elements.namedItem(name);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = value;
  }
}

function applySettings() {
  const s = readSettings();
  const root = document.documentElement.style;
  root.setProperty('--stage-fg', s.fg);
  root.setProperty('--stage-bg', s.bg);
  root.setProperty('--stage-font', FONTS[s.font] ?? FONTS.sans);
  root.setProperty('--stage-size', `${s.size}vmin`);
  $('#sizeOut').value = s.size;
  const sample = { syllables: 'ca', word: 'cane', letters: 'c' }[s.unit];
  $('#sample').textContent = applyCase(s, sample);
  return s;
}

function onSettingsInput() {
  store.set('settings', readSettings());
  applySettings();
  renderPreview();
}

form.addEventListener('input', onSettingsInput);
// associato al form con form="settings" ma fuori dal suo albero: l'evento non risale fino al form
form.elements.namedItem('lineMode').addEventListener('input', onSettingsInput);
form.addEventListener('submit', (e) => e.preventDefault());

// ---------- Elenco parole ----------

function getWords() {
  const separator = readSettings().lineMode ? /[\r\n;]+/ : /[\s,;]+/;
  return wordsEl.value.split(separator).map((w) => w.trim()).filter(Boolean);
}

const PREVIEW_LIMIT = 400;

function renderPreview() {
  const s = readSettings();
  const words = getWords();

  const chips = words.slice(0, PREVIEW_LIMIT).map((raw) => {
    const parts = raw.split(/\s+/).flatMap((word, wi) => [
      ...(wi > 0 ? [' '] : []),
      ...syllabify(word).flatMap((syl, si) => [
        ...(si > 0 ? [h('b', { textContent: '·' })] : []),
        applyCase(s, syl),
      ]),
    ]);
    return h('span', { className: 'chip' }, ...parts);
  });
  if (words.length > PREVIEW_LIMIT) {
    chips.push(h('span', { className: 'muted', textContent: `… e altre ${words.length - PREVIEW_LIMIT}` }));
  }

  $('#preview').replaceChildren(...chips);
  $('#wordCount').value = words.length === 1 ? '1 elemento' : `${words.length} elementi`;
  $('#startBtn').disabled = words.length === 0;
}

let previewTimer;
wordsEl.addEventListener('input', () => {
  store.set('words', wordsEl.value);
  syncListSelection();
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 150);
});

function setWords(text) {
  wordsEl.value = text;
  store.set('words', text);
  renderPreview();
}

// ---------- Liste salvate ----------

const getLists = () => store.get('lists', {});

const listNameFor = (text) =>
  Object.entries(getLists()).find(([, words]) => words === text)?.[0] ?? '';

function renderLists(selected = '') {
  const names = Object.keys(getLists()).sort((a, b) => a.localeCompare(b, 'it'));
  listSelect.replaceChildren(
    new Option('Liste salvate…', ''),
    ...names.map((name) => new Option(name, name)),
  );
  listSelect.value = names.includes(selected) ? selected : '';
  deleteBtn.disabled = !listSelect.value;
}

function syncListSelection() {
  if (listSelect.value && getLists()[listSelect.value] !== wordsEl.value) {
    listSelect.value = '';
    deleteBtn.disabled = true;
  }
}

listSelect.addEventListener('change', () => {
  const name = listSelect.value;
  deleteBtn.disabled = !name;
  if (!name) return;
  const text = getLists()[name];
  const unsaved = wordsEl.value.trim() && !listNameFor(wordsEl.value);
  if (unsaved && !confirm(`Sostituire le parole attuali con la lista «${name}»?`)) {
    renderLists();
    return;
  }
  setWords(text);
});

$('#saveList').addEventListener('click', () => {
  if (!wordsEl.value.trim()) {
    alert("L'elenco è vuoto.");
    return;
  }
  const name = prompt('Nome della lista:', listSelect.value)?.trim();
  if (!name) return;
  const lists = getLists();
  if (name in lists && name !== listSelect.value &&
      !confirm(`Esiste già una lista «${name}». Sovrascriverla?`)) return;
  store.set('lists', { ...lists, [name]: wordsEl.value });
  renderLists(name);
});

deleteBtn.addEventListener('click', () => {
  const name = listSelect.value;
  if (!name || !confirm(`Eliminare la lista «${name}»?`)) return;
  const { [name]: _removed, ...rest } = getLists();
  store.set('lists', rest);
  renderLists();
});

$('#importFile').addEventListener('change', async (e) => {
  const [file] = e.target.files;
  e.target.value = '';
  if (!file) return;
  const text = (await file.text()).replace(/^﻿/, '');
  if (wordsEl.value.trim() && !confirm(`Sostituire le parole attuali con il contenuto di «${file.name}»?`)) return;
  setWords(text);
  renderLists(listNameFor(text));
});

// ---------- Presentazione e riepilogo ----------

let lastSession = null;

function startSession(words) {
  const settings = readSettings();
  const presentation = new Presentation({
    stage: $('#stage'),
    settings,
    words,
    onFinish: (result) => showResults({ ...result, words }),
  });
  if (presentation.isEmpty) {
    alert('Inserisci almeno una parola.');
    return;
  }
  if (resultsDialog.open) resultsDialog.close();
  presentation.start();
}

const MARKS = { right: '✓', wrong: '✗' };

function showResults(session) {
  lastSession = session;
  const shown = session.items.filter((item) => item.shown);
  const count = (result) => shown.filter((item) => item.result === result).length;
  const right = count('right');
  const wrong = count('wrong');

  const stat = (value, label, className = '') =>
    h('div', { className: `stat ${className}` }, h('strong', { textContent: value }), h('span', { textContent: label }));

  $('#stats').replaceChildren(
    stat(`${shown.length} / ${session.items.length}`, 'presentate'),
    stat(right, 'corrette', 'right'),
    stat(wrong, 'sbagliate', 'wrong'),
    stat(shown.length - right - wrong, 'non segnate'),
  );

  $('#resultList').replaceChildren(
    ...shown.map((item) =>
      h('li', {},
        h('span', { className: `mark ${item.result ?? ''}`, textContent: MARKS[item.result] ?? '–' }),
        applyCase(session.settings, syllableLabel(item.raw)),
      ),
    ),
  );

  $('#retryWrong').disabled = wrong === 0;
  $('#copyResults').textContent = 'Copia';
  resultsDialog.showModal();
}

$('#retryWrong').addEventListener('click', () => {
  startSession(lastSession.items.filter((item) => item.result === 'wrong').map((item) => item.raw));
});

$('#restart').addEventListener('click', () => startSession(lastSession.words));

$('#copyResults').addEventListener('click', async (e) => {
  const text = lastSession.items
    .filter((item) => item.shown)
    .map((item) => `${MARKS[item.result] ?? '–'} ${applyCase(lastSession.settings, syllableLabel(item.raw))}`)
    .join('\n');
  try {
    await navigator.clipboard.writeText(text);
    e.target.textContent = 'Copiato ✓';
  } catch {
    e.target.textContent = 'Copia non riuscita';
  }
});

$('#startBtn').addEventListener('click', () => startSession(getWords()));

// ---------- Avvio ----------

restoreSettings();
wordsEl.value = store.get('words', DEFAULT_WORDS);
renderLists(listNameFor(wordsEl.value));
applySettings();
renderPreview();

// ---------- Funzionamento offline ----------

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  try {
    await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    const badge = $('#offlineStatus');
    badge.value = '✓ Disponibile offline';
    badge.hidden = false;
  } catch {
    // service worker non disponibile: l'app funziona comunque online
  }
}
