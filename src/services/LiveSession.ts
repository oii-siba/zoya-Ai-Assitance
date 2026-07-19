import { AudioStreamer } from './AudioStreamer';
import type { LiveSessionConfig, SessionState, IncomingMessage, OutgoingMessage } from '../types/live';

export class LiveSession {
  private socket: WebSocket | null = null;
  private audioStreamer: AudioStreamer;
  private state: SessionState = 'disconnected';
  private config: LiveSessionConfig | null = null;
  private onStateChangeCallback: ((state: SessionState) => void) | null = null;
  private onStatusMessageCallback: ((message: string) => void) | null = null;
  private onOpenWebsiteCallback: ((url: string) => void) | null = null;

  constructor() {
    this.audioStreamer = new AudioStreamer();
  }

  public onStateChange(callback: (state: SessionState) => void): void {
    this.onStateChangeCallback = callback;
  }

  public onStatusMessage(callback: (message: string) => void): void {
    this.onStatusMessageCallback = callback;
  }

  public onOpenWebsite(callback: (url: string) => void): void {
    this.onOpenWebsiteCallback = callback;
  }

  private updateState(newState: SessionState): void {
    this.state = newState;
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(newState);
    }
  }

  private logStatus(msg: string): void {
    console.log(`[LiveSession] ${msg}`);
    if (this.onStatusMessageCallback) {
      this.onStatusMessageCallback(msg);
    }
  }

  public getState(): SessionState {
    return this.state;
  }

  public getAudioStreamer(): AudioStreamer {
    return this.audioStreamer;
  }

  /**
   * Connects to the Gemini Live WebSocket API
   */
  public async connect(config: LiveSessionConfig): Promise<void> {
    if (this.state !== 'disconnected') return;
    this.config = config;
    this.updateState('connecting');
    this.logStatus('Connecting to Gemini Live API...');

    try {
      // Initialize AudioStreamer
      await this.audioStreamer.init((base64MicChunk) => {
        this.sendAudioInput(base64MicChunk);
      });

      // Resume context for playback
      await this.audioStreamer.resumePlayback();

      // Construct WSS URL
      // Endpoint syntax: wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=YOUR_API_KEY
      const baseUrl = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
      const wssUrl = `${baseUrl}?key=${encodeURIComponent(config.apiKey)}`;

      this.socket = new WebSocket(wssUrl);

      this.socket.onopen = () => {
        this.logStatus('WebSocket connection established. Sending setup payload...');
        this.sendSetupPayload();
      };

      this.socket.onmessage = async (event) => {
        try {
          let data: string;
          if (event.data instanceof Blob) {
            data = await event.data.text();
          } else {
            data = event.data;
          }
          const message = JSON.parse(data) as IncomingMessage;
          this.handleIncomingMessage(message);
        } catch (e) {
          console.error('Failed to parse incoming WebSocket message:', e);
        }
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.logStatus('Connection error. Please check your API Key and network.');
        this.disconnect();
      };

      this.socket.onclose = (event) => {
        this.logStatus(`Connection closed. Code: ${event.code}, Reason: ${event.reason}`);
        this.disconnect();
      };
    } catch (error) {
      console.error('Failed to connect:', error);
      this.logStatus(`Connection failed: ${(error as Error).message}`);
      this.disconnect();
    }
  }

  /**
   * Disconnects the current session and stops all audio.
   */
  public disconnect(): void {
    if (this.state === 'disconnected') return;
    this.logStatus('Disconnecting session...');

    if (this.socket) {
      if (this.socket.readyState === WebSocket.OPEN) {
        this.socket.close();
      }
      this.socket = null;
    }

    this.audioStreamer.destroy();
    this.updateState('disconnected');
    this.logStatus('Disconnected.');
  }

  /**
   * Sends the initial setup configuration.
   */
  private sendSetupPayload(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.config) return;

    const setupPayload: OutgoingMessage = {
      setup: {
        model: this.config.model,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.config.voiceName,
              },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: this.config.systemInstruction }],
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: 'openWebsite',
                description: 'Opens a given website URL or search query page in a new browser tab. If the user asks to search for something, construct a Google search URL (e.g. https://www.google.com/search?q=query) and pass it here.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    url: {
                      type: 'STRING',
                      description: 'The fully qualified URL to open. For searches, use https://www.google.com/search?q=search+terms. Must start with http:// or https://.',
                    },
                  },
                  required: ['url'],
                },
              },
            ],
          },
        ],
      },
    };

    this.socket.send(JSON.stringify(setupPayload));
    this.logStatus('Setup completed. Starting microphone recording...');
    
    // Once setup is acknowledged, start mic recording
    this.audioStreamer.startRecording().then(() => {
      this.updateState('listening');
      this.logStatus('Connected. Zoya is listening...');
    }).catch(err => {
      console.error('Microphone access failed:', err);
      this.logStatus(`Microphone access error: ${err.message}`);
      this.disconnect();
    });
  }

  /**
   * Sends recorded audio chunk to the WebSocket.
   */
  private sendAudioInput(base64Pcm: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    // If we send audio, we can clear playback to keep audio input crisp (local barge-in help)
    // The server will also trigger `interrupted: true` if it determines we barge in.
    const message: OutgoingMessage = {
      realtimeInput: {
        audio: {
          mimeType: 'audio/pcm;rate=16000',
          data: base64Pcm,
        },
      },
    };

    this.socket.send(JSON.stringify(message));
  }

  /**
   * Sends a tool response back to the model.
   */
  private sendToolResponse(callId: string, output: Record<string, any>): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    const message: OutgoingMessage = {
      toolResponse: {
        functionResponses: [
          {
            response: { output },
            id: callId,
          },
        ],
      },
    };

    this.socket.send(JSON.stringify(message));
    this.logStatus(`Sent response for tool call: ${callId}`);
  }

  /**
   * Processes messages arriving from the Gemini Live WebSocket server.
   */
  private handleIncomingMessage(msg: IncomingMessage): void {
    // 1. Check for interruptions / barge-in
    if (msg.serverContent?.interrupted) {
      this.logStatus('Interrupted by user speech.');
      this.audioStreamer.stopPlayback();
      this.updateState('listening');
      return;
    }

    // 2. Play incoming audio chunks
    if (msg.serverContent?.modelTurn?.parts) {
      msg.serverContent.modelTurn.parts.forEach((part) => {
        if (part.inlineData && part.inlineData.data) {
          // Update state to speaking when receiving audio
          this.updateState('speaking');
          this.audioStreamer.playAudioChunk(part.inlineData.data);
        }
      });
    }

    // 3. Handle turn completion
    if (msg.serverContent?.turnComplete) {
      this.logStatus('Zoya finished speaking.');
      this.updateState('listening');
    }

    // 4. Handle Tool Calls
    if (msg.toolCall?.functionCalls) {
      msg.toolCall.functionCalls.forEach((call) => {
        this.executeToolCall(call);
      });
    }
  }

  /**
   * Executes tool calls requested by the model
   */
  private executeToolCall(call: { name: string; args: Record<string, any>; id: string }): void {
    this.logStatus(`Executing tool call: ${call.name} with args: ${JSON.stringify(call.args)}`);

    if (call.name === 'openWebsite') {
      try {
        let url = call.args.url;
        if (!/^https?:\/\//i.test(url)) {
          url = `https://${url}`;
        }
        
        // Notify the callback (UI will handle window.open and fallback popup overlays)
        if (this.onOpenWebsiteCallback) {
          this.onOpenWebsiteCallback(url);
        }
        
        // Respond to the tool call immediately
        this.sendToolResponse(call.id, { success: true, openedUrl: url });
        this.logStatus(`Successfully triggered open website for: ${url}`);
      } catch (error) {
        console.error('Failed to execute openWebsite callback:', error);
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else {
      this.logStatus(`Unknown tool call: ${call.name}`);
      this.sendToolResponse(call.id, { error: 'Unknown function' });
    }
  }
}
