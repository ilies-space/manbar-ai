// ASR adapters. Whisper (3s chunks via local proxy) is the accurate default;
// Chrome Web Speech (ar-SA) is the keyless fallback. Same interface.

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

export class WhisperChunkAdapter {
  constructor({ onText, onState, chunkMs = 3000 }) {
    this.name = "Whisper (3s chunks)";
    this.onText = onText; this.onState = onState;
    this.chunkMs = chunkMs;
    this.stream = null; this.recorder = null; this.analyser = null;
    this._busy = 0;
  }
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    src.connect(this.analyser);

    this._live = true;
    this.onState("listening");
    this._recordLoop();
  }
  _recordLoop() {
    if (!this._live) return;
    // one self-contained recording per chunk so every blob has a valid header
    const rec = new MediaRecorder(this.stream, { mimeType: "audio/webm;codecs=opus" });
    const parts = [];
    rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
    rec.onstop = async () => {
      this._recordLoop();                       // keep rolling
      const blob = new Blob(parts, { type: "audio/webm" });
      if (blob.size < 4000) return;             // near-silence
      this._busy++;
      this.onState("transcribing");
      try {
        const r = await fetch("/api/asr", { method: "POST", headers: { "Content-Type": "audio/webm" }, body: blob });
        const d = await r.json();
        if (d.text && d.text.trim()) this.onText(d.text.trim(), { final: true });
      } catch (e) {
        this.onState("error", String(e));
      } finally {
        this._busy--;
        if (this._live && !this._busy) this.onState("listening");
      }
    };
    rec.start();
    this.recorder = rec;
    setTimeout(() => { if (rec.state === "recording") rec.stop(); }, this.chunkMs);
  }
  stop() {
    this._live = false;
    if (this.recorder?.state === "recording") this.recorder.stop();
    this.stream?.getTracks().forEach(t => t.stop());
    this.onState("stopped");
  }
  level() {
    if (!this.analyser) return 0;
    const buf = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(buf);
    return buf.reduce((a, b) => a + b, 0) / buf.length / 255;
  }
}

export async function pickAdapter(opts) {
  try {
    const h = await fetch("/api/health").then(r => r.json());
    if (h.key) return new WhisperChunkAdapter(opts);
  } catch {}
  if (WebSpeechAdapter.supported()) return new WebSpeechAdapter(opts);
  return null;
}
