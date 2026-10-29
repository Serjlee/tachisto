import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syllabify, parseItem, syllableLabel } from '../js/syllabify.js';

const cases = {
  cane: 'ca-ne', gatto: 'gat-to', casa: 'ca-sa', pasta: 'pa-sta',
  acqua: 'ac-qua', campo: 'cam-po', parte: 'par-te', capra: 'ca-pra',
  bagno: 'ba-gno', figlio: 'fi-glio', pesce: 'pe-sce', mostro: 'mo-stro',
  paese: 'pa-e-se', poeta: 'po-e-ta', leone: 'le-o-ne', aereo: 'a-e-re-o',
  ciao: 'cia-o', aiuola: 'a-iuo-la', noia: 'no-ia', maiale: 'ma-ia-le',
  gioia: 'gio-ia', aiuto: 'a-iu-to', europa: 'eu-ro-pa', tuoi: 'tuoi',
  miei: 'miei', quadro: 'qua-dro', scuola: 'scuo-la', chiesa: 'chie-sa',
  archivio: 'ar-chi-vio', instradare: 'in-stra-da-re', ritmo: 'rit-mo',
  atleta: 'at-le-ta', inglese: 'in-gle-se', camicia: 'ca-mi-cia',
  albero: 'al-be-ro', zucchero: 'zuc-che-ro', farfalla: 'far-fal-la',
  CANE: 'CA-NE', paùra: 'pa-ù-ra', "l'albero": "l'al-be-ro",
  sole: 'so-le', a: 'a', tre: 'tre', computer: 'com-pu-ter',
  sport: 'sport', yogurt: 'yo-gurt', 'ba-u-le': 'ba-u-le',
  'TA·VO·LO': 'TA-VO-LO',
};

for (const [word, expected] of Object.entries(cases)) {
  test(word, () => assert.equal(syllabify(word).join('-'), expected));
}

test('parseItem syllables', () => {
  assert.deepEqual(parseItem('il ca-ne', 'syllables'), {
    text: 'il cane',
    units: [[0, 2], [3, 5], [5, 7]],
  });
});

test('parseItem word', () => {
  assert.deepEqual(parseItem('cane', 'word'), { text: 'cane', units: [[0, 4]] });
  assert.deepEqual(parseItem('il cane', 'word').units, [[0, 7]]);
});

test('parseItem letters', () => {
  assert.deepEqual(parseItem("l'oca", 'letters').units, [[0, 1], [2, 3], [3, 4], [4, 5]]);
});

test('syllableLabel', () => assert.equal(syllableLabel(' il  cane '), 'il ca-ne'));
