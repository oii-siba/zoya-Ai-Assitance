import type { VoiceEmotionType, VoiceEmotionState } from '../types/live';
import { voiceBiometrics } from './VoiceBiometrics';

interface FrameStats {
  pitch: number;
  rms: number;
  centroid: number;
  zcr: number;
  timestamp: number;
}

export class EmotionDetectorService {
  private recentFrames: FrameStats[] = [];
  private currentEmotion: VoiceEmotionState = {
    emotion: 'calm',
    confidence: 80,
    label: 'Calm',
    emoji: '😌',
    pitch: 0,
    rms: 0,
    updatedAt: Date.now(),
  };

  private listeners: Array<(state: VoiceEmotionState) => void> = [];
  private lastVoicedTime = 0;
  private readonly ROLLING_WINDOW_SIZE = 12; // ~1.5s of speech

  constructor() {}

  public onEmotionChange(callback: (state: VoiceEmotionState) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  public getCurrentEmotion(): VoiceEmotionState {
    return this.currentEmotion;
  }

  /**
   * Analyzes an incoming 16kHz audio buffer (Float32Array) from microphone worklet
   */
  public analyzeFrame(samples: Float32Array, sampleRate = 16000): VoiceEmotionState | null {
    if (!samples || samples.length === 0) return null;

    // 1. Calculate RMS Energy
    let sumSq = 0;
    let zeroCrossings = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSq += samples[i] * samples[i];
      if (i > 0 && ((samples[i] >= 0 && samples[i - 1] < 0) || (samples[i] < 0 && samples[i - 1] >= 0))) {
        zeroCrossings++;
      }
    }
    const rms = Math.sqrt(sumSq / samples.length);
    const zcr = zeroCrossings / samples.length;

    // Background silence/ambient gate
    if (rms < 0.012) {
      // If silent for more than 2.5 seconds, gradually settle to calm
      if (Date.now() - this.lastVoicedTime > 2500 && this.currentEmotion.emotion !== 'calm') {
        this.updateEmotion('calm', 80, 'Calm', '😌', 0, rms);
      }
      return null;
    }

    // 2. Pitch Detection via Auto-Correlation
    const minPeriod = Math.floor(sampleRate / 450); // 450 Hz
    const maxPeriod = Math.floor(sampleRate / 65);  // 65 Hz
    let bestPeriod = -1;
    let maxCorr = 0;

    for (let tau = minPeriod; tau <= maxPeriod; tau++) {
      let corr = 0;
      let power = 0;
      const limit = samples.length - tau;
      for (let i = 0; i < limit; i++) {
        corr += samples[i] * samples[i + tau];
        power += samples[i] * samples[i];
      }
      if (power > 1e-4) {
        const normCorr = corr / power;
        if (normCorr > maxCorr) {
          maxCorr = normCorr;
          bestPeriod = tau;
        }
      }
    }

    let pitch = -1;
    if (maxCorr > 0.42 && bestPeriod > 0) {
      pitch = sampleRate / bestPeriod;
    }

    // 3. Spectral Centroid Calculation
    const fftSize = Math.min(1024, samples.length);
    const halfFft = fftSize / 2;
    let magSum = 0;
    let weightedFreqSum = 0;
    const binFreq = sampleRate / fftSize;

    for (let k = 0; k < halfFft; k++) {
      let re = 0;
      let im = 0;
      const omega = (2 * Math.PI * k) / fftSize;
      for (let n = 0; n < fftSize; n += 2) {
        const win = 0.5 * (1 - Math.cos((2 * Math.PI * n) / fftSize));
        const val = samples[n] * win;
        re += val * Math.cos(omega * n);
        im -= val * Math.sin(omega * n);
      }
      const mag = Math.sqrt(re * re + im * im);
      magSum += mag;
      weightedFreqSum += mag * (k * binFreq);
    }
    const spectralCentroid = magSum > 1e-4 ? weightedFreqSum / magSum : 0;

    this.lastVoicedTime = Date.now();

    // Push into rolling window
    this.recentFrames.push({
      pitch,
      rms,
      centroid: spectralCentroid,
      zcr,
      timestamp: Date.now(),
    });

    if (this.recentFrames.length > this.ROLLING_WINDOW_SIZE) {
      this.recentFrames.shift();
    }

    // Classify emotion using windowed statistics
    return this.classifyCurrentMood(rms, pitch);
  }

