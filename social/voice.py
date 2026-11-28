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

Level (Muse, Nov 27): the track is turned up until its mean level over the whole video is about
-19.5 dB (it was about -24 to -25 dB), so the voice stays on top of the TikTok sound added at
upload. A look-ahead limiter keeps every peak at -1.5 dBFS, so nothing clips.

Facebook copy (Jeremy via Muse, Nov 27): each post also gets social/out/voice/<id>-fb.wav, the
same voice with HowLocal's own music bed low under it (see bed()), because a sound can't be added
to a Facebook post at upload the way it is on TikTok.
"""
import hashlib
import json
import math
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
MEAN = -19.5  # mean level of the whole track in dB, as ffmpeg's volumedetect reads it
MOST = 12  # never turn the voice up more than this many dB into the limiter
BED = -28  # the Facebook copy's music bed: its mean level between the lines, in dB
DUCK = 6  # how many dB the bed goes down while the voice speaks


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


def mean_db(np, x):
    return 10 * math.log10(float(np.mean(np.square(x, dtype=np.float64))) + 1e-20)


def limited(np, x, rate, look=0.005, release=0.08):
    """x with its loudest moments turned down smoothly so no sample goes past PEAK. The gain starts
    coming down `look` seconds before a peak and comes back up over about `release` seconds."""
    from numpy.lib.stride_tricks import sliding_window_view

    n = max(1, int(look * rate))
    need = np.minimum(1.0, PEAK / np.maximum(np.abs(x.astype(np.float64)), 1e-12))
    ahead = sliding_window_view(np.concatenate([need, np.ones(n)]), n + 1).min(axis=1)
    ramp = np.convolve(np.concatenate([np.full(n, ahead[0]), ahead]), np.full(n + 1, 1 / (n + 1)), mode="valid")
    keep = math.exp(-1 / (release * rate))
    gain, g = ramp.tolist(), 1.0
    for i, most in enumerate(gain):
        g = min(most, 1 - (1 - g) * keep)
        gain[i] = g
    return (x * np.asarray(gain)).astype(np.float32)


def louder(np, track, rate):
    """The track turned up until its mean level reaches MEAN (at most MOST dB), peaks held at PEAK.
    Returns the track and how many dB it was turned up."""
    base = track * (PEAK / (float(np.max(np.abs(track))) or 1.0))
    if mean_db(np, base) >= MEAN:
        return base, 0.0
    lo, hi = 0.0, float(MOST)
    if mean_db(np, limited(np, base * 10 ** (hi / 20), rate)) > MEAN:
        for _ in range(12):
            mid = (lo + hi) / 2
            if mean_db(np, limited(np, base * 10 ** (mid / 20), rate)) < MEAN:
                lo = mid
            else:
                hi = mid
    return limited(np, base * 10 ** (hi / 20), rate), hi


def moving_mean(np, x, k):
    """The mean of x over a window of k samples centered on each sample."""
    c = np.concatenate([[0.0], np.cumsum(x, dtype=np.float64)])
    i = np.arange(len(x))
    lo, hi = np.clip(i - k // 2, 0, len(x)), np.clip(i + k // 2 + 1, 0, len(x))
    return (c[hi] - c[lo]) / (hi - lo)


def filtered(np, x, rate, low=None, high=None):
    """x with the sound below `low` Hz and above `high` Hz rolled off. Done around the ring, so the
    end of the track flows into its start the way the video loops."""
    f = np.fft.rfftfreq(len(x), 1 / rate)
    mask = np.ones_like(f)
    if high:
        mask /= 1 + (f / high) ** 8
    if low:
        mask /= 1 + (low / np.maximum(f, 1e-6)) ** 8
    return np.fft.irfft(np.fft.rfft(x) * mask, len(x))


def bed(np, seconds, rate):
    """HowLocal's own music bed for the Facebook copies: an upbeat 120 BPM groove (kick on every beat,
    claps, off-beat hats, octave bass, chord stabs and a soft pad over C G Am F C G, a bar every 2 s),
    made here from sine waves and noise. It costs nothing, needs no license and nobody can claim it.
    The same bed goes under every post, and it's built in a ring so the loop at 12 s is seamless."""
    n = int(round(seconds * rate))
    rng = np.random.default_rng(7)
    kicks, claps, hats, bass, keys = (np.zeros(n) for _ in range(5))

    def put(track, sound, at):
        np.add.at(track, (int(round(at * rate)) + np.arange(len(sound))) % n, sound)

    def clock(length):
        return np.arange(int(length * rate)) / rate

    def hz(note):
        return 440 * 2 ** ((note - 69) / 12)

    def tone(freq, t):
        return np.sin(2 * np.pi * freq * t)

    tk, tc, th, te, ts, tp = clock(0.32), clock(0.18), clock(0.06), clock(0.22), clock(0.24), clock(2.0)
    kick = np.sin(2 * np.pi * np.cumsum(48 + 110 * np.exp(-tk * 28)) / rate) * np.exp(-tk * 9)
    clap = rng.standard_normal(len(tc)) * np.exp(-tc * 22)
    hat = rng.standard_normal(len(th)) * np.exp(-th * 70)
    chords = {"C": (36, [60, 64, 67]), "G": (43, [59, 62, 67]), "Am": (45, [60, 64, 69]), "F": (41, [60, 65, 69])}
    for bar, name in enumerate(["C", "G", "Am", "F", "C", "G"]):
        root, notes = chords[name]
        start = bar * 2.0
        for beat in range(4):
            put(kicks, kick, start + beat * 0.5)
            if beat % 2:
                put(claps, clap, start + beat * 0.5)
        for eighth in range(8):
            at = start + eighth * 0.25
            off = eighth % 2
            put(hats, (0.6 if off else 0.3) * hat, at)
            f = hz(root + 12 * off)
            put(bass, (tone(f, te) + 0.3 * tone(2 * f, te)) * np.minimum(1, te / 0.004) * np.exp(-te * 7), at)
            if off:
                stab = sum(tone(hz(m), ts) + 0.4 * tone(2 * hz(m), ts) * np.exp(-ts * 10) for m in notes)
                put(keys, stab * np.minimum(1, ts / 0.003) * np.exp(-ts * 9) / len(notes), at)
        pad = sum(tone(hz(m) * 0.999, tp) + tone(hz(m) * 1.001, tp) for m in notes) / (2 * len(notes))
        put(keys, 0.35 * pad * np.minimum(1, tp / 0.25) * np.minimum(1, (2.0 - tp) / 0.25), start)
    mix = (kicks + 0.45 * filtered(np, claps, rate, low=900, high=5000) + 0.25 * filtered(np, hats, rate, low=6000)
           + 0.55 * filtered(np, bass, rate, high=1200) + 0.5 * filtered(np, keys, rate, high=3500))
    return (mix * (10 ** (BED / 20) / np.sqrt(np.mean(mix ** 2)))).astype(np.float32)


