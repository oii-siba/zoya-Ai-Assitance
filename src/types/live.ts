export interface LiveSessionConfig {
  apiKey: string;
  model: string;
  voiceName: string;
  systemInstruction: string;
}

export type SessionState = 'disconnected' | 'connecting' | 'listening' | 'speaking';

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
          properties: Record<string, { type: 'STRING'; description: string }>;
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

export type OutgoingMessage = SetupMessage | RealtimeInputMessage | ToolResponseMessage;

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
