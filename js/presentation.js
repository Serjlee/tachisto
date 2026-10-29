import { parseItem } from './syllabify.js';

const KEY_ACTIONS = {
  ' ': 'next', Enter: 'next', ArrowRight: 'next', PageDown: 'next',
  c: 'right', C: 'right', 1: 'right',
  s: 'wrong', S: 'wrong', 2: 'wrong',
  r: 'repeat', R: 'repeat',
  Escape: 'exit',
};

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

const shuffle = (list) => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

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
  #stage;
  #display;
  #message;
  #counter;
  #settings;
  #items;
  #pos = -1;
  #phase = 'ready'; // ready | running | waiting | autowait | done
  #abort = null;
  #fullscreen = false;
  #wakeLock = null;
  #onFinish;
  #listeners = new AbortController();

  constructor({ stage, settings, words, onFinish }) {
    this.#stage = stage;
    this.#display = stage.querySelector('#display');
    this.#message = stage.querySelector('#stageMessage');
    this.#counter = stage.querySelector('#counter');
    this.#settings = settings;
    this.#onFinish = onFinish;
    this.#items = words
      .map((raw) => ({ raw, parsed: parseItem(raw, settings.unit), result: null, shown: false }))
      .filter((item) => item.parsed.units.length > 0);
    if (settings.order === 'random') shuffle(this.#items);
  }

  get isEmpty() {
    return this.#items.length === 0;
  }

  async start() {
    const { signal } = this.#listeners;
    document.addEventListener('keydown', (e) => this.#onKey(e), { signal });
    this.#stage.addEventListener('click', (e) => this.#onClick(e), { signal });
    document.addEventListener('fullscreenchange', () => {
      // l'utente ha chiuso lo schermo intero (es. con Esc): termina
      if (this.#fullscreen && !document.fullscreenElement) {
        this.#fullscreen = false;
        this.finish();
      }
    }, { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.#requestWakeLock();
    }, { signal });

    this.#stage.hidden = false;
    this.#display.replaceChildren();
    this.#display.style.fontSize = '';
    this.#message.textContent = 'Premi SPAZIO o tocca lo schermo per iniziare';
    this.#setPhase('ready');
    this.#stage.focus();

    this.#requestWakeLock();
    if (this.#settings.fullscreen && !document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen?.();
        this.#fullscreen = this.#phase !== 'done';
      } catch {
        // non supportato (es. iPhone): si prosegue in finestra
      }
    }
  }

  act(action) {
    const answering = this.#phase === 'waiting' || this.#phase === 'autowait';
    switch (action) {
      case 'next':
        if (this.#phase === 'ready' || answering) this.#next();
        break;
      case 'right':
      case 'wrong':
        if (answering) {
          this.#current.result = action;
          this.#next();
        }
        break;
      case 'repeat':
        if (this.#phase !== 'ready' && this.#phase !== 'done') this.#runItem();
        break;
      case 'exit':
        this.finish();
        break;
    }
  }

  finish() {
    if (this.#phase === 'done') return;
    this.#abort?.abort();
    this.#setPhase('done');
    this.#listeners.abort();
    this.#stage.hidden = true;
    this.#stage.className = '';
    this.#display.replaceChildren();
    if (this.#fullscreen && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    this.#wakeLock?.release().catch(() => {});
    this.#wakeLock = null;
    this.#onFinish({ settings: this.#settings, items: this.#items });
  }

  get #current() {
    return this.#items[this.#pos];
  }

  #setPhase(phase) {
    this.#phase = phase;
    this.#stage.className = phase === 'autowait' ? 'waiting' : phase;
    this.#counter.value = `${this.#pos + 1} / ${this.#items.length}`;
  }

  #next() {
    this.#pos++;
    if (this.#pos >= this.#items.length) this.finish();
    else this.#runItem();
  }

  async #runItem() {
    this.#abort?.abort();
    const abort = new AbortController();
    this.#abort = abort;

    const s = this.#settings;
    const item = this.#current;
    item.shown = true;
    this.#message.textContent = '';
    this.#setPhase('running');
    this.#fitText(applyCase(s, item.parsed.text));

    const { units } = item.parsed;
    const steps = [
      { kind: 'blank', dur: s.preDelay },
      s.fixation && { kind: 'fix', dur: s.fixationDur },
      ...units.flatMap((_, index) => [
        { kind: 'unit', index, dur: s.duration },
        index < units.length - 1 && { kind: 'blank', dur: s.gap },
      ]),
      s.mask && { kind: 'mask', dur: s.maskDur },
    ];

    try {
      await this.#play(steps, abort.signal);
      this.#render({ kind: 'blank' });
      if (s.advance === 'auto') {
        this.#setPhase('autowait');
        await this.#play([{ kind: 'blank', dur: s.autoDelay }], abort.signal);
        this.#next();
      } else {
        this.#setPhase('waiting');
      }
    } catch (err) {
      if (err?.name !== 'AbortError') throw err;
    }
  }

  /**
   * Mostra le schermate in sequenza, sincronizzandosi con il refresh dello
   * schermo per tempi di esposizione il più possibile precisi.
   */
  async #play(steps, signal) {
    let frame = 1000 / 60; // stima della durata di un fotogramma
    let t = await nextFrame();
    signal.throwIfAborted();

    for (const step of steps) {
      if (!step || !(step.dur > 0)) continue;
      this.#render(step);
      const start = t;
      const target = step.dur * 1000;
      do {
        const prev = t;
        t = await nextFrame();
        signal.throwIfAborted();
        const delta = t - prev;
        if (delta > 4 && delta < 50) frame = frame * 0.9 + delta * 0.1;
      } while (t - start < target - frame / 2);
    }
  }

  #render(step) {
    const s = this.#settings;
    const chars = [...applyCase(s, this.#current.parsed.text)];
    this.#display.className = step.kind === 'fix' ? 'fix' : '';

    switch (step.kind) {
      case 'fix':
        this.#display.textContent = '+';
        break;
      case 'mask':
        this.#display.textContent = chars.map((c) => (c === ' ' ? ' ' : '#')).join('');
        break;
      case 'unit': {
        const [from, to] = this.#current.parsed.units[step.index];
        if (s.position === 'real' && s.unit !== 'word') {
          // la parola intera occupa lo spazio, ma si vede solo la sillaba
          const part = (a, b, hidden) => {
            const span = document.createElement('span');
            span.textContent = chars.slice(a, b).join('');
            if (hidden) span.className = 'hide';
            return span;
          };
          this.#display.replaceChildren(
            part(0, from, true),
            part(from, to, false),
            part(to, chars.length, true),
          );
        } else {
          this.#display.textContent = chars.slice(from, to).join('');
        }
        break;
      }
      default:
        this.#display.replaceChildren();
    }
  }

  /** Riduce il carattere se la parola non entra nello schermo. */
  #fitText(text) {
    const display = this.#display;
    display.style.fontSize = '';
    display.textContent = text;
    const available = this.#stage.clientWidth * 0.94;
    const width = display.scrollWidth;
    display.replaceChildren();
    if (width > available) {
      display.style.fontSize = `calc(var(--stage-size) * ${(available / width).toFixed(3)})`;
    }
  }

  async #requestWakeLock() {
    if (!('wakeLock' in navigator) || this.#phase === 'done') return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (this.#phase === 'done') lock.release();
      else this.#wakeLock = lock;
    } catch {
      // non disponibile: pazienza
    }
  }

  #onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const action = KEY_ACTIONS[e.key];
    if (!action) return;
    e.preventDefault();
    if (!e.repeat) this.act(action);
  }

  #onClick(e) {
    const button = e.target.closest('button');
    if (button) {
      button.blur();
      this.act(button.dataset.action);
    } else {
      this.act('next');
    }
  }
}
