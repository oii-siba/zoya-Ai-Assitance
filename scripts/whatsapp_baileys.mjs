import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import pino from 'pino';
import { execSync } from 'child_process';

const AUTH_DIR = path.join(process.cwd(), 'whatsapp_auth');
const PID_LOCK_FILE = path.join(AUTH_DIR, 'session.pid');

function acquireProcessLock() {
  try {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }
    if (fs.existsSync(PID_LOCK_FILE)) {
      const oldPidStr = fs.readFileSync(PID_LOCK_FILE, 'utf8').trim();
      const oldPid = parseInt(oldPidStr, 10);
      if (oldPid && oldPid !== process.pid) {
        let isAlive = false;
        try {
          process.kill(oldPid, 0);
          isAlive = true;
        } catch (e) {
          isAlive = false;
        }

        if (isAlive) {
          console.warn(`[ZOYA WHATSAPP] Terminating old duplicate process (PID: ${oldPid}) to prevent session conflict (440)...`);
          try {
            if (process.platform === 'win32') {
              execSync(`taskkill /F /PID ${oldPid} /T`, { stdio: 'ignore' });
            } else {
              process.kill(oldPid, 'SIGKILL');
            }
          } catch (e) { }
        }
      }
    }
    fs.writeFileSync(PID_LOCK_FILE, String(process.pid), 'utf8');
  } catch (e) { }
}

process.on('exit', () => {
  try {
    if (fs.existsSync(PID_LOCK_FILE)) {
      const current = fs.readFileSync(PID_LOCK_FILE, 'utf8').trim();
      if (current === String(process.pid)) {
        fs.unlinkSync(PID_LOCK_FILE);
      }
    }
  } catch (e) { }
});

process.on('uncaughtException', (err) => {
  console.warn('[ZOYA SAFEGUARD] Handled uncaughtException:', err?.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.warn('[ZOYA SAFEGUARD] Handled unhandledRejection:', reason?.message || reason);
});


function clearAuthDir() {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      const files = fs.readdirSync(AUTH_DIR);
      for (const file of files) {
        if (file === 'session.pid') continue;
        try {
          fs.unlinkSync(path.join(AUTH_DIR, file));
        } catch (e) { }
      }
    }
  } catch (e) { }
}

