/** Piccolo wrapper su localStorage che non fallisce mai (modalità privata, quota piena…). */
export const store = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(`tachisto.${key}`);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(`tachisto.${key}`, JSON.stringify(value));
    } catch {
      // ignorato: l'app funziona comunque, semplicemente non ricorda
    }
  },
};
