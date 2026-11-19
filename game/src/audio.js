// Synthesised WebAudio sound for Cayo Verde: engine hum, two-tone police siren,
// three tiny radio stations (sequenced oscillator loops, no recorded music),
// gunshots, pickups and UI blips. Nothing is loaded from a file.
const STATIONS = [
  { name: 'RADIO SOL 98.4 — sunny pop', bpm: 112, bass: [0, 0, 7, 5], lead: [12, 16, 19, 16, 14, 12, 9, 7] },
  { name: 'VERDE FM 101.1 — street bass', bpm: 96, bass: [0, 0, 3, 10], lead: [12, 12, 15, 12, 10, 7, 10, 12] },
  { name: 'PLAYA 88.9 — slow sunset', bpm: 76, bass: [5, 3, 0, 7], lead: [19, 16, 12, 14, 16, 19, 21, 19] },
];

function midiToFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.station = 0;
    this.radioOn = true;
    this._engineOsc = null;
    this._engineGain = null;
    this._sirenOsc = null;
    this._sirenGain = null;
    this._sirenTimer = 0;
    this._beat = 0;
    this._nextNote = 0;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;
    this._master = ctx.createGain();
    this._master.gain.value = this.muted ? 0 : 0.5;
    this._master.connect(ctx.destination);
    this._engineOsc = ctx.createOscillator();
    this._engineOsc.type = 'sawtooth';
    this._engineOsc.frequency.value = 55;
    this._engineGain = ctx.createGain();
    this._engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass'; engineFilter.frequency.value = 420;
    this._engineOsc.connect(engineFilter);
    engineFilter.connect(this._engineGain);
    this._engineGain.connect(this._master);
    this._engineOsc.start();
    this._sirenOsc = ctx.createOscillator();
    this._sirenOsc.type = 'triangle';
    this._sirenOsc.frequency.value = 720;
    this._sirenGain = ctx.createGain();
    this._sirenGain.gain.value = 0;
    this._sirenOsc.connect(this._sirenGain);
    this._sirenGain.connect(this._master);
    this._sirenOsc.start();
    this._nextNote = ctx.currentTime + 0.1;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this._master) this._master.gain.value = muted ? 0 : 0.5;
  }

  cycleStation() {
    this.station = (this.station + 1) % STATIONS.length;
    this._beat = 0;
    return STATIONS[this.station].name;
  }

  stationName() { return STATIONS[this.station].name; }

  blip(freq = 880, dur = 0.09) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain); gain.connect(this._master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  cashSound() { this.blip(660, 0.08); setTimeout(() => this.blip(990, 0.14), 90); }

  gunshot() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const dur = 0.16;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    noise.connect(filter); filter.connect(gain); gain.connect(this._master);
    noise.start();
  }

  // Called every frame: engine pitch follows speed, siren wails while wanted,
  // and the radio scheduler plays the current station's loop.
  update(dt, speedKmh, wanted, playing) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this._engineGain) {
      const target = playing ? 0.03 + Math.min(0.11, speedKmh / 900) : 0;
      this._engineGain.gain.setTargetAtTime(target, t, 0.1);
      this._engineOsc.frequency.setTargetAtTime(52 + speedKmh * 1.1, t, 0.1);
    }
    if (this._sirenGain) {
      this._sirenTimer += dt;
      const high = Math.floor(this._sirenTimer * 1.6) % 2 === 0;
      this._sirenOsc.frequency.setTargetAtTime(high ? 920 : 660, t, 0.05);
      this._sirenGain.gain.setTargetAtTime(wanted > 0 && playing ? 0.045 : 0, t, 0.2);
    }
    if (!this.radioOn || !playing) return;
    const station = STATIONS[this.station];
    const stepDur = 60 / station.bpm / 2;
    while (this._nextNote < t + 0.15) {
      const step = this._beat % 8;
      const bassNote = 45 + station.bass[step % station.bass.length];
      const leadNote = 69 + station.lead[step];
      this._note(midiToFreq(bassNote), this._nextNote, stepDur * 0.95, 'triangle', 0.16);
      if (step % 2 === 0) this._note(midiToFreq(leadNote), this._nextNote, stepDur * 0.9, 'square', 0.05);
      this._nextNote += stepDur;
      this._beat += 1;
    }
  }

  _note(freq, when, dur, type, vol) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(gain); gain.connect(this._master);
    osc.start(when); osc.stop(when + dur + 0.02);
  }
}