export const COMMON_EMOJIS = {
  '😂': 'হাসির ইমোজি 😂',
  '🤣': 'হাসতে হাসতে গড়িয়ে পড়ার ইমোজি 🤣',
  '❤️': 'ভালোবাসার লাল হার্ট ইমোজি ❤️',
  '🧡': 'কমলা হার্ট ইমোজি 🧡',
  '💛': 'হলুদ হার্ট ইমোজি 💛',
  '💚': 'সবুজ হার্ট ইমোজি 💚',
  '💙': 'নীল হার্ট ইমোজি 💙',
  '💜': 'বেগুনী হার্ট ইমোজি 💜',
  '🖤': 'কালো হার্ট ইমোজি 🖤',
  '🤍': 'সাদা হার্ট ইমোজি 🤍',
  '💖': 'ঝলমলে ভালোবাসার হার্ট ইমোজি 💖',
  '💕': 'জোড়া হার্ট ইমোজি 💕',
  '💞': 'ঘূর্ণায়মান হার্ট ইমোজি 💞',
  '💓': 'স্পন্দনশীল হার্ট ইমোজি 💓',
  '💗': 'ক্রমবর্ধমান হার্ট ইমোজি 💗',
  '💘': 'তীরবিদ্ধ হার্ট ইমোজি 💘',
  '💝': 'রিবন হার্ট ইমোজি 💝',
  '🥰': 'মিষ্টি ভালোবাসা ও হাসির হার্ট ইমোজি 🥰',
  '😍': 'চোখে ভালোবাসার লাভ-আইজ ইমোজি 😍',
  '😘': 'ভালোবাসার ফ্লাইং কিস ইমোজি 😘',
  '😗': 'কিসিং ফেস ইমোজি 😗',
  '😭': 'কান্নার ইমোজি 😭',
  '😢': 'চোখের জলের দুঃখের ইমোজি 😢',
  '🥺': 'আবেগী কাতর চোখের ইমোজি 🥺',
  '😊': 'মিষ্টি হাসিমুখের ইমোজি 😊',
  '☺️': 'লাজুক হাসিমুখের ইমোজি ☺️',
  '😁': 'দাঁত বের করা হাসির ইমোজি 😁',
  '😀': 'চওড়া হাসির ইমোজি 😀',
  '😃': 'উজ্জ্বল হাসির ইমোজি 😃',
  '😄': 'আনন্দিত হাসির ইমোজি 😄',
  '😅': 'ঘামঝরা অপ্রস্তুত হাসির ইমোজি 😅',
  '🙃': 'উল্টো হাসিমুখের ইমোজি 🙃',
  '😉': 'চোখ মারার উইঙ্ক ইমোজি 😉',
  '😎': 'সানগ্লাস পরা কুল বা স্মার্ট ইমোজি 😎',
  '🤔': 'ভাবুক বা চিন্তাভাবনার ইমোজি 🤔',
  '🤫': 'চুপ থাকার ইমোজি 🤫',
  '🙄': 'বিরক্ত বা চোখ ঘোরানোর ইমোজি 🙄',
  '😴': 'ঘুমন্ত ইমোজি 😴',
  '🥱': 'হাই তোলার ক্লান্ত ইমোজি 🥱',
  '😡': 'লাল রাগী চেহারার ইমোজি 😡',
  '😠': 'রাগান্বিত ইমোজি 😠',
  '🤬': 'চরম ক্ষুব্ধ ও রাগী ইমোজি 🤬',
  '😱': 'ভয় ও আতঙ্কের চিৎকারের ইমোজি 😱',
  '😨': 'ভীত চেহারার ইমোজি 😨',
  '😰': 'উদ্বিগ্ন ঘর্মাক্ত ইমোজি 😰',
  '🥳': 'পার্টি বা উৎসবের সেলিব্রেশন ইমোজি 🥳',
  '🎉': 'কনফেটি পার্টি পপার ইমোজি 🎉',
  '🎊': 'উৎসবের কনফেটি বল ইমোজি 🎊',
  '👍': 'থাম্বস আপ বা লাইক ইমোজি 👍',
  '👎': 'থাম্বস ডাউন বা অপছন্দের ইমোজি 👎',
  '🙏': 'হাতজোড় করা নমস্কার বা প্রার্থনার ইমোজি 🙏',
  '👏': 'হাততালির ক্লাপিং ইমোজি 👏',
  '🙌': 'দু হাত তুলে আনন্দের ইমোজি 🙌',
  '🔥': 'আগুনের ফায়ার ইমোজি 🔥',
  '💯': '১০০ পার্সেন্ট নিখুঁত ইমোজি 💯',
  '✨': 'চকচকে তারার স্পার্কল ইমোজি ✨',
  '⭐': 'সোনার তারার ইমোজি ⭐',
  '🌟': 'উজ্জ্বল তারার ইমোজি 🌟',
  '💔': 'ভাঙা হার্ট বা দুঃখের ইমোজি 💔',
  '🌹': 'লাল গোলাপ ফুলের ইমোজি 🌹',
  '🌸': 'চেরি ব্লসম ফুলের ইমোজি 🌸',
  '🌺': 'জবা ফুলের ইমোজি 🌺',
  '💐': 'ফুলের তোড়ার বুকেট ইমোজি 💐',
  '🎂': 'জন্মদিনের কেক ইমোজি 🎂',
  '🍰': 'কেকের স্লাইস ইমোজি 🍰',
  '☕': 'এক কাপ গরম কফির ইমোজি ☕',
  '🍫': 'চকলেটের ইমোজি 🍫',
  '🍬': 'ক্যান্ডি বা মিষ্টির ইমোজি 🍬',
  '🤝': 'হ্যান্ডশেক বা বন্ধুত্বের ইমোজি 🤝',
  '✌️': 'ভিক্টরি বা পিস সাইন ইমোজি ✌️',
  '👋': 'হাত নাড়ার ওয়েভিং ইমোজি 👋',
  '🙈': 'চোখ ঢেকে ফেলা লাজুক বানরের ইমোজি 🙈',
  '💪': 'শক্তিশালী মাসল বা শক্তির ইমোজি 💪',
  '👀': 'চোখ তুলে দেখার আইজ ইমোজি 👀'
};

