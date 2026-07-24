#!/usr/bin/env python3
# transcribe.py — trascrittore cross-platform per brand-monitor.
# Prova mlx-whisper (Mac Apple Silicon, GPU) e in fallback faster-whisper (Mac Intel / Windows / CPU).
# Uso: python3 transcribe.py <file-audio-o-video> [lingua|auto] [cartella-output]
# Scrive "<nome> - trascrizione.txt" nella cartella di output.

import sys, os

def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Uso: transcribe.py <file> [lingua|auto] [outdir]\n"); sys.exit(1)
    infile = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else "auto"
    outdir = sys.argv[3] if len(sys.argv) > 3 else (os.path.dirname(infile) or ".")
    name = os.path.splitext(os.path.basename(infile))[0]
    out = os.path.join(outdir, name + " - trascrizione.txt")

    text = None

    # 1) mlx-whisper — Mac Apple Silicon (usa la GPU)
    #    modello via env BRAND_MONITOR_WHISPER_MLX (default: large-v3-turbo)
    try:
        import mlx_whisper
        kw = {} if lang == "auto" else {"language": lang}
        mlx_model = os.environ.get("BRAND_MONITOR_WHISPER_MLX", "mlx-community/whisper-large-v3-turbo")
        r = mlx_whisper.transcribe(infile, path_or_hf_repo=mlx_model, **kw)
        text = (r.get("text") or "").strip()
    except Exception:
        text = None

    # 2) faster-whisper — Mac Intel / Windows / qualsiasi CPU
    if text is None:
        try:
            from faster_whisper import WhisperModel
            model_name = os.environ.get("BRAND_MONITOR_WHISPER", "small")
            model = WhisperModel(model_name, device="cpu", compute_type="int8")
            segments, _ = model.transcribe(infile, language=None if lang == "auto" else lang)
            text = " ".join(s.text.strip() for s in segments).strip()
        except Exception as e:
            sys.stderr.write("Trascrizione non disponibile (manca mlx-whisper o faster-whisper): %s\n" % e)
            sys.exit(2)

    with open(out, "w", encoding="utf-8") as f:
        f.write((text or "") + "\n")
    print(out)

if __name__ == "__main__":
    main()
