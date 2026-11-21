/**
 * Voice Biometrics & Multi-Speaker Recognition Service for Zoya AI
 * Enterprise-grade Speaker Identification Engine featuring:
 * 1. 16-band Mel-Filterbank + 12-band Cepstral Mean-Subtracted MFCC Formant Analysis
 * 2. Multi-Octave Harmonic Pitch Tracker (eliminates octave jump false alarms)
 * 3. Rolling-Window Temporal Frame Fusion (averages features across sustained speech)
 * 4. Speaker Pitch Range Envelope (low/high boundary calibration)
 * 5. Self-Healing Adaptive Learning for verified Boss voice
 */

export interface SpeakerProfile {
  id: string;
  name: string;
  role: 'boss' | 'friend' | 'family' | 'guest';
  pitchMedian: number;
  pitchLow: number;  // 15th percentile of pitch range
  pitchHigh: number; // 85th percentile of pitch range
  spectralCentroid: number;
  timbreSignature: number[]; // 12-dimensional zero-mean unit MFCC vector
  sampleCount: number;
  enrolledAt: number;
}

export interface AcousticFeatures {
  rms: number;
  pitch: number; // in Hz, -1 if unvoiced
  spectralCentroid: number;
  mfcc: number[]; // 12-band zero-mean unit MFCC vector
}

export interface SpeakerRecognitionResult {
  speaker: SpeakerProfile | null;
  confidence: number; // 0 to 100%
  status: 'boss' | 'recognized' | 'stranger' | 'silence';
  pitch: number;
}

const STORAGE_KEY = 'zoya_speaker_profiles';
const ACTIVE_SPEAKER_TIMEOUT_MS = 800;

export class VoiceBiometricsService {
  private profiles: SpeakerProfile[] = [];
  private currentSpeaker: SpeakerProfile | null = null;
  private lastRecognitionTime = 0;
  private melFilterBanks: { centerHz: number; startIdx: number; centerIdx: number; endIdx: number }[] = [];
  private dctMatrix: number[][] = [];
  private smoothedScore = 0;
  private recentVoicedFrames: AcousticFeatures[] = [];
  private lastAdaptSave = 0;

  constructor() {
    this.initMelFilterBanks(16000, 1024, 16);
    this.initDctMatrix(16, 12);
    this.loadProfiles();
  }

  /**
   * Initializes 16 triangular Mel filterbanks spanning 80 Hz to 7600 Hz
   */
  private initMelFilterBanks(sampleRate: number, fftSize: number, numBands: number): void {
    const minMel = 2595 * Math.log10(1 + 80 / 700);
    const maxMel = 2595 * Math.log10(1 + (sampleRate / 2) / 700);
    const melStep = (maxMel - minMel) / (numBands + 1);

    const melPoints: number[] = [];
    for (let i = 0; i <= numBands + 1; i++) {
      const mel = minMel + i * melStep;
      const hz = 700 * (Math.pow(10, mel / 2595) - 1);
      melPoints.push(hz);
    }

    const binFreq = sampleRate / fftSize;
    this.melFilterBanks = [];

    for (let m = 1; m <= numBands; m++) {
      const startIdx = Math.max(0, Math.floor(melPoints[m - 1] / binFreq));
      const centerIdx = Math.floor(melPoints[m] / binFreq);
      const endIdx = Math.min(fftSize / 2, Math.ceil(melPoints[m + 1] / binFreq));
      this.melFilterBanks.push({
        centerHz: melPoints[m],
        startIdx,
        centerIdx,
        endIdx,
      });
    }
  }

  /**
   * Precomputes DCT-II transform matrix (excluding c0 energy)
   */
  private initDctMatrix(numBands: number, numCoeffs: number): void {
    this.dctMatrix = [];
    for (let k = 1; k <= numCoeffs; k++) {
      const row: number[] = [];
      for (let m = 0; m < numBands; m++) {
        row.push(Math.cos((Math.PI * k * (m + 0.5)) / numBands));
      }
      this.dctMatrix.push(row);
    }
  }

  /**
   * Loads speaker profiles from localStorage
   */
  public loadProfiles(): SpeakerProfile[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.profiles = parsed.map((p: any) => ({
          ...p,
          pitchLow: p.pitchLow ?? (p.pitchMedian * 0.88),
          pitchHigh: p.pitchHigh ?? (p.pitchMedian * 1.12),
        }));
      } else {
        this.profiles = [];
      }

