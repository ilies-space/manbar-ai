// ASR adapters: pause-aware Whisper recording, with Web Speech as a keyless option.

import { apiResolve, apiRequest } from "./api.js";

export class WebSpeechAdapter {
  constructor({ onText, onState }) {
    this.name = "Web Speech (ar-SA)";
    this.onText = onText; this.onState = onState;
    this.rec = null;
  }
  static supported() {
    return "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
  }
  async start() {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.rec = new Rec();
    this.rec.lang = "ar-SA";
    this.rec.continuous = true;
    this.rec.interimResults = true;
    this.rec.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        this.onText(r[0].transcript.trim(), { final: r.isFinal });
      }
    };
    this.rec.onerror = e => this.onState("error", e.error);
    this.rec.onend = () => { if (this._live) this.rec.start(); }; // auto-restart
    this._live = true;
    this.rec.start();
    this.onState("listening");
  }
  stop() { this._live = false; this.rec?.stop(); this.onState("stopped"); }
  level() { return 0; }
}

// Adaptive VAD: tracks the ambient noise floor and uses hysteresis, so it
// works with quiet laptop mics AND noisy rooms (a fixed threshold silently
// discarded quiet speech and never found pauses in noisy ones).
export class SpeechWindow {
  constructor({ maxMs = 10000, minSpeechMs = 350, pauseMs = 700, floor = 0.004 } = {}) {
    Object.assign(this, { maxMs, minSpeechMs, pauseMs });
    this.floor = floor;          // ambient-noise EMA, learned live
    this.speaking = false;
    this.speechMs = 0;
    this.lastVoiceMs = 0;
  }
  get _on() { return Math.min(0.022, Math.max(0.0075, this.floor * 3.2)); }
  get _off() { return Math.min(0.016, Math.max(0.0055, this.floor * 2.0)); }
  sample(rms, elapsedMs) {
    // learn ambience only from clearly-quiet samples, and never let the
    // floor climb so high that real speech gets reclassified as noise
    if (rms < Math.max(this.floor * 1.6, 0.006)) {
      this.floor = Math.min(0.015, this.floor * 0.95 + rms * 0.05);
    }
    if (!this.speaking) {
      if (rms >= this._on) { this.speaking = true; this.lastVoiceMs = elapsedMs; this.speechMs += 100; }
    } else if (rms >= this._off) {
      this.lastVoiceMs = elapsedMs;
      this.speechMs += 100;
    }
    const pausedLongEnough = this.hasSpeech && elapsedMs - this.lastVoiceMs >= this.pauseMs;
    return elapsedMs >= this.maxMs || pausedLongEnough;
  }
  get hasSpeech() { return this.speechMs >= this.minSpeechMs; }
}

// Whisper invents filler phrases on silence/noise-only audio. Reject the
// classics outright, and anything where the VAD barely saw speech.
const FILLER_PHRASES = [
  /اشترك(وا)?\s+في\s+القناة/, /فعل(وا)?\s+ال[جز]رس/, /شكرا?ً?\s+على\s+المشاهدة/,
  /لا\s+تنس(وا|ى)?\s+الاشتراك/, /ترجمة\s+نانسي/, /نانسي\s+قنقر/,
  /subscribe\s+to/i, /thanks?\s+for\s+watching/i
];
const FILLER_WHOLE = [/^\s*\[?موسيقى\]?\s*$/, /^\s*\[?music\]?\s*$/i, /^\s*♪+\s*$/];
export function isHallucination(text, meta = {}) {
  // filler phrases only count when they ARE the utterance, not a mention
  if (FILLER_PHRASES.some(rx => rx.test(text)) && text.length <= 48) return true;
  if (FILLER_WHOLE.some(rx => rx.test(text))) return true;
  // reject only when the VAD saw almost no voiced audio at all
  if ((meta.speechMs ?? 600) < 600 && (meta.durMs || 0) > 3000) return true;
  return false;
}