export function formatEmojisAndMedia(rawText) {
  if (!rawText) return '';
  const str = String(rawText).trim();

  // Find all matched emojis from COMMON_EMOJIS
  const found = [];
  for (const [em, desc] of Object.entries(COMMON_EMOJIS)) {
    if (str.includes(em)) {
      found.push(desc);
    }
  }

  // Check if string is purely emojis
  let stripped = str;
  for (const em of Object.keys(COMMON_EMOJIS)) {
    stripped = stripped.split(em).join('');
  }
  stripped = stripped.replace(/[\s\u200B-\u200D\uFE0F]/g, '');

  if (stripped.length === 0 && found.length > 0) {
    // Pure emoji message
    return `একটি ${found.join(' ও ')}`;
  }

  // If mixed text with emojis
  if (found.length > 0) {
    return `${str} [ইমোজি: ${found.join(', ')}]`;
  }

  return str;
}

export class WhatsAppDirectClient {
  constructor() {
    this.sock = null;
    this.qrCodeDataUrl = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'qr_ready'
    this.userJid = null;
    this.userName = null;
    this.incomingQueue = [];
    this.recentContacts = new Map();
    this.lastSenderJid = null;
    this.lastSenderName = null;
    this.sentHistory = []; // { key, targetJid, text, timestamp }
    this.lastSentMessage = null;
    this.logger = pino({ level: 'silent' });
    this.isReconnecting = false;
    this.isConnecting = false;
    this.manualLogout = false;
    this.lastConnectingTime = 0;
    this.reconnectTimer = null;
    this.watchdogInterval = null;
    // Note: Do not auto-start watchdog in constructor to prevent hanging Vite builds
  }

