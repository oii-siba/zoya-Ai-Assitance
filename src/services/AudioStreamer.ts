import { floatTo16BitPCM, arrayBufferToBase64, base64ToArrayBuffer } from './AudioUtils';
import { voiceBiometrics } from './VoiceBiometrics';
import { emotionDetector } from './EmotionDetector';

export class AudioStreamer {
  private inputContext: AudioContext | null = null;
  private playbackContext: AudioContext | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private activeSources: AudioBufferSourceNode[] = [];
  private nextPlayTime = 0;
  private onAudioInputCallback: ((base64Pcm: string) => void) | null = null;
  private isRecording = false;
  private isPaused = false;
  
  // Voice Biometrics & Multi-Speaker settings
  private strangerDetected = false;
  private strangerStreak = 0;
  private lastStrangerSpeechTime = 0;

  constructor() {}

  /**
   * Initializes the AudioStreamer. Must be called after a user interaction to satisfy browser security.
   */
  public async init(onAudioInput: (base64Pcm: string) => void): Promise<void> {
    this.onAudioInputCallback = onAudioInput;

    // Create contexts
    // Input context is locked to 16kHz so browser downsamples microphone input automatically
    this.inputContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 16000,
    });
    
    // Playback context uses default rate, browser resamples 24kHz buffer to match device rate
    this.playbackContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    this.inputAnalyser = this.inputContext.createAnalyser();
    this.inputAnalyser.fftSize = 256;

    this.outputAnalyser = this.playbackContext.createAnalyser();
    this.outputAnalyser.fftSize = 256;
    this.outputAnalyser.connect(this.playbackContext.destination);

    // Register dynamic inline audio worklet
    const workletCode = `
      class AudioInputProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          // We collect samples in chunks (e.g. 2048 samples = 128ms at 16kHz)
          this.buffer = new Float32Array(2048);
          this.bufferIndex = 0;
        }

        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (!input || !input[0]) return true;

          const channelData = input[0];
          for (let i = 0; i < channelData.length; i++) {
            this.buffer[this.bufferIndex++] = channelData[i];
            if (this.bufferIndex >= this.buffer.length) {
              this.port.postMessage(this.buffer.slice());
              this.bufferIndex = 0;
            }
          }
          return true;
        }
      }

      registerProcessor('audio-input-processor', AudioInputProcessor);
    `;

    const blob = new Blob([workletCode], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);
    await this.inputContext.audioWorklet.addModule(workletUrl);
    URL.revokeObjectURL(workletUrl);
  }

  /**
   * Starts capturing microphone input.
   */
  public async startRecording(): Promise<void> {
    if (this.isRecording) return;
    if (!this.inputContext || !this.inputAnalyser) {
      throw new Error('AudioStreamer not initialized. Call init() first.');
    }

    // Load Voice Biometrics profiles from localStorage
    voiceBiometrics.loadProfiles();
    this.strangerDetected = false;
    this.strangerStreak = 0;
    this.lastStrangerSpeechTime = 0;

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (this.inputContext.state === 'suspended') {
        await this.inputContext.resume();
      }

      const micSource = this.inputContext.createMediaStreamSource(this.micStream);
      micSource.connect(this.inputAnalyser);

      this.isPaused = false;

      this.workletNode = new AudioWorkletNode(this.inputContext, 'audio-input-processor');
      this.workletNode.port.onmessage = (event) => {
        if (!this.isRecording) return;
        if (this.isPaused) return;
        const float32Data = event.data as Float32Array;

        // Perform biometric multi-speaker recognition
        const profiles = voiceBiometrics.getProfiles();
        if (profiles.length > 0) {
          const savedSens = parseInt(localStorage.getItem('zoya_boss_sensitivity') || '70', 10);
          const sensitivity = isNaN(savedSens) ? 70 : savedSens;
          const recResult = voiceBiometrics.identifySpeaker(float32Data, 16000, sensitivity);
          
          if (recResult.status !== 'silence') {
            window.dispatchEvent(new CustomEvent('zoya-speaker-identified', {
              detail: recResult
            }));

            if (recResult.status === 'stranger') {
              this.strangerStreak++;
              if (this.strangerStreak >= 8) {
                if (!this.strangerDetected) {
                  this.strangerDetected = true;
                  console.warn(`[AudioStreamer] Stranger voice detected! Confidence: ${recResult.confidence}%`);
                }
                this.lastStrangerSpeechTime = Date.now();
              }
            } else if (recResult.status === 'boss') {
              // Boss detected - immediately clear stranger suspicion
              this.strangerStreak = 0;
            } else {
              // Enrolled friend/guest profile detected
              this.strangerStreak = Math.max(0, this.strangerStreak - 1);
            }
          }
        }

        // Handle silence timeout when stranger was speaking
        if (this.strangerDetected && Date.now() - this.lastStrangerSpeechTime > 1500) {
          this.strangerDetected = false;
          this.strangerStreak = 0;
          window.dispatchEvent(new CustomEvent('zoya-stranger-detected'));
        }

        // Real-time Voice Emotion Detection
        try {
          emotionDetector.analyzeFrame(float32Data, 16000);
        } catch (e) {
          console.error('[AudioStreamer] Emotion analysis error:', e);
        }

        // Stream raw audio to AI
        const int16PCM = floatTo16BitPCM(float32Data);
        const base64Pcm = arrayBufferToBase64(int16PCM.buffer);
        if (this.onAudioInputCallback) {
          this.onAudioInputCallback(base64Pcm);
        }
      };

      micSource.connect(this.workletNode);
      
      // Connect to a silent GainNode to keep the worklet pulled
      const dummyGain = this.inputContext.createGain();
      dummyGain.gain.value = 0;
      this.workletNode.connect(dummyGain);
      dummyGain.connect(this.inputContext.destination);

      this.isRecording = true;
    } catch (error) {
      this.stopRecording();
      throw error;
    }
  }

  /**
   * Stops capturing microphone input.
   */
  public stopRecording(): void {
    this.isRecording = false;
    this.isPaused = false;

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
  }

  /**
   * Pauses microphone input stream.
   */
  public pauseRecording(): void {
    this.isPaused = true;
    if (this.micStream) {
      this.micStream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    }
  }

  /**
   * Resumes microphone input stream.
   */
  public resumeRecording(): void {
    this.isPaused = false;
    if (this.micStream) {
      this.micStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
    }
  }

  /**
   * Checks if microphone recording is paused.
   */
  public isPausedRecording(): boolean {
    return this.isPaused;
  }

  /**
   * Resumes playback context if suspended.
   */
  public async resumePlayback(): Promise<void> {
    if (this.playbackContext && this.playbackContext.state === 'suspended') {
      await this.playbackContext.resume();
    }
  }

  /**
   * Queues an incoming 24kHz base64 PCM16 audio chunk for playback.
   */
  public playAudioChunk(base64Pcm: string): void {
    if (!this.playbackContext || !this.outputAnalyser) return;

    try {
      const arrayBuffer = base64ToArrayBuffer(base64Pcm);
      const int16Array = new Int16Array(arrayBuffer);
      const float32Array = new Float32Array(int16Array.length);

      // Convert 16-bit PCM to Float32
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      // Create an AudioBuffer for 24kHz Mono
      const audioBuffer = this.playbackContext.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAnalyser);

      const currentTime = this.playbackContext.currentTime;
      // Schedule gapless playback
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }

      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
      this.activeSources.push(source);

      source.onended = () => {
        this.activeSources = this.activeSources.filter((s) => s !== source);
      };
    } catch (error) {
      console.error('Error playing audio chunk:', error);
    }
  }

  /**
   * Stops all active audio source playbacks immediately (for interruptions/barge-in).
   */
  public stopPlayback(): void {
    this.activeSources.forEach((source) => {
      try {
        source.stop();
      } catch (e) {
        // Source might have already finished playing
      }
    });
    this.activeSources = [];
    this.nextPlayTime = 0;
  }

  /**
   * Returns the FFT analyzer data for the recording microphone.
   */
  public getInputFrequencyData(): Uint8Array {
    if (!this.inputAnalyser) return new Uint8Array(0);
    const dataArray = new Uint8Array(this.inputAnalyser.frequencyBinCount);
    this.inputAnalyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  /**
   * Returns the FFT analyzer data for the playing AI response.
   */
  public getOutputFrequencyData(): Uint8Array {
    if (!this.outputAnalyser) return new Uint8Array(0);
    const dataArray = new Uint8Array(this.outputAnalyser.frequencyBinCount);
    this.outputAnalyser.getByteFrequencyData(dataArray);
    return dataArray;
  }


  /**
   * Cleanup everything
   */
  public destroy(): void {
    this.stopRecording();
    this.stopPlayback();

    if (this.inputContext) {
      this.inputContext.close();
      this.inputContext = null;
    }

    if (this.playbackContext) {
      this.playbackContext.close();
      this.playbackContext = null;
    }

    this.inputAnalyser = null;
    this.outputAnalyser = null;
  }
}
