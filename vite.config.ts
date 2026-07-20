import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Custom Vite plugin for system commands execution
function systemControlPlugin() {
  return {
    name: 'zoya-system-control',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url && req.url.startsWith('/api/control')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.end();
            return;
          }

          // Parse query parameter or body
          const urlObj = new URL(req.url, 'http://localhost');
          const action = urlObj.searchParams.get('action');

          let body: any = {};
          if (req.method === 'POST') {
            try {
              const buffers: Buffer[] = [];
              for await (const chunk of req) {
                buffers.push(chunk);
              }
              const bodyStr = Buffer.concat(buffers).toString();
              body = JSON.parse(bodyStr);
            } catch (e) {
              console.error('Error parsing JSON body:', e);
            }
          }

          const finalAction = action || body.action;

          if (finalAction === 'shutdown') {
            const platform = os.platform();
            let command = '';
            if (platform === 'win32') {
              // 15 seconds shutdown delay with warning message
              command = 'shutdown /s /t 15 /c "Zoya AI is shutting down your PC in 15 seconds. Run shutdown /a to cancel."';
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
              res.end(JSON.stringify({ success: true, message: 'PC Shutdown sequence initiated (15s).' }));
            });
            return;
          }

          if (finalAction === 'create-site') {
            const folderName = body.folderName || urlObj.searchParams.get('folderName');
            const siteTitle = body.siteTitle || urlObj.searchParams.get('siteTitle') || 'Zoya Generated Site';

            if (!folderName) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'folderName is required' }));
              return;
            }

            const cleanFolderName = folderName.replace(/[^a-zA-Z0-9-_ ]/g, '_');
            const desktopPath = path.join(os.homedir(), 'Desktop');
            const projectPath = path.join(desktopPath, cleanFolderName);

            try {
              if (!fs.existsSync(projectPath)) {
                fs.mkdirSync(projectPath, { recursive: true });
              }

              const htmlContent = `<!DOCTYPE html>
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

              fs.writeFileSync(path.join(projectPath, 'index.html'), htmlContent);

              // Open folder
              let openCmd = '';
              if (os.platform() === 'win32') {
                openCmd = `explorer "${projectPath}"`;
              } else if (os.platform() === 'darwin') {
                openCmd = `open "${projectPath}"`;
              } else {
                openCmd = `xdg-open "${projectPath}"`;
              }
              exec(openCmd);

              res.end(JSON.stringify({ success: true, message: `Folder and website created at: ${projectPath}`, path: projectPath }));
            } catch (err: any) {
              console.error(err);
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
            return;
          }

          if (finalAction === 'open-app') {
            const appName = (body.appName || urlObj.searchParams.get('appName') || '').trim();
            if (!appName) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'appName is required' }));
              return;
            }

            const platform = os.platform();
            let command = '';

            if (platform === 'win32') {
              const lowerApp = appName.toLowerCase();
              if (lowerApp.includes('calc')) command = 'start calc';
              else if (lowerApp.includes('notepad')) command = 'start notepad';
              else if (lowerApp.includes('paint') || lowerApp.includes('mspaint')) command = 'start mspaint';
              else if (lowerApp.includes('chrome') || lowerApp.includes('google chrome')) command = 'start chrome';
              else if (lowerApp.includes('explorer') || lowerApp.includes('my pc') || lowerApp.includes('this pc')) command = 'explorer';
              else if (lowerApp.includes('cmd') || lowerApp.includes('command prompt')) command = 'start cmd';
              else if (lowerApp.includes('code') || lowerApp.includes('vscode') || lowerApp.includes('vs code')) command = 'code .';
              else {
                command = `start "" "${appName}"`;
              }
            } else if (platform === 'darwin') {
              command = `open -a "${appName}"`;
            } else {
              command = `xdg-open "${appName}"`;
            }

            exec(command, (err) => {
              if (err) {
                // If direct start fails on Windows, try running it directly
                if (platform === 'win32') {
                  exec(`start ${appName}`, (err2) => {
                    if (err2) {
                      res.statusCode = 500;
                      res.end(JSON.stringify({ success: false, error: err2.message }));
                      return;
                    }
                    res.end(JSON.stringify({ success: true, message: `Opened app: ${appName}` }));
                  });
                  return;
                }
                res.statusCode = 500;
                res.end(JSON.stringify({ success: false, error: err.message }));
                return;
              }
              res.end(JSON.stringify({ success: true, message: `Opened app: ${appName}` }));
            });
            return;
          }

          res.statusCode = 404;
          res.end(JSON.stringify({ success: false, error: 'Action not found' }));
          return;
        }
        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), systemControlPlugin()],
})
