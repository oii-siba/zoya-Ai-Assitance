const fs = require('fs');
const path = require('path');
const os = require('os');

function setup() {
  console.log('Setting up Windows Startup shortcut for Zoya AI...');

  if (os.platform() !== 'win32') {
    console.error('Error: Startup shortcut setup is only supported on Windows OS.');
    process.exit(1);
  }

  const appData = process.env.APPDATA;
  if (!appData) {
    console.error('Error: APPDATA environment variable not found.');
    process.exit(1);
  }

  const startupFolder = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  if (!fs.existsSync(startupFolder)) {
    console.error(`Error: Startup folder does not exist at ${startupFolder}`);
    process.exit(1);
  }

  const vbsPath = path.join(startupFolder, 'ZoyaAI_Startup.vbs');
  const projectDir = path.resolve(__dirname, '..');

  const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
' Run the Vite development server in the background (hidden window)
WshShell.Run "cmd.exe /c cd /d ""${projectDir}"" && npm run dev", 0, false

' Wait 4 seconds for the server to spin up
WScript.Sleep 4000

' Open Zoya in Chrome or the default browser with startup query parameter
WshShell.Run "cmd.exe /c start http://localhost:5173/?startup=true", 0, false
`;

  try {
    fs.writeFileSync(vbsPath, vbsContent, 'utf8');
    console.log(`Success! Startup script successfully written to: ${vbsPath}`);
    console.log('When you restart your computer, Zoya will automatically start.');
  } catch (err) {
    console.error('Failed to write startup script:', err);
    process.exit(1);
  }
}

setup();
