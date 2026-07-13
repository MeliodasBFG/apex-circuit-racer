export class ModernRaceAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineBus = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.engineOscillators = [];
    this.musicNodes = new Set();
    this.musicTimer = null;
    this.musicStopped = true;
    this.noiseBuffer = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = .76;

    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = .008;
    compressor.release.value = .22;
    this.master.connect(compressor).connect(this.ctx.destination);

    this.engineBus = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    this.engineBus.gain.value = .13;
    this.sfxBus.gain.value = .52;
    this.musicBus.gain.value = .18;
    this.engineBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);

    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 1050;
    engineFilter.Q.value = 1.45;
    engineFilter.connect(this.engineBus);

    for (const [type, gain, ratio] of [['sawtooth', .11, 1], ['triangle', .16, 2.01], ['sine', .08, .5]]) {
      const oscillator = this.ctx.createOscillator();
      const oscillatorGain = this.ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.value = 45 * ratio;
      oscillatorGain.gain.value = gain;
      oscillator.connect(oscillatorGain).connect(engineFilter);
      oscillator.start();
      this.engineOscillators.push({ oscillator, ratio });
    }

    const noiseLength = Math.floor(this.ctx.sampleRate * .4);
    this.noiseBuffer = this.ctx.createBuffer(1, noiseLength, this.ctx.sampleRate);
    const noise = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
  }

  update(kmh, throttle) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const fundamental = 38 + kmh * 1.18 + throttle * 28;
    for (const { oscillator, ratio } of this.engineOscillators) {
      oscillator.frequency.setTargetAtTime(fundamental * ratio, now, .045);
    }
    this.engineBus.gain.setTargetAtTime(.09 + throttle * .11 + Math.min(kmh / 900, .12), now, .07);
  }

  scheduleTone({ frequency, time, duration, gain, type = 'sine', lpf = 2200, attack = .008, destination = this.musicBus }) {
    const oscillator = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const envelope = this.ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(lpf, time);
    envelope.gain.setValueAtTime(.0001, time);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), time + attack);
    envelope.gain.exponentialRampToValueAtTime(.0001, time + duration);
    oscillator.connect(filter).connect(envelope).connect(destination);
    oscillator.start(time);
    oscillator.stop(time + duration + .03);
    this.musicNodes.add(oscillator);
    oscillator.onended = () => this.musicNodes.delete(oscillator);
  }

  scheduleKick(time) {
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(105, time);
    oscillator.frequency.exponentialRampToValueAtTime(42, time + .16);
    gain.gain.setValueAtTime(.22, time);
    gain.gain.exponentialRampToValueAtTime(.0001, time + .2);
    oscillator.connect(gain).connect(this.musicBus);
    oscillator.start(time);
    oscillator.stop(time + .21);
    this.musicNodes.add(oscillator);
    oscillator.onended = () => this.musicNodes.delete(oscillator);
  }

  scheduleHat(time, gainValue = .045) {
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = 'highpass';
    filter.frequency.value = 6200;
    gain.gain.setValueAtTime(gainValue, time);
    gain.gain.exponentialRampToValueAtTime(.0001, time + .055);
    source.connect(filter).connect(gain).connect(this.musicBus);
    source.start(time, 0, .06);
    this.musicNodes.add(source);
    source.onended = () => this.musicNodes.delete(source);
  }

  playMusic(profile) {
    this.init();
    this.stopMusic();
    this.musicStopped = false;
    const stepDuration = 60 / profile.bpm / 4;
    let nextStepTime = this.ctx.currentTime + .06;
    let step = 0;
    const intervals = profile.intervals;

    const schedule = () => {
      if (this.musicStopped) return;
      while (nextStepTime < this.ctx.currentTime + .12) {
        const phraseStep = step % 64;
        const beatStep = step % 16;
        const chordIndex = Math.floor(phraseStep / 16) % intervals.length;
        const root = profile.root * Math.pow(2, intervals[chordIndex] / 12);

        if (beatStep === 0 || beatStep === 8 || beatStep === 10) this.scheduleKick(nextStepTime);
        if (beatStep % 2 === 0) this.scheduleHat(nextStepTime, beatStep % 4 === 0 ? .036 : .024);

        if (beatStep % 4 === 0) {
          this.scheduleTone({ frequency: root, time: nextStepTime, duration: stepDuration * 3.45, gain: .12, type: 'triangle', lpf: 420 });
        }

        if (beatStep === 0) {
          for (const semitones of [12, 15, 19]) {
            this.scheduleTone({
              frequency: profile.root * Math.pow(2, (intervals[chordIndex] + semitones) / 12),
              time: nextStepTime,
              duration: stepDuration * 15,
              gain: .026,
              type: 'sawtooth',
              lpf: 1250,
              attack: .32
            });
          }
        }

        if (beatStep % 2 === 1 && phraseStep % 8 !== 7) {
          const arpeggio = [12, 19, 15, 22][Math.floor(phraseStep / 2) % 4];
          this.scheduleTone({
            frequency: profile.root * Math.pow(2, (intervals[chordIndex] + arpeggio) / 12),
            time: nextStepTime,
            duration: stepDuration * 1.35,
            gain: .024,
            type: 'sine',
            lpf: 1900,
            attack: .018
          });
        }

        step++;
        nextStepTime += stepDuration;
      }
      this.musicTimer = window.setTimeout(schedule, 25);
    };

    schedule();
  }

  stopMusic() {
    this.musicStopped = true;
    window.clearTimeout(this.musicTimer);
    this.musicTimer = null;
    for (const node of this.musicNodes) {
      try { node.stop(); } catch (_) {}
    }
    this.musicNodes.clear();
  }

  hit() {
    if (!this.ctx || this.muted) return;
    const time = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    gain.gain.setValueAtTime(.3, time);
    gain.gain.exponentialRampToValueAtTime(.0001, time + .18);
    source.connect(filter).connect(gain).connect(this.sfxBus);
    source.start(time, 0, .2);
  }

  itemSfx(id, activate = false) {
    if (!this.ctx || this.muted) return;
    const notes = { turbo: [260, 420, 680], shield: [520, 660, 820], grip: [300, 380, 470], pulse: [740, 430, 260] }[id] || [360, 520];
    notes.forEach((frequency, index) => {
      this.scheduleTone({
        frequency,
        time: this.ctx.currentTime + index * .065,
        duration: .16,
        gain: .16,
        type: activate ? 'sawtooth' : 'sine',
        lpf: 2600,
        destination: this.sfxBus
      });
    });
  }

  toggle() {
    this.init();
    this.muted = !this.muted;
    this.master.gain.setTargetAtTime(this.muted ? .0001 : .76, this.ctx.currentTime, .025);
    return this.muted;
  }
}
