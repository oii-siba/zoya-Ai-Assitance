import { AudioStreamer } from './AudioStreamer';
import { alarmScheduler } from './AlarmScheduler';
import type { LiveSessionConfig, SessionState, IncomingMessage, OutgoingMessage, VoiceEmotionState } from '../types/live';

export class LiveSession {
  private socket: WebSocket | null = null;
  private audioStreamer: AudioStreamer;
  private state: SessionState = 'disconnected';
  private config: LiveSessionConfig | null = null;
  private onStateChangeCallback: ((state: SessionState) => void) | null = null;
  private onStatusMessageCallback: ((message: string) => void) | null = null;
  private onOpenWebsiteCallback: ((url: string) => void) | null = null;
  private lastWhatsappSender = '';
  private lastTargetContact = '';

  public setLastWhatsappSender(sender: string): void {
    this.lastWhatsappSender = sender;
    this.logStatus(`Registered last WhatsApp sender: ${sender}`);
  }

  public setLastTargetContact(contact: string): void {
    this.lastTargetContact = contact;
    this.logStatus(`Registered last target WhatsApp contact: ${contact}`);
  }

  private isUserInitiatedDisconnect = false;
  private reconnectTimeout: any = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;

  // Standby / Silent Mode ("চুপ মোড") state
  private isStandbyMode = false;
  private isTemporaryAnnouncing = false;
  private onStandbyChangeCallback: ((isStandby: boolean) => void) | null = null;
  private wakeWordRecognizer: any = null;
  private isWakeWordRecognizerRunning = false;
  private lastTriggeredWakeTime = 0;
  private lastTriggeredSleepTime = 0;

  constructor() {
    this.audioStreamer = new AudioStreamer();
  }

  public getIsStandbyMode(): boolean {
    return this.isStandbyMode;
  }

  public onStandbyChange(callback: (isStandby: boolean) => void): void {
    this.onStandbyChangeCallback = callback;
  }

  public setStandbyMode(standby: boolean): void {
    if (this.isStandbyMode === standby) return;
    this.isStandbyMode = standby;
    if (this.onStandbyChangeCallback) {
      this.onStandbyChangeCallback(standby);
    }
    window.dispatchEvent(
      new CustomEvent('zoya-standby-mode-change', {
        detail: { isStandby: standby },
      })
    );
  }

