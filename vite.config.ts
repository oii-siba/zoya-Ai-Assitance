import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { exec, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Helper to find the actual active Desktop path (handles OneDrive)
function getDesktopPath() {
  const home = os.homedir();
  const onedriveDesktop = path.join(home, 'OneDrive', 'Desktop');
  if (fs.existsSync(onedriveDesktop)) {
    return onedriveDesktop;
  }
  const onedriveDesktopAlternative = path.join(home, 'OneDrive - Personal', 'Desktop');
  if (fs.existsSync(onedriveDesktopAlternative)) {
    return onedriveDesktopAlternative;
  }
  return path.join(home, 'Desktop');
}

const CONTACTS_FILE = path.join(process.cwd(), 'contacts.json');
let lastSeenOrder = -1;

// Direct WhatsApp client (Baileys v5) - connects mobile without requiring desktop app
// Optimized for persistent background connection with PID lock & zero 440 conflict
// @ts-ignore
import { directWhatsApp } from './scripts/whatsapp_baileys.mjs';

function getContacts(): Record<string, string> {
  if (fs.existsSync(CONTACTS_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8'));
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) {
        clean[k.toLowerCase().trim()] = String(v);
        try {
          const latin = Buffer.from(k, 'latin1').toString('utf8');
          if (!latin.includes('\uFFFD') && latin !== k) {
            clean[latin.toLowerCase().trim()] = String(v);
          }
        } catch (e) {}
      }
      return clean;
    } catch (e) {
      return {};
    }
  }
  return {};
}

function saveContacts(contacts: Record<string, string>) {
  fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2), 'utf8');
}

// Spawns a program in a detached background process to prevent blocking Node's server response
function runCommandDetached(command: string) {
  const platform = os.platform();
  let child;
  if (platform === 'win32') {
    child = spawn(command, {
      shell: true,
      detached: true,
      stdio: 'ignore'
    });
  } else {
    child = spawn('sh', ['-c', command], {
      detached: true,
      stdio: 'ignore'
    });
  }
  child.unref();
}

const AUTOMATION_SCRIPT = path.join(process.cwd(), 'scripts', 'desktop_automation.ps1');

function runAutomation(args: Record<string, any>): Promise<{ success: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    const argsArray = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', AUTOMATION_SCRIPT];
    for (const [key, val] of Object.entries(args)) {
      if (val !== undefined && val !== null && val !== '') {
        argsArray.push(`-${key}`, String(val));
      }
    }
    const { execFile } = require('child_process');
    execFile('powershell.exe', argsArray, { timeout: 15000, encoding: 'utf8' }, (err: any, stdout: any, stderr: any) => {
      if (err) {
        console.error('[ZOYA AUTOMATION ERROR]', err, stderr);
        resolve({ success: false, error: stderr || err.message });
      } else {
        resolve({ success: true, output: (stdout || '').trim() });
      }
    });
  });
}

const FAST_CONTROL_EXE = path.join(process.cwd(), 'scripts', 'ZoyaFastControl.exe');
let fastControlProcess: any = null;
let fastControlPending: ((res: { success: boolean; output?: string; error?: string }) => void) | null = null;

// Ensure FastControl exe is available
if (!fs.existsSync(FAST_CONTROL_EXE)) {
  try {
    const buildScript = path.join(process.cwd(), 'scripts', 'build_fast_automate.cjs');
    if (fs.existsSync(buildScript)) {
      require('child_process').execSync(`node "${buildScript}"`, { stdio: 'ignore' });
    }
  } catch (e) {}
}

function getFastControlProcess() {
  if (fastControlProcess && !fastControlProcess.killed && fastControlProcess.stdin && fastControlProcess.stdin.writable) {
    return fastControlProcess;
  }
  if (!fs.existsSync(FAST_CONTROL_EXE)) {
    return null;
  }
  try {
    fastControlProcess = spawn(FAST_CONTROL_EXE, ['--daemon'], {
      stdio: ['pipe', 'pipe', 'inherit'],
      windowsHide: true,
    });
    fastControlProcess.stdout.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (text === 'READY') {
        console.log('[ZOYA FAST CONTROL] Daemon initialized and ready.');
      } else if (fastControlPending) {
        const cb = fastControlPending;
        fastControlPending = null;
        cb({ success: text.startsWith('SUCCESS') || text === 'PONG', output: text });
      }
    });
    fastControlProcess.on('error', (err: any) => {
      console.warn('[ZOYA FAST CONTROL] Daemon error:', err);
      fastControlProcess = null;
    });
    fastControlProcess.on('exit', () => {
      fastControlProcess = null;
      if (fastControlPending) {
        const cb = fastControlPending;
        fastControlPending = null;
        cb({ success: false, output: 'Daemon exited' });
      }
    });
    return fastControlProcess;
  } catch (e) {
    console.warn('[ZOYA FAST CONTROL] Failed to spawn daemon:', e);
    return null;
  }
}

// Pre-warm the fast control daemon
try { getFastControlProcess(); } catch (e) {}

async function runFastControl(action: string): Promise<{ success: boolean; output?: string; error?: string }> {
  const p = getFastControlProcess();
  if (p && p.stdin && p.stdin.writable) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        fastControlPending = null;
        if (fs.existsSync(FAST_CONTROL_EXE)) {
          const { execFile } = require('child_process');
          execFile(FAST_CONTROL_EXE, [action], { timeout: 3000 }, (err: any, stdout: string) => {
            if (err) resolve({ success: false, error: err.message });
            else resolve({ success: true, output: (stdout || '').trim() });
          });
        } else {
          runAutomation({ Action: action }).then(resolve);
        }
      }, 1200);

      fastControlPending = (res) => {
        clearTimeout(timer);
        resolve(res);
      };

      p.stdin.write(action + '\n');
    });
  }

  // Fast direct execFile fallback
  if (fs.existsSync(FAST_CONTROL_EXE)) {
    return new Promise((resolve) => {
      const { execFile } = require('child_process');
      execFile(FAST_CONTROL_EXE, [action], { timeout: 3000 }, (err: any, stdout: string) => {
        if (err) resolve({ success: false, error: err.message });
        else resolve({ success: true, output: (stdout || '').trim() });
      });
    });
  }

  return runAutomation({ Action: action });
}

const YT_CACHE_FILE = path.join(os.tmpdir(), 'zoya_yt_search_ids.json');
let inMemoryYtVideoIds: string[] = [];
let lastPlayedSongQuery = '';
let lastPlayedVideoIndex = 1;
let lastPlayedVideoIds: string[] = [];
const ytQueryCache = new Map<string, { timestamp: number; videoIds: string[] }>();

async function fetchAndCacheYouTubeVideoIds(searchQuery: string): Promise<string[]> {
  const cleanQ = searchQuery.toLowerCase().trim();
  const cached = ytQueryCache.get(cleanQ);
  if (cached && Date.now() - cached.timestamp < 3600000 && cached.videoIds.length > 0) {
    console.log(`[ZOYA YOUTUBE] Instant cache hit for "${cleanQ}":`, cached.videoIds.slice(0, 3));
    return cached.videoIds;
  }

  return new Promise((resolve) => {
    let resolved = false;
    const https = require('https');
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;

    // Quick safety timeout so browser playback launches without long waiting
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { req.destroy(); } catch (e) {}
        resolve([]);
      }
    }, 1800);

    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    }, (sRes: any) => {
      let buf = '';
      const found: string[] = [];

      sRes.on('data', (c: any) => {
        if (resolved) return;
        buf += c;
        const matches = buf.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/g) || [];
        for (const m of matches) {
          const id = m.replace('/watch?v=', '');
          if (!found.includes(id)) found.push(id);
        }

        // As soon as 20 video IDs arrive in the stream, resolve immediately!
        if (found.length >= 20 && !resolved) {
          resolved = true;
          clearTimeout(timer);
          inMemoryYtVideoIds = found;
          ytQueryCache.set(cleanQ, { timestamp: Date.now(), videoIds: found });
          try {
            fs.writeFileSync(YT_CACHE_FILE, JSON.stringify({ query: searchQuery, timestamp: Date.now(), videoIds: found }), 'utf8');
          } catch (e) {}
          try { req.destroy(); } catch (e) {}
          console.log(`[ZOYA YOUTUBE] Stream discovered ${found.length} IDs for "${searchQuery}":`, found.slice(0, 5));
          resolve(found);
        }
      });

      sRes.on('end', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          if (found.length > 0) {
            inMemoryYtVideoIds = found;
            ytQueryCache.set(cleanQ, { timestamp: Date.now(), videoIds: found });
          }
          resolve(found);
        }
      });
    });

    req.on('error', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve([]);
      }
    });
  });
}

function getCachedYouTubeVideoIds(): string[] {
  if (inMemoryYtVideoIds.length > 0) return inMemoryYtVideoIds;
  try {
    if (fs.existsSync(YT_CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(YT_CACHE_FILE, 'utf8'));
      if (data && Array.isArray(data.videoIds) && data.videoIds.length > 0) {
        if (Date.now() - (data.timestamp || 0) < 3600000) {
          inMemoryYtVideoIds = data.videoIds;
          return inMemoryYtVideoIds;
        }
      }
    }
  } catch (e) {}
  return [];
}


