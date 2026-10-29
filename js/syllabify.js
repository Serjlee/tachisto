/**
 * Divisione in sillabe per l'italiano (regole scolastiche).
 *
 * Le regole coprono la grande maggioranza delle parole comuni. Quando la
 * divisione automatica non è quella desiderata (es. iati non accentati come
 * "ba-u-le") la si può forzare scrivendo la parola con i trattini: BA-U-LE.
 */

const VOWELS = new Set('aeiouàèéìíîòóùúy');
const ACCENTED = new Set('àèéìíîòóùú');
const MANUAL_SEPARATORS = /[-·|]/;

// Gruppi consonantici che possono iniziare una sillaba (e quindi non si
// dividono): consonante + l/r, digrammi, s + consonante, ecc.
const ONSET = /^s?(?:[bcfgpv][lr]|[dt]r|ch[lr]?|gh|gn|[b-df-hj-np-tv-z])$|^s$/;

const isLetter = (ch) => /\p{L}/u.test(ch);
const isStrong = (ch) => 'aeo'.includes(ch) || ACCENTED.has(ch);

/** Classifica ogni lettera come vocale (true) o consonante (false). */
const classify = (letters) =>
  letters.map((ch, i) => {
    if (!VOWELS.has(ch)) return false;
    // la "u" di "qu" fa parte della consonante
    if (ch === 'u' && letters[i - 1] === 'q') return false;
    // "y" davanti a vocale si comporta da consonante (yogurt)
    if (ch === 'y' && VOWELS.has(letters[i + 1])) return false;
    return true;
  });

/** Indici (relativi alla sequenza di vocali) prima dei quali si va a capo. */
function splitVowelRun(run) {
  const cuts = [];
  for (let j = 1; j < run.length; j++) {
    const [a, b] = [run[j - 1], run[j]];
    if (!isStrong(a)) continue;
    if (isStrong(b)) cuts.push(j); // iato: pa-e-se, le-o-ne
    else if (j + 1 < run.length) cuts.push(j); // i/u tra vocali: a-iuo-la, no-ia
  }
  return cuts;
}

/** Quante consonanti del gruppo restano alla sillaba precedente. */
function splitConsonants(cluster) {
  if (cluster.length <= 1) return 0;
  const [a, b] = cluster;
  if (a === b || (a === 'c' && b === 'q')) return 1; // gat-to, ac-qua
  const i = cluster.findIndex((_, k) => ONSET.test(cluster.slice(k).join('')));
  return i === -1 ? cluster.length - 1 : i;
}

/** Posizioni (indici di carattere) dove inizia una nuova sillaba. */
function syllableBreaks(chars) {
  const pos = [];
  const letters = [];
  chars.forEach((ch, i) => {
    if (isLetter(ch)) {
      pos.push(i);
      letters.push(ch.toLowerCase());
    }
  });

  const vowel = classify(letters);
  const nuclei = []; // [inizio, fine) in indici di lettera
  for (let i = 0; i < letters.length; ) {
    if (!vowel[i]) { i++; continue; }
    const start = i;
    while (i < letters.length && vowel[i]) i++;
    let last = start;
    for (const cut of splitVowelRun(letters.slice(start, i))) {
      nuclei.push([last, start + cut]);
      last = start + cut;
    }
    nuclei.push([last, i]);
  }

  return nuclei.slice(1).map(([nextStart], n) => {
    const prevEnd = nuclei[n][1];
    return pos[prevEnd + splitConsonants(letters.slice(prevEnd, nextStart))];
  });
}

/** Divide una singola parola in sillabe. */
export function syllabify(word) {
  if (MANUAL_SEPARATORS.test(word)) {
    return word.split(MANUAL_SEPARATORS).filter(Boolean);
  }
  const chars = [...word];
  const bounds = [0, ...syllableBreaks(chars), chars.length];
  return bounds
    .slice(1)
    .map((end, i) => chars.slice(bounds[i], end).join(''))
    .filter(Boolean);
}

/**
 * Prepara un elemento della lista per la presentazione.
 * @param {string} raw parola o breve frase
 * @param {'syllables'|'word'|'letters'} mode
 * @returns {{text: string, units: [number, number][]}} units sono intervalli
 *   [inizio, fine) di caratteri di `text` da mostrare uno alla volta.
 */
export function parseItem(raw, mode) {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  const units = [];
  let offset = 0;

  const parts = words.map((w, wi) => {
    if (wi > 0) offset += 1; // spazio
    const syllables = syllabify(w);
    for (const syl of syllables) {
      const len = [...syl].length;
      if (mode === 'syllables') units.push([offset, offset + len]);
      if (mode === 'letters') {
        [...syl].forEach((ch, k) => {
          if (/[\p{L}\p{N}]/u.test(ch)) units.push([offset + k, offset + k + 1]);
        });
      }
      offset += len;
    }
    return syllables.join('');
  });

  const text = parts.join(' ');
  if (mode === 'word' && text) units.push([0, [...text].length]);
  return { text, units };
}

/** Etichetta leggibile: "il ca-ne". */
export const syllableLabel = (raw) =>
  raw.trim().split(/\s+/).map((w) => syllabify(w).join('-')).join(' ');
