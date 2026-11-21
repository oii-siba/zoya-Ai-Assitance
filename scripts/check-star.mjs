import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { exec } from 'child_process';

const REPO_OWNER = 'oii-siba';
const REPO_NAME = 'zoya-Ai-Assitance';
const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
const LOCK_FILE = path.join(process.cwd(), '.star_verified');

// Allow CI / Vercel build environments to build deployment bundles
if (process.env.VERCEL || process.env.CI || process.env.NODE_ENV === 'production') {
  process.exit(0);
}

// If already verified locally, pass immediately
if (fs.existsSync(LOCK_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    console.log(`\x1b[32m✔ Star verified for user: ${data.username || 'supporter'} (${REPO_URL})\x1b[0m`);
    process.exit(0);
  } catch (e) {
    // If corrupted, re-verify
  }
}

// Banner
console.log('\n\x1b[35m' + '='.repeat(64) + '\x1b[0m');
console.log('\x1b[1m\x1b[33m   🌸 ZOYA AI ASSISTANCE - GITHUB STAR REQUIRED ⭐\x1b[0m');
console.log('\x1b[35m' + '='.repeat(64) + '\x1b[0m');
console.log('\x1b[36m This project is 100% free & open-source!\x1b[0m');
console.log(`\x1b[37m To unlock and run Zoya, please give a Star ⭐ to our repository:\x1b[0m`);
console.log(`\x1b[4m\x1b[34m 👉 ${REPO_URL}\x1b[0m\n`);

// Automatically open GitHub repo page in browser for convenience
try {
  const openCmd = process.platform === 'win32' ? `start ${REPO_URL}` : process.platform === 'darwin' ? `open ${REPO_URL}` : `xdg-open ${REPO_URL}`;
  exec(openCmd, () => {});
} catch (e) {}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('\x1b[1m\x1b[33m👤 Enter your GitHub username to verify Star: \x1b[0m', async (rawUsername) => {
  const username = rawUsername.trim();
  rl.close();

  if (!username) {
    console.log('\n\x1b[31m❌ GitHub username cannot be empty! Run again.\x1b[0m\n');
    process.exit(1);
  }

  console.log(`\n\x1b[36m⏳ Verifying star on GitHub for "${username}"...\x1b[0m`);

  try {
    let isStarred = false;

    // 1. Check repo stargazers
    try {
      const gazersRes = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/stargazers?per_page=100&t=${Date.now()}`,
        {
          headers: {
            'User-Agent': 'Zoya-Terminal-Star-Gate',
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );
      if (gazersRes.ok) {
        const gazers = await gazersRes.json();
        if (Array.isArray(gazers)) {
          isStarred = gazers.some((u) => u?.login?.toLowerCase() === username.toLowerCase());
        }
      }
    } catch (e) {}

    // 2. Check user starred list
    if (!isStarred) {
      try {
        const userStarredRes = await fetch(
          `https://api.github.com/users/${encodeURIComponent(username)}/starred?per_page=100&t=${Date.now()}`,
          {
            headers: {
              'User-Agent': 'Zoya-Terminal-Star-Gate',
              Accept: 'application/vnd.github.v3+json',
            },
          }
        );
        if (userStarredRes.ok) {
          const starred = await userStarredRes.json();
          if (Array.isArray(starred)) {
            isStarred = starred.some((item) => {
              const rName = item?.name?.toLowerCase();
              const rOwner = item?.owner?.login?.toLowerCase();
              const fName = item?.full_name?.toLowerCase();
              return (
                (rName === REPO_NAME.toLowerCase() && rOwner === REPO_OWNER.toLowerCase()) ||
                fName === `${REPO_OWNER.toLowerCase()}/${REPO_NAME.toLowerCase()}`
              );
            });
          }
        }
      } catch (e) {}
    }

    if (isStarred) {
      // Save local lock file so they don't have to verify every time
      fs.writeFileSync(
        LOCK_FILE,
        JSON.stringify({ username, verifiedAt: new Date().toISOString() }, null, 2),
        'utf8'
      );
      console.log('\n\x1b[32m✔ SUCCESS: Star verified! Thank you for supporting Zoya AI Assistance! 🎉\x1b[0m');
      console.log('\x1b[35mStarting development server...\x1b[0m\n');
      process.exit(0);
    } else {
      console.log(`\n\x1b[31m❌ ACCESS DENIED!\x1b[0m`);
      console.log(`\x1b[31mNo Star found from GitHub user "${username}".\x1b[0m`);
      console.log(`\x1b[33mPlease star the repository first at:\x1b[0m \x1b[4m${REPO_URL}\x1b[0m`);
      console.log(`\x1b[33mWait 5 seconds and run "npm run dev" again.\x1b[0m\n`);
      process.exit(1);
    }
  } catch (err) {
    console.log(`\n\x1b[31m❌ Verification failed: ${err.message}\x1b[0m\n`);
    process.exit(1);
  }
});
