// lib-parlato.mjs — un'unica regola per decidere se una trascrizione è parlato vero.
//
// Serve perché un video "muto" (musica + testo a schermo) NON produce una trascrizione vuota:
// Whisper allucina. Le firme tipiche sono una manciata di parole ("Thank you.", "Music") oppure
// un token ripetuto all'infinito ("MC MC MC MC…"). Se ogni tool applicasse la propria soglia,
// dump-trascrizioni e check-archivio darebbero conteggi diversi sullo stesso run.

export function haParlatoUtile(t) {
  const s = (t || "").trim();
  if (!s) return false;
  const parole = s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  if (parole.length < 12) return false;                    // troppo corta per essere uno script
  if (new Set(parole).size / parole.length < 0.2) return false; // un token ripetuto = allucinazione su musica
  return true;
}
