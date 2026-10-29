import { parseItem } from './syllabify.js';

const KEY_ACTIONS = {
  ' ': 'next', Enter: 'next', ArrowRight: 'next', ArrowDown: 'next', PageDown: 'next',
  c: 'right', C: 'right', 1: 'right',
  s: 'wrong', S: 'wrong', 2: 'wrong',
  r: 'repeat', R: 'repeat', ArrowLeft: 'repeat', PageUp: 'repeat',
  Escape: 'exit',
};

// Segnale interno: la sequenza in corso è stata interrotta (ripeti, avanti, esci).
const CANCELLED = Symbol('cancelled');

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

const shuffle = (list) => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

// Schermo intero, con i prefissi webkit per Safari/iPad meno recenti.
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;

function enterFullscreen() {
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) return el.requestFullscreen();
    if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch {
    // non consentito: si prosegue in finestra
  }
  return Promise.resolve();
}

function exitFullscreen() {
  if (!fullscreenElement()) return;
  if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
  else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
}

export const applyCase = (settings, str) =>
  ({
    upper: str.toLocaleUpperCase('it'),
    lower: str.toLocaleLowerCase('it'),
  })[settings.case] ?? str;

/**
 * Una sessione di presentazione: mostra gli elementi uno alla volta sullo
 * schermo `stage`, poi chiama `onFinish` con i risultati.
 */
export class Presentation {
  constructor({ stage, settings, words, onFinish }) {
    this.stage = stage;
    this.display = stage.querySelector('#display');
    this.message = stage.querySelector('#stageMessage');
    this.counter = stage.querySelector('#counter');
    this.settings = settings;
    this.onFinish = onFinish;
    this.items = words
      .map((raw) => ({ raw, parsed: parseItem(raw, settings.unit), result: null, shown: false }))
      .filter((item) => item.parsed.units.length > 0);
    if (settings.order === 'random') shuffle(this.items);

    this.pos = -1;
    this.phase = 'ready'; // ready | running | waiting | autowait | done
    this.token = 0; // cambia a ogni interruzione: le sequenze vecchie si fermano
    this.fullscreen = false;
    this.wakeLock = null;

    this.handlers = {
      keydown: (e) => this.onKey(e),
      click: (e) => this.onClick(e),
      contextmenu: (e) => e.preventDefault(), // pressione lunga su LIM/tablet
      fullscreenchange: () => this.onFullscreenChange(),
      visibilitychange: () => {
        if (document.visibilityState === 'visible') this.requestWakeLock();
      },
    };
  }

  get isEmpty() {
    return this.items.length === 0;
  }

  get current() {
    return this.items[this.pos];
  }

  listen(on) {
    const method = on ? 'addEventListener' : 'removeEventListener';
    const h = this.handlers;
    document[method]('keydown', h.keydown);
    document[method]('fullscreenchange', h.fullscreenchange);
    document[method]('webkitfullscreenchange', h.fullscreenchange);
    document[method]('visibilitychange', h.visibilitychange);
    this.stage[method]('click', h.click);
    this.stage[method]('contextmenu', h.contextmenu);
  }

  async start() {
    this.listen(true);
    this.stage.hidden = false;
    this.display.textContent = '';
    this.display.style.fontSize = '';
    this.message.textContent = 'Tocca lo schermo o premi SPAZIO per iniziare';
    this.setPhase('ready');
    this.stage.focus();
    this.requestWakeLock();

    if (this.settings.fullscreen && !fullscreenElement()) {
      try {
        await enterFullscreen();
      } catch {
        // rifiutato o non supportato (es. iPhone): si prosegue in finestra
      }
      this.fullscreen = Boolean(fullscreenElement()) && this.phase !== 'done';
    }
  }

  act(action) {
    const answering = this.phase === 'waiting' || this.phase === 'autowait';
    switch (action) {
      case 'next':
        if (this.phase === 'ready' || answering) this.next();
        break;
      case 'right':
      case 'wrong':
        if (answering) {
          this.current.result = action;
          this.next();
        }
        break;
      case 'repeat':
        if (this.phase !== 'ready' && this.phase !== 'done') this.runItem();
        break;
      case 'exit':
        this.finish();
        break;
    }
  }

  finish() {
    if (this.phase === 'done') return;
    this.token++;
    this.setPhase('done');
    this.listen(false);
    this.stage.hidden = true;
    this.stage.className = '';
    this.display.textContent = '';
    if (this.fullscreen) exitFullscreen();
    if (this.wakeLock) this.wakeLock.release().catch(() => {});
    this.wakeLock = null;
    this.onFinish({ settings: this.settings, items: this.items });
  }