def under(np, music, voice, rate):
    """The bed turned down DUCK dB while the voice speaks, from 150 ms before each line to 150 ms after."""
    talking = moving_mean(np, (np.abs(voice) > 0.02).astype(np.float64), int(0.3 * rate)) > 0
    turn = moving_mean(np, talking.astype(np.float64), int(0.15 * rate))
    return (music * (1 - (1 - 10 ** (-DUCK / 20)) * turn)).astype(np.float32)


def save(np, path, track, rate):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes((np.clip(track, -1, 1) * 32767).astype("<i2").tobytes())


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
    beds = {}  # and the music bed once per length
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
        track, boost = louder(np, track, rate)
        peak = 20 * math.log10(float(np.max(np.abs(track))) or 1e-9)
        print(f"  {job['id']}: level {mean_db(np, track):.1f} dB mean, {peak:.1f} dB peak (turned up {boost:.1f} dB)")
        save(np, out / f"{job['id']}.wav", track, rate)
        if (job["seconds"], rate) not in beds:
            beds[(job["seconds"], rate)] = bed(np, job["seconds"], rate)
        fb = limited(np, track + under(np, beds[(job["seconds"], rate)], track, rate), rate)
        print(f"  {job['id']}: Facebook copy with the music bed {mean_db(np, fb):.1f} dB mean")
        save(np, out / f"{job['id']}-fb.wav", fb, rate)


if __name__ == "__main__":
    main()