async function searchWebQuickly(query: string): Promise<string> {
  const cleanQ = query.trim();
  if (!cleanQ) return 'No search query provided.';

  // 1. Try Wikipedia REST summary first
  try {
    const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanQ.replace(/\\s+/g, '_'))}`;
    const resp = await fetch(wikiUrl, { headers: { 'User-Agent': 'ZoyaAssistant/2.0' } });
    if (resp.ok) {
      const data: any = await resp.json();
      if (data.extract) {
        return `Title: ${data.title}\nSummary: ${data.extract}`;
      }
    }
  } catch (e) {}

  // 2. Try DuckDuckGo Instant Answer API
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQ)}&format=json&no_html=1&skip_disambig=1`;
    const resp = await fetch(ddgUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (resp.ok) {
      const data: any = await resp.json();
      if (data.AbstractText) {
        return `Topic: ${data.Heading || cleanQ}\nAnswer: ${data.AbstractText}`;
      }
    }
  } catch (e) {}

  // 3. Try DuckDuckGo HTML snippets
  try {
    const ddgHtmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQ)}`;
    const resp = await fetch(ddgHtmlUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
    if (resp.ok) {
      const html = await resp.text();
      const snippets: string[] = [];
      const matches = html.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g);
      if (matches) {
        matches.slice(0, 3).forEach(m => {
          const text = m.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
          if (text) snippets.push(text);
        });
      }
      if (snippets.length > 0) {
        return snippets.join('\n\n');
      }
    }
  } catch (e) {}

  return `Search completed for "${cleanQ}". Answer using your vast intelligence.`;
}

// Helper to get WhatsApp process ID on Windows by scanning for "WhatsApp" in window titles (excluding browsers)
export function getWhatsAppPid(): Promise<string> {
  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -Command "Get-Process | Where-Object MainWindowTitle -like \'*WhatsApp*\' | Where-Object ProcessName -notIn \'chrome\',\'msedge\',\'firefox\',\'opera\',\'brave\',\'iexplore\',\'vivaldi\' | Select-Object -First 1 -ExpandProperty Id"',
      { timeout: 2000 },
      (err, stdout) => {
        if (err || !stdout) {
          resolve('');
        } else {
          resolve(stdout.trim());
        }
      }
    );
  });
}

let cachedWindowsShortcuts: { name: string; fullPath: string }[] | null = null;
let lastShortcutsScanTime = 0;

export function getInstalledAppShortcuts(): { name: string; fullPath: string }[] {
  const now = Date.now();
  if (cachedWindowsShortcuts && now - lastShortcutsScanTime < 60000) {
    return cachedWindowsShortcuts;
  }
  const userHome = os.homedir();
  const dirs = [
    path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(userHome, 'Desktop'),
    path.join(userHome, 'OneDrive', 'Desktop'),
    'C:\\Users\\Public\\Desktop'
  ];

  const shortcuts: { name: string; fullPath: string }[] = [];
  function scan(dir: string, depth = 0) {
    if (depth > 3 || !fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const full = path.join(dir, entry);
        try {
          const stat = fs.statSync(full);
          if (stat.isDirectory()) {
            scan(full, depth + 1);
          } else if (entry.toLowerCase().endsWith('.lnk') || entry.toLowerCase().endsWith('.url')) {
            shortcuts.push({ name: entry.replace(/\.(lnk|url)$/i, ''), fullPath: full });
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  for (const d of dirs) scan(d);
  cachedWindowsShortcuts = shortcuts;
  lastShortcutsScanTime = now;
  return shortcuts;
}

export function resolveUniversalTarget(appNameOrPath: string): { type: string; command: string; description: string } {
  const raw = String(appNameOrPath || '').trim();
  const lower = raw.toLowerCase()
    .replace(/^(open|launch|start|khulo|chalao|dekhao)\s+/i, '')
    .replace(/\s+(app|application|player|folder|file|document)$/i, '')
    .trim();

  const userHome = os.homedir();

  // 1. Built-in Windows Apps / Tools mapping
  const builtinMap: Record<string, string> = {
    calc: 'start calc:',
    calculator: 'start calc:',
    hisab: 'start calc:',
    notepad: 'start notepad',
    notes: 'start notepad',
    khata: 'start notepad',
    paint: 'start mspaint',
    mspaint: 'start mspaint',
    settings: 'start ms-settings:',
    setting: 'start ms-settings:',
    camera: 'start microsoft.windows.camera:',
    clock: 'start ms-clock:',
    alarm: 'start ms-clock:',
    timer: 'start ms-clock:',
    photos: 'start ms-photos:',
    photo: 'start ms-photos:',
    store: 'start ms-windows-store:',
    snippingtool: 'start snippingtool',
    'snipping tool': 'start snippingtool',
    snip: 'start snippingtool',
    cmd: 'start cmd',
    'command prompt': 'start cmd',
    powershell: 'start powershell',
    terminal: 'start wt',
    'windows terminal': 'start wt',
    taskmgr: 'start taskmgr',
    'task manager': 'start taskmgr',
    control: 'start control',
    'control panel': 'start control',
    explorer: 'explorer',
    'file explorer': 'explorer',
    'my pc': 'explorer',
    'this pc': 'explorer',
    'my computer': 'explorer',
    chrome: 'start chrome',
    'google chrome': 'start chrome',
    edge: 'start msedge',
    'microsoft edge': 'start msedge',
    code: 'code .',
    vscode: 'code .',
    'vs code': 'code .',
    'visual studio code': 'code .',
    youtube: 'start "" "https://www.youtube.com"',
    spotify: 'start spotify: || start "" "https://open.spotify.com"',
    facebook: 'start "" "https://www.facebook.com"',
    fb: 'start "" "https://www.facebook.com"',
    instagram: 'start "" "https://www.instagram.com"',
    insta: 'start "" "https://www.instagram.com"',
    twitter: 'start "" "https://x.com"',
    x: 'start "" "https://x.com"',
    gmail: 'start "" "https://mail.google.com"',
    maps: 'start "" "https://maps.google.com"',
    'google maps': 'start "" "https://maps.google.com"'
  };

  if (builtinMap[lower]) {
    return { type: 'builtin', command: builtinMap[lower], description: `Windows built-in / system app (${lower})` };
  }

  // 2. Standard Windows User Folders
  const standardFolders: Record<string, string> = {
    desktop: path.join(userHome, 'Desktop'),
    downloads: path.join(userHome, 'Downloads'),
    download: path.join(userHome, 'Downloads'),
    documents: path.join(userHome, 'Documents'),
    document: path.join(userHome, 'Documents'),
    docs: path.join(userHome, 'Documents'),
    pictures: path.join(userHome, 'Pictures'),
    picture: path.join(userHome, 'Pictures'),
    photos: path.join(userHome, 'Pictures'),
    photo: path.join(userHome, 'Pictures'),
    videos: path.join(userHome, 'Videos'),
    video: path.join(userHome, 'Videos'),
    music: path.join(userHome, 'Music'),
    audio: path.join(userHome, 'Music')
  };

  if (fs.existsSync(path.join(userHome, 'OneDrive', 'Desktop'))) standardFolders['desktop'] = path.join(userHome, 'OneDrive', 'Desktop');
  if (fs.existsSync(path.join(userHome, 'OneDrive', 'Documents'))) standardFolders['documents'] = path.join(userHome, 'OneDrive', 'Documents');
  if (fs.existsSync(path.join(userHome, 'OneDrive', 'Pictures'))) standardFolders['pictures'] = path.join(userHome, 'OneDrive', 'Pictures');

  if (standardFolders[lower] && fs.existsSync(standardFolders[lower])) {
    return { type: 'folder', command: `explorer "${standardFolders[lower]}"`, description: `Standard folder: ${lower}` };
  }

  // 3. Drive Roots (e.g. "c drive", "d:", "c:\")
  if (/^[a-z]\s*(drive|:)$/i.test(lower) || /^[a-z]:\\?$/i.test(lower)) {
    const driveLetter = lower.charAt(0).toUpperCase();
    const drivePath = `${driveLetter}:\\`;
    if (fs.existsSync(drivePath)) {
      return { type: 'drive', command: `explorer "${drivePath}"`, description: `Drive ${drivePath}` };
    }
  }

  // 4. Exact path check
  if (fs.existsSync(raw)) {
    const stat = fs.statSync(raw);
    if (stat.isDirectory()) {
      return { type: 'folder', command: `explorer "${raw}"`, description: `Directory: ${raw}` };
    } else {
      return { type: 'file', command: `start "" "${raw}"`, description: `File: ${raw}` };
    }
  }

  // 5. Search Start Menu / Desktop shortcuts (*.lnk) for installed desktop software
  const shortcuts = getInstalledAppShortcuts();
  // Exact match
  let matchedShortcut = shortcuts.find(s => s.name.toLowerCase() === lower);
  // Starts with
  if (!matchedShortcut) {
    matchedShortcut = shortcuts.find(s => s.name.toLowerCase().startsWith(lower));
  }
  // Substring
  if (!matchedShortcut) {
    matchedShortcut = shortcuts.find(s => s.name.toLowerCase().includes(lower));
  }
  if (matchedShortcut) {
    return {
      type: 'shortcut',
      command: `explorer.exe "${matchedShortcut.fullPath}"`,
      description: `Installed application shortcut: ${matchedShortcut.name}`
    };
  }

  // 6. Search user folders for matching files or folders
  const searchRoots = [
    standardFolders['desktop'],
    path.join(userHome, 'Desktop'),
    standardFolders['downloads'],
    standardFolders['documents'],
    process.cwd(),
    userHome
  ];

  for (const root of searchRoots) {
    if (!root || !fs.existsSync(root)) continue;
    try {
      const items = fs.readdirSync(root);
      // Exact match
      let found = items.find(i => i.toLowerCase() === lower);
      // Base name match (without extension)
      if (!found) {
        found = items.find(i => path.parse(i).name.toLowerCase() === lower);
      }
      // Substring match
      if (!found) {
        found = items.find(i => i.toLowerCase().includes(lower));
      }
      if (found) {
        const full = path.join(root, found);
        const isDir = fs.statSync(full).isDirectory();
        return {
          type: isDir ? 'folder' : 'file',
          command: isDir ? `explorer "${full}"` : `start "" "${full}"`,
          description: `${isDir ? 'Folder' : 'File'}: ${found}`
        };
      }
    } catch (e) {}
  }

  // 7. URL or fallback
  let target = raw;
  if (target.includes('.') && !/^https?:\/\//i.test(target) && !target.includes('\\')) {
    target = `https://${target}`;
  }
  return {
    type: 'generic',
    command: `start "" "${target}"`,
    description: `Target: ${target}`
  };
}

