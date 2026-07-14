// Sound Engine using Web Audio API for procedural soundscapes
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.masterToneFilter = null;
    this.masterCompressor = null;
    this.droneOsc = null;
    this.secondaryOsc = null;
    this.droneFilter = null;
    this.secondaryFilter = null;
    this.droneGain = null;
    this.secondaryGain = null;
    this.lfo = null;
    this.isMuted = true;
    this.chimeInterval = null;
    this.textureInterval = null;
    
    // Config for procedural music
    this.currentBaseFreq = 60;
    this.currentChimeFreq = 120;
    this.currentLfoFreq = 0.05;
    this.currentEraIndex = 0;
    this.currentEraType = 'drone';
    this.currentChimeDelay = 5000;
    this.currentScale = [1, 1.125, 1.25, 1.5, 1.667, 2];
  }

  init() {
    if (this.ctx) return;
    
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.masterToneFilter = this.ctx.createBiquadFilter();
    this.masterToneFilter.type = 'lowpass';
    this.masterToneFilter.frequency.setValueAtTime(6800, this.ctx.currentTime);
    this.masterToneFilter.Q.setValueAtTime(0.55, this.ctx.currentTime);
    this.masterCompressor = this.ctx.createDynamicsCompressor();
    this.masterCompressor.threshold.setValueAtTime(-24, this.ctx.currentTime);
    this.masterCompressor.knee.setValueAtTime(18, this.ctx.currentTime);
    this.masterCompressor.ratio.setValueAtTime(4, this.ctx.currentTime);
    this.masterCompressor.attack.setValueAtTime(0.012, this.ctx.currentTime);
    this.masterCompressor.release.setValueAtTime(0.28, this.ctx.currentTime);
    this.masterGain.connect(this.masterToneFilter);
    this.masterToneFilter.connect(this.masterCompressor);
    this.masterCompressor.connect(this.ctx.destination);
    
    this.startAmbientDrone();
    this.startChimeLoop();
    this.startTextureLoop();
  }

  toggleMute() {
    if (!this.ctx) this.init();
    
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    
    this.isMuted = !this.isMuted;
    
    if (this.isMuted) {
      this.masterGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
    } else {
      this.masterGain.gain.linearRampToValueAtTime(0.24, this.ctx.currentTime + 1.0);
    }
    
    return this.isMuted;
  }

  updateEra(ambientStyle, eraIndex = 0) {
    if (!ambientStyle) return;
    
    this.currentBaseFreq = ambientStyle.baseFreq || 60;
    this.currentChimeFreq = ambientStyle.chimeFreq || 120;
    this.currentLfoFreq = ambientStyle.lfoFreq || 0.05;
    this.currentEraIndex = eraIndex;
    this.currentEraType = ambientStyle.type || 'drone';
    this.applyEraTuning();
    
    if (!this.ctx) return;
    
    // Smoothly transition frequencies
    const now = this.ctx.currentTime;
    if (this.droneOsc) {
      this.droneOsc.frequency.exponentialRampToValueAtTime(this.currentBaseFreq, now + 2);
    }
    if (this.secondaryOsc) {
      const harmonic = this.currentEraType === 'bell' ? 1.5 : this.currentEraType === 'sine' ? 2 : 1.333;
      this.secondaryOsc.frequency.exponentialRampToValueAtTime(this.currentBaseFreq * harmonic, now + 2);
    }
    if (this.lfo) {
      this.lfo.frequency.linearRampToValueAtTime(this.currentLfoFreq, now + 1);
    }
    if (this.droneFilter) {
      this.droneFilter.type = this.currentEraType === 'wind' ? 'bandpass' : 'lowpass';
      this.droneFilter.frequency.linearRampToValueAtTime(this.getFilterFrequency(), now + 1.2);
      this.droneFilter.Q.linearRampToValueAtTime(this.getFilterQ(), now + 1.2);
    }
    if (this.secondaryFilter) {
      this.secondaryFilter.frequency.linearRampToValueAtTime(
        this.currentEraType === 'sine' ? 520 : 1150,
        now + 1.2
      );
      this.secondaryFilter.Q.linearRampToValueAtTime(
        this.currentEraType === 'sine' ? 0.55 : 0.8,
        now + 1.2
      );
    }
    if (this.droneGain) {
      this.droneGain.gain.linearRampToValueAtTime(this.getDroneLevel(), now + 1.5);
    }
    if (this.secondaryGain) {
      this.secondaryGain.gain.linearRampToValueAtTime(this.getSecondaryLevel(), now + 1.5);
    }
    if (this.droneOsc) {
      this.droneOsc.type = this.getWaveType(0);
    }
    if (this.secondaryOsc) {
      this.secondaryOsc.type = this.getWaveType(1);
    }
    
    // Trigger a sweeping transition sound
    this.playTransitionSound();
    this.playEraMotif();
  }

  applyEraTuning() {
    const delayBase = {
      drone: 5200,
      wind: 6200,
      bell: 4400,
      sine: 3200
    }[this.currentEraType] || 5000;

    this.currentChimeDelay = Math.max(2600, delayBase - (this.currentEraIndex % 5) * 350);
    this.currentScale = this.getScaleForEra();
  }

  startAmbientDrone() {
    const now = this.ctx.currentTime;
    
    // Main low drone oscillator
    this.droneOsc = this.ctx.createOscillator();
    this.droneOsc.type = this.getWaveType(0);
    this.droneOsc.frequency.setValueAtTime(this.currentBaseFreq, now);

    this.secondaryOsc = this.ctx.createOscillator();
    this.secondaryOsc.type = this.getWaveType(1);
    this.secondaryOsc.frequency.setValueAtTime(this.currentBaseFreq * 1.333, now);
    
    // Lowpass filter to make it soft and warm
    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneFilter.type = this.currentEraType === 'wind' ? 'bandpass' : 'lowpass';
    this.droneFilter.frequency.setValueAtTime(this.getFilterFrequency(), now);
    this.droneFilter.Q.setValueAtTime(this.getFilterQ(), now);

    this.secondaryFilter = this.ctx.createBiquadFilter();
    this.secondaryFilter.type = 'lowpass';
    this.secondaryFilter.frequency.setValueAtTime(
      this.currentEraType === 'sine' ? 520 : 1150,
      now
    );
    this.secondaryFilter.Q.setValueAtTime(0.55, now);
    
    // Gain for drone
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(this.getDroneLevel(), now);

    this.secondaryGain = this.ctx.createGain();
    this.secondaryGain.gain.setValueAtTime(this.getSecondaryLevel(), now);
    
    // LFO to modulate drone volume (create a breathing effect)
    this.lfo = this.ctx.createOscillator();
    this.lfo.frequency.setValueAtTime(this.currentLfoFreq, now);
    
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(0.03, now);
    
    // Connections
    this.lfo.connect(lfoGain);
    lfoGain.connect(this.droneGain.gain);
    
    this.droneOsc.connect(this.droneFilter);
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.masterGain);
    this.secondaryOsc.connect(this.secondaryFilter);
    this.secondaryFilter.connect(this.secondaryGain);
    this.secondaryGain.connect(this.masterGain);
    
    // Start oscillators
    this.droneOsc.start(now);
    this.secondaryOsc.start(now);
    this.lfo.start(now);
  }

  startChimeLoop() {
    // Randomly play chime bells matching the era's pentatonic scale
    const playNext = () => {
      const delay = this.currentChimeDelay + Math.random() * (2600 + this.currentEraIndex * 35);
      this.chimeInterval = setTimeout(() => {
        if (!this.isMuted && this.ctx && this.ctx.state !== 'suspended') {
          this.playChime();
        }
        playNext();
      }, delay);
    };
    
    playNext();
  }

  startTextureLoop() {
    const playNext = () => {
      const delay = 7000 + Math.random() * 5000;
      this.textureInterval = setTimeout(() => {
        if (!this.isMuted && this.ctx && this.ctx.state !== 'suspended') {
          this.playTextureAccent();
        }
        playNext();
      }, delay);
    };

    playNext();
  }

  // Plays a synthesized bronze chime bell or zen bowl sound
  playChime() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    
    const scale = this.currentScale;
    const mult = scale[Math.floor(Math.random() * scale.length)];
    const isModernAmbient = this.currentEraType === 'sine';
    const freq = isModernAmbient
      ? Math.min(this.currentChimeFreq * mult, 560)
      : this.currentChimeFreq * mult;
    
    // Fundamental tone
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    
    // Overtone 1 (creates a bell-like metallic chime)
    const overtone1 = this.ctx.createOscillator();
    overtone1.type = this.currentEraType === 'bell' ? 'triangle' : 'sine';
    overtone1.frequency.setValueAtTime(freq * 1.503, now);
    
    // Overtone 2
    const overtone2 = this.ctx.createOscillator();
    overtone2.type = 'sine';
    overtone2.frequency.setValueAtTime(freq * 2.001, now);
    
    // Gains
    const gain = this.ctx.createGain();
    const over1Gain = this.ctx.createGain();
    const over2Gain = this.ctx.createGain();
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(
      this.currentEraType === 'bell' ? 0.11 : isModernAmbient ? 0.026 : 0.065,
      now + (isModernAmbient ? 0.11 : 0.05)
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + (isModernAmbient ? 2.2 : this.currentEraType === 'wind' ? 2.3 : 4.0)
    );
    
    over1Gain.gain.setValueAtTime(isModernAmbient ? 0.007 : 0.025, now);
    over1Gain.gain.exponentialRampToValueAtTime(0.0001, now + (isModernAmbient ? 1.8 : 2.5));
    
    over2Gain.gain.setValueAtTime(isModernAmbient ? 0.0025 : 0.012, now);
    over2Gain.gain.exponentialRampToValueAtTime(0.0001, now + (isModernAmbient ? 1.2 : 1.5));
    
    // Reverb simulation (small highpass/bandpass noise burst + delay)
    // Connecting
    osc.connect(gain);
    overtone1.connect(over1Gain);
    overtone2.connect(over2Gain);
    
    gain.connect(this.masterGain);
    over1Gain.connect(this.masterGain);
    over2Gain.connect(this.masterGain);
    
    osc.start(now);
    overtone1.start(now);
    overtone2.start(now);
    
    osc.stop(now + 4.5);
    overtone1.stop(now + 4.5);
    overtone2.stop(now + 4.5);
  }

  playTextureAccent() {
    if (!this.ctx) return;

    if (this.currentEraType === 'wind') {
      this.playFilteredNoise(0.022, 1.2, 'bandpass', 550 + this.currentEraIndex * 12);
    } else if (this.currentEraType === 'bell') {
      this.playChime();
      setTimeout(() => this.playChime(), 240);
    } else if (this.currentEraType === 'sine') {
      this.playDigitalPulse();
    } else {
      this.playLowPulse();
    }
  }

  playEraMotif() {
    if (!this.ctx || this.isMuted) return;

    if (this.currentEraType === 'wind') {
      this.playFilteredNoise(0.02, 0.9, 'bandpass', 380 + this.currentEraIndex * 18);
    } else if (this.currentEraType === 'bell') {
      this.playChime();
    } else if (this.currentEraType === 'sine') {
      this.playDigitalPulse();
    } else {
      this.playLowPulse();
    }
  }

  playFilteredNoise(level, duration, filterType, filterFreq) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.Q.setValueAtTime(filterType === 'bandpass' ? 1.1 : 0.8, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(now);
    source.stop(now + duration);
  }

  playDigitalPulse() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const toneFilter = this.ctx.createBiquadFilter();
    toneFilter.type = 'lowpass';
    toneFilter.frequency.setValueAtTime(720, now);
    toneFilter.Q.setValueAtTime(0.5, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.018, now + 0.14);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.9);
    toneFilter.connect(gain);
    gain.connect(this.masterGain);

    [0.5, 1].forEach((ratio, index) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(Math.min(520, this.currentChimeFreq * ratio), now);
      const layerGain = this.ctx.createGain();
      layerGain.gain.setValueAtTime(index === 0 ? 0.72 : 0.34, now);
      osc.connect(layerGain);
      layerGain.connect(toneFilter);
      osc.start(now);
      osc.stop(now + 2.0);
    });
  }

  playLowPulse() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(this.currentBaseFreq * 0.5, now);
    osc.frequency.exponentialRampToValueAtTime(this.currentBaseFreq * 0.75, now + 0.7);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.03, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 1.2);
  }

  getWaveType(layer) {
    if (this.currentEraType === 'bell') return layer === 0 ? 'triangle' : 'sine';
    if (this.currentEraType === 'wind') return 'sine';
    if (this.currentEraType === 'sine') return 'sine';
    return 'sine';
  }

  getFilterFrequency() {
    const base = {
      drone: 220,
      wind: 420,
      bell: 640,
      sine: 520
    }[this.currentEraType] || 260;
    return base + (this.currentEraIndex % 7) * 35;
  }

  getFilterQ() {
    return {
      drone: 0.8,
      wind: 4.2,
      bell: 2.5,
      sine: 0.55
    }[this.currentEraType] || 1.0;
  }

  getDroneLevel() {
    return {
      drone: 0.052,
      wind: 0.03,
      bell: 0.04,
      sine: 0.021
    }[this.currentEraType] || 0.04;
  }

  getSecondaryLevel() {
    return {
      drone: 0.014,
      wind: 0.008,
      bell: 0.012,
      sine: 0.006
    }[this.currentEraType] || 0.012;
  }

  getScaleForEra() {
    const scaleSets = [
      [1, 1.125, 1.25, 1.5, 1.667, 2],
      [1, 1.2, 1.333, 1.5, 1.8, 2],
      [1, 1.167, 1.333, 1.583, 1.778, 2],
      [1, 1.25, 1.414, 1.5, 1.75, 2],
      [1, 1.125, 1.333, 1.6, 1.875, 2]
    ];
    return scaleSets[this.currentEraIndex % scaleSets.length];
  }

  // Play a pluck sound (resembling a Guqin or Pipa) on click
  playPluck() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    
    const freq = this.currentChimeFreq * (0.5 + Math.random() * 0.5); // lower pluck
    
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    
    // Lowpass filter sweep for pluck dampening
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(2, now);
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.8);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(now);
    osc.stop(now + 1.5);
  }

  playTransitionSound() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 1.5);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.045, now + 0.3);
    gain.gain.linearRampToValueAtTime(0, now + 1.5);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(now);
    osc.stop(now + 1.6);
  }

  // Clean up
  destroy() {
    if (this.chimeInterval) clearTimeout(this.chimeInterval);
    if (this.textureInterval) clearTimeout(this.textureInterval);
    if (this.droneOsc) this.droneOsc.stop();
    if (this.secondaryOsc) this.secondaryOsc.stop();
    if (this.lfo) this.lfo.stop();
  }
}

export const sound = new SoundEngine();