export class WhisperChunkAdapter {
  constructor({ onText, onState, chunkMs = 10000 }) {
    this.name = "Whisper (pause-aware)";
    this.onText = onText; this.onState = onState;
    this.chunkMs = chunkMs;
    this.stream = null; this.recorder = null; this.analyser = null;
    this._session = 0;
    this._rms = 0;
  }
  async start() {
    const mimeType = ["audio/webm;codecs=opus", "audio/webm"].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("تسجيل WebM غير مدعوم في هذا المتصفح");
    this.mimeType = mimeType;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: {
      echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: { ideal: 1 }
    } });
    try {
      this.context = new AudioContext();
      await this.context.resume();
      this.source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.samples = new Float32Array(this.analyser.fftSize);
      this.source.connect(this.analyser);
      this._session++;
      this._pending = Promise.resolve();
      this._queued = 0;
      this._live = true;
      this.onState("listening");
      this._recordLoop();
    } catch (error) { this.stop(); throw error; }
  }
  _recordLoop() {
    if (!this._live) return;
    const session = this._session;
    const rec = new MediaRecorder(this.stream, { mimeType: this.mimeType, audioBitsPerSecond: 64000 });
    const parts = [];
    const window = new SpeechWindow({ maxMs: this.chunkMs, floor: this._floor || 0.004 });
    const started = performance.now();
    this._parts = parts; this._window = window; this._startedAt = started;
    rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
    rec.onstop = () => {
      clearInterval(timer);
      if (!this._live || session !== this._session) return;
      const blob = new Blob(parts, { type: "audio/webm" });
      const meta = { speechMs: window.speechMs, durMs: performance.now() - started };
      if (window.hasSpeech && blob.size) this._enqueue(blob, session, meta);
      this._recordLoop();
    };
    rec.onerror = () => { this.stop(); this.onState("error", "تعذّر تسجيل الصوت"); };
    rec.start();
    this.recorder = rec;
    const timer = this._sampleTimer = setInterval(() => {
      this.analyser.getFloatTimeDomainData(this.samples);
      this._rms = Math.sqrt(this.samples.reduce((sum, value) => sum + value * value, 0) / this.samples.length);
      this._floor = window.floor;
      if (window.sample(this._rms, performance.now() - started) && rec.state === "recording") rec.stop();
    }, 100);
  }
  _enqueue(blob, session, meta) {
    if (this._queued >= 3) {
      this.onState("error", "الاتصال بطيء — تم تجاوز مقطع");
      setTimeout(() => { if (this._live && session === this._session && !this._queued) this.onState("listening"); }, 1500);
      return;
    }
    this._queued++;
    this._pending = this._pending.then(async () => {
      if (!this._live || session !== this._session) return;
      const controller = new AbortController();
      this._request = controller;
      this.onState("transcribing");
      try {
        const data = await apiRequest("asr", {
          method: "POST", headers: { "Content-Type": "audio/webm" }, body: blob, signal: controller.signal
        });
        const text = (data.text || "").trim();
        if (this._live && session === this._session && text && !isHallucination(text, meta)) {
          await this.onText(text, { final: true });
        }
      } catch (error) {
        if (this._live && session === this._session) this.onState("error", String(error));
      } finally {
        if (session === this._session) {
          this._queued--;
          this._request = null;
          if (this._live && !this._queued) this.onState("listening");
        }
      }
    });
  }
  stop() {
    this._live = false;
    this._session++;
    clearInterval(this._sampleTimer);
    this._request?.abort();
    const teardown = () => {
      this.stream?.getTracks().forEach(t => t.stop());
      this.source?.disconnect();
      this.context?.close().catch(() => {});
    };
    if (this.recorder?.state === "recording") {
      // flush the unfinished window: the imam's last sentence still counts
      const parts = this._parts, win = this._window;
      const meta = { speechMs: win?.speechMs || 0, durMs: performance.now() - (this._startedAt || 0) };
      this.recorder.addEventListener("stop", () => {
        const blob = new Blob(parts || [], { type: "audio/webm" });
        if (win?.hasSpeech && blob.size) {
          apiRequest("asr", { method: "POST", headers: { "Content-Type": "audio/webm" }, body: blob })
            .then(d => {
              const text = (d.text || "").trim();
              if (text && !isHallucination(text, meta)) this.onText(text, { final: true });
            })
            .catch(() => {});
        }
        teardown();
      }, { once: true });
      this.recorder.stop();
    } else {
      teardown();
    }
    this._rms = 0;
    this.onState("stopped");
  }
  level() { return Math.min(1, this._rms * 4); }
}

export async function pickAdapter(opts) {
  const api = await apiResolve();
  if (api.key && api.asr) return new WhisperChunkAdapter(opts);
  if (WebSpeechAdapter.supported()) return new WebSpeechAdapter(opts);
  return null;
}
