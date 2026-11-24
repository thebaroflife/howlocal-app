#!/usr/bin/env python3
"""The spoken track for HowLocal's TikTok videos (Jeremy, Nov 23: free, no paid tools).

The voice is Kokoro (open source, Apache-2.0). It runs on this machine: no account, no API,
nothing to pay. render.mjs calls this script; it isn't usually run by hand.

    python3 social/voice.py social/out/voice/lines.json

lines.json is a list of posts: [{"id": "...", "seconds": 12, "lines": [{"text": "...", "at": 0.3}]}].
Each post gets social/out/voice/<id>.wav, as long as the video, with every line starting at its
time. Each line's sounds are printed so a misread place name is easy to spot: fix it with a
respelling in social/voice.json ("say_like"), e.g. "San Pedro" -> "San Peedro".

Setup (once per machine): pip install --break-system-packages kokoro-onnx==0.6.1
The model files (about 350 MB) download on first use into ~/.cache/howlocal-voice
(or $HOWLOCAL_VOICE_DIR) and are checked against the hashes below.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
MODEL_FILES = {
    "kokoro-v1.0.onnx": "7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5",
    "voices-v1.0.bin": "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
}
PEAK = 10 ** (-1.5 / 20)  # loudest point of the track: -1.5 dBFS


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def model_dir():
    folder = Path(os.environ.get("HOWLOCAL_VOICE_DIR") or Path.home() / ".cache" / "howlocal-voice")
    folder.mkdir(parents=True, exist_ok=True)
    for name, want in MODEL_FILES.items():
        path = folder / name
        if path.exists() and sha256(path) == want:
            continue
        print(f"voice: downloading {name} ...", flush=True)
        part = path.with_suffix(path.suffix + ".part")
        subprocess.run(["curl", "-sSfL", "--retry", "3", "--max-time", "600", "-o", str(part), RELEASE + name], check=True)
        got = sha256(part)
        if got != want:
            part.unlink()
            sys.exit(f"voice: {name} didn't match its checksum ({got}); not using it")
        part.replace(path)
    return folder


def sounds(text, say_like, tokenizer):
    """The line as the voice will say it. say_like maps a name to a respelling ("San Peedro") or,
    when respelling isn't enough, to exact sounds between slashes ("/səpˈʌlvədə/")."""
    text = text.replace("&", " and ")
    exact = {}
    for word, say in say_like.items():
        if say.startswith("/") and say.endswith("/"):
            exact[word] = say.strip("/")
        else:
            text = re.sub(rf"\b{re.escape(word)}\b", say, text)
    if not exact:
        return tokenizer.phonemize(text, "en-us")
    parts, last = [], 0
    for m in re.finditer(r"\b(" + "|".join(map(re.escape, exact)) + r")\b", text):
        if text[last:m.start()].strip():
            parts.append(tokenizer.phonemize(text[last:m.start()], "en-us"))
        parts.append(exact[m.group(1)])
        last = m.end()
    if text[last:].strip():
        parts.append(tokenizer.phonemize(text[last:], "en-us"))
    return re.sub(r"\s+([.,?!])", r"\1", " ".join(p.strip() for p in parts))


def main():
    jobs = json.loads(Path(sys.argv[1]).read_text())
    settings = json.loads((HERE / "voice.json").read_text())
    try:
        import numpy as np
        from kokoro_onnx import Kokoro
    except ImportError:
        sys.exit("voice: Kokoro isn't installed. Run: pip install --break-system-packages kokoro-onnx==0.6.1")

    folder = model_dir()
    kokoro = Kokoro(str(folder / "kokoro-v1.0.onnx"), str(folder / "voices-v1.0.bin"))
    out = Path(sys.argv[1]).parent
    said = {}  # the same sentence is only made once
    for job in jobs:
        rate = None
        clips = []
        for line in job["lines"]:
            spoken = sounds(line["text"], settings.get("say_like", {}), kokoro.tokenizer)
            if spoken not in said:
                samples, sr = kokoro.create(spoken, voice=settings["voice"], speed=settings.get("speed", 1.0), lang="en-us", is_phonemes=True)
                said[spoken] = (np.asarray(samples, dtype=np.float32), sr)
            samples, sr = said[spoken]
            rate = rate or sr
            clips.append((line, samples))
            end = line["at"] + len(samples) / sr
            print(f"  {job['id']}: {line['at']:.1f}-{end:.1f} s \"{line['text']}\"  sounds: {spoken}")
            if line.get("by") and end > line["by"]:
                sys.exit(f"voice: {job['id']}: \"{line['text']}\" runs to {end:.1f} s, past {line['by']} s. Shorten it.")
        track = np.zeros(int(round(job["seconds"] * rate)), dtype=np.float32)
        for (line, samples), nxt in zip(clips, clips[1:] + [(None, None)]):
            start = int(round(line["at"] * rate))
            if nxt[0] and start + len(samples) > int(round(nxt[0]["at"] * rate)):
                sys.exit(f"voice: {job['id']}: \"{line['text']}\" is still playing when the next line starts. Shorten it.")
            if start + len(samples) > len(track):
                sys.exit(f"voice: {job['id']}: \"{line['text']}\" runs past the end of the video. Shorten it.")
            track[start:start + len(samples)] += samples
        loudest = float(np.max(np.abs(track))) or 1.0
        pcm = (np.clip(track * (PEAK / loudest), -1, 1) * 32767).astype("<i2")
        with wave.open(str(out / f"{job['id']}.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    main()
