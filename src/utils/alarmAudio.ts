import type { SeverityLevel } from '../types';

let activeAudioCtx: AudioContext | null = null;
let repeatTimer: number | null = null;
let isPlaying = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!activeAudioCtx) {
    activeAudioCtx = new AudioCtx();
  }
  if (activeAudioCtx.state === 'suspended') {
    activeAudioCtx.resume().catch(() => {});
  }
  return activeAudioCtx;
}

/**
 * Pre-warms and unlocks Web Audio API on the user's first gesture so incoming
 * emergency alarms immediately sound at full power without autoplay blocking.
 */
export function unlockAlarmAudio() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

export function triggerDeviceVibration(severity: SeverityLevel) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      if (severity === 'EMERGENCY') {
        navigator.vibrate([500, 150, 500, 150, 800]);
      } else if (severity === 'HIGH') {
        navigator.vibrate([300, 120, 300]);
      } else {
        navigator.vibrate([180]);
      }
    } catch {
      // Ignore browser/device restriction
    }
  }
}

function playSingleBurst(severity: SeverityLevel, volume: number) {
  const ctx = getAudioContext();
  if (!ctx) return;

  // DynamicsCompressor maximises loudness cleanly without speaker clipping
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-16, ctx.currentTime);
  compressor.knee.setValueAtTime(10, ctx.currentTime);
  compressor.ratio.setValueAtTime(12, ctx.currentTime);
  compressor.attack.setValueAtTime(0.002, ctx.currentTime);
  compressor.release.setValueAtTime(0.12, ctx.currentTime);

  const masterGain = ctx.createGain();
  const safeVol = Math.min(1.0, Math.max(0.1, volume));
  // 1.35x pre-compressor drive pushes full RMS output on laptops & phones
  masterGain.gain.setValueAtTime(safeVol * 1.35, ctx.currentTime);

  compressor.connect(masterGain);
  masterGain.connect(ctx.destination);

  const now = ctx.currentTime;

  if (severity === 'EMERGENCY') {
    // High-power 3-oscillator industrial emergency klaxon (4 rapid sweeps per burst)
    for (let i = 0; i < 4; i++) {
      const start = now + i * 0.38;

      // 1. Core sawtooth sweep
      const oscMain = ctx.createOscillator();
      const envMain = ctx.createGain();
      oscMain.type = 'sawtooth';
      oscMain.frequency.setValueAtTime(840, start);
      oscMain.frequency.linearRampToValueAtTime(1420, start + 0.16);
      oscMain.frequency.linearRampToValueAtTime(760, start + 0.34);

      envMain.gain.setValueAtTime(0.01, start);
      envMain.gain.linearRampToValueAtTime(0.95, start + 0.02);
      envMain.gain.setValueAtTime(0.95, start + 0.28);
      envMain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

      oscMain.connect(envMain);
      envMain.connect(compressor);
      oscMain.start(start);
      oscMain.stop(start + 0.36);

      // 2. Piercing upper harmonic square wave (human ear sensitivity peak 1.6-2.5 kHz)
      const oscHigh = ctx.createOscillator();
      const envHigh = ctx.createGain();
      oscHigh.type = 'square';
      oscHigh.frequency.setValueAtTime(1680, start);
      oscHigh.frequency.linearRampToValueAtTime(2460, start + 0.16);
      oscHigh.frequency.linearRampToValueAtTime(1520, start + 0.34);

      envHigh.gain.setValueAtTime(0.01, start);
      envHigh.gain.linearRampToValueAtTime(0.65, start + 0.02);
      envHigh.gain.setValueAtTime(0.65, start + 0.28);
      envHigh.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

      oscHigh.connect(envHigh);
      envHigh.connect(compressor);
      oscHigh.start(start);
      oscHigh.stop(start + 0.36);

      // 3. Sub-harmonic foundation tone
      const oscSub = ctx.createOscillator();
      const envSub = ctx.createGain();
      oscSub.type = 'triangle';
      oscSub.frequency.setValueAtTime(420, start);
      oscSub.frequency.linearRampToValueAtTime(710, start + 0.16);
      oscSub.frequency.linearRampToValueAtTime(380, start + 0.34);

      envSub.gain.setValueAtTime(0.01, start);
      envSub.gain.linearRampToValueAtTime(0.75, start + 0.02);
      envSub.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

      oscSub.connect(envSub);
      envSub.connect(compressor);
      oscSub.start(start);
      oscSub.stop(start + 0.36);
    }
  } else if (severity === 'HIGH') {
    // Urgent high-power dual-oscillator alert
    for (let i = 0; i < 3; i++) {
      const start = now + i * 0.32;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const env = ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(980, start);
      osc1.frequency.setValueAtTime(740, start + 0.14);

      osc2.type = 'square';
      osc2.frequency.setValueAtTime(1960, start);
      osc2.frequency.setValueAtTime(1480, start + 0.14);

      env.gain.setValueAtTime(0.01, start);
      env.gain.linearRampToValueAtTime(0.85, start + 0.02);
      env.gain.setValueAtTime(0.85, start + 0.22);
      env.gain.exponentialRampToValueAtTime(0.001, start + 0.29);

      osc1.connect(env);
      osc2.connect(env);
      env.connect(compressor);

      osc1.start(start);
      osc2.start(start);
      osc1.stop(start + 0.3);
      osc2.stop(start + 0.3);
    }
  } else {
    // Louder, crisp advisory dual-tone chime for WARNING / test
    for (let i = 0; i < 2; i++) {
      const start = now + i * 0.26;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const env = ctx.createGain();

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(880, start);
      osc1.frequency.setValueAtTime(1174.66, start + 0.12);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1760, start);
      osc2.frequency.setValueAtTime(2349.32, start + 0.12);

      env.gain.setValueAtTime(0.01, start);
      env.gain.linearRampToValueAtTime(0.75, start + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, start + 0.24);

      osc1.connect(env);
      osc2.connect(env);
      env.connect(compressor);

      osc1.start(start);
      osc2.start(start);
      osc1.stop(start + 0.25);
      osc2.stop(start + 0.25);
    }
  }
}

export function stopAlarmAudio() {
  isPlaying = false;
  if (repeatTimer !== null) {
    window.clearInterval(repeatTimer);
    repeatTimer = null;
  }
}

export function startEmergencyAlarmLoop(params: {
  severity: SeverityLevel;
  volume: number;
  maxRepeats: number;
  onCycle?: (count: number) => void;
}) {
  stopAlarmAudio();
  isPlaying = true;
  const repeats = Math.min(10, Math.max(1, params.maxRepeats));
  let count = 1;

  playSingleBurst(params.severity, params.volume);
  triggerDeviceVibration(params.severity);
  params.onCycle?.(count);

  if (repeats === 1 || params.severity === 'NORMAL') {
    isPlaying = false;
    return;
  }

  const intervalMs = params.severity === 'EMERGENCY' ? 1650 : 2000;
  repeatTimer = window.setInterval(() => {
    if (!isPlaying || count >= repeats) {
      stopAlarmAudio();
      return;
    }
    count += 1;
    playSingleBurst(params.severity, params.volume);
    triggerDeviceVibration(params.severity);
    params.onCycle?.(count);
  }, intervalMs);
}

export function testAlarmSound(severity: SeverityLevel, volume: number) {
  stopAlarmAudio();
  playSingleBurst(severity, volume);
  triggerDeviceVibration(severity);
}