  private classifyCurrentMood(currentRms: number, currentPitch: number): VoiceEmotionState {
    const validFrames = this.recentFrames.filter(f => f.timestamp > Date.now() - 3000);
    const voicedFrames = validFrames.filter(f => f.pitch > 65 && f.pitch < 450);

    // Get baseline pitch (from enrolled Boss profile or default 135Hz)
    const boss = voiceBiometrics.getBossProfile();
    const baselinePitch = boss?.pitchMedian || 135;

    // Averages across recent voiced frames
    const avgRms = validFrames.reduce((acc, f) => acc + f.rms, 0) / Math.max(1, validFrames.length);
    const avgCentroid = validFrames.reduce((acc, f) => acc + f.centroid, 0) / Math.max(1, validFrames.length);
    const avgZcr = validFrames.reduce((acc, f) => acc + f.zcr, 0) / Math.max(1, validFrames.length);

    let avgPitch = baselinePitch;
    let pitchVariance = 0;

    if (voicedFrames.length >= 2) {
      avgPitch = voicedFrames.reduce((acc, f) => acc + f.pitch, 0) / voicedFrames.length;
      const sqDiffs = voicedFrames.map(f => Math.pow(f.pitch - avgPitch, 2));
      pitchVariance = Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / voicedFrames.length);
    }

    let detected: VoiceEmotionType = 'calm';
    let label = 'Calm';
    let emoji = '😌';
    let confidence = 75;

    // Rule 1: Whisper / Quiet confidential tone
    if (avgRms < 0.035 && avgCentroid > 2200 && avgZcr > 0.12 && (voicedFrames.length === 0 || avgPitch < baselinePitch * 1.1)) {
      detected = 'whisper';
      label = 'Whisper';
      emoji = '🤫';
      confidence = Math.min(95, Math.round(70 + (avgCentroid / 3000) * 20));
    }
    // Rule 2: Stressed / Angry / High-tension
    else if (avgRms > 0.088 && (avgCentroid > 1850 || pitchVariance > 28)) {
      detected = 'stressed';
      label = 'Stressed / Urgent';
      emoji = '🔥';
      confidence = Math.min(95, Math.round(75 + (avgRms / 0.14) * 20));
    }
    // Rule 3: Excited / Happy / Joyful
    else if (
      (avgPitch > baselinePitch * 1.15 || (avgPitch > 160 && baselinePitch < 140)) &&
      avgRms > 0.050 &&
      pitchVariance > 10
    ) {
      detected = 'excited';
      label = 'Excited / Happy';
      emoji = '⚡';
      confidence = Math.min(95, Math.round(70 + (avgPitch / (baselinePitch * 1.25)) * 25));
    }
    // Rule 4: Sad / Tired / Low energy / Depressed
    else if (
      (avgPitch < baselinePitch * 0.92 || avgPitch < 118) &&
      avgRms < 0.052 &&
      voicedFrames.length >= 2
    ) {
      detected = 'sad';
      label = 'Sad / Tired';
      emoji = '🥺';
      confidence = Math.min(95, Math.round(70 + ((baselinePitch - avgPitch) / 30) * 25));
    }
    // Rule 5: Calm / Neutral
    else {
      // Hysteresis: If currently in a strong emotional state (sad, excited, stressed),
      // retain it for at least 3 seconds unless strong evidence of return to calm
      const timeSinceChange = Date.now() - this.currentEmotion.updatedAt;
      if (
        this.currentEmotion.emotion !== 'calm' &&
        timeSinceChange < 3200 &&
        voicedFrames.length < 5
      ) {
        return this.currentEmotion;
      }
      detected = 'calm';
      label = 'Calm';
      emoji = '😌';
      confidence = 85;
    }

    return this.updateEmotion(
      detected,
      confidence,
      label,
      emoji,
      currentPitch > 0 ? currentPitch : avgPitch,
      currentRms
    );
  }

  private updateEmotion(
    emotion: VoiceEmotionType,
    confidence: number,
    label: string,
    emoji: string,
    pitch: number,
    rms: number
  ): VoiceEmotionState {
    const newState: VoiceEmotionState = {
      emotion,
      confidence,
      label,
      emoji,
      pitch: Math.round(pitch),
      rms: Math.round(rms * 1000) / 1000,
      updatedAt: Date.now(),
    };

    const hasChanged = this.currentEmotion.emotion !== emotion;
    this.currentEmotion = newState;

    if (hasChanged || Date.now() - newState.updatedAt < 500) {
      this.listeners.forEach(cb => {
        try {
          cb(newState);
        } catch (e) {
          console.error('[EmotionDetector] Listener error:', e);
        }
      });

      window.dispatchEvent(
        new CustomEvent('zoya-emotion-detected', {
          detail: newState,
        })
      );
    }

    return newState;
  }
}

export const emotionDetector = new EmotionDetectorService();
