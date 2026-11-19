// Sound, synthesized live with WebAudio — no audio files, no network.
// Engine hum, sirens, gunshots, pickup chimes, mission jingles and a
// three-station synth radio that actually plays a bassline.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.station = 0;
    this.musicTimer = 0;
    this.nextNote = 0;
    this.step = 0;
    this.muted = false;
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    // engine: two detuned saws through a lowpass
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineOsc2 = this.ctx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.value = 28;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420;
    this.engineOsc.connect(lp); engineOsc2.connect(lp);
    lp.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(); engineOsc2.start();
    this._engineOsc2 = engineOsc2;
    // siren: alternating two-tone
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this._sirenOn = false;
    this._sirenT = 0;
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setEngine(speed01, inCar) {
    if (!this.ctx) return;
    const target = inCar ? 0.05 + speed01 * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    const f = 52 + speed01 * 130;
    this.engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.1);
    this._engineOsc2.frequency.setTargetAtTime(f / 2, this.ctx.currentTime, 0.1);
  }
  setSiren(on) {
    if (!this.ctx) return;
    this._sirenOn = on;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
  }
  update(dt) {
    if (!this.ctx || this.muted) return;
    if (this._sirenOn) {
      this._sirenT += dt;
      const f = (Math.floor(this._sirenT * 1.6) % 2 === 0) ? 660 : 880;
      this.sirenOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
    }
    // radio: a 16-step loop, bass + sparkle, tempo per station
    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      const tempos = [0.21, 0.16, 0.26];
      this.musicTimer = tempos[this.station];
      this.playStep(this.step);
      this.step = (this.step + 1) % 32;
    }
  }
  playStep(step) {
    if (!this.ctx) return;
    const basslines = [
      [55, 0, 55, 0, 65.4, 0, 49, 0, 55, 0, 55, 0, 73.4, 0, 65.4, 0],
      [41.2, 41.2, 0, 49, 0, 41.2, 0, 55, 41.2, 0, 49, 0, 58.3, 0, 55, 0],
      [65.4, 0, 82.4, 0, 65.4, 0, 98, 0, 82.4, 0, 65.4, 0, 73.4, 0, 65.4, 0],
    ];
    const line = basslines[this.station];
    const note = line[step % 16];
    if (note) this.blip(note, 0.5, 'triangle', 0.5);
    if (step % 4 === 0) this.blip(880 + (step % 8) * 40, 0.08, 'sine', 0.12);
    if (step % 2 === 1) this.noise(0.03, 0.05);
  }
  blip(freq, dur, type = 'sine', vol = 0.3) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.musicGain);
    o.start(); o.stop(this.ctx.currentTime + dur);
  }
  noise(dur, vol) {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g); g.connect(this.master);
    src.start();
  }
  sfx(name) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const env = (g, v, dur) => {
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    };
    if (name === 'shot') {
      this.noise(0.16, 0.5);
      this.blip(160, 0.1, 'square', 0.25);
    } else if (name === 'punch') {
      this.noise(0.08, 0.3);
    } else if (name === 'pickup') {
      this.blip(660, 0.12, 'sine', 0.3);
      setTimeout(() => this.blip(990, 0.18, 'sine', 0.3), 90);
    } else if (name === 'mission') {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.28, 'triangle', 0.32), i * 110));
    } else if (name === 'crash') {
      this.noise(0.3, 0.45);
      this.blip(70, 0.25, 'sawtooth', 0.3);
    } else if (name === 'busted') {
      [440, 415, 392, 370].forEach((f, i) => setTimeout(() => this.blip(f, 0.35, 'sawtooth', 0.25), i * 160));
    } else if (name === 'enter') {
      this.blip(220, 0.1, 'triangle', 0.25);
      setTimeout(() => this.blip(330, 0.12, 'triangle', 0.25), 80);
    } else if (name === 'cash') {
      [880, 1174, 1568].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'sine', 0.28), i * 70));
    }
  }
  cycleStation() {
    this.station = (this.station + 1) % 3;
    this.step = 0;
    return this.station;
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }
}