  setPhase(phase) {
    this.phase = phase;
    this.stage.className = phase === 'autowait' ? 'waiting' : phase;
    this.counter.textContent = `${this.pos + 1} / ${this.items.length}`;
  }

  next() {
    this.pos++;
    if (this.pos >= this.items.length) this.finish();
    else this.runItem();
  }

  async runItem() {
    const token = ++this.token;
    const s = this.settings;
    const item = this.current;
    item.shown = true;
    this.message.textContent = '';
    this.setPhase('running');
    this.fitText(applyCase(s, item.parsed.text));

    const { units } = item.parsed;
    const steps = [{ kind: 'blank', dur: s.preDelay }];
    if (s.fixation) steps.push({ kind: 'fix', dur: s.fixationDur });
    units.forEach((_, index) => {
      steps.push({ kind: 'unit', index, dur: s.duration });
      if (index < units.length - 1) steps.push({ kind: 'blank', dur: s.gap });
    });
    if (s.mask) steps.push({ kind: 'mask', dur: s.maskDur });

    try {
      await this.play(steps, token);
      this.render({ kind: 'blank' });
      if (s.advance === 'auto') {
        this.setPhase('autowait');
        await this.play([{ kind: 'blank', dur: s.autoDelay }], token);
        this.next();
      } else {
        this.setPhase('waiting');
      }
    } catch (err) {
      if (err !== CANCELLED) throw err;
    }
  }

  /**
   * Mostra le schermate in sequenza, sincronizzandosi con il refresh dello
   * schermo per tempi di esposizione il più possibile precisi.
   */
  async play(steps, token) {
    const check = () => {
      if (token !== this.token) throw CANCELLED;
    };
    let frame = 1000 / 60; // stima della durata di un fotogramma
    let t = await nextFrame();
    check();

    for (const step of steps) {
      if (!(step.dur > 0)) continue;
      this.render(step);
      const start = t;
      const target = step.dur * 1000;
      do {
        const prev = t;
        t = await nextFrame();
        check();
        const delta = t - prev;
        if (delta > 4 && delta < 50) frame = frame * 0.9 + delta * 0.1;
      } while (t - start < target - frame / 2);
    }
  }

  render(step) {
    const s = this.settings;
    const chars = [...applyCase(s, this.current.parsed.text)];
    const display = this.display;
    display.className = step.kind === 'fix' ? 'fix' : '';
    display.textContent = '';

    if (step.kind === 'fix') {
      display.textContent = '+';
    } else if (step.kind === 'mask') {
      display.textContent = chars.map((c) => (c === ' ' ? ' ' : '#')).join('');
    } else if (step.kind === 'unit') {
      const [from, to] = this.current.parsed.units[step.index];
      if (s.position === 'real' && s.unit !== 'word') {
        // la parola intera occupa lo spazio, ma si vede solo la sillaba
        [[0, from, true], [from, to, false], [to, chars.length, true]].forEach(([a, b, hidden]) => {
          if (b <= a) return;
          const span = document.createElement('span');
          span.textContent = chars.slice(a, b).join('');
          if (hidden) span.className = 'hide';
          display.appendChild(span);
        });
      } else {
        display.textContent = chars.slice(from, to).join('');
      }
    }
  }

  /** Riduce il carattere se la parola non entra nello schermo. */
  fitText(text) {
    const display = this.display;
    display.style.fontSize = '';
    display.textContent = text;
    const available = this.stage.clientWidth * 0.94;
    const width = display.scrollWidth;
    display.textContent = '';
    if (width > available) {
      display.style.fontSize = `calc(var(--stage-size) * ${(available / width).toFixed(3)})`;
    }
  }

  async requestWakeLock() {
    if (!('wakeLock' in navigator) || this.phase === 'done') return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (this.phase === 'done') lock.release();
      else this.wakeLock = lock;
    } catch {
      // non disponibile: pazienza
    }
  }

  onFullscreenChange() {
    // l'utente ha chiuso lo schermo intero (es. con Esc): termina
    if (this.fullscreen && !fullscreenElement()) {
      this.fullscreen = false;
      this.finish();
    }
  }

  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const action = KEY_ACTIONS[e.key];
    if (!action) return;
    e.preventDefault();
    if (!e.repeat) this.act(action);
  }

  onClick(e) {
    const button = e.target.closest('button');
    if (button) {
      button.blur();
      this.act(button.dataset.action);
    } else {
      this.act('next');
    }
  }
}
