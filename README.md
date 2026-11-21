# 🌸 Zoya AI Assistance

[![React 19](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.1-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-4.3-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Google Gemini Live](https://img.shields.io/badge/Google-Gemini_Live_API-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Zoya AI Assistance** is an advanced, ultra-responsive, real-time voice-to-voice multimodal AI assistant powered by Google Gemini Live API. Featuring real-time acoustic empathy, voice biometrics, natural Bengali and English conversation, desktop automation, and WhatsApp integration.

---

## ✨ Features

- 🎙️ **Real-Time Voice-to-Voice Streaming**: Ultra-low-latency, full-duplex conversational audio powered directly by the Google Gemini Live WebSocket API (`models/gemini-2.0-flash-exp` / `gemini-3.1-flash-live-preview`).
- 💖 **Acoustic Emotion Intelligence (Emotion Engine)**: Detects the emotional state in your voice (happy, sad, tired, angry, whispering, calm) and adapts its tone with comforting care or joyful energy.
- 👤 **Voice Biometrics & Speaker Identification**: Recognizes its creator ("Siba Boss") vs. other speakers, seamlessly adapting greeting protocol and responses.
- ⏰ **Smart Alarm & Voice Scheduler**: Hands-free voice commands to set alarms or timed wake-up calls with spoken morning reminders.
- 🌊 **Audio Waveform Visualizer**: Smooth, real-time visual representation of both user microphone input and assistant voice output.
- 💻 **Desktop Automation (Windows)**: Built-in PowerShell and C# automation scripts to interact with local apps and perform fast OS controls.
- 📱 **WhatsApp Integration (Baileys)**: Automated WhatsApp messaging and connection handling via `@whiskeysockets/baileys`.
- 🌐 **Multilingual Mastery**: Native, articulate fluency in Bengali (বাংলা), English, and Hindi.

---

## 🛠️ Tech Stack

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/)
- **Audio Processing**: Web Audio API (PCM 16-bit 16kHz AudioWorklet / Streaming)
- **AI Brain**: Google Gemini Multimodal Live WebSocket API
- **Automation & Services**: Node.js, Baileys, PowerShell, C# (.NET)

---

## 📋 Prerequisites

Before running this project, ensure you have the following installed on your machine:

- **[Node.js](https://nodejs.org/)** (v18.0.0 or higher recommended, e.g. Node 20 LTS or 22)
- **npm** (comes with Node.js) or **pnpm** / **yarn**
- **Google Gemini API Key**: Get a free API key from [Google AI Studio](https://aistudio.google.com/).

---

## 🚀 Getting Started (Installation & Setup)

Anyone can clone and run this repository locally by following these simple steps:

### 1. Clone the Repository

```bash
git clone https://github.com/oii-siba/zoya-Ai-Assitance.git
cd zoya-Ai-Assitance
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Environment Variables (Optional)

Copy the sample environment file:

```bash
cp .env.example .env
```

*(Note: If you have a Hugging Face token, you can add it into `.env`. The main Gemini Live API key can be entered directly in the web UI settings without editing code).*

### 4. Run the Development Server

```bash
npm run dev
```

> 🌟 **Note**: To support the project, on the first run the terminal will verify that you have given a Star ⭐ to this repository. Once verified, it unlocks and starts the Vite development server!

The application will start, usually at:
```
http://localhost:5173
```

### 5. Configure Your Gemini API Key

1. Open your browser and navigate to `http://localhost:5173`.
2. Click the **Settings (⚙️)** icon in the top header.
3. **Personalize Your Name & Title**: In the **User Identity** section, enter your own name and title (e.g., your name, and whether Zoya should call you Boss, Bhaiya, Sir, or Friend). Zoya will automatically adapt all spoken greetings and voice prompts to your name!
4. Paste your **Gemini API Key** from [Google AI Studio](https://aistudio.google.com/).
5. Select your preferred voice, model, and personality tone.
6. Click **Save & Connect** and start speaking with Zoya!

---

## 📦 Available Scripts

In the project directory, you can run:

| Command | Description |
|---|---|
| `npm run dev` | Runs the Vite dev server at `http://localhost:5173` with Hot Module Replacement (HMR). |
| `npm run build` | Compiles TypeScript and builds the production bundle in `/dist`. |
| `npm run preview` | Locally previews the production build. |
| `npm run lint` | Runs [Oxlint](https://oxc.rs) to quickly lint TypeScript/React source files. |

---

## 📱 Optional Features

### WhatsApp Integration (Baileys)
To start the WhatsApp automated assistant service:

```bash
node scripts/whatsapp_baileys.mjs
```
A QR code will appear in your terminal. Scan it from your WhatsApp mobile app (`Linked Devices`) to authenticate.

> ⚠️ **Note**: Your WhatsApp session tokens are stored locally in `whatsapp_auth/` and are excluded from Git for privacy and security.

### Windows Desktop Automation
The `scripts/` folder includes PowerShell scripts and C# utilities for Windows-specific voice controls:
- `scripts/desktop_automation.ps1`
- `scripts/compile_dll.ps1`

---

## 📂 Project Structure

```text
zoya-ai-assistance/
├── public/                 # Static assets (images, icons)
├── scripts/                # WhatsApp Baileys & Windows automation scripts
├── src/
│   ├── components/         # React UI components (SettingsOverlay, Waveform, etc.)
│   ├── services/           # Core audio streaming, LiveSession, EmotionDetector, Alarms
│   ├── types/              # TypeScript type definitions (live.ts, etc.)
│   ├── App.tsx             # Main application orchestrator & voice state manager
│   ├── App.css             # Main stylesheet & animations
│   └── main.tsx            # Application entrypoint
├── .env.example            # Environment variables template
├── .gitignore              # Files excluded from git (credentials, auth keys)
├── package.json            # Project manifest & dependencies
├── vite.config.ts          # Vite configuration
└── README.md               # Project documentation
```

---

## 🔒 Security & Privacy Notice

- **Never commit `.env` or API keys** to GitHub.
- **Never commit `whatsapp_auth/`** or generated session `.json` files.
- The included `.gitignore` already protects your sensitive files from being pushed accidentally.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to check out the [issues page](https://github.com/oii-siba/zoya-Ai-Assitance/issues).

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

Made with ❤️ by [Siba](https://github.com/oii-siba)