      // Check legacy boss pitch migration if no boss profile
      const legacyPitch = localStorage.getItem('zoya_boss_pitch');
      if (legacyPitch && !this.profiles.some(p => p.role === 'boss')) {
        const pitch = parseFloat(legacyPitch);
        if (!isNaN(pitch) && pitch > 60) {
          const bossProfile: SpeakerProfile = {
            id: 'boss_siba',
            name: 'Siba Boss',
            role: 'boss',
            pitchMedian: pitch,
            pitchLow: pitch * 0.88,
            pitchHigh: pitch * 1.12,
            spectralCentroid: pitch * 14,
            timbreSignature: this.generateDefaultMfcc(pitch),
            sampleCount: 10,
            enrolledAt: Date.now(),
          };
          this.profiles.unshift(bossProfile);
          this.saveProfiles();
        }
      }
    } catch (e) {
      console.error('[VoiceBiometrics] Failed to load speaker profiles:', e);
      this.profiles = [];
    }
    return this.profiles;
  }

  public saveProfiles(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profiles));
    } catch (e) {
      console.error('[VoiceBiometrics] Failed to save speaker profiles:', e);
    }
  }

  public getProfiles(): SpeakerProfile[] {
    return this.profiles;
  }

  public getBossProfile(): SpeakerProfile | null {
    return this.profiles.find(p => p.role === 'boss') || null;
  }

  public deleteProfile(id: string): void {
    this.profiles = this.profiles.filter(p => p.id !== id);
    if (id === 'boss_siba' || id.startsWith('boss')) {
      localStorage.removeItem('zoya_boss_pitch');
    }
    this.saveProfiles();
  }

  private generateDefaultMfcc(pitch: number): number[] {
    const raw = new Array(12).fill(0);
    const band = Math.min(11, Math.max(0, Math.floor(pitch / 25)));
    raw[band] = 1.0;
    return this.applyCepstralMeanSubtraction(raw);
  }

  /**
   * Applies Cepstral Mean Subtraction (CMS) and L2 Unit Normalization
   */
  public applyCepstralMeanSubtraction(coeffs: number[]): number[] {
    const n = coeffs.length;
    if (n === 0) return coeffs;

    const mean = coeffs.reduce((a, b) => a + b, 0) / n;
    const demeaned = coeffs.map(c => c - mean);

    const norm = Math.sqrt(demeaned.reduce((sum, val) => sum + val * val, 0));
    if (norm < 1e-6) return demeaned;
    return demeaned.map(val => val / norm);
  }

  /**
   * Real-time acoustic feature extraction on 16kHz audio buffer
   */
  public extractFeatures(samples: Float32Array, sampleRate = 16000): AcousticFeatures | null {
    // 1. RMS Energy calculation to gate silence / background noise
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSquares += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sumSquares / samples.length);
    if (rms < 0.015) {
      return null; // Silence / ambient room floor
    }

    // 2. High-precision Pitch (F0) estimation via Normalized Cross-Correlation (NCCF)
    // Human voice fundamental frequency: 65 Hz to 420 Hz
    const minPeriod = Math.floor(sampleRate / 420); // ~38 samples
    const maxPeriod = Math.floor(sampleRate / 65);  // ~246 samples
    let bestCorrelation = -1;
    let bestPeriod = -1;

    const analysisLength = Math.min(samples.length - maxPeriod, 1024);
    if (analysisLength > 128) {
      let energy0 = 0;
      for (let i = 0; i < analysisLength; i++) {
        energy0 += samples[i] * samples[i];
      }

      if (energy0 > 1e-4) {
        for (let period = minPeriod; period <= maxPeriod; period++) {
          let cross = 0;
          let energyLag = 0;
          for (let i = 0; i < analysisLength; i += 2) {
            cross += samples[i] * samples[i + period];
            energyLag += samples[i + period] * samples[i + period];
          }
          const denom = Math.sqrt(energy0 * energyLag);
          if (denom > 1e-5) {
            const nccf = (2 * cross) / denom;
            if (nccf > bestCorrelation) {
              bestCorrelation = nccf;
              bestPeriod = period;
            }
          }
        }
      }
    }

    let pitch = -1;
    if (bestCorrelation > 0.48 && bestPeriod > 0) {
      pitch = sampleRate / bestPeriod;
    }

    // 3. Spectral Analysis with Hann Window on 1024 points
    const fftSize = Math.min(1024, samples.length);
    const halfFft = fftSize / 2;
    const magnitudes = new Float32Array(halfFft);
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
      magnitudes[k] = Math.sqrt(re * re + im * im);
    }

    // 4. Spectral Centroid
    let magSum = 0;
    let weightedFreqSum = 0;
    for (let k = 0; k < halfFft; k++) {
      const mag = magnitudes[k];
      magSum += mag;
      weightedFreqSum += mag * (k * binFreq);
    }
    const spectralCentroid = magSum > 1e-4 ? weightedFreqSum / magSum : 0;

    // 5. 16-Band Mel Filterbank Energies
    const numBands = this.melFilterBanks.length;
    const logMelEnergies = new Array(numBands).fill(0);

    this.melFilterBanks.forEach((band, bIdx) => {
      let energy = 0;
      for (let k = band.startIdx; k <= band.endIdx; k++) {
        if (k < halfFft) {
          let weight = 0;
          if (k <= band.centerIdx && band.centerIdx > band.startIdx) {
            weight = (k - band.startIdx) / (band.centerIdx - band.startIdx);
          } else if (k > band.centerIdx && band.endIdx > band.centerIdx) {
            weight = (band.endIdx - k) / (band.endIdx - band.centerIdx);
          }
          energy += magnitudes[k] * weight;
        }
      }
      logMelEnergies[bIdx] = Math.log(1 + 1000 * energy);
    });

    // 6. 12 MFCCs via DCT-II + Cepstral Mean Subtraction
    const rawMfcc = new Array(12).fill(0);
    for (let c = 0; c < 12; c++) {
      let sum = 0;
      const row = this.dctMatrix[c];
      for (let m = 0; m < numBands; m++) {
        sum += logMelEnergies[m] * row[m];
      }
      rawMfcc[c] = sum;
    }

    const mfcc = this.applyCepstralMeanSubtraction(rawMfcc);

    return {
      rms,
      pitch,
      spectralCentroid,
      mfcc,
    };
  }

  /**
   * Enrolls a speaker from recorded frames with pitch range statistics and average MFCC signature
   */
  public enrollSpeaker(name: string, role: 'boss' | 'friend' | 'family' | 'guest', frames: AcousticFeatures[]): SpeakerProfile {
    const validPitches = frames.map(f => f.pitch).filter(p => p > 65 && p < 450);
    validPitches.sort((a, b) => a - b);
    const pitchMedian = validPitches.length > 0 ? validPitches[Math.floor(validPitches.length / 2)] : 130;
    const pitchLow = validPitches.length > 0 ? validPitches[Math.floor(validPitches.length * 0.15)] : pitchMedian * 0.88;
    const pitchHigh = validPitches.length > 0 ? validPitches[Math.floor(validPitches.length * 0.85)] : pitchMedian * 1.12;

    const validCentroids = frames.map(f => f.spectralCentroid).filter(c => c > 100);
    const avgCentroid = validCentroids.length > 0 ? validCentroids.reduce((a, b) => a + b, 0) / validCentroids.length : 1800;

    // Average 12-dimensional MFCC vectors across all voiced/valid frames
    const numCoeffs = 12;
    const avgMfcc = new Array(numCoeffs).fill(0);
    frames.forEach(frame => {
      for (let c = 0; c < numCoeffs; c++) {
        avgMfcc[c] += frame.mfcc[c] || 0;
      }
    });
    for (let c = 0; c < numCoeffs; c++) {
      avgMfcc[c] /= Math.max(1, frames.length);
    }
    const timbreSignature = this.applyCepstralMeanSubtraction(avgMfcc);

    const profileId = role === 'boss' ? 'boss_siba' : `speaker_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Remove existing profile with same role if updating Boss
    this.profiles = this.profiles.filter(p => p.id !== profileId && (role !== 'boss' || p.role !== 'boss'));

    const newProfile: SpeakerProfile = {
      id: profileId,
      name,
      role,
      pitchMedian,
      pitchLow,
      pitchHigh,
      spectralCentroid: avgCentroid,
      timbreSignature,
      sampleCount: frames.length,
      enrolledAt: Date.now(),
    };

    if (role === 'boss') {
      this.profiles.unshift(newProfile);
      localStorage.setItem('zoya_boss_pitch', pitchMedian.toFixed(1));
    } else {
      this.profiles.push(newProfile);
    }

    this.saveProfiles();
    return newProfile;
  }

  /**
   * Continuous self-healing learning for Boss voice
   */
  private adaptBossProfile(features: AcousticFeatures): void {
    const boss = this.getBossProfile();
    if (!boss || !features.mfcc || features.mfcc.length < 12) return;
    const lr = 0.02;
    for (let i = 0; i < 12; i++) {
      boss.timbreSignature[i] = boss.timbreSignature[i] * (1 - lr) + features.mfcc[i] * lr;
    }
    boss.timbreSignature = this.applyCepstralMeanSubtraction(boss.timbreSignature);

    if (Date.now() - this.lastAdaptSave > 15000) {
      this.lastAdaptSave = Date.now();
      this.saveProfiles();
    }
  }

  /**
   * Identifies the speaker from a live audio buffer using rolling temporal fusion and harmonic pitch tolerance
   */
  public identifySpeaker(samples: Float32Array, sampleRate = 16000, sensitivity = 70): SpeakerRecognitionResult {
    const features = this.extractFeatures(samples, sampleRate);
    if (!features) {
      if (this.currentSpeaker && Date.now() - this.lastRecognitionTime < ACTIVE_SPEAKER_TIMEOUT_MS) {
        return {
          speaker: this.currentSpeaker,
          confidence: Math.round(this.smoothedScore * 100) || 75,
          status: this.currentSpeaker.role === 'boss' ? 'boss' : 'recognized',
          pitch: 0,
        };
      }
      this.smoothedScore = 0;
      this.recentVoicedFrames = [];
      return { speaker: null, confidence: 0, status: 'silence', pitch: 0 };
    }

    if (this.profiles.length === 0) {
      return { speaker: null, confidence: 100, status: 'recognized', pitch: features.pitch };
    }

    const isVoiced = features.pitch > 65 && features.pitch < 450;

    // Instantaneous single-frame check for abrupt speaker transitions & interruptions
    const bossProfile = this.getBossProfile();
    if (isVoiced && bossProfile) {
      let instantDot = 0;
      for (let c = 0; c < 12; c++) {
        instantDot += (bossProfile.timbreSignature[c] || 0) * (features.mfcc[c] || 0);
      }
      const d1 = Math.abs(12 * Math.log2(features.pitch / bossProfile.pitchMedian));
      const d2 = Math.abs(12 * Math.log2((features.pitch / 2) / bossProfile.pitchMedian));
      const d3 = Math.abs(12 * Math.log2((features.pitch * 2) / bossProfile.pitchMedian));
      const instantSemitone = Math.min(d1, d2, d3);

      const isInstantBoss = instantDot >= 0.35 && instantSemitone <= 3.2;
      const isInstantStranger = instantDot < 0.18 || instantSemitone > 3.8;

      if (isInstantBoss && this.currentSpeaker?.role !== 'boss') {
        // Siba Boss interrupted someone else! Flush buffer immediately
        this.recentVoicedFrames = [features];
        this.smoothedScore = 0.82;
      } else if (isInstantStranger && this.currentSpeaker?.role === 'boss') {
        // Someone else interrupted Siba Boss! Flush buffer immediately
        this.recentVoicedFrames = [features];
        this.smoothedScore = 0.15;
      }
    }

    // Temporal rolling fusion of recent voiced speech frames
    if (isVoiced) {
      this.recentVoicedFrames.push(features);
      if (this.recentVoicedFrames.length > 4) {
        this.recentVoicedFrames.shift();
      }
    }

    // Compute averaged MFCC vector across rolling window
    const activeMfcc = new Array(12).fill(0);
    const activeFrames = this.recentVoicedFrames.length > 0 ? this.recentVoicedFrames : [features];
    activeFrames.forEach(f => {
      for (let c = 0; c < 12; c++) {
        activeMfcc[c] += f.mfcc[c] || 0;
      }
    });
    for (let c = 0; c < 12; c++) {
      activeMfcc[c] /= activeFrames.length;
    }
    const fusedMfcc = this.applyCepstralMeanSubtraction(activeMfcc);

    let bestMatch: SpeakerProfile | null = null;
    let highestScore = 0;

    for (const profile of this.profiles) {
      // 1. Cosine similarity of Zero-Mean MFCC Formant Envelope
      let dot = 0;
      for (let c = 0; c < 12; c++) {
        dot += (profile.timbreSignature[c] || 0) * (fusedMfcc[c] || 0);
      }
      const rawMfccSim = Math.max(0, Math.min(1, dot));
      // Calibrate: dot product below 0.15 is random noise/different person; above 0.75 is same person
      const mfccScore = Math.max(0, Math.min(1, (rawMfccSim - 0.15) / 0.70));

      // 2. Multi-Octave Harmonic Pitch Comparison (F0, F0/2, 2*F0)
      let pitchScore = 0.5; // neutral when unvoiced
      let pitchViolated = false;

      if (isVoiced && profile.pitchMedian > 60) {
        // Test fundamental, subharmonic (halving), and 2nd harmonic (doubling)
        const d1 = Math.abs(12 * Math.log2(features.pitch / profile.pitchMedian));
        const d2 = Math.abs(12 * Math.log2((features.pitch / 2) / profile.pitchMedian));
        const d3 = Math.abs(12 * Math.log2((features.pitch * 2) / profile.pitchMedian));
        const semitoneDiff = Math.min(d1, d2, d3);

        // Check if pitch falls within enrolled natural speaking range [pitchLow, pitchHigh]
        const inNaturalRange = (features.pitch >= profile.pitchLow * 0.88 && features.pitch <= profile.pitchHigh * 1.12) ||
                               (features.pitch / 2 >= profile.pitchLow * 0.88 && features.pitch / 2 <= profile.pitchHigh * 1.12) ||
                               (features.pitch * 2 >= profile.pitchLow * 0.88 && features.pitch * 2 <= profile.pitchHigh * 1.12);

        if (inNaturalRange) {
          pitchScore = 0.95;
        } else if (semitoneDiff > 3.5) {
          pitchViolated = true;
          pitchScore = 0.05;
        } else {
          pitchScore = Math.max(0, 1 - Math.pow(semitoneDiff / 3.5, 2));
        }
      }

      // 3. Spectral Centroid Check
      let centroidScore = 0.5;
      if (features.spectralCentroid > 100 && profile.spectralCentroid > 100) {
        const diffRatio = Math.abs(features.spectralCentroid - profile.spectralCentroid) / profile.spectralCentroid;
        centroidScore = Math.max(0, 1 - diffRatio * 1.3);
      }

      // Multi-factor weighted score
      let combinedScore = 0;
      if (isVoiced) {
        if (pitchViolated) {
          combinedScore = mfccScore * 0.25;
        } else {
          combinedScore = mfccScore * 0.55 + pitchScore * 0.35 + centroidScore * 0.10;
        }
      } else {
        // Unvoiced frame: rely primarily on vocal envelope
        combinedScore = mfccScore * 0.80 + centroidScore * 0.20;
      }

      if (combinedScore > highestScore) {
        highestScore = combinedScore;
        bestMatch = profile;
      }
    }

    // Adaptive threshold based on sensitivity slider (50% = 0.48, 70% = 0.55, 90% = 0.62)
    const requiredThreshold = 0.48 + ((sensitivity - 50) / 100) * 0.16;

    // Temporal smoothing
    if (this.smoothedScore === 0) {
      this.smoothedScore = highestScore;
    } else {
      this.smoothedScore = this.smoothedScore * 0.65 + highestScore * 0.35;
    }

    if (this.smoothedScore >= requiredThreshold && bestMatch) {
      this.currentSpeaker = bestMatch;
      this.lastRecognitionTime = Date.now();
      const confidence = Math.min(99, Math.max(68, Math.round(68 + ((this.smoothedScore - requiredThreshold) / (1 - requiredThreshold)) * 31)));

      if (bestMatch.role === 'boss' && confidence > 82) {
        this.adaptBossProfile(features);
      }

      return {
        speaker: bestMatch,
        confidence,
        status: bestMatch.role === 'boss' ? 'boss' : 'recognized',
        pitch: features.pitch,
      };
    }

    // If voiced and score is below threshold, it is an alien/stranger voice!
    if (isVoiced) {
      this.currentSpeaker = null;
      const strangerScore = Math.round(this.smoothedScore * 40); // 10% - 25% match
      return {
        speaker: null,
        confidence: strangerScore,
        status: 'stranger',
        pitch: features.pitch,
      };
    }

    // Brief silence/ambient frame
    return {
      speaker: null,
      confidence: 0,
      status: 'silence',
      pitch: features.pitch,
    };
  }
}

export const voiceBiometrics = new VoiceBiometricsService();