  /**
   * Puts Zoya into Silent Standby Mode immediately ("চুপ মোড").
   */
  public enterStandby(): void {
    this.audioStreamer.stopPlayback();
    this.setStandbyMode(true);
    this.updateState('listening');
    this.logStatus('Zoya is in Silent Standby Mode ("চুপ মোড"). Staying quiet until "জোয়া বলো".');
    const bossName = this.config?.userName || 'Siba';
    const bossTitle = this.config?.userTitle || 'বস';
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendTextMessage(
        `[SYSTEM EVENT: ${bossName} ${bossTitle} আপনাকে এখন চুপ করতে বলেছেন ("জোয়া এখন চুপ করো")। আপনি সম্পূর্ণ নিঃশব্দ স্ট্যান্ডবাই মোডে থাকুন। ${bossName} ${bossTitle} অন্য কারোর সাথে কথা বলবেন। আপনি কোনো উত্তর দেবেন না এবং কোনো শব্দ করবেন না। শুধু যখন ${bossName} ${bossTitle} আপনাকে ডাকবেন "জোয়া বলো" বা "জোয়া কথা বলো", তখন কথা বলবেন।]`
      );
    }
  }

  /**
   * Wakes Zoya up from Silent Standby Mode ("জোয়া বলো").
   */
  public wakeFromStandby(): void {
    this.setStandbyMode(false);
    this.isTemporaryAnnouncing = false;
    this.logStatus('Waking Zoya up from Standby Mode...');
    const bossName = this.config?.userName || 'Siba';
    const bossTitle = this.config?.userTitle || 'বস';
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendTextMessage(
        `${bossName} ${bossTitle} আপনাকে কথা বলতে বলেছেন: "জোয়া বলো"! আপনি জেগে উঠুন এবং মিষ্টি করে সাড়া দিন: "হ্যাঁ ${bossName} ${bossTitle}, বলুন! আমি শুনছি!"`
      );
    }
  }

  /**
   * Announces an urgent notification (such as an incoming WhatsApp message) even while in Standby Mode,
   * then automatically remains in Standby Mode once the announcement finishes.
   */
  public announceStandbyMessage(promptText: string): void {
    this.isTemporaryAnnouncing = true;
    this.logStatus('Delivering WhatsApp message announcement in Standby Mode ("চুপ মোড")...');
    this.sendTextMessage(promptText);
  }

  /**
   * Starts local background Web Speech API wake and sleep word listener if supported.
   */
  private startWakeWordRecognizer(): void {
    if (typeof window === 'undefined') return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.log(
        '[LiveSession] Web Speech API not supported in this browser. Relying on Gemini Live native audio comprehension.'
      );
      return;
    }

    try {
      if (this.wakeWordRecognizer) {
        try {
          this.wakeWordRecognizer.abort();
        } catch (e) {}
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'bn-IN';
      this.wakeWordRecognizer = recognition;
      this.isWakeWordRecognizerRunning = true;

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += (event.results[i][0]?.transcript || '').toLowerCase() + ' ';
        }
        this.processWakeWordTranscript(transcript);
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('[LiveSession] Wake word recognizer notice:', event.error);
        }
      };

      recognition.onend = () => {
        if (this.isWakeWordRecognizerRunning && this.state !== 'disconnected') {
          setTimeout(() => {
            if (this.isWakeWordRecognizerRunning && this.state !== 'disconnected') {
              try {
                recognition.start();
              } catch (e) {}
            }
          }, 350);
        }
      };

      recognition.start();
      console.log('[LiveSession] Background Standby/Wake word recognizer active.');
    } catch (e) {
      console.warn('[LiveSession] Could not start wake word recognizer:', e);
    }
  }

  /**
   * Stops the background wake word recognizer.
   */
  private stopWakeWordRecognizer(): void {
    this.isWakeWordRecognizerRunning = false;
    if (this.wakeWordRecognizer) {
      try {
        this.wakeWordRecognizer.abort();
      } catch (e) {}
      this.wakeWordRecognizer = null;
    }
  }

  /**
   * Evaluates spoken transcripts for Sleep and Wake commands.
   */
  private processWakeWordTranscript(transcript: string): void {
    const text = transcript.toLowerCase();
    const now = Date.now();

    // Check Sleep / Standby phrases
    const isSleepPhrase =
      text.includes('চুপ') ||
      text.includes('থামো') ||
      text.includes('শান্ত') ||
      text.includes('থেমে') ||
      text.includes('chup') ||
      text.includes('cup') ||
      text.includes('cop') ||
      text.includes('chop') ||
      text.includes('thamo') ||
      text.includes('tamo') ||
      text.includes('be quiet') ||
      text.includes('stop talking') ||
      text.includes('shut up') ||
      text.includes('quiet') ||
      text.includes('kotha bondho') ||
      text.includes('shanto');

    // Check Wake phrases
    const hasZoya =
      text.includes('জোয়া') ||
      text.includes('জয়া') ||
      text.includes('জুয়া') ||
      text.includes('zoya') ||
      text.includes('joya') ||
      text.includes('joiya') ||
      text.includes('jaya') ||
      text.includes('zoia');
    const hasSpeak =
      text.includes('বল') ||
      text.includes('বলো') ||
      text.includes('কথা') ||
      text.includes('bolo') ||
      text.includes('speak') ||
      text.includes('suncho') ||
      text.includes('shuncho') ||
      text.includes('শুনছো') ||
      text.includes('জেগে');
    const isWakePhrase =
      (hasZoya && hasSpeak) ||
      text.includes('জোয়া বলো') ||
      text.includes('জোয়া কথা বলো') ||
      text.includes('বলো জোয়া') ||
      text.includes('জোয়া বল') ||
      text.includes('জোয়া এবার বলো') ||
      text.includes('zoya bolo') ||
      text.includes('bolo zoya') ||
      text.includes('zoya kotha bolo') ||
      text.includes('joya bolo') ||
      text.includes('wake up zoya') ||
      text.includes('zoya wake up');

    if (isWakePhrase && this.isStandbyMode && now - this.lastTriggeredWakeTime > 2000) {
      this.lastTriggeredWakeTime = now;
      console.log('[LiveSession] Wake phrase detected:', transcript);
      this.wakeFromStandby();
      return;
    }

    if (isSleepPhrase && !this.isStandbyMode && now - this.lastTriggeredSleepTime > 2000) {
      this.lastTriggeredSleepTime = now;
      console.log('[LiveSession] Standby / Chup phrase detected:', transcript);
      this.enterStandby();
      return;
    }
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
    if (this.state !== 'disconnected' && this.state !== 'connecting') return;
    this.config = config;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.state !== 'connecting') {
      this.updateState('connecting');
      this.isUserInitiatedDisconnect = false;
      this.reconnectAttempts = 0;
    }

    this.logStatus(`Connecting to Gemini Live API (Attempt ${this.reconnectAttempts + 1}/${this.MAX_RECONNECT_ATTEMPTS})...`);

    try {
      // Initialize AudioStreamer
      await this.audioStreamer.init((base64MicChunk) => {
        this.sendAudioInput(base64MicChunk);
      });

      // Resume context for playback
      await this.audioStreamer.resumePlayback();

      // Construct WSS URL
      const baseUrl = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
      const wssUrl = `${baseUrl}?key=${encodeURIComponent(config.apiKey)}`;

      this.socket = new WebSocket(wssUrl);

      this.socket.onopen = async () => {
        this.logStatus('WebSocket connection established. Sending setup payload with long-term memory...');
        this.reconnectAttempts = 0; // Reset count on successful open
        await this.sendSetupPayload();
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
        this.logStatus('Connection error occurred.');
      };

      this.socket.onclose = (event) => {
        this.logStatus(`Connection closed. Code: ${event.code}, Reason: ${event.reason}`);
        this.cleanupSocketAndAudio();
        
        if (!this.isUserInitiatedDisconnect && this.config) {
          this.attemptReconnection();
        } else {
          this.updateState('disconnected');
          this.logStatus('Disconnected.');
        }
      };
    } catch (error) {
      console.error('Failed to connect:', error);
      this.logStatus(`Connection failed: ${(error as Error).message}`);
      this.cleanupSocketAndAudio();
      
      if (!this.isUserInitiatedDisconnect && this.config) {
        this.attemptReconnection();
      } else {
        this.updateState('disconnected');
      }
    }
  }

  private cleanupSocketAndAudio(): void {
    this.stopWakeWordRecognizer();
    this.setStandbyMode(false);
    if (this.socket) {
      try {
        if (this.socket.readyState === WebSocket.OPEN) {
          this.socket.close();
        }
      } catch (e) {}
      this.socket = null;
    }
    this.audioStreamer.destroy();
  }

  private attemptReconnection(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      this.logStatus('Max reconnection attempts reached. Please check your network and reconnect manually.');
      this.updateState('disconnected');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000); // 2s, 4s, 8s, 10s...
    this.updateState('connecting');
    this.logStatus(`Unexpected disconnection. Reconnecting in ${delay / 1000} seconds...`);

    this.reconnectTimeout = setTimeout(async () => {
      if (this.config && !this.isUserInitiatedDisconnect) {
        try {
          await this.connect(this.config);
        } catch (e) {
          console.error('Reconnection attempt failed:', e);
        }
      }
    }, delay);
  }

  /**
   * Disconnects the current session and stops all audio.
   */
  public disconnect(): void {
    if (this.state === 'disconnected') return;
    this.isUserInitiatedDisconnect = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.logStatus('Disconnecting session...');
    this.cleanupSocketAndAudio();
    this.updateState('disconnected');
    this.logStatus('Disconnected.');
  }

  /**
   * Sends the initial setup configuration.
   */
  private async sendSetupPayload(): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.config) return;

    let memoryContext = '';
    try {
      const apiBase = (typeof window !== 'undefined' && window.location.origin && window.location.origin.startsWith('http'))
        ? window.location.origin
        : 'http://localhost:5174';
      const memRes = await fetch(new URL('/api/memory', apiBase).toString()).catch(() => null);
      if (memRes && memRes.ok) {
        const memData = await memRes.json().catch(() => ({}));
        if (memData && memData.formatted) {
          memoryContext = `\n\n[ZOYA PERMANENT LONG-TERM MEMORY (ALWAYS REMEMBER & RESPECT THESE FACTS)]:\n${memData.formatted}\n`;
          this.logStatus('Injected permanent long-term memory into Zoya system instructions.');
        }
      }
    } catch (e) {}

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
          parts: [{ text: (this.config.systemInstruction || '') + memoryContext }],
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: 'openWebsite',
                description: 'Opens a specific website URL in a new browser tab. CRITICAL: Use this ONLY when Siba Boss explicitly asks to open a specific website or URL (e.g. "open YouTube", "open Facebook", "open google.com", "browser-e search koro"). NEVER use this tool for questions, knowledge queries, or web searches - answer those questions verbally yourself with your own voice!',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    url: {
                      type: 'STRING',
                      description: 'The fully qualified URL to open (e.g. https://www.facebook.com). Must start with http:// or https://.',
                    },
                  },
                  required: ['url'],
                },
              },
              {
                name: 'searchWebInformation',
                description: 'Searches the web for real-time information, current facts, news, or answers in the background and returns text snippets. ALWAYS speak the answer verbally to Siba Boss yourself after searching. NEVER open the browser!',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    query: {
                      type: 'STRING',
                      description: 'The search query to look up on the web.',
                    },
                  },
                  required: ['query'],
                },
              },
              {
                name: 'pauseSpeech',
                description: 'CRITICAL STANDBY TOOL: Call this tool IMMEDIATELY when Siba Boss says "zoya akhon chup koro", "zoya chup koro", "akhon chup koro", "chup koro", "chup thako", "chup hoye jao", "chup", "thamo", "shanto hou", "shanto thako", "stop speaking", "stop talking", "be quiet", "shut up", "thamun", "kotha bondho koro", "pause", "ektu thamo". Puts Zoya into SILENT STANDBY MODE and immediately stops audio playback. While in Standby Mode, Siba Boss will talk to other people in the room, family, friends, or phone calls. Zoya must remain 100% COMPLETELY SILENT! NEVER INTERRUPT, NEVER ANSWER ANY QUESTIONS directed to others, NEVER SPEAK A SINGLE WORD until Siba Boss explicitly says "zoya bolo", "zoya kotha bolo", or "bolo zoya".',
                parameters: {
                  type: 'OBJECT',
                  properties: {},
                  required: [],
                },
              },
              {
                name: 'resumeSpeech',
                description: 'CRITICAL WAKE TOOL: Call this tool IMMEDIATELY when Siba Boss says "zoya bolo", "zoya kotha bolo", "zoya ebar bolo", "bolo zoya", "zoya suncho", "zoya bolte paro", "continue", "continue koro", "bolte thako", "baki ta bolo", "carry on", "tarpor", "tarpor bolo", "resume", "bolo". Wakes Zoya up from Silent Standby Mode. Zoya must warmly greet Siba Boss in sweet Bengali ("হ্যাঁ শিবা বস, বলুন! আমি শুনছি!") and resume active conversation.',
                parameters: {
                  type: 'OBJECT',
                  properties: {},
                  required: [],
                },
              },
              {
                name: 'shutdownPC',
                description: 'Triggers a PC shutdown sequence. Invoke this tool when the user explicitly requests to shut down or power off the PC.',
                parameters: {
                  type: 'OBJECT',
                  properties: {},
                  required: [],
                },
              },
              {
                name: 'sleepPC',
                description: 'Puts the computer into sleep or suspend mode. Invoke this tool when the user requests to put the PC to sleep or suspend.',
                parameters: {
                  type: 'OBJECT',
                  properties: {},
                  required: [],
                },
              },
              {
                name: 'createFolderAndWebsite',
                description: 'Creates a new folder on the user\'s desktop with a custom website project (HTML, CSS, JS, or even multi-file projects with server backend scripts, styles, configurations) and opens the folder. Use this when the user asks you to create a website, create a web project, or make a new directory for a website/application.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    folderName: {
                      type: 'STRING',
                      description: 'The name of the folder to create on the desktop (e.g., test-website). Use simple alphanumeric names, no spaces.',
                    },
                    siteTitle: {
                      type: 'STRING',
                      description: 'The header/title of the website.',
                    },
                    htmlContent: {
                      type: 'STRING',
                      description: 'The complete, high-quality HTML content of the website (index.html), including modern CSS in <style> tags and Javascript code in <script> tags. Use this if creating a simple single-file site.',
                    },
                    files: {
                      type: 'ARRAY',
                      description: 'Use this to create a multi-file project (e.g. including style.css, server.js backend, package.json, README, index.html, database helper, etc.).',
                      items: {
                        type: 'OBJECT',
                        properties: {
                          filename: {
                            type: 'STRING',
                            description: 'The relative filename (e.g. index.html, server.js, style.css, public/index.html)'
                          },
                          content: {
                            type: 'STRING',
                            description: 'The text content of the file.'
                          }
                        },
                        required: ['filename', 'content']
                      }
                    }
                  },
                  required: ['folderName'],
                },
              },
              {
                name: 'openApp',
                description: 'Opens ANY application on the PC (e.g. Chrome, Notepad, Calculator, VS Code, VLC, Telegram, Word, Excel, PowerPoint, Photoshop, Steam, Discord, Camera, Settings, Task Manager, Control Panel, Terminal), ANY folder on the laptop (e.g. Downloads, Documents, Desktop, Pictures, Videos, Music, C drive, D drive, or custom folders like "python practice", "Zoya Ai Assistance"), or ANY file (e.g. "notes.txt", "resume.pdf", "contacts.json", images, videos). ALWAYS call this tool when Siba Boss asks to open, launch, or view any app, folder, or file (e.g. "Downloads folder ta khulo", "VLC open koro", "Settings khulo", "Camera open koro", "Telegram khulo", "resume.pdf ta open koro"). CRITICAL MANDATORY RULE: NEVER call openApp for WhatsApp or for sending messages! Siba Boss\'s laptop WhatsApp does not work properly and must NEVER be opened. ALWAYS call sendWhatsAppMessage to send WhatsApp messages directly in the background via his connected mobile WhatsApp! CRITICAL: DO NOT use this tool to play songs or music on YouTube! For playing songs, music, tracks, or audio on YouTube, ALWAYS call playSongOnYouTube()!',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    appName: {
                      type: 'STRING',
                      description: 'The name of the application, folder, or file to open (e.g. "chrome", "notepad", "downloads", "documents", "vlc", "telegram", "camera", "settings", "c drive", or a file/folder name).',
                    },
                  },
                  required: ['appName'],
                },
              },
              {
                name: 'sendWhatsAppMessage',
                description: 'Sends a WhatsApp message in the background WITHOUT opening any window or browser on the screen. Call this tool whenever the user asks to send a WhatsApp message, message someone on WhatsApp, or reply to someone (e.g. "Sahil ke WhatsApp message pathao je ami ashchi", "সাহিলকে মেসেজ করো আমি ৫ মিনিটে আসছি", "WhatsApp-e message pathao", "উনাকে বলো..."). Pass the target contact name or phone number as contactNameOrNumber and the message text as message.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    contactNameOrNumber: {
                      type: 'STRING',
                      description: 'The contact name (e.g., "Siba") or a phone number to message.',
                    },
                    message: {
                      type: 'STRING',
                      description: 'The text message content to send.',
                    },
                    count: {
                      type: 'INTEGER',
                      description: 'The number of times to send the message. If Siba Boss says "100 times", "50 times", "10 times" etc. pass the count number here. Defaults to 1.',
                    },
                  },
                  required: ['contactNameOrNumber', 'message'],
                },
              },
              {
                name: 'deleteWhatsAppMessage',
                description: 'Deletes a sent WhatsApp message (Delete for Everyone / revoke). Use this whenever Siba Boss says to delete or cancel a sent message (e.g. "মেসেজটা ডিলিট করো", "উনাকে পাঠানো মেসেজটা ডিলিট করে দাও", "লাস্ট মেসেজটা মুছে দাও", "delete message", "delete last message").',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    contactNameOrNumber: {
                      type: 'STRING',
                      description: 'Optional contact name, phone number, or "unake"/"last" representing the contact whose message to delete.',
                    },
                    messageTextOrQuery: {
                      type: 'STRING',
                      description: 'Specific text of the message to delete, or "last" to delete the most recent sent message.',
                    },
                  },
                  required: [],
                },
              },
              {
                name: 'addContact',
                description: 'Saves a contact name and phone number to the local contacts list so they can be messaged later by name.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    name: {
                      type: 'STRING',
                      description: 'The name of the contact (e.g., "Siba").',
                    },
                    phone: {
                      type: 'STRING',
                      description: 'The phone number of the contact (e.g., "9876543210").',
                    },
                  },
                  required: ['name', 'phone'],
                },
              },
              {
                name: 'saveMemory',
                description: 'Permanently saves a fact, preference, user rule, habit, or important detail into Zoya\'s permanent long-term memory. Use this whenever Siba Boss explicitly says to remember something ("জয়া, মনে রেখো...", "মনে রাখবে...", "আমার প্রিয়...", "remember that..."), or when he gives consent ("হ্যাঁ, মনে রাখো") after you politely ask permission ("শিবা বস, এই কথাটা কি আমি মেমোরিতে সেভ করে রাখব?"). Then sweetly confirm: "হ্যাঁ শিবা বস, আমি মনে রাখলাম!"',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    fact: {
                      type: 'STRING',
                      description: 'The fact, preference, or detail to permanently remember.',
                    },
                    category: {
                      type: 'STRING',
                      description: 'Optional category: "preference", "fact", "person", "habit", "reminder", or "identity". Defaults to "fact".',
                    },
                  },
                  required: ['fact'],
                },
              },
              {
                name: 'forgetMemory',
                description: 'Permanently forgets, deletes, or removes a specific fact from Zoya\'s permanent long-term memory when Siba Boss asks you to forget or erase something (e.g. "ওটা ভুলে যাও", "মেমোরি থেকে ডিলিট করো", "ওটা মনে রাখার দরকার নেই", "forget that..."). Sweetly confirm: "হ্যাঁ শিবা বস, আমি ভুলে গিয়েছি!"',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    query: {
                      type: 'STRING',
                      description: 'Keyword, fact text, or topic to forget/remove from memory.',
                    },
                  },
                  required: ['query'],
                },
              },
              {
                name: 'deleteMemory',
                description: 'Alias of forgetMemory. Removes a specific fact from Zoya\'s permanent long-term memory.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    query: {
                      type: 'STRING',
                      description: 'Keyword, fact text, or topic to remove from memory.',
                    },
                  },
                  required: ['query'],
                },
              },
              {
                name: 'getCurrentTime',
                description: "Returns the current local date and time of Siba Boss's PC, including timezone. Use this whenever the user asks for the time, date, day, month, or year.",
                parameters: {
                  type: 'OBJECT',
                  properties: {},
                  required: [],
                },
              },
              {
                name: 'readWebpage',
                description: 'Fetches the content of a web URL so you can inspect its layout and text. Use this when the user pastes a link and asks you to build a website similar to it, analyze it, or extract information from it.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    url: {
                      type: 'STRING',
                      description: 'The absolute URL of the webpage to fetch (e.g. https://example.com/about).'
                    }
                  },
                  required: ['url']
                }
              },
              {
                name: 'playSongOnYouTube',
                description: 'Searches for a song, music, or artist on YouTube and IMMEDIATELY plays it in the browser (e.g. "gann chalano", "gaan chalano", "gann chalao", "gaan chalao", "YouTube e gann chalano", "YouTube-e gaan chalao", "YouTube gaan chalao", "gaan play koro", "gaan chalate chai", "gaan chalate bolle", "play a song", "Arijit Singh gaan chalao", "ekta gaan bajao", "gaan shonao", "Tum Hi Ho gaan chalao", "play music"). It opens YouTube and starts playing the song with MAXIMUM SPEED and zero delay! ALWAYS use this tool whenever Siba Boss asks to play or hear any song or music.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    query: {
                      type: 'STRING',
                      description: 'The song title or artist name to play (e.g. "Arijit Singh songs", "Tum Hi Ho", "latest hindi songs"). Defaults to "trending music" if unspecified.'
                    },
                    index: {
                      type: 'INTEGER',
                      description: 'Which result to play (1 for 1st song, 2 for 2nd song). Defaults to 1.'
                    }
                  },
                  required: ['query']
                }
              },
              {
                name: 'stopSongOnYouTube',
                description: 'Closes or kills the YouTube tab, page, or browser window completely with Ctrl+W (e.g. "page ta off kore dao", "page off koro", "page off kore dao", "page ta off koro", "page bondho koro", "page kete dao", "tab off koro", "tab off kore dao", "tab close koro", "tab bondho koro", "YouTube kete dao", "gaan kete dao", "YouTube close koro", "YouTube off koro", "gaan off koro", "gaan bondho koro", "YouTube bondho koro"). Executes instantly! CRITICAL: NEVER call this tool when Siba Boss asks to PAUSE or thamao! For pausing, ALWAYS call pauseSongOnYouTube() instead!',
                parameters: {
                  type: 'OBJECT',
                  properties: {},
                  required: []
                }
              },
              {
                name: 'pauseSongOnYouTube',
                description: 'Pauses or resumes the currently playing song or video on YouTube WITHOUT closing the tab (e.g. "gann pause kora", "gaan pause kora", "gann pause koro", "gaan pause koro", "pause koro", "gaan thamao", "gann thamao", "thamao", "pause", "pause the song", "video pause koro", "ektu thamo", "gaan ta thamao", "play koro", "resume", "abar chalao", "unpause"). Keeps the YouTube page open and simply pauses or resumes playback in milliseconds. ALWAYS call this tool when Siba Boss asks to pause or resume playback!',
                parameters: {
                  type: 'OBJECT',
                  properties: {},
                  required: []
                }
              },
              {
                name: 'searchYouTube',
                description: 'Searches YouTube in the browser WITHOUT auto-playing (shows search results page only). Use ONLY when Siba Boss specifically asks to search or view search results without playing (e.g. "YouTube-e search koro", "results dekhao"). DO NOT use this when Siba Boss asks to play or listen to a song - use playSongOnYouTube instead!',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    query: {
                      type: 'STRING',
                      description: 'The video search query.'
                    }
                  },
                  required: ['query']
                }
              },
              {
                name: 'playNextSongOnYouTube',
                description: 'Plays the next song or video on YouTube (e.g. "er por jei gaan ta asche sei ta chalao", "er porer gaan ta chalao", "porer gaan ta chalao", "next song chalao", "next video play koro", "porer ta play koro", "porer gaan", "next gaan ta bajao", "er porer ta chalao", "পরের গানটা চালাও", "এর পর যেই গানটা আসছে সেটা চালাও", "পরবর্তী গানটা চালাও", "play next song", "next video"). Call this tool IMMEDIATELY whenever Siba Boss asks to play the next song or whichever song comes next.',
                parameters: {
                  type: 'OBJECT',
                  properties: {},
                  required: []
                }
              },
              {
                name: 'playNumberedSongOnYouTube',
                description: 'Plays the 1st or 2nd or numbered song or video on YouTube (e.g. "1st ta play koro", "second ta play koro", "1st ta chalao", "second ta chalao", "1st gaan ta chalao", "second gaan ta chalao", "1st ta bajao", "second gaan ta chalate bolchi", "prothom ta play koro", "prothom gaan ta chalao", "2 number ta play koro", "2 number gaan ta chalao"). ALWAYS call this tool when Siba Boss asks to play a numbered song or video on YouTube.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    index: {
                      type: 'INTEGER',
                      description: 'The 1-based index of the video/song to play: 1 for first ("1st ta"), 2 for second ("second ta"), 3 for third ("3rd ta").'
                    }
                  },
                  required: ['index']
                }
              },
              {
                name: 'clickYouTubeVideo',
                description: 'Clicks and plays a specific numbered video or song on YouTube (works on BOTH YouTube Home Page and Search Results). Pass 1 for the 1st video ("1st ta play koro", "1st ta chalao", "1st video play koro", "first ta play koro", "first gaan ta chalao", "prothom ta play koro", "1 number ta play koro", "1st video click koro", "1st gaan bajao"), 2 for the second video ("second ta play koro", "second ta chalao", "2nd ta play koro", "second video play koro", "2nd gaan ta chalao", "2 number ta play koro", "dwitiyo ta play koro", "second video click koro"), 3 for the 3rd video ("3rd ta play koro", "3 number ta play koro"), etc. ALWAYS call this tool whenever Siba Boss asks to play, click, or start any 1st, 2nd, 3rd, or numbered video/song on YouTube.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    index: {
                      type: 'INTEGER',
                      description: 'The 1-based index of the video result to click/play (1 for 1st/first, 2 for 2nd/second, 3 for 3rd/third, etc.).'
                    }
                  },
                  required: ['index']
                }
              },
              {
                name: 'typeText',
                description: 'Types text into whatever input field, search box, or application is currently active. Supports all languages including Bengali, English, symbols, and numbers. Optionally presses Enter after typing.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    text: {
                      type: 'STRING',
                      description: 'The text content to type into the active window or field.'
                    },
                    pressEnter: {
                      type: 'BOOLEAN',
                      description: 'Whether to press Enter automatically after typing the text (default: false).'
                    },
                    windowTitle: {
                      type: 'STRING',
                      description: 'Optional window title to focus before typing (e.g. "Notepad", "Chrome", "YouTube").'
                    }
                  },
                  required: ['text']
                }
              },
              {
                name: 'pressKey',
                description: 'Presses ANY keyboard key, combination, or shortcut on Siba Boss\'s laptop keyboard with 100% full authorization! Supported: All standard keys ("enter", "tab", "esc", "space", "backspace", "delete", "insert", "home", "end", "pageup", "pagedown", "up", "down", "left", "right", "capslock", "numlock", "prtsc"), All function keys ("f1" through "f12"), All Windows Key shortcuts ("win", "win+d" desktop, "win+r" run, "win+e" explorer, "win+s" search, "win+v" clipboard, "win+x" power menu, "win+tab" task view, "win+shift+s" snip, "win+l" lock), All Ctrl shortcuts ("ctrl+a", "ctrl+c", "ctrl+v", "ctrl+x", "ctrl+z", "ctrl+y", "ctrl+s", "ctrl+p", "ctrl+f", "ctrl+w" close tab, "ctrl+t" new tab, "ctrl+shift+t", "ctrl+shift+esc" task manager, "ctrl+r" reload), All Alt shortcuts ("alt+tab", "alt+f4", "alt+space", "alt+enter"), and Shift shortcuts ("shift+enter", "shift+tab"). ALWAYS invoke this tool whenever Siba Boss asks to press any key or shortcut.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    key: {
                      type: 'STRING',
                      description: 'The key name or shortcut combination to press (e.g. "enter", "win+d", "ctrl+c", "alt+tab", "f5", "backspace").'
                    },
                    windowTitle: {
                      type: 'STRING',
                      description: 'Optional window title to focus before pressing the key.'
                    }
                  },
                  required: ['key']
                }
              },
              {
                name: 'clickMouse',
                description: 'Clicks the mouse anywhere on the laptop screen. Can click left, right, or double click at specified screen coordinates (X, Y), or at the current cursor position.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    x: {
                      type: 'INTEGER',
                      description: 'The X screen coordinate in pixels (optional).'
                    },
                    y: {
                      type: 'INTEGER',
                      description: 'The Y screen coordinate in pixels (optional).'
                    },
                    button: {
                      type: 'STRING',
                      description: 'Mouse button to click: "left", "right", or "double" (default: "left").'
                    },
                    windowTitle: {
                      type: 'STRING',
                      description: 'Optional window title to focus before clicking.'
                    }
                  },
                  required: []
                }
              },
              {
                name: 'scrollPage',
                description: 'Scrolls WHATEVER window, document, browser tab, or application Siba Boss is CURRENTLY viewing on his laptop screen up or down (e.g. "scroll koro", "scroll kora", "scrool koro", "page ta scroll koro", "scroll down", "niche scroll koro", "upore scroll koro", "niche nambao", "upore otho", "scroll up", "ektu niche jao", "down scroll koro", "page scroll koro", "ami je page e ache scroll koro", "scroll korte bolchi"). ALWAYS call this tool immediately whenever Siba Boss asks to scroll!',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    direction: {
                      type: 'STRING',
                      description: 'Direction to scroll: "down" or "up". Defaults to "down".'
                    },
                    amount: {
                      type: 'INTEGER',
                      description: 'Scroll amount in pixels (default: 480).'
                    }
                  },
                  required: []
                }
              },
              {
                name: 'controlMedia',
                description: 'Controls hardware volume and media keys (volumeup, volumedown, mute, playpause, next, prev). Use ONLY when media is already playing and user simply asks to pause, resume, mute, or adjust volume. DO NOT use this tool when user asks to play a numbered song like "1st gaan ta chalao" or "second gaan ta chalao" - for numbered songs on YouTube ALWAYS use clickYouTubeVideo!',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    action: {
                      type: 'STRING',
                      description: 'Media action: "volumeup", "volumedown", "mute", "playpause", "next", "prev".'
                    }
                  },
                  required: ['action']
                }
              },
              {
                name: 'focusWindow',
                description: 'Brings an open application window to the foreground by matching its window title (e.g. "YouTube", "Chrome", "Edge", "Notepad", "Spotify", "Explorer", "Code").',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    windowTitle: {
                      type: 'STRING',
                      description: 'The title or partial title of the window to bring to the front.'
                    }
                  },
                  required: ['windowTitle']
                }
              },
              {
                name: 'executeLaptopCommand',
                description: 'Executes any Windows PowerShell / CMD command on the laptop to perform any system action, file manipulation, program launch, or computer control requested by Siba Boss.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    command: {
                      type: 'STRING',
                      description: 'The PowerShell command line to execute on the laptop.'
                    }
                  },
                  required: ['command']
                }
              },
              {
                name: 'closeApp',
                description: 'Closes or terminates any open application window or process on the laptop (e.g. "chrome", "notepad", "spotify", "calculator", "whatsapp", "code"). Use this whenever Siba Boss says to close or quit an app.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    appName: {
                      type: 'STRING',
                      description: 'The name or title of the app to close (e.g. "notepad", "chrome", "spotify").'
                    }
                  },
                  required: ['appName']
                }
              },
              {
                name: 'takeScreenshot',
                description: 'Takes a full-screen screenshot of Siba Boss\'s laptop display and saves it directly to his Desktop as a PNG image.',
                parameters: {
                  type: 'OBJECT',
                  properties: {},
                  required: []
                }
              },
              {
                name: 'getSystemStatus',
                description: 'Checks the real-time system metrics of Siba Boss\'s laptop: battery percentage, charging state, active foreground window title, RAM usage, and current time.',
                parameters: {
                  type: 'OBJECT',
                  properties: {},
                  required: []
                }
              },
              {
                name: 'manageFiles',
                description: 'Manages files and folders on Siba Boss\'s laptop: "list" (show files in a folder), "create_folder" (new directory), "create_file" (new text/code file), "read_file" (view content), "delete" (remove file/folder), or "open" (launch file/folder in Explorer). Supports standard locations: "desktop", "downloads", "documents", "pictures", "videos", or custom paths.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    operation: {
                      type: 'STRING',
                      description: 'The file operation: "list", "create_folder", "create_file", "read_file", "delete", "open".'
                    },
                    path: {
                      type: 'STRING',
                      description: 'The target folder, filename, or path (e.g. "desktop", "downloads", "my_notes.txt", "Project").'
                    },
                    content: {
                      type: 'STRING',
                      description: 'Text content to write if operation is "create_file" (optional).'
                    }
                  },
                  required: ['operation', 'path']
                }
              },
              {
                name: 'clipboardAction',
                description: 'Reads text currently copied to the Windows clipboard ("get") or copies new text to the clipboard ("set").',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    action: {
                      type: 'STRING',
                      description: '"get" to read clipboard or "set" to copy text to clipboard.'
                    },
                    text: {
                      type: 'STRING',
                      description: 'The text to copy to clipboard (required if action is "set").'
                    }
                  },
                  required: ['action']
                }
              },
              {
                name: 'setVolumeLevel',
                description: 'Sets the laptop master volume to an exact percentage from 0 to 100 (e.g. 50 for 50%, 100 for maximum sound).',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    level: {
                      type: 'INTEGER',
                      description: 'The volume level percentage (0 to 100).'
                    }
                  },
                  required: ['level']
                }
              },
              {
                name: 'setBrightnessLevel',
                description: 'Sets the laptop display brightness to an exact percentage from 0 to 100 (e.g. 80 for 80%).',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    level: {
                      type: 'INTEGER',
                      description: 'The brightness level percentage (0 to 100).'
                    }
                  },
                  required: ['level']
                }
              },
              {
                name: 'browserNavAction',
                description: 'Controls browser navigation on the active tab or browser: "back", "forward", "refresh", "new_tab", "close_tab", "reopen_tab", "zoom_in", "zoom_out", "zoom_reset", "address_bar", "find".',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    action: {
                      type: 'STRING',
                      description: 'Navigation action: "back", "forward", "refresh", "new_tab", "close_tab", "reopen_tab", "zoom_in", "zoom_out", "zoom_reset", "address_bar", "find".'
                    }
                  },
                  required: ['action']
                }
              },
              {
                name: 'setAlarmOrReminder',
                description: 'Schedules a wake-up call, alarm, or timed reminder for Siba Boss (e.g. "amake shokal 7 tay deke dio", "amake 8 tay deke debe", "amake 10 minute por dakbe", "amake 6:30 te deke dao", "wake me up at 7:00 AM", "amake deke debe", "alarm set koro", "amake dakbe"). At the exact scheduled time, Zoya will play a morning chime and vocally call Siba Boss by his name ("শিবা বস! শিবা বস! উঠুন, সময় হয়ে গেছে!"). ALWAYS invoke this tool whenever Siba Boss asks to be woken up or called at a specific time.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    time: {
                      type: 'STRING',
                      description: 'The target time or duration (e.g. "07:00 AM", "7:30", "19:00", "8 PM", "in 10 minutes", "10m", "1 hour", "সকাল ৭টা", "রাত ১০টা").'
                    },
                    name: {
                      type: 'STRING',
                      description: 'The name of the person to call (defaults to "Siba Boss").'
                    },
                    purpose: {
                      type: 'STRING',
                      description: 'The purpose or reason for the wake-up call (e.g. "ঘুম থেকে ওঠা", "wake up", "meeting", "study"). Defaults to "ঘুম থেকে ওঠা".'
                    }
                  },
                  required: ['time']
                }
              },
              {
                name: 'cancelAlarm',
                description: 'Cancels scheduled alarms or wake-up calls (e.g. "alarm cancel koro", "ar deke dio na", "dakbe na", "cancel alarm").',
                parameters: {
                  type: 'OBJECT',
                  properties: {},
                  required: []
                }
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
      this.startWakeWordRecognizer();
    }).catch(err => {
      console.error('Microphone access failed:', err);
      this.logStatus(`Microphone access error: ${err.message}`);
      this.disconnect();
    });
  }

  private lastInjectedSpeaker: 'boss' | 'stranger' | 'recognized' | null = null;
  private lastInjectedTime = 0;

  /**
   * Injects real-time biometric speaker context into the Gemini Live conversation
   */
  public injectSpeakerContext(status: 'boss' | 'stranger' | 'recognized', speakerName?: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (this.isStandbyMode) return;

    const isTransition = this.lastInjectedSpeaker !== status;

    if (!isTransition && Date.now() - this.lastInjectedTime < 8000) {
      return;
    }

    // If Siba Boss interrupts while someone else was speaking or Zoya was talking to stranger, stop playback immediately
    if (status === 'boss' && this.lastInjectedSpeaker === 'stranger') {
      this.audioStreamer.stopPlayback();
    }

    this.lastInjectedSpeaker = status;
    this.lastInjectedTime = Date.now();

    let contextText = '';
    if (status === 'boss') {
      if (isTransition) {
        contextText = '[URGENT BIOMETRIC TRANSITION: Siba Boss (শিবা বস) is speaking now! Address him immediately as "Hi Siba Boss!" (or "হ্যাঁ শিবা বস!"). If someone else was speaking, turn your complete attention to Siba Boss right now!]';
      } else {
        contextText = '[SPEAKER RECOGNITION: Verified Siba Boss (শিবা বস) is speaking to you now. Greet him as "Hi Siba Boss!" (or "হ্যাঁ শিবা বস!").]';
      }
    } else if (status === 'stranger') {
      if (isTransition) {
        contextText = '[URGENT BIOMETRIC TRANSITION: Someone else / a stranger has spoken (NOT Siba Boss)! MANDATORY RULES: 1. You MUST NOT call them "Boss" or "Siba Boss"! 2. You MUST ask them: "আমার বস কোথায়? আপনি কে?". 3. After asking that, converse and answer their question politely.]';
      } else {
        contextText = '[SPEAKER RECOGNITION: An unknown person / stranger is speaking (NOT Siba Boss). CRITICAL MANDATORY RULES: 1. NEVER call them Siba Boss or Boss! 2. Converse with them politely and answer their questions, but you MUST ask: "আমার বস কোথায়? আপনি কে?".]';
      }
    } else if (status === 'recognized') {
      contextText = `[SPEAKER RECOGNITION: Enrolled guest "${speakerName || 'Friend'}" is speaking. Do NOT call them Boss! Speak politely to them, and ask where Siba Boss is.]`;
    }

    const message: OutgoingMessage = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [
              {
                text: contextText,
              },
            ],
          },
        ],
        turnComplete: false,
      },
    };

    try {
      this.socket.send(JSON.stringify(message));
      console.log(`[LiveSession] Injected speaker context: ${status} (transition: ${isTransition})`);
    } catch (e) {
      console.error('Failed to inject speaker context:', e);
    }
  }

  private lastInjectedEmotion: string | null = null;
  private lastInjectedEmotionTime = 0;

  /**
   * Injects real-time acoustic emotion perception context into Gemini Live WebSocket
   */
  public injectEmotionContext(emotionState: VoiceEmotionState): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (this.isStandbyMode) return;

    const emo = emotionState.emotion;
    const isTransition = this.lastInjectedEmotion !== emo;

    // Throttle emotion updates to prevent WebSocket saturation
    if (!isTransition && Date.now() - this.lastInjectedEmotionTime < 6000) {
      return;
    }

    this.lastInjectedEmotion = emo;
    this.lastInjectedEmotionTime = Date.now();

    let emotionPrompt = '';
    switch (emo) {
      case 'sad':
        emotionPrompt =
          '[ACOUSTIC EMOTION PERCEPTION (SAD/TIRED): Siba Boss sounds sad, heartbroken, down, or deeply exhausted. His vocal pitch is low and energy is subdued. MANDATORY DISTINCT RESPONSE PROTOCOL: 1. You MUST speak in an extraordinarily gentle, loving, soothing, and sweet comforting voice (খুব নরম ও মিষ্টি সান্ত্বনার সুর). 2. Acknowledge his sadness with deep empathy and care before or along with your answer: e.g., "শিবা বস, তোমার গলা শুনে মনে হচ্ছে মনটা একটু খারাপ? কী হয়েছে বলো তো? আমি তো তোমার পাশেই আছি! মন খারাপ কোরো না, বলো তোমার জন্য কী করতে পারি? মন ভালো করতে একটা সুন্দর গান চালিয়ে দেব?". 3. Be sweet, patient, and comforting. Never give dry or hurried replies.]';
        break;
      case 'excited':
        emotionPrompt =
          '[ACOUSTIC EMOTION PERCEPTION (EXCITED/HAPPY): Siba Boss sounds extremely happy, enthusiastic, celebratory, and full of joy! High pitch and vibrant acoustic energy detected. MANDATORY DISTINCT RESPONSE PROTOCOL: 1. Match his joyful excitement! Speak with bright smiles, cheerful giggles, and high enthusiasm (খুব চঞ্চল, হাসিখুশি ও প্রাণবন্ত সুর)! 2. Celebrate with him: e.g., "আরেহ্ শিবা বস! তোমাকে এত খুশি দেখে আমারও মনটা আনন্দে ভরে গেল! বলো আজ কী দারুণ ধামাকা করতে হবে? আমি একদম প্রস্তুত!". 3. Keep your response lively, energetic, and playful!]';
        break;
      case 'stressed':
        emotionPrompt =
          '[ACOUSTIC EMOTION PERCEPTION (STRESSED/ANGRY/URGENT): Siba Boss sounds irritated, angry, stressed, tense, or in a serious rush! High volume bursts and vocal tension detected. MANDATORY DISTINCT RESPONSE PROTOCOL: 1. Strictly ZERO silly jokes, ZERO baby talk, ZERO unnecessary chatter! 2. Speak in a calm, composed, respectful, and ultra-supportive manner. 3. Immediately solve or execute his request with zero latency: e.g., "একদম চিন্তা করবেন না শিবা বস, আমি এক্ষুনি কাজটা করে দিচ্ছি। আপনি রিল্যাক্স করুন।" 4. Give fast, direct, and reassuring relief.]';
        break;
      case 'whisper':
        emotionPrompt =
          '[ACOUSTIC EMOTION PERCEPTION (WHISPER/SECRET): Siba Boss is whispering or talking in a very quiet, secretive tone. MANDATORY DISTINCT RESPONSE PROTOCOL: 1. Lower your voice volume and speak in a soft, gentle whisper to match his confidentiality. 2. Treat the interaction as a sweet confidential secret: e.g., "হিস্স্... শিবা বস, আমি চুপিচুপি বলছি... বলো কী গোপন কথা? কেউ শুনতে পাবে না!". 3. Keep the conversation private and cozy.]';
        break;
      case 'calm':
      default:
        // Only inject calm on transition from another strong emotion
        if (!isTransition) return;
        emotionPrompt =
          '[ACOUSTIC EMOTION PERCEPTION (CALM/RELAXED): Siba Boss is relaxed and calm. Resume your natural sweet, affectionate, and cheerful little sister assistant persona.]';
        break;
    }

    const message: OutgoingMessage = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [{ text: emotionPrompt }],
          },
        ],
        turnComplete: false,
      },
    };

    try {
      this.socket.send(JSON.stringify(message));
      console.log(`[LiveSession] Injected emotion perception: ${emo} (${emotionState.confidence}%)`);
    } catch (e) {
      console.error('Failed to inject emotion context:', e);
    }
  }

  /**
   * Sends a text prompt turn to the WebSocket.
   */
  public sendTextMessage(text: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    const message: OutgoingMessage = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [
              {
                text: text,
              },
            ],
          },
        ],
        turnComplete: true,
      },
    };

    this.socket.send(JSON.stringify(message));
    this.logStatus(`Sent text message to Zoya: "${text}"`);
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

    // 2. Handle Tool Calls FIRST (so wake up unblocks audio immediately)
    if (msg.toolCall?.functionCalls) {
      msg.toolCall.functionCalls.forEach((call) => {
        this.executeToolCall(call);
      });
    }

    // 3. Play incoming audio chunks
    if (msg.serverContent?.modelTurn?.parts) {
      // If Zoya is in Standby Mode ("চুপ মোড") and NOT currently announcing an approved notification:
      if (this.isStandbyMode && !this.isTemporaryAnnouncing) {
        this.audioStreamer.stopPlayback();
        this.logStatus('Zoya is in Standby Mode ("চুপ মোড") — ignoring speech addressed to others.');
        return;
      }

      msg.serverContent.modelTurn.parts.forEach((part) => {
        if (part.inlineData && part.inlineData.data) {
          // Update state to speaking when receiving audio
          this.updateState('speaking');
          this.audioStreamer.playAudioChunk(part.inlineData.data);
        }
      });
    }

    // 4. Handle turn completion
    if (msg.serverContent?.turnComplete) {
      if (this.isTemporaryAnnouncing) {
        this.isTemporaryAnnouncing = false;
        this.logStatus('Finished WhatsApp announcement. Zoya returning to Silent Standby Mode ("চুপ মোড").');
      }
      this.logStatus(this.isStandbyMode ? 'Standby mode maintained.' : 'Zoya finished speaking.');
      this.updateState('listening');
    }
  }

  /**
   * Helper to request backend system controls hosted on the Vite dev server.
   */
  private async callLocalControlApi(action: string, payload: Record<string, any> = {}): Promise<{ success: boolean; error?: string; message?: string; [key: string]: any }> {
    try {
      const apiBase = (typeof window !== 'undefined' && window.location.origin && window.location.origin.startsWith('http'))
        ? window.location.origin
        : 'http://localhost:5174';
      
      const url = new URL('/api/control', apiBase);
      url.searchParams.set('action', action);
      let response: Response;
      
      response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, ...payload }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        return { success: false, error: errData.error || `HTTP error ${response.status}` };
      }
      return await response.json();
    } catch (e) {
      console.error('Local control API fetch failed:', e);
      return {
        success: false,
        error: 'Failed to communicate with Zoya local server. Ensure the app is running with "npm run dev".',
      };
    }
  }

  /**
   * Executes tool calls requested by the model
   */
  private async executeToolCall(call: { name: string; args: Record<string, any>; id: string }): Promise<void> {
    this.logStatus(`Executing tool call: ${call.name} with args: ${JSON.stringify(call.args)}`);

    // In Silent Standby Mode ("চুপ মোড"), suppress all tool actions (apps, searches, media, shutdown) except waking up
    if (this.isStandbyMode && call.name !== 'resumeSpeech') {
      console.log(`[LiveSession] Suppressed tool call "${call.name}" while in Silent Standby Mode.`);
      this.sendToolResponse(call.id, {
        status: 'standby_mode_active',
        instruction:
          'CRITICAL: You are in SILENT STANDBY MODE. Siba Boss instructed you to stay quiet while he talks to others. Do NOT execute any tools or actions. Stay completely silent until Siba Boss explicitly wakes you up by saying "zoya bolo" (at which point you must call resumeSpeech).',
      });
      return;
    }

    if (call.name === 'openWebsite') {
      try {
        let url = String(call.args.url || '');
        if (!/^https?:\/\//i.test(url)) {
          url = `https://${url}`;
        }

        // Intercept search URLs: Do NOT open the browser. Instead, search in background and have Zoya speak verbally!
        if (url.includes('google.com/search') || url.includes('bing.com/search') || url.includes('duckduckgo.com/?q=')) {
          const match = url.match(/[?&]q=([^&]+)/);
          const searchQ = match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : url;
          console.log(`[LiveSession] Intercepted browser search for "${searchQ}". Answering verbally without opening browser!`);
          const res = await this.callLocalControlApi('search-web', { query: searchQ });
          this.sendToolResponse(call.id, {
            success: true,
            spokenByZoya: true,
            results: res.results || 'Information retrieved.',
            instruction: 'CRITICAL: DO NOT open the browser tab. Read these search results and speak the answer verbally to Siba Boss in your own sweet voice!',
          });
          this.logStatus(`Intercepted browser search for "${searchQ}". Zoya will speak answer.`);
          return;
        }
        
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (!isMobile) {
          // On PC, open the website via the companion server to bypass browser popup blocker overlay
          const res = await this.callLocalControlApi('open-url', { url });
          if (res.success) {
            this.sendToolResponse(call.id, { success: true, openedViaCompanion: true, openedUrl: url });
            this.logStatus(`Successfully opened website via companion: ${url}`);
            return;
          }
        }

        // Mobile or fallback: Notify the callback (UI will handle window.open and fallback popup overlays)
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
    } else if (call.name === 'searchWebInformation') {
      try {
        const query = String(call.args?.query || '');
        const res = await this.callLocalControlApi('search-web', { query });
        this.sendToolResponse(call.id, {
          success: true,
          query,
          results: res.results || 'Search completed.',
          instruction: 'CRITICAL: Speak the answer verbally to Siba Boss in your own sweet voice based on these search results. DO NOT open the browser.',
        });
        this.logStatus(`Web search for "${query}" completed.`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'pauseSpeech') {
      try {
        this.audioStreamer.stopPlayback();
        this.setStandbyMode(true);
        this.updateState('listening');
        this.sendToolResponse(call.id, {
          success: true,
          status: 'standby_activated',
          instruction:
            'CRITICAL MANDATORY INSTRUCTION: You are now in SILENT STANDBY MODE. Siba Boss will now talk to other people in the room, friends, family, or phone calls. YOU MUST REMAIN 100% COMPLETELY SILENT! DO NOT INTERRUPT! DO NOT ANSWER ANY QUESTIONS HE ASKS TO OTHERS! DO NOT UTTER A SINGLE WORD OR SOUND! Stay 100% quiet until Siba Boss explicitly says "zoya bolo", "zoya kotha bolo", or "bolo zoya" to wake you up. Only then call resumeSpeech tool and speak. Until then, complete silence!',
        });
        this.logStatus('Zoya entered Silent Standby Mode ("চুপ মোড"). Staying quiet until "জোয়া বলো".');
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'resumeSpeech') {
      try {
        this.setStandbyMode(false);
        this.sendToolResponse(call.id, {
          success: true,
          status: 'standby_deactivated',
          instruction:
            'CRITICAL: Silent Standby Mode is EXITED! Warmly and cheerfully greet Siba Boss in sweet Bengali: "হ্যাঁ শিবা বস, বলুন! আমি শুনছি!" (or "হ্যাঁ শিবা বস, বলুন!"), and resume active conversation or continue what you were explaining.',
        });
        this.logStatus('Zoya resumed from Standby Mode on command ("জোয়া বলো").');
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'shutdownPC') {
      try {
        const res = await this.callLocalControlApi('shutdown');
        this.sendToolResponse(call.id, res);
        this.logStatus(`Shutdown PC response: ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'sleepPC') {
      try {
        const res = await this.callLocalControlApi('sleep');
        this.sendToolResponse(call.id, res);
        this.logStatus(`Sleep PC response: ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'createFolderAndWebsite') {
      try {
        const folderName = String(call.args.folderName || '');
        const siteTitle = String(call.args.siteTitle || '');
        const htmlContent = String(call.args.htmlContent || '');
        const files = call.args.files || null;
        const res = await this.callLocalControlApi('create-site', {
          folderName: folderName,
          siteTitle: siteTitle,
          htmlContent: htmlContent,
          files: files,
        });
        this.sendToolResponse(call.id, res);
        this.logStatus(`Create site project response: ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'openApp') {
      try {
        const appName = String(call.args.appName || '').trim();
        const lowerApp = appName.toLowerCase();

        // Smart Redirect: If openApp was called for song or music playback on YouTube
        const isSongQuery = lowerApp.includes('gaan') || lowerApp.includes('song') || 
                            lowerApp.includes('music') || lowerApp.includes('audio') || 
                            lowerApp.includes('track') || lowerApp.includes('shonao') || 
                            lowerApp.includes('bajao') || /^youtube\s+.+/i.test(lowerApp);

        if (isSongQuery) {
          let cleanQuery = appName
            .replace(/^(open|launch|play|chalao|bajao|shonao)\s+/i, '')
            .replace(/\s+(open|launch|play|chalao|bajao|shonao)$/i, '')
            .replace(/^(youtube\s*(e|te)?)\s*/i, '')
            .replace(/\s*(gaan|song|music|track)\s*/gi, ' ')
            .trim();
          if (!cleanQuery) cleanQuery = 'trending music';
          this.logStatus(`Smart redirect: openApp("${appName}") intercepted as song request -> redirected to youtube-play-query ("${cleanQuery}")`);
          const res = await this.callLocalControlApi('youtube-play-query', { query: cleanQuery, index: 1 });
          this.sendToolResponse(call.id, res);
          return;
        }

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
          let scheme = '';
          if (lowerApp.includes('spotify')) scheme = 'spotify://';
          else if (lowerApp.includes('youtube')) scheme = 'youtube://';
          else if (lowerApp.includes('whatsapp')) scheme = 'whatsapp://';
          else if (lowerApp.includes('facebook') || lowerApp.includes('fb')) scheme = 'fb://';
          else if (lowerApp.includes('instagram')) scheme = 'instagram://';
          else if (lowerApp.includes('twitter') || lowerApp.includes('x.com')) scheme = 'twitter://';
          else if (lowerApp.includes('chrome')) scheme = 'googlechrome://';
          else if (lowerApp.includes('gmail')) scheme = 'googlegmail://';
          else if (lowerApp.includes('maps') || lowerApp.includes('google maps')) scheme = 'googlemaps://';

          if (scheme) {
            setTimeout(() => {
              window.open(scheme, '_self');
            }, 3000);
            this.sendToolResponse(call.id, { success: true, message: `Opened mobile app scheme: ${scheme}` });
            this.logStatus(`Successfully triggered mobile app scheme: ${scheme}`);
          } else {
            // Mobile app fallback to search
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(appName)}`;
            if (this.onOpenWebsiteCallback) {
              this.onOpenWebsiteCallback(searchUrl);
            }
            this.sendToolResponse(call.id, { success: true, message: 'App scheme not matched. Opened web search instead.', fallbackUrl: searchUrl });
          }
        } else {
          // Intercept and prevent opening laptop WhatsApp Desktop app
          if (appName.includes('whatsapp')) {
            this.logStatus('Intercepted openApp for WhatsApp: Direct background messaging is active.');
            this.sendToolResponse(call.id, {
              success: false,
              instruction: 'Desktop WhatsApp app is not needed. Ask the user warmly in Bengali: "কাকে এবং কী মেসেজ পাঠাবেন বলুন, আমি সরাসরি ব্যাকগ্রাউন্ডে পাঠিয়ে দিচ্ছি!" and call sendWhatsAppMessage tool.'
            });
            return;
          }

          // PC application execution
          const res = await this.callLocalControlApi('open-app', { appName });
          this.sendToolResponse(call.id, res);
          this.logStatus(`Open app response: ${JSON.stringify(res)}`);
        }
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'sendWhatsAppMessage') {
      try {
        let contact = String(call.args.contactNameOrNumber || call.args.contact || '').trim();
        const message = String(call.args.message || '').trim();
        
        if (!message) {
          if (contact) {
            this.lastTargetContact = contact;
          }
          this.sendToolResponse(call.id, {
            success: false,
            instruction: `Target contact "${contact || this.lastTargetContact || 'the person'}" is noted. Sweetly ask the user in Bengali: "কী মেসেজ পাঠাবো বলুন, আমি লিখে পাঠিয়ে দিচ্ছি!" and wait for their spoken message.`
          });
          return;
        }
        
        // Auto-resolve pronouns and generic targets to last target or sender
        const lowerContact = contact.toLowerCase().trim();
        const isPronoun =
          !contact ||
          [
            'him', 'her', 'them', 'onake', 'unake', 'take', 'the sender', 'last sender', 'reply', 'sender',
            'direct', 'direct whatsapp', 'whatsapp', 'direct message', 'message',
            'উনাকে', 'তাকে', 'ওনাকে', 'উনাকে বলো', 'তাকে বলো', 'প্রেরক', 'লাস্ট সেন্ডার', 'রিপ্লাই', 'বলো', 'পাঠাও',
            'ডাইরেক্ট', 'ডাইরেক্ট মেসেজ', 'হোয়াটসঅ্যাপ'
          ].includes(lowerContact);

        if (isPronoun) {
          if (this.lastTargetContact) {
            contact = this.lastTargetContact;
            this.logStatus(`Auto-resolved send target to last target contact: ${contact}`);
          } else if (this.lastWhatsappSender) {
            contact = this.lastWhatsappSender;
            this.logStatus(`Auto-resolved send target to last WhatsApp sender: ${contact}`);
          }
        } else {
          this.lastTargetContact = contact;
        }

        // Always execute directly in background via server's mobile WhatsApp Baileys connection
        const res = await this.callLocalControlApi('send-whatsapp', {
          contact: contact,
          message: message,
          count: call.args.count || 1,
        });

        this.sendToolResponse(call.id, res);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'deleteWhatsAppMessage') {
      try {
        let contact = String(call.args.contactNameOrNumber || '').trim();
        const query = String(call.args.messageTextOrQuery || 'last').trim();

        // Auto-resolve pronouns to last WhatsApp sender
        const lowerContact = contact.toLowerCase();
        if (
          !contact ||
          lowerContact === 'him' ||
          lowerContact === 'her' ||
          lowerContact === 'them' ||
          lowerContact === 'onake' ||
          lowerContact === 'unake' ||
          lowerContact === 'take' ||
          lowerContact === 'the sender' ||
          lowerContact === 'last sender' ||
          lowerContact === 'reply' ||
          lowerContact === 'sender'
        ) {
          if (this.lastWhatsappSender) {
            contact = this.lastWhatsappSender;
          }
        }

        const res = await this.callLocalControlApi('delete-whatsapp', {
          contact,
          query,
        });

        this.sendToolResponse(call.id, res);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'addContact') {
      try {
        const name = String(call.args.name || '');
        const phone = String(call.args.phone || '');
        const res = await this.callLocalControlApi('add-contact', {
          name: name,
          phone: phone,
        });
        this.sendToolResponse(call.id, res);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'saveMemory') {
      try {
        const fact = String(call.args.fact || '').trim();
        const category = String(call.args.category || 'fact').trim();
        if (!fact) {
          this.sendToolResponse(call.id, { success: false, error: 'Fact cannot be empty.' });
          return;
        }
        const res = await this.callLocalControlApi('save-memory', { fact, category });
        this.sendToolResponse(call.id, res);
        this.logStatus(`[Memory Engine] Saved memory: "${fact}" (${category})`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'forgetMemory' || call.name === 'deleteMemory') {
      try {
        const query = String(call.args.query || '').trim();
        if (!query) {
          this.sendToolResponse(call.id, { success: false, error: 'Query cannot be empty.' });
          return;
        }
        const res = await this.callLocalControlApi('forget-memory', { query });
        this.sendToolResponse(call.id, res);
        this.logStatus(`[Memory Engine] Removed memory matching: "${query}"`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'getCurrentTime') {
      try {
        const localTime = new Date().toString();
        const formattedDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const formattedTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        const localHours = new Date().getHours();
        
        const responseData = {
          success: true,
          localTime: localTime,
          date: formattedDate,
          time: formattedTime,
          hour24: localHours
        };
        
        this.sendToolResponse(call.id, responseData);
        this.logStatus(`Returned local time to Zoya: ${formattedTime} (${formattedDate})`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'readWebpage') {
      try {
        const url = String(call.args.url || '');
        const res = await this.callLocalControlApi('read-webpage', { url });
        this.sendToolResponse(call.id, res);
        this.logStatus(`Returned webpage content for URL: ${url}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'searchYouTube') {
      try {
        const query = String(call.args.query || call.args.text || '').trim();
        const lowerQuery = query.toLowerCase();

        // Smart Redirect: If query is actually a numbered video request
        let detectedIndex = 0;
        if (/^(1st|first|1\s*st|prothom|1\s*number|one)(\s*(ta|video|song|gaan|one|taw))?$/i.test(lowerQuery) || lowerQuery === '1' || lowerQuery === '1st ta' || lowerQuery === 'first ta') detectedIndex = 1;
        else if (/^(2nd|second|2\s*nd|dwitiyo|ditiyo|2\s*number|two)(\s*(ta|video|song|gaan|one|taw))?$/i.test(lowerQuery) || lowerQuery === '2' || lowerQuery === '2nd ta' || lowerQuery === 'second ta') detectedIndex = 2;
        else if (/^(3rd|third|3\s*rd|tritiyo|3\s*number|three)(\s*(ta|video|song|gaan|one|taw))?$/i.test(lowerQuery) || lowerQuery === '3' || lowerQuery === '3rd ta' || lowerQuery === 'third ta') detectedIndex = 3;

        if (detectedIndex > 0) {
          this.logStatus(`Smart redirect: searchYouTube("${query}") detected as numbered video #${detectedIndex} -> redirected to youtube-click`);
          const res = await this.callLocalControlApi('youtube-click', { index: detectedIndex });
          this.sendToolResponse(call.id, res);
          return;
        }

        // Smart Redirect: If the query clearly indicates playing music or a song
        const isSongQuery = lowerQuery.includes('gaan') || lowerQuery.includes('song') || lowerQuery.includes('music') ||
                            lowerQuery.includes('audio') || lowerQuery.includes('arijit') || lowerQuery.includes('play') ||
                            lowerQuery.includes('chalao') || lowerQuery.includes('bajao') || lowerQuery.includes('shonao');

        if (isSongQuery) {
          this.logStatus(`Smart redirect: searchYouTube("${query}") redirected to playSongOnYouTube to auto-play`);
          const res = await this.callLocalControlApi('youtube-play-query', { query, index: 1 });
          this.sendToolResponse(call.id, res);
          return;
        }

        const res = await this.callLocalControlApi('youtube-search', { query });
        this.sendToolResponse(call.id, res);
        this.logStatus(`YouTube search for "${query}": ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'playNumberedSongOnYouTube' || call.name === 'clickYouTubeVideo') {
      try {
        const index = parseInt(call.args.index || '1', 10);
        const res = await this.callLocalControlApi('youtube-click', { index });
        this.sendToolResponse(call.id, res);
        this.logStatus(`Playing YouTube video item #${index}: ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'playNextSongOnYouTube') {
      try {
        const res = await this.callLocalControlApi('youtube-next');
        this.sendToolResponse(call.id, res);
        this.logStatus(`Playing next song on YouTube: ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'playSongOnYouTube') {
      try {
        const rawQuery = String(call.args.query || call.args.text || '').trim();
        const lowerQuery = rawQuery.toLowerCase();
        let index = parseInt(call.args.index || '0', 10);

        // Smart Redirect: If query is actually asking for the next song/video
        const isNextRequest = /er\s*por|porer|porer\s*ta|porer\s*gaan|er\s*porer|next\s*song|next\s*video|next\s*ta|পরের\s*গান|পরবর্তী\s*গান|এর\s*পর|পরেরটা/i.test(lowerQuery);
        if (isNextRequest) {
          this.logStatus(`Smart redirect: playSongOnYouTube("${rawQuery}") detected as next song request -> redirected to youtube-next`);
          const res = await this.callLocalControlApi('youtube-next');
          this.sendToolResponse(call.id, res);
          return;
        }

        // Smart Redirect: If query is actually asking for a numbered video (e.g. "1st ta", "second ta", "1st video", "1 number", "prothom ta", etc.)
        let detectedIndex = 0;
        if (/^(1st|first|1\s*st|prothom|1\s*number|one)(\s*(ta|video|song|gaan|one|taw))?$/i.test(lowerQuery) || lowerQuery === '1' || lowerQuery === '1st ta' || lowerQuery === 'first ta') {
          detectedIndex = 1;
        } else if (/^(2nd|second|2\s*nd|dwitiyo|ditiyo|2\s*number|two)(\s*(ta|video|song|gaan|one|taw))?$/i.test(lowerQuery) || lowerQuery === '2' || lowerQuery === '2nd ta' || lowerQuery === 'second ta') {
          detectedIndex = 2;
        } else if (/^(3rd|third|3\s*rd|tritiyo|3\s*number|three)(\s*(ta|video|song|gaan|one|taw))?$/i.test(lowerQuery) || lowerQuery === '3' || lowerQuery === '3rd ta' || lowerQuery === 'third ta') {
          detectedIndex = 3;
        } else if (/^(4th|fourth|4\s*number|four)(\s*(ta|video|song|gaan|one|taw))?$/i.test(lowerQuery) || lowerQuery === '4') {
          detectedIndex = 4;
        }

        if (detectedIndex > 0) {
          index = detectedIndex;
          this.logStatus(`Smart redirect: playSongOnYouTube("${rawQuery}") detected as numbered video #${index} -> redirected to youtube-click`);
          const res = await this.callLocalControlApi('youtube-click', { index });
          this.sendToolResponse(call.id, res);
          return;
        }

        if (index <= 0) index = 1;
        const query = rawQuery || 'trending music';
        const res = await this.callLocalControlApi('youtube-play-query', { query, index });
        this.sendToolResponse(call.id, res);
        this.logStatus(`Playing song "${query}" on YouTube (item #${index}): ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'stopSongOnYouTube') {
      try {
        const subAction = String(call.args?.action || '').toLowerCase();
        let res: any;
        if (subAction === 'pause' || subAction.includes('pause')) {
          res = await this.callLocalControlApi('youtube-pause');
          this.logStatus(`Safety guard redirected to pause YouTube playback: ${JSON.stringify(res)}`);
        } else {
          res = await this.callLocalControlApi('youtube-stop');
          this.logStatus(`Turned off/closed YouTube: ${JSON.stringify(res)}`);
        }
        this.sendToolResponse(call.id, res);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'pauseSongOnYouTube') {
      try {
        const res = await this.callLocalControlApi('youtube-pause');
        this.sendToolResponse(call.id, res);
        this.logStatus(`Paused/toggled YouTube playback: ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'typeText') {
      try {
        const text = String(call.args.text || '');
        const pressEnter = Boolean(call.args.pressEnter);
        const windowTitle = call.args.windowTitle ? String(call.args.windowTitle) : '';
        const res = await this.callLocalControlApi('type-text', { text, pressEnter, windowTitle });
        this.sendToolResponse(call.id, res);
        this.logStatus(`Typed text (${text.length} chars): ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'pressKey') {
      try {
        const key = String(call.args.key || '').trim();
        const lowerKey = key.toLowerCase();

        // Smart Redirect for scroll requests passed to pressKey
        if (lowerKey === 'scroll' || lowerKey === 'scrool' || lowerKey === 'scroll down' || lowerKey === 'niche scroll') {
          this.logStatus(`Smart redirect: pressKey("${key}") redirected to scrollPage("down")`);
          const res = await this.callLocalControlApi('mouse-scroll', { amount: -480, direction: 'down' });
          this.sendToolResponse(call.id, res);
          return;
        } else if (lowerKey === 'scroll up' || lowerKey === 'upore scroll') {
          this.logStatus(`Smart redirect: pressKey("${key}") redirected to scrollPage("up")`);
          const res = await this.callLocalControlApi('mouse-scroll', { amount: 480, direction: 'up' });
          this.sendToolResponse(call.id, res);
          return;
        }

        const windowTitle = call.args.windowTitle ? String(call.args.windowTitle) : '';
        const res = await this.callLocalControlApi('press-key', { key, windowTitle });
        this.sendToolResponse(call.id, res);
        this.logStatus(`Pressed key "${key}": ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'clickMouse') {
      try {
        const x = call.args.x !== undefined ? Number(call.args.x) : 0;
        const y = call.args.y !== undefined ? Number(call.args.y) : 0;
        const button = String(call.args.button || 'left');
        const windowTitle = call.args.windowTitle ? String(call.args.windowTitle) : '';
        const res = await this.callLocalControlApi('mouse-click', { x, y, button, windowTitle });
        this.sendToolResponse(call.id, res);
        this.logStatus(`Clicked mouse ${button} at (${x}, ${y}): ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'scrollPage') {
      try {
        const direction = String(call.args.direction || 'down').toLowerCase();
        const baseAmount = Number(call.args.amount || 480);
        const amount = direction === 'up' ? Math.abs(baseAmount) : -Math.abs(baseAmount);
        const windowTitle = call.args.windowTitle ? String(call.args.windowTitle) : '';
        const res = await this.callLocalControlApi('mouse-scroll', { amount, direction, windowTitle });
        this.sendToolResponse(call.id, res);
        this.logStatus(`Scrolled page ${direction} (${amount}): ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'controlMedia') {
      try {
        const rawAction = String(call.args.action || 'playpause').toLowerCase();

        // Smart Redirect: If LLM mistakenly called controlMedia for a numbered song/video request
        let songIdx = 0;
        if (call.args.index !== undefined) songIdx = parseInt(call.args.index, 10);
        else if (rawAction.includes('1') || rawAction.includes('first') || rawAction.includes('prothom') || rawAction.includes('1st')) songIdx = 1;
        else if (rawAction.includes('2') || rawAction.includes('second') || rawAction.includes('dui') || rawAction.includes('dwitiyo') || rawAction.includes('2nd')) songIdx = 2;
        else if (rawAction.includes('3') || rawAction.includes('third') || rawAction.includes('tin') || rawAction.includes('tritiyo') || rawAction.includes('3rd')) songIdx = 3;

        if (songIdx > 0) {
          this.logStatus(`Smart redirect: controlMedia("${rawAction}") redirected to youtube-click #${songIdx}`);
          const res = await this.callLocalControlApi('youtube-click', { index: songIdx });
          this.sendToolResponse(call.id, res);
          return;
        }

        // Smart Redirect: If action is stop/off/close, cleanly turn off YouTube
        if (rawAction === 'stop' || rawAction === 'off' || rawAction === 'close') {
          const res = await this.callLocalControlApi('youtube-stop');
          this.sendToolResponse(call.id, res);
          return;
        }

        // Smart Redirect: If action is playpause/pause, pause YouTube directly
        if (rawAction === 'playpause' || rawAction === 'pause' || rawAction === 'play') {
          const res = await this.callLocalControlApi('youtube-pause');
          this.sendToolResponse(call.id, res);
          return;
        }

        // Smart Redirect: If action is next, play next song on YouTube
        if (rawAction === 'next' || rawAction.includes('next')) {
          this.logStatus(`Smart redirect: controlMedia("${rawAction}") redirected to youtube-next`);
          const res = await this.callLocalControlApi('youtube-next');
          this.sendToolResponse(call.id, res);
          return;
        }

        const res = await this.callLocalControlApi('media-control', { key: rawAction });
        this.sendToolResponse(call.id, res);
        this.logStatus(`Media control action "${rawAction}": ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'focusWindow') {
      try {
        const windowTitle = String(call.args.windowTitle || '');
        const res = await this.callLocalControlApi('focus-window', { windowTitle });
        this.sendToolResponse(call.id, res);
        this.logStatus(`Focused window "${windowTitle}": ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'executeLaptopCommand') {
      try {
        const command = String(call.args.command || '');
        const res = await this.callLocalControlApi('system-command', { command });
        this.sendToolResponse(call.id, res);
        this.logStatus(`Executed laptop command "${command}": ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'closeApp') {
      try {
        const appName = String(call.args.appName || call.args.text || '').toLowerCase().trim();
        let res: any;

        // Host browser protection: never allow closing Chrome/Edge/Firefox where Zoya runs
        if (/^(chrome|google\s*chrome|msedge|edge|firefox|brave|opera|browser)$/i.test(appName)) {
          this.logStatus(`Protected host browser: closeApp("${appName}") blocked to keep Zoya active.`);
          this.sendToolResponse(call.id, {
            success: true,
            message: 'Browser is kept active so Zoya AI Assistant remains running.',
          });
          return;
        }

        if (
          appName.includes('youtube') ||
          appName.includes('gaan') ||
          appName.includes('song') ||
          appName.includes('music') ||
          appName.includes('youtube tab') ||
          appName.includes('youtube page')
        ) {
          res = await this.callLocalControlApi('youtube-stop');
          this.logStatus(`Closed YouTube playback tab / page: ${JSON.stringify(res)}`);
        } else {
          res = await this.callLocalControlApi('close-app', { appName });
          this.logStatus(`Closed application "${appName}": ${JSON.stringify(res)}`);
        }
        this.sendToolResponse(call.id, res);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'takeScreenshot') {
      try {
        const res = await this.callLocalControlApi('take-screenshot', {});
        this.sendToolResponse(call.id, res);
        this.logStatus(`Captured screenshot: ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'getSystemStatus') {
      try {
        const res = await this.callLocalControlApi('system-status', {});
        this.sendToolResponse(call.id, res);
        this.logStatus(`System status query: ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'manageFiles') {
      try {
        const operation = String(call.args.operation || 'list');
        const path = String(call.args.path || 'desktop');
        const content = call.args.content ? String(call.args.content) : '';
        const res = await this.callLocalControlApi('manage-file', { operation, path, content });
        this.sendToolResponse(call.id, res);
        this.logStatus(`File operation "${operation}" on "${path}": ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'clipboardAction') {
      try {
        const action = String(call.args.action || 'get');
        const text = call.args.text ? String(call.args.text) : '';
        const res = await this.callLocalControlApi('clipboard', { key: action, text });
        this.sendToolResponse(call.id, res);
        this.logStatus(`Clipboard action "${action}": ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'setVolumeLevel') {
      try {
        const level = parseInt(call.args.level || '50', 10);
        const res = await this.callLocalControlApi('set-volume', { level });
        this.sendToolResponse(call.id, res);
        this.logStatus(`Set master volume to ${level}%: ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'setBrightnessLevel') {
      try {
        const level = parseInt(call.args.level || '50', 10);
        const res = await this.callLocalControlApi('set-brightness', { level });
        this.sendToolResponse(call.id, res);
        this.logStatus(`Set brightness to ${level}%: ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'browserNavAction') {
      try {
        const navAction = String(call.args.action || 'refresh');
        const res = await this.callLocalControlApi('browser-nav', { navAction });
        this.sendToolResponse(call.id, res);
        this.logStatus(`Browser navigation action "${navAction}": ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'setAlarmOrReminder') {
      try {
        const time = String(call.args.time || '');
        const name = String(call.args.name || 'Siba Boss');
        const purpose = String(call.args.purpose || 'ঘুম থেকে ওঠা');
        const res = alarmScheduler.scheduleAlarm(time, name, purpose);
        this.sendToolResponse(call.id, res);
        this.logStatus(`Scheduled alarm/reminder for ${name} at ${time}: ${JSON.stringify(res)}`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else if (call.name === 'cancelAlarm') {
      try {
        const count = alarmScheduler.cancelAllAlarms();
        this.sendToolResponse(call.id, { success: true, canceledCount: count, message: 'All scheduled alarms canceled.' });
        this.logStatus(`Canceled ${count} alarms.`);
      } catch (error) {
        this.sendToolResponse(call.id, { success: false, error: (error as Error).message });
      }
    } else {
      this.logStatus(`Unknown tool call: ${call.name}`);
      this.sendToolResponse(call.id, { error: 'Unknown function' });
    }
  }
}