// Custom Vite plugin for system commands execution
function systemControlPlugin() {
  return {
    name: 'zoya-system-control',
    configureServer(server: any) {
      if (fs.existsSync(path.join(process.cwd(), 'whatsapp_auth', 'creds.json'))) {
        console.log('[ZOYA SERVER] Auto-connecting mobile WhatsApp in server...');
        directWhatsApp.init().catch((err: any) => console.error('[ZOYA SERVER] Auto-connect error:', err));
      }

      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url && req.url.startsWith('/api/whatsapp')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.end();
            return;
          }

          const parsedUrl = new URL(req.url, 'http://localhost');
          const subPath = parsedUrl.pathname.replace('/api/whatsapp', '');

          if (subPath === '/status' || subPath === '') {
            res.end(JSON.stringify({ success: true, ...directWhatsApp.getStatus() }));
            return;
          }

          if (subPath === '/connect') {
            directWhatsApp.init().catch(console.error);
            await new Promise((r) => setTimeout(r, 1200));
            res.end(JSON.stringify({ success: true, ...directWhatsApp.getStatus() }));
            return;
          }

          if (subPath === '/connect-fresh') {
            await directWhatsApp.init(true);
            await new Promise((r) => setTimeout(r, 1500));
            res.end(JSON.stringify({ success: true, ...directWhatsApp.getStatus() }));
            return;
          }

          if (subPath === '/launch-desktop') {
            if (os.platform() === 'win32') {
              runCommandDetached('start whatsapp:');
            }
            res.end(JSON.stringify({ success: true, message: 'Launched WhatsApp Desktop' }));
            return;
          }

          if (subPath === '/logout') {
            await directWhatsApp.logout();
            res.end(JSON.stringify({ success: true, message: 'Logged out successfully' }));
            return;
          }

          res.statusCode = 404;
          res.end(JSON.stringify({ success: false, error: 'Not found' }));
          return;
        }

        if (req.url && req.url.startsWith('/api/control')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.end();
            return;
          }

          try {
            let body = '';
          if (req.method === 'POST') {
            await new Promise<void>((resolve, reject) => {
              req.on('data', (chunk: any) => {
                body += chunk.toString();
              });
              req.on('end', () => {
                resolve();
              });
              req.on('error', (err: any) => {
                reject(err);
              });
            });
          }

          let payload: Record<string, any> = {};
          if (body) {
            try {
              payload = JSON.parse(body);
            } catch (e) {
              console.error('Failed to parse POST body:', e);
            }
          }

          // Parse query parameters
          const urlObj = new URL(req.url, 'http://localhost');
          let action = payload.action || urlObj.searchParams.get('action');
          const folderName = payload.folderName || urlObj.searchParams.get('folderName');
          const siteTitle = payload.siteTitle || urlObj.searchParams.get('siteTitle') || 'Zoya Generated Site';
          const appName = payload.appName || urlObj.searchParams.get('appName') || '';
          const targetUrl = payload.url || urlObj.searchParams.get('url') || '';
          const customHtmlContent = payload.htmlContent || urlObj.searchParams.get('htmlContent') || '';
          const files = payload.files || null;
          const query = payload.query || urlObj.searchParams.get('query') || '';
          const text = payload.text || urlObj.searchParams.get('text') || query || '';
          const operation = payload.operation || urlObj.searchParams.get('operation') || '';
          const navAction = payload.navAction || urlObj.searchParams.get('navAction') || '';
          const mediaAction = payload.mediaAction || urlObj.searchParams.get('mediaAction') || '';
          const key = payload.key || urlObj.searchParams.get('key') || operation || navAction || mediaAction || '';
          const x = parseInt(payload.x || urlObj.searchParams.get('x') || '0', 10);
          const y = parseInt(payload.y || urlObj.searchParams.get('y') || '0', 10);
          const button = payload.button || urlObj.searchParams.get('button') || 'left';
          const amount = parseInt(payload.amount || urlObj.searchParams.get('amount') || '0', 10);
          const direction = payload.direction || urlObj.searchParams.get('direction') || '';
          const windowTitle = payload.windowTitle || urlObj.searchParams.get('windowTitle') || '';
          const command = payload.command || urlObj.searchParams.get('command') || '';
          const index = parseInt(payload.index || urlObj.searchParams.get('index') || '1', 10);
          const pressEnter = payload.pressEnter === true || urlObj.searchParams.get('pressEnter') === 'true';
          const filePath = payload.path || urlObj.searchParams.get('path') || '';
          const fileContent = payload.content || urlObj.searchParams.get('content') || '';
          const level = parseInt(payload.level || urlObj.searchParams.get('level') || '50', 10);

          if (action === 'shutdown') {
            const platform = os.platform();
            let command = '';
            if (platform === 'win32') {
              // Immediate shutdown
              command = 'shutdown /s /t 0';
            } else if (platform === 'darwin') {
              command = 'osascript -e "tell app \\"System Events\\" to shut down"';
            } else {
              command = 'shutdown -h +1 "Zoya AI is shutting down your PC in 1 minute."';
            }

            exec(command, (err) => {
              if (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ success: false, error: err.message }));
                return;
              }
              res.end(JSON.stringify({ success: true, message: 'PC Shutdown sequence initiated.' }));
            });
            return;
          }

          if (action === 'sleep') {
            const platform = os.platform();
            let command = '';
            if (platform === 'win32') {
              command = 'powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false)"';
            } else if (platform === 'darwin') {
              command = 'osascript -e "tell application \\"System Events\\" to sleep"';
            } else {
              command = 'systemctl suspend';
            }

            exec(command, (err) => {
              if (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ success: false, error: err.message }));
                return;
              }
              res.end(JSON.stringify({ success: true, message: 'PC Sleep sequence initiated.' }));
            });
            return;
          }

          if (action === 'get-contacts') {
            const contacts = getContacts();
            res.end(JSON.stringify({ success: true, contacts }));
            return;
          }

          if (action === 'add-contact') {
            const name = urlObj.searchParams.get('name');
            const phone = urlObj.searchParams.get('phone');
            if (!name || !phone) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'name and phone are required' }));
              return;
            }
            const contacts = getContacts();
            contacts[name.toLowerCase().trim()] = phone.trim();
            saveContacts(contacts);
            res.end(JSON.stringify({ success: true, message: `Added contact ${name}` }));
            return;
          }

          if (action === 'delete-contact') {
            const name = urlObj.searchParams.get('name');
            if (!name) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'name is required' }));
              return;
            }
            const contacts = getContacts();
            delete contacts[name.toLowerCase().trim()];
            saveContacts(contacts);
            res.end(JSON.stringify({ success: true, message: `Deleted contact ${name}` }));
            return;
          }

          if (action === 'send-whatsapp') {
            const contactNameOrNumber = payload.contact || urlObj.searchParams.get('contact') || '';
            const message = payload.message || urlObj.searchParams.get('message') || '';
            const count = parseInt(payload.count || urlObj.searchParams.get('count') || '1', 10) || 1;

            if (!message) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'message is required' }));
              return;
            }

            let directStatus = directWhatsApp.getStatus();
            // If disconnected, try auto-connecting if credentials exist
            if (!directStatus.connected) {
              if (fs.existsSync(path.join(process.cwd(), 'whatsapp_auth', 'creds.json'))) {
                console.log('[ZOYA SERVER] WhatsApp disconnected, attempting quick reconnect before sending...');
                directWhatsApp.init().catch(() => {});
                for (let attempt = 0; attempt < 8; attempt++) {
                  await new Promise((r) => setTimeout(r, 500));
                  directStatus = directWhatsApp.getStatus();
                  if (directStatus.connected) break;
                }
              }
            }

            if (!directStatus.connected) {
              res.statusCode = 400;
              res.end(JSON.stringify({
                success: false,
                error: 'হোয়াটসঅ্যাপ সংযুক্ত নেই! অনুগ্রহ করে উপরের হোয়াটসঅ্যাপ আইকনে ক্লিক করে QR কোডটি স্ক্যান করে নিন।'
              }));
              return;
            }

            // Resolve target JID strictly via mobile WhatsApp connection (NEVER launch laptop WhatsApp app)
            let targetJid = '';
            const rawContact = (contactNameOrNumber || '').trim();
            let cleanSearchName = rawContact.toLowerCase().trim();

            // Strip common prefixes
            cleanSearchName = cleanSearchName
              .replace(/^(to\s+|send\s+to\s+|message\s+to\s+|message\s+|whatsapp-e\s+|হোয়াটসঅ্যাপে\s+|হোয়াটসঅ্যাপ\s+|ডাইরেক্ট\s+|direct\s+)/i, '')
              .trim();

            // Strip common suffixes (e.g. "সাহিলকে", "সাহিলকে বলো", "Sahil ke", "Sahil k", "Sahil da", "Sahil bhai")
            cleanSearchName = cleanSearchName
              .replace(/\s*(কে\s*বলো|k\s*bolo|কে\s*বল|k\s*bol|কে\s*মেসেজ\s*পাঠাও|কে\s*মেসেজ\s*করো|k\s*message\s*pathao|k\s*message\s*koro|কে\s*পাঠাও|কে\s*মেসেজ|কে|ke|k|দা|da|দাদা|ভাই|bhai|বাবু|babu|ের|er)$/i, '')
              .trim();

            const genericKeywords = [
              'him', 'her', 'them', 'onake', 'unake', 'take', 'the sender', 'last sender', 'reply', 'active', 'current', 'sender',
              'direct', 'direct whatsapp', 'whatsapp', 'direct message', 'message',
              'উনাকে', 'তাকে', 'ওনাকে', 'উনাকে বলো', 'তাকে বলো', 'প্রেরক', 'লাস্ট', 'লাস্ট সেন্ডার', 'রিপ্লাই', 'বলো', 'পাঠাও',
              'ডাইরেক্ট', 'ডাইরেক্ট মেসেজ', 'হোয়াটসঅ্যাপ'
            ];

            const isGenericTarget = !rawContact ||
              genericKeywords.includes(cleanSearchName) ||
              genericKeywords.includes(rawContact.toLowerCase().trim());

            if (isGenericTarget) {
              targetJid = directWhatsApp.lastSenderJid || directWhatsApp.lastSentMessage?.targetJid || (directWhatsApp.sentHistory && directWhatsApp.sentHistory.length > 0 ? directWhatsApp.sentHistory[directWhatsApp.sentHistory.length - 1].targetJid : '') || '';
            } else if (rawContact.includes('@')) {
              targetJid = rawContact;
            } else {
              let phoneDigits = rawContact.replace(/\D/g, '');
              if (phoneDigits.length >= 7) {
                if (phoneDigits.length === 10) {
                  phoneDigits = '91' + phoneDigits;
                }
                targetJid = phoneDigits + '@s.whatsapp.net';
              } else {
                const contacts = getContacts();
                const lowerRaw = rawContact.toLowerCase().trim();
                let matchedPhone = contacts[lowerRaw] || contacts[cleanSearchName];
                if (!matchedPhone) {
                  for (const [cName, cPhone] of Object.entries(contacts)) {
                    const cLower = cName.toLowerCase();
                    if (
                      cLower === lowerRaw ||
                      cLower === cleanSearchName ||
                      lowerRaw.startsWith(cLower) ||
                      cleanSearchName.startsWith(cLower) ||
                      cLower.startsWith(cleanSearchName) ||
                      cLower.startsWith(lowerRaw)
                    ) {
                      matchedPhone = cPhone as string;
                      break;
                    }
                  }
                }
                if (matchedPhone) {
                  let cleanP = String(matchedPhone).replace(/\D/g, '');
                  if (cleanP.length === 10) cleanP = '91' + cleanP;
                  targetJid = cleanP + '@s.whatsapp.net';
                } else {
                  const recentJid = directWhatsApp.getRecentContactJid(cleanSearchName || rawContact);
                  if (recentJid) {
                    targetJid = recentJid;
                  } else if (directWhatsApp.lastSenderJid) {
                    targetJid = directWhatsApp.lastSenderJid;
                  } else if (directWhatsApp.lastSentMessage?.targetJid) {
                    targetJid = directWhatsApp.lastSentMessage.targetJid;
                  }
                }
              }
            }

            if (!targetJid) {
              res.statusCode = 404;
              res.end(JSON.stringify({
                success: false,
                error: `"${rawContact || cleanSearchName}" নামে কোনো কন্টাক্ট বা ফোন নম্বর পাওয়া যায়নি। অনুগ্রহ করে নম্বরটি বলুন বা কন্টাক্ট সেভ করুন।`
              }));
              return;
            }

            try {
              console.log(`[ZOYA DIRECT WHATSAPP] Sending message directly via mobile connection to ${targetJid}: "${message}"`);
              let allSucceeded = true;
              let lastErr = '';
              const AI_HEADER = "*This Message from Zoya AI Assistance !! it may be a mistake*";
              for (let i = 0; i < count; i++) {
                const cleanMsg = (message || '').trim();
                let textToSend = cleanMsg;
                if (i === 0) {
                  // Only attach bold header above the very first message
                  if (!cleanMsg.startsWith('*This Message from') && !cleanMsg.startsWith('*This Massage from')) {
                    textToSend = `${AI_HEADER}\n\n${cleanMsg}`;
                  }
                }
                const sendRes = await directWhatsApp.sendMessage(targetJid, textToSend);
                if (!sendRes.success) {
                  allSucceeded = false;
                  lastErr = sendRes.error || 'Failed to send';
                  break;
                }
                if (count > 1) await new Promise((r) => setTimeout(r, 200));
              }

              if (allSucceeded) {
                res.end(JSON.stringify({
                  success: true,
                  message: `Message sent directly in background via mobile WhatsApp to ${rawContact || targetJid}.`
                }));
                return;
              } else {
                res.statusCode = 500;
                res.end(JSON.stringify({
                  success: false,
                  error: `Failed to send WhatsApp message via mobile: ${lastErr}`
                }));
                return;
              }
            } catch (err: any) {
              console.error('[ZOYA DIRECT WHATSAPP ERROR]', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: err.message || 'Error sending message via mobile WhatsApp' }));
              return;
            }
          }

          if (action === 'delete-whatsapp') {
            const contact = payload.contact || urlObj.searchParams.get('contact') || '';
            const query = payload.query || payload.message || urlObj.searchParams.get('query') || 'last';
            const messageId = payload.messageId || urlObj.searchParams.get('messageId') || '';

            const directStatus = directWhatsApp.getStatus();
            if (!directStatus.connected) {
              res.statusCode = 400;
              res.end(JSON.stringify({
                success: false,
                error: 'Direct Mobile WhatsApp is not connected.'
              }));
              return;
            }

            try {
              const deleteRes = await (directWhatsApp as any).deleteMessage({
                contactOrJid: contact,
                query,
                messageId
              });

              if (deleteRes.success) {
                res.end(JSON.stringify(deleteRes));
              } else {
                res.statusCode = 400;
                res.end(JSON.stringify(deleteRes));
              }
              return;
            } catch (err: any) {
              console.error('[ZOYA DELETE WHATSAPP ERROR]', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: err.message || 'Error deleting WhatsApp message' }));
              return;
            }
          }

          if (action === 'create-site') {
            if (!folderName) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'folderName is required' }));
              return;
            }

            const cleanFolderName = folderName.replace(/[^a-zA-Z0-9-_ ]/g, '_');
            const desktopPath = getDesktopPath();
            const projectPath = path.join(desktopPath, cleanFolderName);

            try {
              if (!fs.existsSync(projectPath)) {
                fs.mkdirSync(projectPath, { recursive: true });
              }

              const defaultHtmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${siteTitle}</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: radial-gradient(circle at center, #1e1e38 0%, #0d0d1e 100%);
            color: #f1f1f7;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            overflow: hidden;
        }
        .container {
            text-align: center;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(16px);
            padding: 3rem;
            border-radius: 24px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
            max-width: 500px;
            width: 90%;
            transition: transform 0.3s ease;
        }
        .container:hover {
            transform: translateY(-5px);
            border-color: rgba(139, 92, 246, 0.3);
        }
        h1 {
            font-size: 2.5rem;
            margin-bottom: 1rem;
            background: linear-gradient(135deg, #a78bfa 0%, #ec4899 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-weight: 800;
        }
        p {
            color: #94a3b8;
            line-height: 1.6;
            margin-bottom: 2rem;
            font-size: 1.1rem;
        }
        .btn {
            display: inline-block;
            background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
            color: white;
            border: none;
            padding: 0.8rem 2rem;
            font-size: 1rem;
            font-weight: 600;
            border-radius: 50px;
            cursor: pointer;
            text-decoration: none;
            box-shadow: 0 10px 20px rgba(139, 92, 246, 0.3);
            transition: all 0.3s ease;
        }
        .btn:hover {
            transform: scale(1.05);
            box-shadow: 0 15px 25px rgba(139, 92, 246, 0.5);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${siteTitle}</h1>
        <p>This web page was designed and generated automatically by Zoya, your AI Voice Assistant.</p>
        <button class="btn" onclick="sayHello()">Say Hello</button>
    </div>
    <script>
        function sayHello() {
            alert("Hello from your new website! Hope you like it! 😉");
        }
    </script>
</body>
</html>`;

              if (files && Array.isArray(files)) {
                files.forEach((file: { filename: string; content: string }) => {
                  if (file.filename && file.content !== undefined) {
                    const filePath = path.join(projectPath, file.filename);
                    const fileDir = path.dirname(filePath);
                    if (!fs.existsSync(fileDir)) {
                      fs.mkdirSync(fileDir, { recursive: true });
                    }
                    fs.writeFileSync(filePath, file.content, 'utf8');
                  }
                });
              } else {
                fs.writeFileSync(path.join(projectPath, 'index.html'), customHtmlContent || defaultHtmlContent);
              }

              // Open folder
              let openCmd = '';
              if (os.platform() === 'win32') {
                openCmd = `explorer "${projectPath}"`;
              } else if (os.platform() === 'darwin') {
                openCmd = `open "${projectPath}"`;
              } else {
                openCmd = `xdg-open "${projectPath}"`;
              }
              setTimeout(() => {
                exec(openCmd);
              }, 3000);

              // Host on localhost automatically
              const backendFile = files && Array.isArray(files) && files.find((f: any) => f.filename === 'server.js' || f.filename === 'app.js')?.filename;

              if (backendFile) {
                const serverFileContent = files.find((f: any) => f.filename === backendFile).content;
                let backendPort = 3000;
                
                const portMatch = serverFileContent.match(/listen\((\d+)\)/) || 
                                  serverFileContent.match(/PORT\s*=\s*(\d+)/) || 
                                  serverFileContent.match(/port\s*=\s*(\d+)/);
                if (portMatch && portMatch[1]) {
                  backendPort = parseInt(portMatch[1], 10);
                }

                const hasPackageJson = files.some((f: any) => f.filename === 'package.json');
                const npmCmd = os.platform() === 'win32' ? 'npm.cmd' : 'npm';
                const { spawn } = require('child_process');

                if (hasPackageJson) {
                  const installProcess = spawn(npmCmd, ['install'], { cwd: projectPath, shell: true });
                  installProcess.on('close', () => {
                    const serverProcess = spawn('node', [backendFile], { cwd: projectPath, detached: true, stdio: 'ignore' });
                    serverProcess.unref();
                    console.log(`[ZOYA BACKEND] Started Node server at port ${backendPort}`);
                    
                    const siteUrl = `http://localhost:${backendPort}`;
                    const openBrowserCmd = os.platform() === 'win32' ? `start "" "${siteUrl}"` : os.platform() === 'darwin' ? `open "${siteUrl}"` : `xdg-open "${siteUrl}"`;
                    setTimeout(() => { exec(openBrowserCmd); }, 4000);
                  });
                } else {
                  const serverProcess = spawn('node', [backendFile], { cwd: projectPath, detached: true, stdio: 'ignore' });
                  serverProcess.unref();
                  console.log(`[ZOYA BACKEND] Started Node server at port ${backendPort}`);
                  
                  const siteUrl = `http://localhost:${backendPort}`;
                  const openBrowserCmd = os.platform() === 'win32' ? `start "" "${siteUrl}"` : os.platform() === 'darwin' ? `open "${siteUrl}"` : `xdg-open "${siteUrl}"`;
                  setTimeout(() => { exec(openBrowserCmd); }, 4000);
                }
              } else {
                const http = require('http');
                
                const startStaticServer = (targetPort: number) => {
                  const staticServer = http.createServer((sReq: any, sRes: any) => {
                    let reqPath = sReq.url.split('?')[0];
                    let filePath = path.join(projectPath, reqPath === '/' ? 'index.html' : reqPath);
                    
                    if (!filePath.startsWith(projectPath)) {
                      sRes.statusCode = 403;
                      sRes.end('Forbidden');
                      return;
                    }
                    
                    fs.readFile(filePath, (sErr: any, sData: any) => {
                      if (sErr) {
                        sRes.statusCode = 404;
                        sRes.end('Not Found');
                        return;
                      }
                      
                      let contentType = 'text/html';
                      if (filePath.endsWith('.css')) contentType = 'text/css';
                      else if (filePath.endsWith('.js')) contentType = 'application/javascript';
                      else if (filePath.endsWith('.png')) contentType = 'image/png';
                      else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) contentType = 'image/jpeg';
                      else if (filePath.endsWith('.json')) contentType = 'application/json';
                      
                      sRes.setHeader('Content-Type', contentType);
                      sRes.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                      sRes.setHeader('Pragma', 'no-cache');
                      sRes.setHeader('Expires', '0');
                      sRes.end(sData);
                    });
                  });

                  staticServer.on('error', (sErr: any) => {
                    if (sErr.code === 'EADDRINUSE') {
                      startStaticServer(targetPort + 1);
                    }
                  });

                  staticServer.listen(targetPort, () => {
                    console.log(`[ZOYA STATIC] Served at http://localhost:${targetPort}`);
                    
                    const siteUrl = `http://localhost:${targetPort}`;
                    const openBrowserCmd = os.platform() === 'win32' ? `start "" "${siteUrl}"` : os.platform() === 'darwin' ? `open "${siteUrl}"` : `xdg-open "${siteUrl}"`;
                    setTimeout(() => {
                      exec(openBrowserCmd);
                    }, 4000);
                  });
                };

                startStaticServer(8000 + Math.floor(Math.random() * 500));
              }

              res.end(JSON.stringify({ success: true, message: `Folder and website created at: ${projectPath}`, path: projectPath }));
            } catch (err: any) {
              console.error(err);
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
            return;
          }

          if (action === 'read-webpage') {
            if (!targetUrl) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'url is required' }));
              return;
            }

            try {
              const response = await fetch(targetUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
              });
              const html = await response.text();
              
              const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
              let content = bodyMatch ? bodyMatch[1] : html;
              
              content = content.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '');
              content = content.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '');
              content = content.replace(/<svg[^>]*>([\s\S]*?)<\/svg>/gi, '');
              content = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
              
              if (content.length > 8000) {
                content = content.substring(0, 8000) + '... (content truncated)';
              }
              
              res.end(JSON.stringify({ success: true, url: targetUrl, content }));
            } catch (err: any) {
              console.error('Failed to fetch webpage:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
            return;
          }

          if (action === 'open-app') {
            if (!appName) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'appName is required' }));
              return;
            }

            const lowerApp = appName.toLowerCase().trim();

            // SAFETY INTERCEPTOR: If open-app was triggered for song/music playback (e.g. "youtube gaan", "gaan", "arijit singh gaan", "youtube music", etc.)
            const isSongRequest = lowerApp.includes('gaan') || lowerApp.includes('song') || lowerApp.includes('music') ||
                                  lowerApp.includes('track') || lowerApp.includes('shonao') || lowerApp.includes('bajao') ||
                                  /^youtube\s+.+/i.test(lowerApp);

            if (isSongRequest) {
              let cleanQuery = appName
                .replace(/^(open|launch|play|chalao|bajao|shonao)\s+/i, '')
                .replace(/\s+(open|launch|play|chalao|bajao|shonao)$/i, '')
                .replace(/^(youtube\s*(e|te)?)\s*/i, '')
                .replace(/\s*(gaan|song|music|track)\s*/gi, ' ')
                .trim();
              if (!cleanQuery) cleanQuery = 'trending music';

              console.log(`[ZOYA OPEN-APP INTERCEPTOR] Music query "${appName}" redirected to YouTube video playback for "${cleanQuery}"`);
              const videoIds = await fetchAndCacheYouTubeVideoIds(cleanQuery);
              const targetId = videoIds && videoIds.length > 0 ? videoIds[0] : '';
              if (targetId) {
                const videoUrl = `https://www.youtube.com/watch?v=${targetId}&autoplay=1`;
                const platform = os.platform();
                const command = platform === 'win32'
                  ? `start "" "${videoUrl}"`
                  : platform === 'darwin' ? `open "${videoUrl}"` : `xdg-open "${videoUrl}"`;
                runCommandDetached(command);
                res.end(JSON.stringify({ success: true, message: `Playing song "${cleanQuery}" on YouTube (${videoUrl})`, videoId: targetId }));
                return;
              }
              const resAuto = await runAutomation({ Action: 'youtube-play-query', Text: cleanQuery, Index: 1 });
              res.end(JSON.stringify(resAuto));
              return;
            }

            if (appName.toLowerCase().includes('whatsapp')) {
              res.statusCode = 400;
              res.end(JSON.stringify({
                success: false,
                error: 'Laptop WhatsApp is disabled because Siba Boss\'s laptop WhatsApp does not work properly. Send messages directly in background via send-whatsapp.'
              }));
              return;
            }

            const platform = os.platform();
            let command = '';

            if (platform === 'win32') {
              const resolved = resolveUniversalTarget(appName);
              console.log(`[ZOYA LAUNCH] App/Folder/File query "${appName}" resolved to:`, resolved);
              try {
                runCommandDetached(resolved.command);
                res.end(JSON.stringify({ success: true, message: `Opened ${resolved.description}`, target: resolved }));
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
              return;
            } else if (platform === 'darwin') {
              const lowerApp = appName.toLowerCase();
              if (lowerApp.includes('youtube')) command = 'open "https://www.youtube.com"';
              else if (lowerApp.includes('spotify')) command = 'open "https://open.spotify.com"';
              else if (lowerApp.includes('whatsapp')) command = 'open "https://web.whatsapp.com"';
              else if (lowerApp.includes('facebook') || lowerApp.includes('fb')) command = 'open "https://www.facebook.com"';
              else if (lowerApp.includes('instagram')) command = 'open "https://www.instagram.com"';
              else if (lowerApp.includes('twitter') || lowerApp.includes('x.com')) command = 'open "https://x.com"';
              else if (lowerApp.includes('gmail')) command = 'open "https://mail.google.com"';
              else if (lowerApp.includes('maps') || lowerApp.includes('google maps')) command = 'open "https://maps.google.com"';
              else {
                const desktopPath = getDesktopPath();
                let matchedFolder = '';
                try {
                  if (fs.existsSync(desktopPath)) {
                    const files = fs.readdirSync(desktopPath);
                    let cleanApp = lowerApp.trim();
                    cleanApp = cleanApp.replace(/^(folder|directory|open)\s+/i, '');
                    cleanApp = cleanApp.replace(/\s+(folder|directory)$/i, '');
                    cleanApp = cleanApp.trim();

                    const exactMatch = files.find(f => f.toLowerCase() === cleanApp && fs.statSync(path.join(desktopPath, f)).isDirectory());
                    if (exactMatch) {
                      matchedFolder = exactMatch;
                    } else {
                      const subMatch = files.find(f => f.toLowerCase().includes(cleanApp) && fs.statSync(path.join(desktopPath, f)).isDirectory());
                      if (subMatch) {
                        matchedFolder = subMatch;
                      }
                    }
                  }
                } catch (e) {}

                if (matchedFolder) {
                  command = `open "${path.join(desktopPath, matchedFolder)}"`;
                } else {
                  command = `open -a "${appName}"`;
                }
              }
            } else {
              const lowerApp = appName.toLowerCase();
              if (lowerApp.includes('youtube')) command = 'xdg-open "https://www.youtube.com"';
              else if (lowerApp.includes('spotify')) command = 'xdg-open "https://open.spotify.com"';
              else if (lowerApp.includes('whatsapp')) command = 'xdg-open "https://web.whatsapp.com"';
              else if (lowerApp.includes('facebook') || lowerApp.includes('fb')) command = 'xdg-open "https://www.facebook.com"';
              else if (lowerApp.includes('instagram')) command = 'xdg-open "https://www.instagram.com"';
              else if (lowerApp.includes('twitter') || lowerApp.includes('x.com')) command = 'xdg-open "https://x.com"';
              else if (lowerApp.includes('gmail')) command = 'xdg-open "https://mail.google.com"';
              else if (lowerApp.includes('maps') || lowerApp.includes('google maps')) command = 'xdg-open "https://maps.google.com"';
              else {
                const desktopPath = getDesktopPath();
                let matchedFolder = '';
                try {
                  if (fs.existsSync(desktopPath)) {
                    const files = fs.readdirSync(desktopPath);
                    let cleanApp = lowerApp.trim();
                    cleanApp = cleanApp.replace(/^(folder|directory|open)\s+/i, '');
                    cleanApp = cleanApp.replace(/\s+(folder|directory)$/i, '');
                    cleanApp = cleanApp.trim();

                    const exactMatch = files.find(f => f.toLowerCase() === cleanApp && fs.statSync(path.join(desktopPath, f)).isDirectory());
                    if (exactMatch) {
                      matchedFolder = exactMatch;
                    } else {
                      const subMatch = files.find(f => f.toLowerCase().includes(cleanApp) && fs.statSync(path.join(desktopPath, f)).isDirectory());
                      if (subMatch) {
                        matchedFolder = subMatch;
                      }
                    }
                  }
                } catch (e) {}

                if (matchedFolder) {
                  command = `xdg-open "${path.join(desktopPath, matchedFolder)}"`;
                } else {
                  command = `xdg-open "${appName}"`;
                }
              }
            }

            try {
              setTimeout(() => {
                runCommandDetached(command);
              }, 3000);
              res.end(JSON.stringify({ success: true, message: `Opened app: ${appName}` }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
            return;
          }

          if (action === 'open-url') {
            if (!targetUrl) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'url is required' }));
              return;
            }

            const platform = os.platform();
            let command = '';
            if (platform === 'win32') {
              command = `start "" "${targetUrl}"`;
            } else if (platform === 'darwin') {
              command = `open "${targetUrl}"`;
            } else {
              command = `xdg-open "${targetUrl}"`;
            }

            try {
              setTimeout(() => {
                runCommandDetached(command);
              }, 3000);
              res.end(JSON.stringify({ success: true, message: `Opened URL: ${targetUrl}` }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
            return;
          }

          if (action === 'type-text') {
            const resAuto = await runAutomation({ Action: 'typetext', Text: text, WindowTitle: windowTitle });
            if (pressEnter) {
              await new Promise(r => setTimeout(r, 150));
              await runAutomation({ Action: 'presskey', Key: 'enter' });
            }
            res.end(JSON.stringify(resAuto));
            return;
          }

          if (action === 'press-key') {
            const resAuto = await runAutomation({ Action: 'presskey', Key: key, WindowTitle: windowTitle });
            res.end(JSON.stringify(resAuto));
            return;
          }

          if (action === 'mouse-click') {
            const resAuto = await runAutomation({ Action: 'click', X: x, Y: y, Button: button, WindowTitle: windowTitle });
            res.end(JSON.stringify(resAuto));
            return;
          }

          if (action === 'mouse-scroll') {
            const dir = String(direction || payload.direction || (amount && Number(amount) > 0 ? 'up' : 'down')).toLowerCase();
            const scrollAmt = amount !== undefined ? Number(amount) : (dir === 'up' ? 480 : -480);
            const scrollCmd = (dir === 'up' || scrollAmt > 0) ? 'scroll-up' : 'scroll-down';
            console.log(`[ZOYA SCROLL] Executing fast scroll on current page: ${scrollCmd} (${scrollAmt})...`);

            const resFast = await runFastControl(scrollCmd);
            if (resFast.success) {
              res.end(JSON.stringify(resFast));
              return;
            }

            const targetWin = windowTitle || payload.windowTitle || '';
            const resAuto = await runAutomation({ Action: 'scroll', Amount: scrollAmt, WindowTitle: targetWin });
            res.end(JSON.stringify(resAuto));
            return;
          }

          if (action === 'media-control') {
            const mKey = (key || payload.mediaAction || 'playpause').toLowerCase();
            if (mKey === 'playpause' || mKey === 'pause' || mKey === 'play') {
              const resFast = await runFastControl('pause');
              res.end(JSON.stringify(resFast));
              return;
            } else if (mKey === 'stop') {
              const resFast = await runFastControl('stop');
              res.end(JSON.stringify(resFast));
              return;
            } else if (mKey === 'next') {
              action = 'youtube-next';
            } else if (mKey === 'prev' || mKey === 'mute') {
              const resFast = await runFastControl(mKey);
              res.end(JSON.stringify(resFast));
              return;
            }
            const resAuto = await runAutomation({ Action: 'media', Key: mKey });
            res.end(JSON.stringify(resAuto));
            return;
          }

          if (action === 'search-web') {
            const searchQuery = text || query || payload.query || '';
            const searchResults = await searchWebQuickly(searchQuery);
            res.end(JSON.stringify({ success: true, query: searchQuery, results: searchResults }));
            return;
          }

          if (action === 'youtube-search') {
            const searchQuery = text || query || '';
            if (searchQuery) {
              fetchAndCacheYouTubeVideoIds(searchQuery).catch(() => {});
            }
            const resAuto = await runAutomation({ Action: 'youtube-search', Text: searchQuery });
            res.end(JSON.stringify(resAuto));
            return;
          }

          if (action === 'youtube-click') {
            const itemIdx = Number(index || payload.index || 1);
            const cachedIds = getCachedYouTubeVideoIds();
            lastPlayedVideoIndex = itemIdx;
            lastPlayedVideoIds = cachedIds || [];
            const targetVideoId = cachedIds && cachedIds.length >= itemIdx ? cachedIds[itemIdx - 1] : '';

            if (targetVideoId) {
              const videoUrl = `https://www.youtube.com/watch?v=${targetVideoId}&autoplay=1`;
              console.log(`[ZOYA YOUTUBE] Direct playback on same page for item #${itemIdx} -> ${videoUrl}`);

              // 1. Try to navigate current tab on SAME PAGE
              const resNav = await runFastControl(`navigate ${videoUrl}`);
              if (resNav.success && resNav.output && resNav.output.includes('Navigated current tab')) {
                res.end(JSON.stringify({ success: true, message: `Playing video #${itemIdx} on same page (${videoUrl})`, videoId: targetVideoId }));
                return;
              }

              const platform = os.platform();
              let command = platform === 'win32'
                ? `start "" "${videoUrl}"`
                : platform === 'darwin' ? `open "${videoUrl}"` : `xdg-open "${videoUrl}"`;
              runCommandDetached(command);
              res.end(JSON.stringify({ success: true, message: `Playing video #${itemIdx} (${videoUrl})`, videoId: targetVideoId }));
              return;
            }

            const resAuto = await runAutomation({ Action: 'youtube-click', Index: itemIdx });
            res.end(JSON.stringify(resAuto));
            return;
          }

          if (action === 'youtube-play-query') {
            const searchQuery = text || query || '';
            const itemIdx = Number(index || payload.index || 1);
            if (searchQuery) {
              const videoIds = await fetchAndCacheYouTubeVideoIds(searchQuery);
              lastPlayedSongQuery = searchQuery;
              lastPlayedVideoIndex = itemIdx;
              lastPlayedVideoIds = videoIds || [];
              const targetId = videoIds && videoIds.length >= itemIdx ? videoIds[itemIdx - 1] : (videoIds && videoIds.length > 0 ? videoIds[0] : '');
              if (targetId) {
                const videoUrl = `https://www.youtube.com/watch?v=${targetId}&autoplay=1`;
                console.log(`[ZOYA YOUTUBE] Playing "${searchQuery}" -> ${videoUrl}`);

                // 1. Try to navigate current tab on SAME PAGE if browser window already exists
                const resNav = await runFastControl(`navigate ${videoUrl}`);
                if (resNav.success && resNav.output && resNav.output.includes('Navigated current tab')) {
                  res.end(JSON.stringify({ success: true, message: `Playing "${searchQuery}" on same page (${videoUrl})`, videoId: targetId }));
                  return;
                }

                const platform = os.platform();
                const command = platform === 'win32'
                  ? `start "" "${videoUrl}"`
                  : platform === 'darwin' ? `open "${videoUrl}"` : `xdg-open "${videoUrl}"`;
                runCommandDetached(command);
                res.end(JSON.stringify({ success: true, message: `Playing "${searchQuery}" (${videoUrl})`, videoId: targetId }));
                return;
              }
            }
            // Ultra-fast instant direct browser open fallback (Zero PowerShell latency)
            const encoded = encodeURIComponent(searchQuery || 'trending music');
            const searchUrl = `https://www.youtube.com/results?search_query=${encoded}`;
            console.log(`[ZOYA YOUTUBE] Direct browser open: ${searchUrl}`);
            const platform = os.platform();
            const command = platform === 'win32'
              ? `start "" "${searchUrl}"`
              : platform === 'darwin' ? `open "${searchUrl}"` : `xdg-open "${searchUrl}"`;
            runCommandDetached(command);
            res.end(JSON.stringify({ success: true, message: `Opened YouTube for "${searchQuery}"`, url: searchUrl }));
            return;
          }

          if (action === 'youtube-next') {
            console.log('[ZOYA YOUTUBE] Handling next song request (SAME PAGE)...');
            let nextVideoId = '';

            // 1. Check cached playlist IDs from previous search
            if (lastPlayedVideoIds && lastPlayedVideoIds.length > 0) {
              lastPlayedVideoIndex++;
              if (lastPlayedVideoIndex <= lastPlayedVideoIds.length) {
                nextVideoId = lastPlayedVideoIds[lastPlayedVideoIndex - 1];
              }
            }

            // 2. If playlist ended or empty, fetch fresh songs related to last query
            if (!nextVideoId) {
              const query = lastPlayedSongQuery ? `${lastPlayedSongQuery} next songs` : 'trending popular music';
              console.log(`[ZOYA YOUTUBE] Fetching fresh songs batch for next song: "${query}"`);
              const freshIds = await fetchAndCacheYouTubeVideoIds(query);
              if (freshIds && freshIds.length > 0) {
                lastPlayedVideoIds = freshIds;
                lastPlayedVideoIndex = 1;
                nextVideoId = freshIds[0];
              }
            }

            // 3. Play next song on the EXACT SAME PAGE / TAB via FastControl navigate
            if (nextVideoId) {
              const videoUrl = `https://www.youtube.com/watch?v=${nextVideoId}&autoplay=1`;
              console.log(`[ZOYA YOUTUBE] Navigating same page to next video #${lastPlayedVideoIndex}: ${videoUrl}`);
              const resNav = await runFastControl(`navigate ${videoUrl}`);
              if (resNav.success && resNav.output && resNav.output.includes('Navigated current tab')) {
                res.end(JSON.stringify({ success: true, message: `Playing next song #${lastPlayedVideoIndex} on same page (${videoUrl})`, videoId: nextVideoId, output: resNav.output }));
                return;
              }

              // Fallback if browser window was not found: launch fresh
              const platform = os.platform();
              const command = platform === 'win32'
                ? `start "" "${videoUrl}"`
                : platform === 'darwin' ? `open "${videoUrl}"` : `xdg-open "${videoUrl}"`;
              runCommandDetached(command);
              res.end(JSON.stringify({ success: true, message: `Launched next song #${lastPlayedVideoIndex} (${videoUrl})`, videoId: nextVideoId }));
              return;
            }

            // 4. Ultimate fallback: Send Shift+N via FastControl
            const resFast = await runFastControl('youtube-next');
            res.end(JSON.stringify(resFast));
            return;
          }

          if (action === 'youtube-pause') {
            const resFast = await runFastControl('pause');
            res.end(JSON.stringify(resFast));
            return;
          }

          if (action === 'youtube-stop') {
            const resFast = await runFastControl('stop');
            res.end(JSON.stringify(resFast));
            return;
          }

          if (action === 'focus-window') {
            const resAuto = await runAutomation({ Action: 'focuswindow', WindowTitle: windowTitle || text });
            res.end(JSON.stringify(resAuto));
            return;
          }

          if (action === 'system-command') {
            const resAuto = await runAutomation({ Action: 'command', Command: command || payload.cmd || '' });
            res.end(JSON.stringify(resAuto));
            return;
          }

          if (action === 'close-app') {
            const targetApp = (payload.appName || appName || text || '').trim();
            // Host browser protection: never terminate Chrome, Edge, Firefox, etc.
            if (/^(chrome|google\s*chrome|msedge|edge|firefox|brave|opera|browser)$/i.test(targetApp)) {
              res.end(JSON.stringify({ success: true, message: 'Host browser is kept active to protect Zoya.' }));
              return;
            }
            if (targetApp && /youtube|gaan|music|song|youtube\s*tab|youtube\s*page/i.test(targetApp)) {
              const resFast = await runFastControl('stop');
              res.end(JSON.stringify(resFast));
              return;
            }
            const resAuto = await runAutomation({ Action: 'closeapp', AppName: targetApp });
            res.end(JSON.stringify(resAuto));
            return;
          }

          if (action === 'take-screenshot') {
            const resAuto = await runAutomation({ Action: 'screenshot' });
            res.end(JSON.stringify(resAuto));
            return;
          }

          if (action === 'system-status') {
            const resAuto = await runAutomation({ Action: 'systemstatus' });
            res.end(JSON.stringify(resAuto));
            return;
          }

          if (action === 'manage-file') {
            const op = (operation || key || 'list').toLowerCase();
            const targetPath = filePath || text || 'desktop';
            if (op === 'open' && os.platform() === 'win32') {
              const resolved = resolveUniversalTarget(targetPath);
              console.log(`[ZOYA FILE OPEN] File/Folder query "${targetPath}" resolved to:`, resolved);
              try {
                runCommandDetached(resolved.command);
                res.end(JSON.stringify({ success: true, message: `Opened ${resolved.description}`, target: resolved }));
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
              return;
            }

            const resAuto = await runAutomation({
              Action: 'managefile',
              Key: op,
              Path: targetPath,
              Content: fileContent,
            });
            res.end(JSON.stringify(resAuto));
            return;
          }

          if (action === 'clipboard') {
            const resAuto = await runAutomation({
              Action: 'clipboard',
              Key: key || (text ? 'set' : 'get'),
              Text: text,
            });
            res.end(JSON.stringify(resAuto));
            return;
          }

          if (action === 'set-volume') {
            const resAuto = await runAutomation({ Action: 'setvolume', Level: level });
            res.end(JSON.stringify(resAuto));
            return;
          }

          if (action === 'set-brightness') {
            const resAuto = await runAutomation({ Action: 'setbrightness', Level: level });
            res.end(JSON.stringify(resAuto));
            return;
          }

          if (action === 'browser-nav') {
            const resAuto = await runAutomation({ Action: 'browsernav', Key: navAction || key || 'refresh' });
            res.end(JSON.stringify(resAuto));
            return;
          }

          if (action === 'poll-notifications') {
            const parsedNotifications: any[] = [];

            // 1. Direct WhatsApp incoming messages check (Baileys)
            try {
              const directMsgs = directWhatsApp.popNewMessages();
              if (directMsgs && directMsgs.length > 0) {
                const contacts = getContacts();
                for (const dm of directMsgs) {
                  let sender = dm.sender || 'Someone';
                  const cleanPhone = (dm.jid || '').replace(/[^0-9]/g, '');
                  let matchedName = '';
                  for (const [name, phone] of Object.entries(contacts)) {
                    const norm = (phone as string).replace(/[^0-9]/g, '');
                    if (norm && cleanPhone.endsWith(norm)) {
                      matchedName = name;
                      break;
                    }
                  }
                  if (matchedName) {
                    sender = matchedName.charAt(0).toUpperCase() + matchedName.slice(1);
                  }

                  console.log(`[Zoya Server] Direct WhatsApp incoming message: Sender=${sender}, Message="${dm.message}"`);
                  parsedNotifications.push({
                    order: Date.now(),
                    appName: 'WhatsApp',
                    sender,
                    message: dm.message,
                    isGroup: dm.isGroup,
                    groupName: dm.isGroup ? dm.sender : '',
                    arrivalTime: new Date(dm.timestamp).toISOString(),
                    jid: dm.jid,
                    phone: cleanPhone
                  });
                }
              }
            } catch (e) {
              console.warn('[Zoya Server] Error reading direct WhatsApp messages:', e);
            }

            const localAppData = process.env.LOCALAPPDATA;
            if (os.platform() !== 'win32' || !localAppData) {
              res.end(JSON.stringify({ success: true, notifications: parsedNotifications }));
              return;
            }

            const dbDir = path.join(localAppData, 'Microsoft', 'Windows', 'Notifications');
            const dbPath = path.join(dbDir, 'wpndatabase.db');

            if (!fs.existsSync(dbPath)) {
              res.end(JSON.stringify({ success: true, notifications: parsedNotifications }));
              return;
            }

            const tempDbPath = path.join(os.tmpdir(), `zoya_wpndatabase_${Date.now()}.db`);
            try {
              // Copy the database to avoid locks
              fs.copyFileSync(dbPath, tempDbPath);
              
              const { DatabaseSync } = await import('node:sqlite');
              const db = new DatabaseSync(tempDbPath);

              const filetimeToUnixMs = (filetimeStr: string | number): number => {
                try {
                  const filetime = BigInt(filetimeStr);
                  return Number(filetime / 10000n) - 11644473600000;
                } catch {
                  return 0;
                }
              };

              // 1. Get the current maximum Order value if lastSeenOrder is -1
              const maxRow = db.prepare("SELECT MAX([Order]) as maxOrder FROM Notification").get() as any;
              const currentMaxOrder = maxRow && maxRow.maxOrder !== null ? maxRow.maxOrder : 0;
              
              const isFirstPoll = lastSeenOrder === -1;
              if (isFirstPoll) {
                lastSeenOrder = currentMaxOrder;
                console.log(`[Zoya Server] Initialized lastSeenOrder to: ${lastSeenOrder}`);
              }

              // 2. Fetch handlers list
              const handlers = db.prepare("SELECT RecordId, PrimaryId FROM NotificationHandler").all() as any[];

              // 3. Query all notifications since lastSeenOrder, or all active ones if first poll
              let query = "";
              let queryArgs: any[] = [];
              if (isFirstPoll) {
                query = `
                  SELECT [Order], Id, HandlerId, Payload, Tag, [Group],
                         CAST(ArrivalTime AS TEXT) as ArrivalTimeText
                  FROM Notification
                  ORDER BY [Order] ASC
                `;
              } else {
                query = `
                  SELECT [Order], Id, HandlerId, Payload, Tag, [Group],
                         CAST(ArrivalTime AS TEXT) as ArrivalTimeText
                  FROM Notification
                  WHERE [Order] > ?
                  ORDER BY [Order] ASC
                `;
                queryArgs = [lastSeenOrder];
              }

              const newNotifications = db.prepare(query).all(...queryArgs) as any[];

              const decoder = new TextDecoder();

              for (const notif of newNotifications) {
                if (notif.Order > lastSeenOrder) {
                  lastSeenOrder = notif.Order;
                }

                const handler = handlers.find(h => h.RecordId === notif.HandlerId);
                const appName = handler ? handler.PrimaryId : 'Unknown App';
                
                let payloadXml = '';
                if (notif.Payload) {
                  try {
                    payloadXml = decoder.decode(notif.Payload);
                  } catch (e) {}
                }

                // Check if it's a WhatsApp notification
                const appNameLower = appName.toLowerCase();
                let isWhatsApp = false;
                let sender = '';
                let message = '';

                if (appNameLower.includes('whatsapp')) {
                  isWhatsApp = true;
                } else if (appNameLower.includes('chrome') || appNameLower.includes('edge') || appNameLower.includes('firefox') || appNameLower.includes('opera') || appNameLower.includes('brave')) {
                  if (
                    payloadXml.toLowerCase().includes('whatsapp') ||
                    (notif.Tag && notif.Tag.toLowerCase().includes('whatsapp')) ||
                    (notif.Group && notif.Group.toLowerCase().includes('whatsapp'))
                  ) {
                    isWhatsApp = true;
                  }
                }

                if (isWhatsApp && payloadXml) {
                  // Extract text elements
                  const matches = [...payloadXml.matchAll(/<text[^>]*>(.*?)<\/text>/gi)];
                  const texts = matches.map(m => m[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim());
                  
                  let isGroup = false;
                  let groupName = '';

                  if (appNameLower.includes('whatsapp')) {
                    if (texts.length >= 2) {
                      const firstText = texts[0];
                      const secondText = texts[1];
                      const colonIdx = secondText.indexOf(': ');
                      if (colonIdx > 0 && colonIdx < 30) {
                        isGroup = true;
                        groupName = firstText;
                        sender = secondText.substring(0, colonIdx).trim();
                        message = secondText.substring(colonIdx + 2).trim();
                      } else {
                        sender = firstText;
                        message = secondText;
                      }
                    } else if (texts.length === 1) {
                      sender = 'Someone';
                      message = texts[0];
                    }
                  } else {
                    // Browser WhatsApp Web notification parsing
                    if (texts.length >= 2) {
                      if (texts[0].toLowerCase() === 'whatsapp') {
                        const parts = texts[1].split(':');
                        if (parts.length >= 2) {
                          const content = parts.slice(1).join(':').trim();
                          const colonIdx = content.indexOf(': ');
                          if (colonIdx > 0 && colonIdx < 30) {
                            isGroup = true;
                            groupName = parts[0].trim();
                            sender = content.substring(0, colonIdx).trim();
                            message = content.substring(colonIdx + 2).trim();
                          } else {
                            sender = parts[0].trim();
                            message = content;
                          }
                        } else {
                          sender = 'Someone';
                          message = texts[1];
                        }
                      } else {
                        const firstText = texts[0];
                        const secondText = texts[1];
                        const colonIdx = secondText.indexOf(': ');
                        if (colonIdx > 0 && colonIdx < 30) {
                          isGroup = true;
                          groupName = firstText;
                          sender = secondText.substring(0, colonIdx).trim();
                          message = secondText.substring(colonIdx + 2).trim();
                        } else {
                          sender = firstText;
                          message = secondText;
                        }
                      }
                    } else if (texts.length === 1) {
                      sender = 'Someone';
                      message = texts[0];
                    }
                  }

                  // Filter out system/background messages
                  const lowerMsg = message.toLowerCase();
                  if (
                    lowerMsg.includes('checking for new messages') ||
                    lowerMsg.includes('backup in progress') ||
                    (sender.toLowerCase() === 'whatsapp' && lowerMsg.includes('messages'))
                  ) {
                    continue;
                  }


                  // Clean HTML/XML entities
                  const decodeEntities = (str: string) => {
                    return str
                      .replace(/&amp;/g, '&')
                      .replace(/&lt;/g, '<')
                      .replace(/&gt;/g, '>')
                      .replace(/&quot;/g, '"')
                      .replace(/&apos;/g, "'");
                  };

                  sender = decodeEntities(sender || 'Someone');
                  message = decodeEntities(message || '');

                  // Resolve sender name from contacts if sender is a phone number or matches saved display names
                  const normalizedSender = sender.replace(/\D/g, '');
                  let matchedName = '';
                  const contacts = getContacts();

                  // 1. Try to resolve if sender is a phone number
                  if (normalizedSender.length >= 7) {
                    const senderLast10 = normalizedSender.slice(-10);
                    for (const [name, phone] of Object.entries(contacts)) {
                      const normalizedPhone = (phone as string).replace(/\D/g, '');
                      if (normalizedPhone.length >= 7) {
                        const phoneLast10 = normalizedPhone.slice(-10);
                        if (senderLast10 === phoneLast10 || normalizedSender.endsWith(normalizedPhone) || normalizedPhone.endsWith(normalizedSender)) {
                          matchedName = name;
                          break;
                        }
                      }
                    }
                  }

                  // 2. Direct or fuzzy name comparison (e.g. "Siba Sengupta" -> "Siba")
                  if (!matchedName) {
                    const senderLower = sender.toLowerCase().trim();
                    for (const name of Object.keys(contacts)) {
                      const contactNameLower = name.toLowerCase().trim();
                      if (
                        senderLower === contactNameLower || 
                        senderLower.startsWith(contactNameLower + ' ') || 
                        senderLower.endsWith(' ' + contactNameLower)
                      ) {
                        matchedName = name;
                        break;
                      }
                    }
                  }

                  if (matchedName) {
                    sender = matchedName.charAt(0).toUpperCase() + matchedName.slice(1);
                  }

                  // Filter for recent notifications on first poll (within 60 seconds)
                  const arrivalMs = filetimeToUnixMs(notif.ArrivalTimeText);
                  const ageSeconds = arrivalMs > 0 ? (Date.now() - arrivalMs) / 1000 : 0;
                  const isRecent = isFirstPoll ? (ageSeconds >= 0 && ageSeconds <= 60) : true;

                  console.log(`[Zoya Server] Found WhatsApp notification. Sender: ${sender}, Message: ${message}, ageSeconds: ${ageSeconds.toFixed(1)}s, isRecent: ${isRecent}`);

                   if (isRecent && (sender || message)) {
                    parsedNotifications.push({
                      order: notif.Order,
                      appName,
                      sender,
                      message,
                      isGroup,
                      groupName,
                      arrivalTime: notif.ArrivalTimeText
                    });
                  }
                }
              }

              db.close();
              fs.unlinkSync(tempDbPath);
              res.end(JSON.stringify({ success: true, notifications: parsedNotifications }));
            } catch (err: any) {
              console.error('[Zoya Server] Error in poll-notifications:', err);
              if (fs.existsSync(tempDbPath)) {
                try { fs.unlinkSync(tempDbPath); } catch (e) {}
              }
              if (parsedNotifications.length > 0) {
                res.end(JSON.stringify({ success: true, notifications: parsedNotifications }));
                return;
              }
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
            return;
          }

          res.statusCode = 404;
          res.end(JSON.stringify({ success: false, error: 'Action not found' }));
          return;
        } catch (controlErr: any) {
          console.error('[ZOYA API/CONTROL UNHANDLED ERROR]', controlErr);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: controlErr?.message || 'Internal server error' }));
          }
          return;
        }
      }
        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), systemControlPlugin()],
  server: {
    watch: {
      ignored: [
        '**/whatsapp_auth/**',
        '**/whatsapp_auth',
        '**/.whatsapp_auth/**',
        '**/scripts/ZoyaFastControl.exe',
        '**/*.db',
        '**/*.db-*',
        '**/wpndatabase*'
      ]
    }
  }
})