  destroy() {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('creds.update');
        this.sock.ev.removeAllListeners('messages.upsert');
        this.sock.ws?.close();
        this.sock.end(undefined);
      } catch (e) { }
      this.sock = null;
    }
  }

  scheduleReconnect(delayMs = 3000) {
    if (this.manualLogout) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isReconnecting = true;
    console.log(`[ZOYA WHATSAPP] Scheduling auto-reconnect in ${(delayMs / 1000).toFixed(1)}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.isReconnecting = false;
      this.init().catch(err => {
        console.error('[ZOYA WHATSAPP RECONNECT ERROR]', err);
        this.scheduleReconnect(5000);
      });
    }, delayMs);
    if (this.reconnectTimer && typeof this.reconnectTimer.unref === 'function') {
      this.reconnectTimer.unref();
    }
  }

  startWatchdog() {
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);
    this.watchdogInterval = setInterval(async () => {
      if (this.manualLogout) return;

      const hasCreds = fs.existsSync(path.join(AUTH_DIR, 'creds.json'));
      if (!hasCreds) return;

      // 1. Recover if stuck in connecting state for > 40 seconds
      if (this.isConnecting && Date.now() - this.lastConnectingTime > 40000) {
        console.warn('[ZOYA WHATSAPP WATCHDOG] Connection attempt stalled (>40s). Resetting socket...');
        this.isConnecting = false;
        this.status = 'disconnected';
        try { this.sock?.ws?.close(); } catch (e) {}
        this.sock = null;
      }

      // 2. If connected, verify socket is TRULY alive (readyState: 1 = OPEN)
      if (this.status === 'connected' && this.sock) {
        const wsState = this.sock.ws?.readyState;
        if (wsState !== undefined && wsState !== 1) {
          console.warn(`[ZOYA WHATSAPP WATCHDOG] Dead socket detected (readyState: ${wsState}). Reconnecting...`);
          this.status = 'disconnected';
          this.sock = null;
          this.scheduleReconnect(2000);
          return;
        }
        return;
      }

      // 3. If disconnected and auth credentials exist, auto-reconnect smoothly
      if (this.status === 'disconnected' && !this.isConnecting && !this.isReconnecting && !this.reconnectTimer) {
        console.log('[ZOYA WHATSAPP WATCHDOG] WhatsApp is disconnected. Auto-reconnecting mobile session...');
        this.scheduleReconnect(2000);
      }
    }, 10000); // Check every 10s
    if (this.watchdogInterval && typeof this.watchdogInterval.unref === 'function') {
      this.watchdogInterval.unref();
    }
  }

  async init(fresh = false) {
    this.startWatchdog();
    if (this.isConnecting) return false;
    if (this.isReconnecting && !fresh) {
      console.log('[ZOYA WHATSAPP] Already waiting to reconnect, keeping backoff schedule.');
      return false;
    }

    if (fresh) {
      this.manualLogout = false;
      clearAuthDir();
    }

    this.isConnecting = true;
    this.lastConnectingTime = Date.now();
    this.status = 'connecting';
    acquireProcessLock();

    try {
      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners('connection.update');
          this.sock.ev.removeAllListeners('creds.update');
          this.sock.ev.removeAllListeners('messages.upsert');
          this.sock.ws?.close();
          this.sock.end(undefined);
        } catch (e) { }
        this.sock = null;
        // Allow old TCP connection to fully teardown on WhatsApp servers
        await new Promise(r => setTimeout(r, 1500));
      }

      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion();

      console.log('[ZOYA WHATSAPP] Starting socket with Baileys v' + version.join('.') + '...');

      const currentSock = makeWASocket({
        version,
        auth: state,
        logger: this.logger,
        printQRInTerminal: false,
        browser: Browsers.windows('Chrome'),
        syncFullHistory: false,
        markOnlineOnConnect: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        defaultQueryTimeoutMs: 60000,
        retryRequestDelayMs: 1000,
        emitOwnEvents: false,
        generateHighQualityLinkPreview: false
      });

      this.sock = currentSock;

      currentSock.ev.on('creds.update', saveCreds);

      currentSock.ev.on('connection.update', async (update) => {
        if (this.sock !== currentSock) return;

        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            this.qrCodeDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
            this.status = 'qr_ready';
            this.isConnecting = false;
            console.log('[ZOYA WHATSAPP] New QR Code generated for mobile linking.');
          } catch (e) {
            console.error('[ZOYA WHATSAPP] QR generation failed:', e);
          }
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error)?.output?.statusCode || (lastDisconnect?.error)?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;
          console.log('[ZOYA WHATSAPP] Connection closed. StatusCode:', statusCode, 'Reason:', lastDisconnect?.error?.message || lastDisconnect?.error);

          // If the socket was already connected, and this error was just a leftover QR timeout (408), ignore it!
          if (statusCode === 408 && fs.existsSync(path.join(AUTH_DIR, 'creds.json')) && this.status === 'connected') {
            console.log('[ZOYA WHATSAPP] Ignoring stale QR timeout since session is authenticated.');
            return;
          }

          this.status = 'disconnected';
          this.isConnecting = false;
          this.qrCodeDataUrl = null;
          this.userJid = null;
          this.userName = null;
          this.sock = null;

          if (isLoggedOut && this.manualLogout) {
            console.log('[ZOYA WHATSAPP] Explicit user logout confirmed. Cleared auth directory.');
            clearAuthDir();
            return;
          }

          if (isLoggedOut) {
            console.warn('[ZOYA WHATSAPP] Session unlinked on phone. Clearing auth directory to generate new QR...');
            clearAuthDir();
            this.scheduleReconnect(2000);
            return;
          }

          // Handle Connection Replaced (another web session or phone sync)
          if (statusCode === 440 || statusCode === DisconnectReason.connectionReplaced) {
            console.log('[ZOYA WHATSAPP] Session conflict (440). Waiting 10s before auto-reconnecting...');
            this.scheduleReconnect(10000);
            return;
          }

          // Restart Required (515) -> immediate reconnect
          if (statusCode === 515 || statusCode === DisconnectReason.restartRequired) {
            console.log('[ZOYA WHATSAPP] Restart required (515). Reconnecting immediately...');
            this.scheduleReconnect(1000);
            return;
          }

          // Connection closed (428) or timed out (408)
          if (statusCode === 428 || statusCode === 408) {
            console.log(`[ZOYA WHATSAPP] Connection ${statusCode}. Reconnecting in 3s...`);
            this.scheduleReconnect(3000);
            return;
          }

          // All other transient network disconnects
          console.log('[ZOYA WHATSAPP] Temporary network disconnect. Auto-reconnecting in 4s...');
          this.scheduleReconnect(4000);
        } else if (connection === 'open') {
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
          }
          this.status = 'connected';
          this.isConnecting = false;
          this.isReconnecting = false;
          this.qrCodeDataUrl = null;
          this.userJid = currentSock.user?.id || '';
          this.userName = currentSock.user?.name || '';
          console.log('[ZOYA WHATSAPP] Mobile WhatsApp successfully CONNECTED! User:', this.userJid, this.userName);
        }
      });

      currentSock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (!messages || messages.length === 0) return;
        for (const m of messages) {
          if (!m.message) continue;

          const jid = m.key.remoteJid || '';
          if (jid === 'status@broadcast') continue;

          // Track outgoing message sent from Siba's phone or companion
          if (m.key.fromMe) {
            let outText = m.message.conversation ||
              m.message.extendedTextMessage?.text ||
              m.message.imageMessage?.caption ||
              m.message.videoMessage?.caption || '';
            if (outText && m.key.id) {
              const record = {
                key: m.key,
                targetJid: jid,
                text: outText,
                timestamp: m.messageTimestamp ? Number(m.messageTimestamp) * 1000 : Date.now()
              };
              this.sentHistory.push(record);
              if (this.sentHistory.length > 50) this.sentHistory.shift();
              this.lastSentMessage = record;
            }
            continue;
          }

          const isGroup = jid.endsWith('@g.us');
          let text = '';
          let isGif = false;
          let isSticker = false;

          if (m.message.conversation) {
            text = m.message.conversation;
          } else if (m.message.extendedTextMessage?.text) {
            text = m.message.extendedTextMessage.text;
          } else if (m.message.videoMessage) {
            if (m.message.videoMessage.gifPlayback) {
              isGif = true;
              text = m.message.videoMessage.caption
                ? `একটি GIF অ্যানিমেশন (ক্যাপশন: ${m.message.videoMessage.caption})`
                : 'একটি GIF অ্যানিমেশন (চলমান অ্যানিমেটেড ছবি)';
            } else {
              text = m.message.videoMessage.caption
                ? `একটি ভিডিও (ক্যাপশন: ${m.message.videoMessage.caption})`
                : 'একটি ভিডিও';
            }
          } else if (m.message.stickerMessage) {
            isSticker = true;
            text = 'একটি হোয়াটসঅ্যাপ স্টিকার';
          } else if (m.message.imageMessage) {
            text = m.message.imageMessage.caption
              ? `একটি ছবি (ক্যাপশন: ${m.message.imageMessage.caption})`
              : 'একটি ছবি (ফটো)';
          } else if (m.message.audioMessage) {
            text = 'একটি ভয়েস মেসেজ বা অডিও ক্লিপ';
          } else if (m.message.reactionMessage) {
            const reactionEmoji = m.message.reactionMessage.text || '';
            text = reactionEmoji ? `একটি রিঅ্যাকশন ইমোজি: ${reactionEmoji}` : 'একটি রিঅ্যাকশন';
          }

          if (!text) continue;

          // Format emojis in text if present
          const formattedMessage = formatEmojisAndMedia(text);

          const senderName = m.pushName || jid.replace('@s.whatsapp.net', '');
          const timestamp = m.messageTimestamp ? Number(m.messageTimestamp) * 1000 : Date.now();

          const cleanName = (senderName || '').toLowerCase().trim();
          if (cleanName) {
            this.recentContacts.set(cleanName, jid);
          }
          this.lastSenderJid = jid;
          this.lastSenderName = senderName;

          console.log(`[ZOYA WHATSAPP INCOMING] From: ${senderName} (${jid}), Text: "${formattedMessage}"`);

          this.incomingQueue.push({
            id: m.key.id,
            jid,
            sender: senderName,
            message: formattedMessage,
            rawMessage: text,
            isGif,
            isSticker,
            isGroup,
            timestamp
          });

          // Keep queue limited to last 100 items
          if (this.incomingQueue.length > 100) {
            this.incomingQueue.shift();
          }
        }
      });

      return true;
    } catch (err) {
      console.error('[ZOYA WHATSAPP INIT ERROR]', err);
      this.status = 'disconnected';
      this.isConnecting = false;
      this.sock = null;
      return false;
    }
  }

  getStatus() {
    return {
      status: this.status,
      connected: this.status === 'connected',
      qr: this.qrCodeDataUrl,
      userJid: this.userJid,
      userName: this.userName
    };
  }

  popNewMessages() {
    const list = [...this.incomingQueue];
    this.incomingQueue = [];
    return list;
  }

  getRecentContactJid(name) {
    if (!name) return this.lastSenderJid;
    const clean = name.toLowerCase().trim();
    if (this.recentContacts.has(clean)) return this.recentContacts.get(clean);
    for (const [cName, cJid] of this.recentContacts.entries()) {
      if (cName.includes(clean) || clean.includes(cName)) return cJid;
    }
    return this.lastSenderJid;
  }

  async sendMessage(to, text) {
    // If not currently connected but paired credentials exist, wait up to 4s for active connection
    if (this.status !== 'connected' || !this.sock) {
      if (fs.existsSync(path.join(AUTH_DIR, 'creds.json')) && !this.manualLogout) {
        console.log('[ZOYA WHATSAPP SEND] Socket disconnected, rapidly waiting for active connection...');
        this.init().catch(() => {});
        for (let i = 0; i < 8; i++) {
          if (this.status === 'connected' && this.sock) break;
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    if (this.status !== 'connected' || !this.sock) {
      return { success: false, error: 'Direct WhatsApp is not connected. Please scan QR in Zoya Settings.' };
    }

    try {
      let targetJid = (to || '').trim();
      if (!targetJid.includes('@')) {
        let clean = targetJid.replace(/[^0-9]/g, '');
        if (clean.length >= 7) {
          if (clean.length === 10) clean = '91' + clean;
          targetJid = clean + '@s.whatsapp.net';
        } else {
          // Look up by recent contact name or fallback to last sender
          const matched = this.getRecentContactJid(targetJid);
          if (matched) {
            targetJid = matched;
          } else {
            return { success: false, error: `Could not find phone number or JID for "${to}".` };
          }
        }
      }

      const sent = await this.sock.sendMessage(targetJid, { text });
      if (sent && sent.key) {
        const record = {
          key: sent.key,
          targetJid,
          text,
          timestamp: Date.now()
        };
        this.sentHistory.push(record);
        if (this.sentHistory.length > 50) this.sentHistory.shift();
        this.lastSentMessage = record;
        this.lastSenderJid = targetJid;
        this.recentContacts.set('last', targetJid);
        this.recentContacts.set('last sent', targetJid);
      }

      console.log(`[ZOYA WHATSAPP SENT] Message to ${targetJid}: "${text}"`);
      return { success: true, targetJid, messageId: sent?.key?.id };
    } catch (e) {
      console.error('[ZOYA WHATSAPP SEND ERROR]', e);
      return { success: false, error: e.message };
    }
  }

  async deleteMessage({ contactOrJid, query, messageId }) {
    if (this.status !== 'connected' || !this.sock) {
      return { success: false, error: 'Direct WhatsApp is not connected.' };
    }

    try {
      let targetRecord = null;

      if (messageId) {
        targetRecord = this.sentHistory.find(m => m.key?.id === messageId);
      }


      let targetJid = '';
      if (contactOrJid) {
        const clean = String(contactOrJid).trim();
        if (clean.includes('@')) {
          targetJid = clean;
        } else {
          const digits = clean.replace(/\D/g, '');
          if (digits.length >= 7) {
            targetJid = (digits.length === 10 ? '91' + digits : digits) + '@s.whatsapp.net';
          } else {
            targetJid = this.getRecentContactJid(clean) || this.lastSenderJid;
          }
        }
      }

      if (!targetRecord) {
        const candidates = targetJid
          ? this.sentHistory.filter(m => m.targetJid === targetJid || m.key?.remoteJid === targetJid)
          : this.sentHistory;

        if (query && query !== 'last' && query !== 'previous' && query !== 'sesh' && query !== 'all' && query !== 'shob') {
          const lowerQuery = query.toLowerCase().trim();
          targetRecord = [...candidates].reverse().find(m => (m.text || '').toLowerCase().includes(lowerQuery));
        } else {
          targetRecord = candidates[candidates.length - 1] || this.lastSentMessage;
        }
      }

      if (!targetRecord || !targetRecord.key) {
        return { success: false, error: 'ডিলিট করার মতো কোনো পাঠানো মেসেজ খুঁজে পাওয়া যায়নি।' };
      }

      const destJid = targetRecord.targetJid || targetRecord.key.remoteJid || targetJid || this.lastSenderJid;
      if (!destJid) {
        return { success: false, error: 'মেসেজ প্রাপকের তথ্য পাওয়া যায়নি।' };
      }

      console.log(`[ZOYA WHATSAPP DELETE] Revoking message ${targetRecord.key.id} in ${destJid}: "${targetRecord.text || ''}"`);

      await this.sock.sendMessage(destJid, {
        delete: targetRecord.key
      });

      this.sentHistory = this.sentHistory.filter(m => m.key?.id !== targetRecord.key.id);
      if (this.lastSentMessage?.key?.id === targetRecord.key.id) {
        this.lastSentMessage = this.sentHistory[this.sentHistory.length - 1] || null;
      }

      return {
        success: true,
        message: 'মেসেজটি সবার জন্য সফলভাবে ডিলিট (Delete for everyone) করে দেওয়া হয়েছে!',
        deletedText: targetRecord.text || ''
      };
    } catch (e) {
      console.error('[ZOYA WHATSAPP DELETE ERROR]', e);
      return { success: false, error: e.message || 'মেসেজ ডিলিট করতে সমস্যা হয়েছে।' };
    }
  }

  async logout() {
    this.manualLogout = true;
    try {
      if (this.sock) {
        await this.sock.logout();
      }
    } catch (e) { }
    this.status = 'disconnected';
    this.qrCodeDataUrl = null;
    this.userJid = null;
    this.userName = null;
    this.sock = null;
    clearAuthDir();
    return { success: true };
  }
}

export const directWhatsApp = globalThis.__zoyaDirectWhatsApp || new WhatsAppDirectClient();
globalThis.__zoyaDirectWhatsApp = directWhatsApp;
