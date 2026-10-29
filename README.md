# Tachistoscopio Online

Presenta un elenco di parole **una alla volta, divise in sillabe**, con tempo di
esposizione regolabile. Esempio: con `CANE` e durata 5 s compare `CA` per 5 s,
poi `NE` per 5 s, poi lo schermo resta bianco in attesa della risposta.

Funziona **anche offline** dopo il primo caricamento (service worker) e si può
installare come app su tablet/telefono/computer.

## Funzioni

- Divisione in sillabe automatica (italiano), con anteprima; si può forzare con
  il trattino: `BA-U-LE`
- Presentazione per sillabe, parola intera o lettere
- Durata di esposizione, pausa tra sillabe, schermo vuoto prima della parola
  (tempi sincronizzati con il refresh dello schermo)
- Sillaba al centro o nella sua posizione reale nella parola
- Punto di fissazione e maschera `#####` opzionali
- Dopo la parola: attesa della risposta oppure avanzamento automatico
- Ordine dell'elenco o casuale; maiuscolo/minuscolo, carattere, dimensione, colori
- Segna le risposte giuste/sbagliate, riepilogo finale, ripeti solo le sbagliate
- Liste di parole salvate sul dispositivo, importazione da file `.txt`

### Comandi durante la presentazione

| Tasto | Azione |
| --- | --- |
| `Spazio` / `Invio` / `→` / tocco | parola successiva |
| `C` | corretta e avanti |
| `S` | sbagliata e avanti |
| `R` | ripeti la parola |
| `Esc` | termina e mostra il riepilogo |

## Pubblicazione su GitHub Pages

Il workflow `.github/workflows/pages.yml` esegue i test e pubblica il sito a ogni
push su `main`.

1. Su GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Fai un push su `main` (o avvia il workflow a mano da **Actions → Pubblica su GitHub Pages**).
3. L'app sarà su `https://<utente>.github.io/<repository>/`.

## Sviluppo

Nessuna dipendenza né build: HTML, CSS e JavaScript (moduli ES) puri.

```sh
npm start   # server locale su http://localhost:8080
npm test    # test della divisione in sillabe (Node 20+)
```

I moduli ES richiedono un server: aprire `index.html` con doppio clic (`file://`)
non funziona. Dopo aver modificato i file, aumenta `CACHE` in `sw.js` per
aggiornare subito le installazioni offline.
