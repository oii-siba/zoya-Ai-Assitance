export interface LiveSessionConfig {
  apiKey: string;
  model: string;
  voiceName: string;
  systemInstruction: string;
  userName?: string;
  userTitle?: string;
  whatsappEnabled?: boolean;
  whatsappShowBanner?: boolean;
  whatsappLanguage?: 'bn-IN' | 'en-IN' | 'en-US' | 'hi-IN';
  whatsappAnnounceContent?: boolean;
  whatsappSpeechRate?: number;
  whatsappSpeechPitch?: number;
  whatsappAlertSound?: 'beep' | 'chime' | 'ding' | 'none';
  whatsappIgnoreGroups?: boolean;
  visualizerTheme?: 'neon-quantum' | 'cosmic-nebula' | 'retro-equalizer' | 'stellar-orbit' | 'liquid-aura';
  voicePersona?: 'cute-girl' | 'sassy-bff' | 'cyber-assistant' | 'anime-sister' | 'playful-puppy' | 'kid-voice' | 'female-voice' | 'sweet-female';
  announcerVoiceName?: string;
}

export type SessionState = 'disconnected' | 'connecting' | 'listening' | 'speaking';

export type VoiceEmotionType = 'calm' | 'excited' | 'sad' | 'stressed' | 'whisper' | 'neutral';

export interface VoiceEmotionState {
  emotion: VoiceEmotionType;
  confidence: number;
  label: string;
  emoji: string;
  pitch: number;
  rms: number;
  updatedAt: number;
}

// Outgoing messages
export interface SetupMessage {
  setup: {
    model: string;
    generationConfig?: {
      responseModalities?: string[];
      speechConfig?: {
        voiceConfig?: {
          prebuiltVoiceConfig?: {
            voiceName?: string;
          };
        };
      };
    };
    systemInstruction?: {
      parts: Array<{ text: string }>;
    };
    tools?: Array<{
      functionDeclarations: Array<{
        name: string;
        description: string;
        parameters: {
          type: 'OBJECT';
          properties: Record<string, any>;
          required: string[];
        };
      }>;
    }>;
  };
}

export interface RealtimeInputMessage {
  realtimeInput: {
    mediaChunks?: Array<{
      mimeType: string;
      data: string;
    }>;
    audio?: {
      mimeType: string;
      data: string; // Base64 encoded PCM16
    };
    video?: {
      mimeType: string;
      data: string; // Base64 encoded video frame
    };
    text?: string;
  };
}

export interface ToolResponseMessage {
  toolResponse: {
    functionResponses: Array<{
      response: { output: Record<string, any> };
      id: string;
    }>;
  };
}

export interface ClientContentMessage {
  clientContent: {
    turns: Array<{
      role: 'user' | 'model';
      parts: Array<{ text: string }>;
    }>;
    turnComplete: boolean;
  };
}

export type OutgoingMessage = SetupMessage | RealtimeInputMessage | ToolResponseMessage | ClientContentMessage;

// Incoming messages
export interface ServerContentPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string; // Base64 encoded PCM16 (usually 24kHz)
  };
}

export interface ServerContentMessage {
  serverContent?: {
    modelTurn?: {
      parts?: ServerContentPart[];
    };
    turnComplete?: boolean;
    interrupted?: boolean;
  };
}

export interface FunctionCall {
  name: string;
  args: Record<string, any>;
  id: string;
}

export interface ToolCallMessage {
  toolCall?: {
    functionCalls: FunctionCall[];
  };
}

export interface ToolCallCancellationMessage {
  toolCallCancellation?: {
    ids: string[];
  };
}

export type IncomingMessage = ServerContentMessage & ToolCallMessage & ToolCallCancellationMessage;
