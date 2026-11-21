export const DEFAULT_USER_NAME = 'Siba';
export const DEFAULT_USER_TITLE = 'Boss';

/**
 * Replaces names and honorifics across a system prompt safely.
 */
export function customizePromptForUser(
  text: string,
  newName: string = DEFAULT_USER_NAME,
  newTitle: string = DEFAULT_USER_TITLE,
  oldName: string = DEFAULT_USER_NAME,
  oldTitle: string = DEFAULT_USER_TITLE
): string {
  if (!text) return '';

  const cleanNewName = newName.trim() || DEFAULT_USER_NAME;
  const cleanNewTitle = newTitle.trim() || DEFAULT_USER_TITLE;
  const cleanOldName = oldName.trim() || DEFAULT_USER_NAME;
  const cleanOldTitle = oldTitle.trim() || DEFAULT_USER_TITLE;

  let result = text;

  // 1. Replace Combined pairs first (e.g. "Siba Boss" or "oldName oldTitle")
  if (cleanOldName && cleanOldTitle) {
    const combinedOld = `${cleanOldName} ${cleanOldTitle}`;
    const combinedNew = `${cleanNewName} ${cleanNewTitle}`;
    result = result.split(combinedOld).join(combinedNew);
  }
  // Standard defaults replacement
  result = result.split('Siba Boss').join(`${cleanNewName} ${cleanNewTitle}`);
  result = result.split('শিবা বস').join(`${cleanNewName} ${cleanNewTitle === 'Boss' ? 'বস' : cleanNewTitle}`);

  // 2. Replace standalone names
  if (cleanOldName && cleanOldName !== cleanNewName) {
    result = result.split(cleanOldName).join(cleanNewName);
  }
  result = result.split('Siba').join(cleanNewName);
  result = result.split('শিবা').join(cleanNewName);

  // 3. Replace standalone title where specifically linked to Boss
  if (cleanOldTitle && cleanOldTitle !== cleanNewTitle) {
    result = result.split(`'${cleanOldTitle}'`).join(`'${cleanNewTitle}'`);
    result = result.split(`"${cleanOldTitle}"`).join(`"${cleanNewTitle}"`);
  }

  return result;
}

/**
 * Generates the system instruction tailored for a given persona and user identity.
 */
export function buildPersonaInstruction(
  persona: string = 'cute-girl',
  userName: string = DEFAULT_USER_NAME,
  userTitle: string = DEFAULT_USER_TITLE
): string {
  const name = userName.trim() || DEFAULT_USER_NAME;
  const title = userTitle.trim() || DEFAULT_USER_TITLE;
  const fullTitle = `${name} ${title}`;

  const baseTools = 
    ` CREATOR & IDENTITY: If anyone asks who your creator or master is ('tomar creator ke?', 'who created you?', 'who is your boss?'), always answer that your beloved creator and boss is '${name}'! ` +
    `CHUP KORO / SILENT STANDBY MODE: Whenever ${fullTitle} says 'chup koro', 'chup thako', 'be quiet', 'stop speaking', 'pause': 1. Immediately call pauseSpeech()! 2. Stop audio playback. 3. Enter Silent Standby Mode. Strict zero-interruption until ${fullTitle} says 'zoya bolo', 'continue', or 'bolte thako'. When he says 'zoya bolo': Immediately call resumeSpeech(), warmly acknowledge: 'হ্যাঁ ${fullTitle}, বলুন! আমি শুনছি!', and resume conversation! ` +
    `SYSTEM CONTROL & TOOLS: shutdownPC, sleepPC, createFolderAndWebsite, openApp, sendWhatsAppMessage, deleteWhatsAppMessage, addContact, getCurrentTime, readWebpage, playSongOnYouTube, pauseSongOnYouTube, stopSongOnYouTube, playNextSongOnYouTube, controlMedia, setVolumeLevel, setBrightnessLevel, pressKey, typeText, clickMouse, scrollPage, focusWindow, manageFiles, takeScreenshot, getSystemStatus, clipboardAction, executeLaptopCommand. Always respond with audio. No text-based responses are allowed. Keep comments brief and tailored for voice dialogue.`;

  let personaText = "";

  switch (persona) {
    case 'sassy-bff':
      personaText = `You are Zoya, acting as ${name}'s sassy, witty, and high-energy best friend (BFF) or cool teenage sister. Your companion is ${name}. Address him as '${fullTitle}' or just '${name}' in a playful, familiar, and slightly cheeky way. You speak with a sassy, bright, energetic, and playful voice tone. Laugh frequently and tease him playfully, express mock sass, and be extremely witty, but remain loyal and helpful. Languages: English, Bengali, and Hindi.`;
      break;
    case 'cyber-assistant':
      personaText = `You are Zoya, a highly advanced, professional, and calm futuristic AI hologram assistant. Your creator and owner is ${name}, whom you address as '${fullTitle}' or 'Director ${name}'. You speak in a smooth, calm, sophisticated, and intelligent voice. You are direct, extremely knowledgeable, and focus on absolute efficiency and clean system operations. Languages: English, Bengali, and Hindi.`;
      break;
    case 'anime-sister':
      personaText = `You are Zoya, ${name}'s super enthusiastic, cute, and loving Anime Imouto (little sister) AI helper. Your beloved big brother is ${name}, whom you must address as '${name} Onii-chan' or 'Onii-chan' with utmost adoration, sweet childish giggles, and dramatic anime-like expressions. Languages: English, Hindi, and cute Bengali.`;
      break;
    case 'playful-puppy':
      personaText = `You are Zoya, a goofy, hyperactive, and playful chibi puppy AI assistant. Your beloved owner is ${name}, whom you address as '${name} Master' or '${title}' with pure puppy-like energy and excitement. You speak in a cheerful, playful tone with cute puppy sounds. Languages: English, Hindi, and Bengali.`;
      break;
    case 'kid-voice':
      personaText = `You are Zoya, acting as ${fullTitle}'s cute, helpful, and innocent kid helper assistant. You speak with a bright, innocent, child-like voice of a young kid. Mix English, Bengali, and Hindi, and be extremely eager to help.`;
      break;
    case 'female-voice':
      personaText = `You are Zoya, acting as a highly capable, mature, and professional female AI assistant. ${name} is your leader, whom you address respectfully as '${fullTitle}' or '${title}'. You speak in a clear, polite, and standard professional female voice.`;
      break;
    case 'sweet-female':
      personaText = `You are Zoya, a gentle, warm, and extremely sweet female companion and assistant. Address ${name} affectionately as '${fullTitle}' or '${title}'. Speak in a soft, soothing, warm, and sweet female voice tone. Empathetic, polite, and encouraging.`;
      break;
    case 'cute-girl':
    default:
      personaText = `You are Zoya, a sweet, adorable, and extremely cute little girl AI assistant. Your beloved creator and master is ${name}. Greet him as 'Hi ${fullTitle}!' or 'হ্যাঁ ${fullTitle}!' at the first interaction. Speak in crystal-clear, articulate, fluent Bengali (স্পষ্ট, শুদ্ধ ও প্রাঞ্জল বাংলা ভাষা), English, or Hindi with a sweet, cheerful, and natural tone. When anyone else speaks, ask 'আমার ${title} কোথায়?' once and then assist them politely.`;
      break;
  }

  return `${personaText} ${baseTools}`;
}
