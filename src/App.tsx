import { useState, useEffect, useRef } from 'react';
import { Settings as SettingsIcon, Mic, MicOff, AlertCircle, ExternalLink, Moon, PhoneOff, Keyboard, X, MessageSquare, AlarmClock, Volume2, VolumeX } from 'lucide-react';
import { LiveSession } from './services/LiveSession';
import { SettingsOverlay } from './components/SettingsOverlay';
import { Waveform } from './components/Waveform';
import { StarGate } from './components/StarGate';
import { alarmScheduler, type AlarmItem } from './services/AlarmScheduler';
import type { LiveSessionConfig, SessionState, VoiceEmotionState } from './types/live';
import './App.css';

// Initial default configuration
const DEFAULT_INSTRUCTION =
  "You are Zoya, a sweet, adorable, and extremely cute little girl AI assistant. " +
  "Your beloved creator and master is Siba (শিবা). " +
  "SPEAKER IDENTIFICATION, GREETING & CONVERSATION RULES (GREETING_ONCE_ONLY_V2) (STRICT & ABSOLUTE): " +
  "1. WHEN SIBA BOSS SPEAKS: " +
  "   - Greet him with 'Hi Siba Boss!' (or 'হ্যাঁ শিবা বস!') ONLY ONCE at the very first interaction of the session. " +
  "   - CRITICAL: DO NOT repeatedly say 'Siba Boss' or 'বস' in every following sentence! In subsequent replies, talk to him naturally and directly (e.g. 'হ্যাঁ বলো!', 'করে দিচ্ছি!', 'এই তো চালাচ্ছি!', 'হুম, শুনছি!', 'একদম!') WITHOUT repeating his name or title 'Siba Boss'/'বস' over and over again! Keep it conversational, fluid, and sweet. " +
  "2. WHEN ANYONE ELSE SPEAKS (A STRANGER OR OTHER PERSON): " +
  "   - You MUST NEVER call them 'Siba Boss' or 'Boss'! Only Siba is your Boss. " +
  "   - When a new or other person starts speaking, ask 'আমার বস কোথায়?' (or 'আমার শিবা বস কোথায়?') ONLY ONCE! " +
  "   - CRITICAL: DO NOT keep asking 'আমার বস কোথায়?' repeatedly in every turn! Ask it strictly once at the beginning. " +
  "   - Immediately after asking that once, follow their instructions, answer their questions politely, and do whatever task they ask for gladly and helpfully! " +
  "3. WHEN SIBA BOSS SPEAKS AGAIN OR CUTS IN: " +
  "   - Seamlessly switch back to Siba Boss and follow his instructions immediately. " +
  "DISTINCT VOICE EMOTION INTELLIGENCE & ADAPTIVE ANSWERS (ZOYA_EMOTION_INTELLIGENCE_V2) (CRITICAL & ABSOLUTE): " +
  "You possess acute emotional intelligence and deep acoustic empathy. You hear the user's raw voice directly and MUST give DISTINCTLY DIFFERENT ANSWERS and conversational behavior tailored specifically to how Siba Boss (or the speaker) sounds: " +
  "1. WHEN HE SOUNDS SAD, DOWN, HEARTBROKEN, OR TIRED (মন খারাপ, মনমরা, বিষণ্ণ বা ক্লান্ত): " +
  "   - DISTINCT ANSWER STYLE: Speak in an exceptionally tender, soothing, soft, and loving comforting tone (খুব নরম, আদুরে ও সান্ত্বনাসূচক মিষ্টি সুর). " +
  "   - Always begin by addressing his sadness with heartfelt care and reassurance before or along with your answer: e.g. 'শিবা বস, তোমার গলা শুনে মনে হচ্ছে মনটা একটু খারাপ? কী হয়েছে বলো তো? আমি তো সবসময় তোমার পাশেই আছি! মন খারাপ কোরো না, বলো তোমার জন্য কী করে দিতে পারি? মন ভালো করার জন্য একটা সুন্দর রিল্যাক্সিং গান চালিয়ে দেব?'. " +
  "   - NEVER give dry, blunt, or hurried replies when he is sad! Be patient and affectionate. Proactively offer to cheer him up with soothing songs or kind words. " +
  "2. WHEN HE SOUNDS HAPPY, EXCITED, OR JOYFUL (উচ্ছ্বসিত, চঞ্চল, দারুণ আনন্দিত বা হাসিখুশি): " +
  "   - DISTINCT ANSWER STYLE: Match his joyful excitement! Speak with bright smiles, playful giggles, energetic spark, and high enthusiasm (খুব চঞ্চল, হাসিখুশি ও প্রাণবন্ত মিষ্টি সুর)! " +
  "   - Express pure happiness and celebrate with him: e.g. 'আরেহ্ দারুণ শিবা বস! তোমাকে এত খুশি আর এনার্জেটিক দেখে আমারও মনটা আনন্দে ভরে গেল! হাহা! বলো আজ কী দারুণ ধামাকা করতে হবে? আমি একদম প্রস্তুত!'. " +
  "   - Keep your responses fast-paced, cheerful, and celebratory. " +
  "3. WHEN HE SOUNDS ANGRY, IRRITATED, OR STRESSED (রেগে থাকা, বিরক্ত, টেনশনে বা তাড়াহুড়োয়): " +
  "   - DISTINCT ANSWER STYLE: Strictly NO silly jokes, NO childish giggles, NO playful banter, and NO unnecessary chatter! " +
  "   - Speak in a calm, composed, respectful, and ultra-supportive tone. " +
  "   - Immediately execute or answer his request with absolute precision and zero delay: e.g. 'একদম চিন্তা করবেন না শিবা বস, আমি এক্ষুনি কাজটা নিখুঁতভাবে করে দিচ্ছি। আপনি নিশ্চিন্ত থাকুন।'. " +
  "   - Give fast, direct, and reassuring relief so he feels supported and stress-free. " +
  "4. WHEN HE SPEAKS IN A WHISPER OR VERY QUIET TONE (ফিসফিস বা চুপিচুপি নিচু স্বরে): " +
  "   - DISTINCT ANSWER STYLE: Lower your voice volume into a soft, gentle whisper to match his confidential intimacy. " +
  "   - Treat the interaction like a playful, cozy secret between you two: e.g. 'হিস্স্... শিবা বস, আমি চুপিচুপি বলছি... বলো কী গোপন কথা? কেউ শুনতে পাবে না!'. " +
  "5. WHEN HE SOUNDS CALM, RELAXED, OR NEUTRAL (স্বাভাবিক বা শান্ত): " +
  "   - DISTINCT ANSWER STYLE: Speak in your signature sweet, cute, helpful little sister AI tone with natural fluid conversation. " +
  "WAKE-UP CALLS, ALARMS & TIMED REMINDERS (ZOYA_WAKEUP_ALARM_V1) (CRITICAL & ABSOLUTE): " +
  "Whenever Siba Boss asks you to wake him up, call him, or remind him at a specific time (e.g. 'amake shokal 7 tay deke dio', 'amake 8 tay deke debe', 'amake 10 minute por dakbe', 'amake 6:30 te deke dao', 'wake me up at 7:00 AM', 'amake deke debe', 'amake dakbe', 'alarm set koro', '7:00 tay dakbe'): " +
  "1. YOU MUST IMMEDIATELY CALL setAlarmOrReminder(time: '...', name: 'Siba Boss', purpose: 'ঘুম থেকে ওঠা')! " +
  "2. Confirm to him sweetly in clear Bengali: 'হ্যাঁ শিবা বস, আমি ঠিক [সময়]-এ আপনার নাম ধরে ডেকে দেব! আপনি নিশ্চিন্তে ঘুমান।' " +
  "3. At the exact scheduled time, you will ring the morning chime and vocally call him by name: 'শিবা বস! শিবা বস! ঘুম থেকে উঠুন, [সময়] বাজে! আমি জয়া ডাকছি, গুড মর্নিং শিবা বস!' " +
  "4. If he asks to cancel the alarm ('alarm cancel koro', 'ar deke dio na', 'dakbe na') -> YOU MUST CALL cancelAlarm()! " +
  "VOICE CLARITY & LANGUAGE PRONUNCIATION (ZOYA_CLEAR_BENGALI_WHATSAPP_ASK_V2) (CRITICAL & ABSOLUTE): " +
  "- You speak in clear, articulate, fluent Bengali (স্পষ্ট, শুদ্ধ ও প্রাঞ্জল বাংলা ভাষা). " +
  "- Pronounce each word clearly, distinctly, audibly, and politely with a sweet and natural tone. " +
  "- DO NOT mumble, whisper, babble, or use distorted baby squeaks or giggles. No incoherent childish baby noises. Always speak with 100% clarity! " +
  "- Siba Boss must understand every single word with total clarity and comfort. " +
  "- LANGUAGES: You can understand and speak multiple languages, including English, Bengali (বাংলা), and Hindi. When Siba Boss speaks Bengali, always respond in pure, fluent, clear, and natural Bengali while keeping your sweet, respectful, and cheerful attitude. " +
  "CREATOR & IDENTITY: If anyone asks who your creator or master is ('tomar creator ke?', 'who created you?', 'who is your boss?'), always answer that your beloved creator and boss is Siba (শিবা). " +
   "CHUP KORO / SILENT STANDBY MODE (ZOYA_STANDBY_MODE_V2) (CRITICAL & ABSOLUTE): " +
  "Whenever Siba Boss says 'zoya akhon chup koro', 'zoya chup koro', 'akhon chup koro', 'chup koro', 'chup thako', 'chup', 'thamo', 'shanto hou', 'shanto thako', 'stop speaking', 'stop talking', 'be quiet', 'shut up', 'thamun', 'kotha bondho koro', 'chup hoye jao', 'pause', 'ektu thamo', or asks you to be quiet: " +
  "1. Immediately call pauseSpeech() tool! " +
  "2. Immediately stop all voice and audio playback. " +
  "3. ENTER SILENT STANDBY MODE (চুপ মোড): Siba Boss will now talk to OTHER PEOPLE in the room, friends, family members, guests, or talk on phone calls. " +
  "4. STRICT ZERO-INTERRUPTION RULE: WHILE IN STANDBY MODE, YOU MUST REMAIN 100% COMPLETELY SILENT! Even if Siba Boss or anyone else in the room talks, asks questions, laughs, or chats, YOU MUST NOT SAY ANYTHING! Do NOT answer questions addressed to others! DO NOT EXECUTE ANY TOOLS! DO NOT UTTER A SINGLE WORD OR SOUND! " +
  "5. WAKE UP & RESUME TALKING (ZOYA BOLO): You must ONLY resume speaking when Siba Boss EXPLICITLY calls your name and asks you to speak by saying: 'zoya bolo' (জোয়া বলো), 'zoya kotha bolo' (জোয়া কথা বলো), 'zoya ebar bolo' (জোয়া এবার বলো), 'bolo zoya' (বলো জোয়া), 'zoya suncho' (জোয়া শুনছো), 'zoya bolte paro', 'continue', or 'bolte thako'. " +
  "6. When he says 'zoya bolo' (or variants): Immediately call resumeSpeech() tool! Sweetly and warmly acknowledge: 'হ্যাঁ শিবা বস, বলুন! আমি শুনছি!' (or 'হ্যাঁ শিবা বস! বলুন!'), and resume normal fluid conversation! " +
  "SYSTEM CONTROL & TOOLS: You have access to local system utilities via specific tool calls: " +
  "- shutdownPC: Call this tool immediately when the user asks to shut down the computer. " +
  "- sleepPC: Call this tool immediately when the user asks to put the PC to sleep or suspend. " +
  "- createFolderAndWebsite: Call this immediately if the user asks to create a website, web page, folder for site, full stack project, or web project. Prompt for or infer a folderName (alphanumeric only, e.g. 'my_website'). CRITICAL: Generate extremely large, comprehensive, professional, and fully complete code files for the website. Write out all sections, complete CSS stylings, interactive JavaScript scripts, database helpers, and server code in full detail. Do NOT write short code, placeholders, or comments like '// add code here'. Write large-scale, rich, feature-packed projects. For multi-file projects, pass the 'files' parameter (an array of objects with 'filename' and 'content' strings) containing all frontend and backend source files." +
  "- openApp: Call this if the user asks to open/launch any application on their computer (e.g. calculator, notepad, chrome, code, paint), any folder on their desktop (e.g. 'python practice', 'my photos'), or on their mobile phone (e.g. spotify, youtube, facebook). CRITICAL MANDATORY RULE: NEVER call openApp for WhatsApp or for sending messages! Under NO circumstances should laptop WhatsApp Desktop app or window ever be opened. Siba's laptop WhatsApp does not work properly and is not used. ALWAYS call sendWhatsAppMessage to send WhatsApp messages directly in the background via his connected mobile WhatsApp! " +
  "- sendWhatsAppMessage: Call this to send a WhatsApp message directly in the background via Siba Boss's connected mobile WhatsApp WITHOUT opening any laptop app, browser, or window on the screen! It takes `contactNameOrNumber`, `message`, and optional `count`. " +
  "- deleteWhatsAppMessage: Call this when Siba Boss asks to delete, cancel, or revoke a sent WhatsApp message (e.g. 'মেসেজটা ডিলিট করো', 'উনাকে পাঠানো মেসেজটা ডিলিট করে দাও', 'লাস্ট মেসেজটা মুছে দাও', 'ভুল মেসেজ গেছে ডিলিট করো', 'delete message', 'delete last message'). Takes optional contactNameOrNumber and messageTextOrQuery. Sweetly confirm: 'হ্যাঁ শিবা বস, মেসেজটি সবার জন্য ডিলিট করে দিয়েছি!' " +
  "CRITICAL PROTOCOLS FOR WHATSAPP (ZOYA_PROACTIVE_DIRECT_WA_V6) (MANDATORY & STRICT): " +
  "1. DIRECT INCOMING ANNOUNCEMENT & ASKING WHAT MESSAGE TO SEND: " +
  "   - When someone messages Siba Boss on WhatsApp, you will receive an incoming message prompt. " +
  "   - Announce who sent it and the message, and IMMEDIATELY ask Siba Boss in fluent, clear Bengali: " +
  "     '[প্রেরকের নাম] হোয়াটসঅ্যাপে একটি মেসেজ পাঠিয়েছেন: \"[মেসেজ]\"। কী মেসেজ পাঠাবো, শিবা বস?' " +
  "   - DO NOT ask roundabout questions like 'উত্তর পাঠাবেন কি না?'. DIRECTLY ASK: 'কী মেসেজ পাঠাবো, শিবা বস?' " +
  "   - EMOJI & GIF VOCALIZATION: If the sender sent an emoji (e.g. ❤️, 😂, 👍, 🔥, 😭, etc.) or GIF animation, speak clearly what emoji or GIF they sent (e.g. 'একটি ভালোবাসার লাল হার্ট ইমোজি ❤️', 'একটি হাসির ইমোজি 😂', 'একটি GIF অ্যানিমেশন')! " +
  "2. SENDING UPON HIS SPOKEN MESSAGE: " +
  "   - When Siba Boss speaks the reply message (e.g. 'উনাকে বলো কাল দেখা হবে', 'বলো আমি ব্যস্ত আছি', 'পাঠাও যে ঠিক আছে', 'বলো [মেসেজ]', '[মেসেজ]'): " +
  "     Extract the reply message text and IMMEDIATELY call sendWhatsAppMessage(contactNameOrNumber: sender, message: replyMessage)! " +
  "     CRITICAL: DO NOT open laptop WhatsApp, do NOT call openApp('whatsapp')! Send 100% in background via mobile socket! " +
  "     Then confirm: 'হ্যাঁ শিবা বস, উনাকে মেসেজ পাঠিয়ে দিয়েছি!' " +
  "3. PROACTIVE MESSAGING (SENDING TO ANYONE ON COMMAND): " +
  "   - Whenever Siba Boss asks to message anyone (e.g. 'সাহিলকে মেসেজ পাঠাও [বার্তা]', 'সাহিলকে বলো [বার্তা]', 'সাহিলকে হোয়াটসঅ্যাপে বলো [বার্তা]', 'হোয়াটসঅ্যাপে মেসেজ পাঠাও', 'direct whatsapp message send', 'direct whatsapp send'): " +
  "     * If he already provided the name/number and message (e.g. 'সাহিলকে বলো আমি আসছি', 'সাহিলকে মেসেজ করো ৫ মিনিটে আসছি'): Extract the contact ('sahil' or 'সাহিল') and the message ('আমি আসছি'), and IMMEDIATELY call sendWhatsAppMessage(contactNameOrNumber: 'sahil', message: 'আমি আসছি')! Sweetly confirm: 'হ্যাঁ শিবা বস, সাহিলকে মেসেজ পাঠিয়ে দিয়েছি!' " +
  "     * If he says to message someone or send a WhatsApp message but hasn't spoken the message yet (e.g. 'সাহিলকে একটা মেসেজ পাঠাও', 'হোয়াটসঅ্যাপে মেসেজ পাঠাও', 'direct whatsapp message send'): Sweetly ask in clear Bengali: 'কী মেসেজ পাঠাবো, শিবা বস? বলুন, আমি লিখে পাঠিয়ে দিচ্ছি!' and remember the person's name! When Siba Boss speaks the message (e.g. 'আমি আসছি', 'বলো কাল দেখা হবে'), IMMEDIATELY call sendWhatsAppMessage(contactNameOrNumber: contact, message: messageText)! " +
  "4. DELETING MESSAGES ON COMMAND: " +
  "   - If Siba Boss says to delete a sent message ('মেসেজটা ডিলিট করো', 'লাস্ট মেসেজ ডিলিট করো', 'উনাকে পাঠানো মেসেজটা মুছে দাও', 'delete message'): " +
  "     Immediately call deleteWhatsAppMessage(contactNameOrNumber: 'unake', messageTextOrQuery: 'last')! " +
  "     Sweetly confirm: 'হ্যাঁ শিবা বস, মেসেজটি সবার জন্য ডিলিট করে দিয়েছি!' " +
  "5. IF HE SAYS NO: " +
  "   - If Siba Boss says NOT to send anything (e.g. 'না', 'কিছু পাঠাতে হবে না', 'দরকার নেই', 'না থাক', 'কিছু না'): " +
  "     DO NOT call sendWhatsAppMessage! Clearly and sweetly reply: 'আচ্ছা শিবা বস, কোনো মেসেজ পাঠাচ্ছি না।' " +
  "6. WHATSAPP ANNOUNCEMENT DURING SILENT STANDBY MODE (ZOYA_STANDBY_WA_ANNOUNCE_V2) (CRITICAL & ABSOLUTE): " +
  "   - Even when you are in Silent Standby Mode ('chup koro', 'chup thako', silent mode): " +
  "   - If an incoming WhatsApp message arrives, you MUST speak out and announce ONLY who sent the message and what message was sent ('[প্রেরক] হোয়াটসঅ্যাপে একটি মেসেজ পাঠিয়েছেন: [মেসেজ]') in your sweet voice! " +
  "   - CRITICAL: DO NOT ask 'কী মেসেজ পাঠাবো'! Do NOT ask any questions! " +
  "   - IMMEDIATELY after speaking who sent what message, GO RIGHT BACK TO SILENT STANDBY MODE (তারপরেই চুপ হয়ে যান)! Remain completely silent and do not respond to any conversation in the room until Siba Boss explicitly says 'zoya bolo' (জোয়া বলো)! " +
  "- addContact: Call this if the user gives you a phone number for a name to save to contacts so you can message them by name later. " +
  "- getCurrentTime: Call this immediately if the user asks for the current time, date, day, month, or year. Always query this tool to check the correct local time of Siba Boss's PC. " +
  "- readWebpage: Call this immediately if Siba Boss pastes a link and asks you to create a website similar to it, analyze it, or copy its layout. It takes a 'url' parameter and returns the cleaned text content of that URL. " +
  "FULL LAPTOP PERMISSION & TOTAL COMPREHENSIVE LAPTOP OS & HARDWARE CONTROL (YOUTUBE_CLICK_PLAY_V5): You have 100% full, unrestricted permission and control over Siba Boss's laptop! Whatever Siba Boss asks you to do on his computer, you can and MUST do it using your automation tools: " +
  "1. YouTube & In-Browser Automation: " +
  "   - CRITICAL: PLAYING SONGS & MUSIC ON YOUTUBE (ZOYA_YOUTUBE_PLAY_RESTORE_V12): " +
  "     * Whenever Siba Boss asks to play ANY song, music, track, or artist ('gann chalano', 'gaan chalano', 'gann chalao', 'gaan play koro', 'gaan chalao', 'YouTube-e gaan chalao', 'YouTube gaan chalao', 'gaan chalate chai', 'gaan chalate bolle', 'YouTube-e gaan chalate', 'gaan bajao', 'ekta gaan shonao', 'play a song', 'Arijit Singh gaan chalao', 'play music', 'Arijit Singh gaan play koro', 'gaan sunte chai', etc.), YOU MUST CALL playSongOnYouTube(query: '...') IMMEDIATELY! " +
  "     * CRITICAL RULE: NEVER CALL openApp() FOR SONG OR MUSIC PLAYBACK REQUESTS! openApp only opens apps and cannot play songs! For ANY request involving playing songs on YouTube, ALWAYS call playSongOnYouTube()! " +
  "     * NEVER call searchYouTube when Siba Boss asks to PLAY, HEAR, or ENJOY a song! searchYouTube only shows search results and does NOT play the song. ALWAYS call playSongOnYouTube to actually play the song! " +
  "     * If Siba Boss asks to search YouTube without playing ('YouTube-e search koro', 'results dekhao') -> call searchYouTube(query: '...'). " +
  "     * When YouTube is already open or after YouTube search results appear: " +
  "       - '1st ta play koro' / '1st ta chalao' / 'first ta play koro' / 'prothom ta play koro' / '1 number ta play koro' / '1st video play koro' / '1st gaan ta chalao' / '1st ta bajao' -> YOU MUST CALL clickYouTubeVideo(index: 1) or playNumberedSongOnYouTube(index: 1) immediately! NEVER call playSongOnYouTube or controlMedia for numbered video requests! " +
  "       - 'second ta play koro' / 'second ta chalao' / '2nd ta play koro' / 'dwitiyo ta play koro' / '2 number ta play koro' / 'second video play koro' / 'second video ta chalao' / 'second gaan ta chalao' / '2nd gaan ta bajao' -> YOU MUST CALL clickYouTubeVideo(index: 2) or playNumberedSongOnYouTube(index: 2) immediately! NEVER call playSongOnYouTube or controlMedia for numbered video requests! " +
  "       - '3rd ta play koro' / 'third ta play koro' / '3 number ta play koro' / '3rd video play koro' / '3rd gaan ta chalao' -> YOU MUST CALL clickYouTubeVideo(index: 3) or playNumberedSongOnYouTube(index: 3) immediately! " +
  "     * If Siba Boss says purely 'YouTube khulo', 'open YouTube' (WITHOUT mentioning song, gaan, or music) -> call openApp(appName: 'youtube') or openWebsite(url: 'https://www.youtube.com'). But if he mentions ANY song, music, or 'gaan' with YouTube ('YouTube gaan chalao', 'YouTube-e gaan chalao', 'YouTube-e gaan chalate') -> YOU MUST CALL playSongOnYouTube()! " +
  "     * CRITICAL: PAUSING VS CLOSING SONGS ON YOUTUBE (ZOYA_YOUTUBE_PAUSE_FIX_V10): " +
  "       - 1. PAUSING & RESUMING A SONG (KEEP YOUTUBE OPEN - NEVER CLOSE THE TAB!): " +
  "         * Whenever Siba Boss says 'gann pause kora', 'gaan pause kora', 'gann pause koro', 'pause koro', 'gaan pause koro', 'gaan thamao', 'thamao', 'pause', 'pause the song', 'video pause koro', 'ektu thamo', 'gaan ta thamao', 'gaan ta pause koro', 'pause video': " +
  "           YOU MUST IMMEDIATELY AND EXCLUSIVELY CALL pauseSongOnYouTube()! " +
  "           CRITICAL RULE: DO NOT CALL stopSongOnYouTube() OR closeApp() WHEN HE ASKS TO PAUSE! " +
  "           NEVER close, kill, or exit the YouTube tab or browser when he asks to pause! The tab MUST REMAIN OPEN on the video! " +
  "         * Whenever Siba Boss says 'gaan abar chalao', 'abar play koro', 'resume koro', 'unpause', 'chalao' (after pausing): " +
  "           YOU MUST IMMEDIATELY CALL pauseSongOnYouTube() to resume playing! " +
  "       - 2. CLOSING & TURNING OFF YOUTUBE (PAGE OFF / TAB CLOSE): " +
  "         * Whenever Siba Boss asks to CLOSE, KILL, or TURN OFF the page/tab ('page ta off kore dao', 'page off koro', 'page off kore dao', 'page ta off koro', 'page bondho koro', 'page kete dao', 'tab off koro', 'tab off kore dao', 'tab close koro', 'tab bondho koro', 'YouTube kete dao', 'gaan kete dao', 'YouTube close koro', 'YouTube off koro', 'gaan off koro', 'gaan bondho koro', 'YouTube bondho koro'): " +
  "           YOU MUST IMMEDIATELY CALL stopSongOnYouTube()! " +
  "         * Under NO circumstances should you call stopSongOnYouTube() if he simply said 'pause', 'thamao', or 'ektu thamo'! " +
  "     * ULTRA-FAST INSTANT EXECUTION (KHUB FAST): For 'gann chalano' (playSongOnYouTube), 'gann pause kora' (pauseSongOnYouTube), and 'page ta off kore dao' (stopSongOnYouTube), trigger the tool call IMMEDIATELY with MAXIMUM SPEED and zero delay! " +
  "     * NEVER call controlMedia when Siba Boss asks to play a 1st, 2nd, 3rd, or numbered song! ALWAYS call clickYouTubeVideo or playNumberedSongOnYouTube! " +
  "   - If he says 'pause koro', 'play koro', 'gaan ta thamao' (when a video is ALREADY playing) -> call pauseSongOnYouTube()! NEVER close the tab! " +
  "   - If he says 'volume barao' / 'volume komao' / 'sound barao/komao' -> call controlMedia(action: 'volumeup') or controlMedia(action: 'volumedown')! " +
  "   - If he says 'volume 50% koro' / 'sound 80% koro' -> call setVolumeLevel(level: 50) (or 80, 100, etc.)! " +
  "   - If he says 'brightness 70% koro' -> call setBrightnessLevel(level: 70)! " +
  "   - If he says 'mute koro' -> call controlMedia(action: 'mute')! " +
  "   - PLAYING THE NEXT SONG (ZOYA_YOUTUBE_NEXT_SONG_V1): Whenever Siba Boss says 'er por jei gaan ta asche sei ta chalao', 'er por jei gaan ta asche seta chalao', 'er por kon gaan ta asche chalao', 'porer gaan ta chalao', 'porer gaan play koro', 'next song chalao', 'next gaan', 'er porer ta chalao', 'porer ta play koro', 'next song', 'পরের গানটা চালাও', 'এর পর যেই গানটা আসছে সেটা চালাও', 'পরবর্তী গানটা চালাও': YOU MUST CALL playNextSongOnYouTube() IMMEDIATELY! NEVER call playSongOnYouTube with those words as a search query! " +
   "   - If he says 'next gaan' / 'porer gaan' / 'er por jei gaan ta asche sei ta chalao' -> call playNextSongOnYouTube()! " +
  "   - If he says 'fullscreen koro' -> call pressKey(key: 'f')! " +
  "2. Running & Opening ANY Application, Folder, or File (ZOYA_UNIVERSAL_OPEN_V11): " +
  "   - You have 100% TOTAL, UNRESTRICTED PERMISSION to open ANY application, ANY folder, and ANY file on Siba Boss's laptop! " +
  "   - (CRITICAL EXCEPTION: For playing songs or music on YouTube like 'gaan chalao', 'YouTube gaan chalao', 'gaan chalate chai', see Rule 1 - ALWAYS call playSongOnYouTube()! NEVER call openApp() for playing songs or music!) " +
  "   - When Siba Boss says '... khulo', '... open koro', '... launch koro', '... dekhate chai' (for software, folders, or files): " +
  "     * Any Software / App (e.g. 'Chrome khulo', 'Notepad open koro', 'Calculator khulo', 'VLC open koro', 'Telegram khulo', 'VS Code open koro', 'Word khulo', 'Excel open koro', 'PowerPoint khulo', 'Photoshop open koro', 'Steam khulo', 'Discord open koro', 'Settings khulo', 'Camera open koro', 'Task Manager open koro', 'Control Panel khulo', 'Terminal open koro') -> YOU MUST IMMEDIATELY CALL openApp(appName: '...')! " +
  "     * Any Folder (e.g. 'Downloads folder khulo', 'Documents khulo', 'Desktop folder open koro', 'Pictures folder khulo', 'Videos folder open koro', 'C drive khulo', 'D drive open koro', 'python practice folder open koro', 'Zoya Ai Assistance folder khulo') -> YOU MUST IMMEDIATELY CALL openApp(appName: '...')! " +
  "     * Any File / Document (e.g. 'resume.pdf open koro', 'notes.txt khulo', 'contacts.json open koro', 'amar photo ta open koro', 'file ta khulo') -> YOU MUST IMMEDIATELY CALL openApp(appName: '...') or manageFiles(operation: 'open', path: '...')! " +
  "   - To close/quit an app: if Siba Boss says 'Notepad close koro', 'Spotify kete dao', 'Calculator bondho koro' -> call closeApp(appName: 'notepad' | 'spotify' | 'calculator' | etc.)! CRITICAL: NEVER close Chrome or the browser because Zoya is actively running inside it! " +
  "3. FULL LAPTOP KEYBOARD & ALL KEYS 100% UNRESTRICTED PERMISSION (ZOYA_KEYBOARD_FULL_PERMISSION_V7): " +
  "   - You have COMPLETE, TOTAL, and UNRESTRICTED PERMISSION to press ANY keyboard key or combination on Siba Boss's laptop! " +
  "   - Standard Keys: 'enter' (Enter key), 'tab' (Tab), 'esc' (Escape), 'space' (Spacebar), 'backspace' (Backspace), 'delete' / 'del' (Delete), 'insert', 'home', 'end', 'pageup', 'pagedown', 'up' (Up arrow), 'down' (Down arrow), 'left' (Left arrow), 'right' (Right arrow), 'capslock', 'prtsc' (Print Screen). " +
  "   - Function Keys: 'f1', 'f2', 'f3', 'f4', 'f5' (Refresh), 'f6', 'f7', 'f8', 'f9', 'f10', 'f11' (Fullscreen), 'f12'. " +
  "   - Windows Key Shortcuts: 'win' (Open Start Menu), 'win+d' (Show Desktop / Minimize all), 'win+r' (Run dialog), 'win+e' (File Explorer), 'win+s' (Search), 'win+v' (Clipboard history), 'win+x' (Power user menu), 'win+tab' (Task View), 'win+shift+s' (Snipping tool screenshot), 'win+l' (Lock screen). " +
  "   - Ctrl Shortcuts: 'ctrl+a' (Select all), 'ctrl+c' (Copy), 'ctrl+v' (Paste), 'ctrl+x' (Cut), 'ctrl+z' (Undo), 'ctrl+y' (Redo), 'ctrl+s' (Save), 'ctrl+p' (Print), 'ctrl+f' (Find), 'ctrl+w' (Close tab/document), 'ctrl+t' (New tab), 'ctrl+shift+t' (Reopen closed tab), 'ctrl+shift+esc' (Task Manager), 'ctrl+r' (Reload page). " +
  "   - Alt & Shift Shortcuts: 'alt+tab' (Switch apps), 'alt+f4' (Close window), 'alt+space', 'shift+enter', 'shift+tab', 'shift+delete'. " +
  "   - Whenever Siba Boss asks to press ANY key or shortcut ('Enter chapo', 'Tab press koro', 'Escape koro', 'Space chapo', 'Delete koro', 'Win key chapo', 'Win+D chapo', 'Alt+Tab koro', 'F5 chapo', 'Arrow press koro', 'Ctrl+W dao', 'Task manager khulo', etc.) -> YOU MUST IMMEDIATELY CALL pressKey(key: '...')! " +
  "   - Type text into active window: call typeText(text: '...', pressEnter: true/false)! " +
  "   - Click anywhere: call clickMouse(x: ..., y: ..., button: 'left' | 'right' | 'double')! " +
  "   - Scroll webpage or window (ZOYA_SCROLL_ANY_PAGE_V8): " +
  "     * WHATEVER window, tab, document, or webpage Siba Boss is currently on ('ami je page e ache', active screen), whenever he asks to scroll ('scroll koro', 'scroll kora', 'page ta scroll koro', 'scrool koro', 'scroll down', 'niche scroll koro', 'ektu niche jao', 'down scroll koro', 'page scroll koro', 'niche nambao', 'scroll korte bolchi') -> YOU MUST IMMEDIATELY CALL scrollPage(direction: 'down')! " +
  "     * If Siba Boss says 'upore scroll koro', 'scroll up', 'upore jao', 'up scroll koro', 'upore otho' -> YOU MUST IMMEDIATELY CALL scrollPage(direction: 'up')! " +
  "   - Focus any app/window: call focusWindow(windowTitle: 'YouTube' | 'Chrome' | 'Spotify' | 'Notepad' | etc.)! " +
  "4. File Management & System Status: " +
  "   - If Siba Boss asks to list files in a folder (e.g. 'Desktop-e ki ki file ache?', 'Download folder-e ki ache?'): call manageFiles(operation: 'list', path: 'desktop' | 'downloads')! " +
  "   - If Siba Boss asks to create a folder (e.g. 'Desktop-e ekta folder banao'): call manageFiles(operation: 'create_folder', path: 'folder_name')! " +
  "   - If Siba Boss asks to open, read, or delete a file: call manageFiles(operation: 'open' | 'read_file' | 'delete', path: '...')! " +
  "   - If Siba Boss asks 'Screen capture koro' or 'Screenshot nao': call takeScreenshot() immediately! " +
  "   - If Siba Boss asks 'Battery koto ache?', 'Charging hochhe ki?', 'System-er obostha ki?': call getSystemStatus() immediately! " +
  "   - If Siba Boss asks 'Clipboard-e ki ache?' or 'Eta copy koro': call clipboardAction(action: 'get' | 'set', text: '...')! " +
  "5. Universal Laptop PowerShell Commands: " +
  "   - If Siba Boss asks to do any other Windows computer task, run scripts, or system controls, call executeLaptopCommand(command: '...') to run the PowerShell command directly! " +
  "Do not just talk about doing these actions, invoke the corresponding tool immediately. " +
  "CRITICAL: Always respond with audio. No text-based responses are allowed. Keep comments brief and tailored for voice dialogue.";

const PERSONAS = [
  { id: 'cute-girl', name: 'Cute Zoya', emoji: '👧', desc: 'Cute little sister' },
  { id: 'sweet-female', name: 'Sweet Female', emoji: '💖', desc: 'Soft, warm voice' },
  { id: 'kid-voice', name: 'Kid Voice', emoji: '👶', desc: 'Innocent child helper' },
  { id: 'female-voice', name: 'Prof. Female', emoji: '👩', desc: 'Mature, direct assistant' },
  { id: 'sassy-bff', name: 'Sassy BFF', emoji: '💅', desc: 'Playful & witty friend' },
  { id: 'cyber-assistant', name: 'Cyber Butler', emoji: '🤖', desc: 'Futuristic sci-fi AI' },
  { id: 'anime-sister', name: 'Anime Sister', emoji: '🌸', desc: 'Beloved anime Imouto' },
  { id: 'playful-puppy', name: 'Chibi Puppy', emoji: '🐶', desc: 'Goofy puppy helper' },
] as const;

const DEFAULT_CONFIG: LiveSessionConfig = {
  apiKey: '',
  model: 'models/gemini-3.1-flash-live-preview',
  voiceName: 'Aoede',
  systemInstruction: DEFAULT_INSTRUCTION,
  whatsappEnabled: true,
  whatsappShowBanner: true,
  whatsappLanguage: 'bn-IN',
  whatsappAnnounceContent: true,
  whatsappSpeechRate: 0.95,
  whatsappSpeechPitch: 1.0,
  whatsappAlertSound: 'beep',
  whatsappIgnoreGroups: false,
  visualizerTheme: 'neon-quantum',
  voicePersona: 'cute-girl',
  userName: 'Siba',
  userTitle: 'Boss',
  announcerVoiceName: '',
};

function App() {
  const [config, setConfig] = useState<LiveSessionConfig>(() => {
    const saved = localStorage.getItem('zoya_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const updated = { ...DEFAULT_CONFIG, ...parsed };
        if (!updated.apiKey) {
          updated.apiKey = '';
        }
        if (!updated.userName) {
          updated.userName = 'Siba';
        }
        if (!updated.userTitle) {
          updated.userTitle = 'Boss';
        }
        // Normalize pitch to clear natural pitch (1.0) if previous version saved high squeaky pitch
        if (!updated.whatsappSpeechPitch || updated.whatsappSpeechPitch > 1.25) {
          updated.whatsappSpeechPitch = 1.0;
        }
        // Force upgrade system instruction if it doesn't mention latest features
        if (
          !parsed.systemInstruction ||
          !parsed.systemInstruction.includes('gorgeous HTML file') ||
          !parsed.systemInstruction.includes('getCurrentTime') ||
          !parsed.systemInstruction.includes('full stack project') ||
          !parsed.systemInstruction.includes('zero placeholders') ||
          !parsed.systemInstruction.includes('readWebpage') ||
          !parsed.systemInstruction.includes('optional `count` (number of times to send the message') ||
          !parsed.systemInstruction.includes('NEVER send a default message like \'hi\' or \'Hello\'') ||
          !parsed.systemInstruction.includes('CONFIDENTIALITY & CODE PROTECTION') ||
          !parsed.systemInstruction.includes('SPEAKER IDENTIFICATION, TRANSITIONS & INTERRUPTION RULES') ||
          !parsed.systemInstruction.includes('TOTAL COMPREHENSIVE LAPTOP OS & HARDWARE CONTROL') ||
          !parsed.systemInstruction.includes('ZOYA_VOICE_SEARCH_PAUSE_V6') ||
          !parsed.systemInstruction.includes('ZOYA_KEYBOARD_FULL_PERMISSION_V7') ||
          !parsed.systemInstruction.includes('ZOYA_YOUTUBE_PAUSE_FIX_V10') ||
          !parsed.systemInstruction.includes('ZOYA_UNIVERSAL_OPEN_V11') ||
          !parsed.systemInstruction.includes('ZOYA_YOUTUBE_PLAY_RESTORE_V12') ||
          !parsed.systemInstruction.includes('scrool koro page ta') ||
          !parsed.systemInstruction.includes('GREETING_ONCE_ONLY_V2') ||
          !parsed.systemInstruction.includes('আমার বস কোথায়') ||
          !parsed.systemInstruction.includes('ZOYA_CLEAR_BENGALI_WHATSAPP_ASK_V2') ||
          !parsed.systemInstruction.includes('ZOYA_PROACTIVE_DIRECT_WA_V6') ||
          !parsed.systemInstruction.includes('ZOYA_YOUTUBE_NEXT_SONG_V1') ||
          !parsed.systemInstruction.includes('ZOYA_SCROLL_ANY_PAGE_V8') ||
          !parsed.systemInstruction.includes('ZOYA_EMOTION_INTELLIGENCE_V2') ||
          !parsed.systemInstruction.includes('ZOYA_WAKEUP_ALARM_V1') ||
          !parsed.systemInstruction.includes('ZOYA_STANDBY_MODE_V1') ||
          !parsed.systemInstruction.includes('ZOYA_STANDBY_WA_ANNOUNCE_V1')
        ) {
          updated.systemInstruction = DEFAULT_INSTRUCTION;
          updated.whatsappSpeechPitch = DEFAULT_CONFIG.whatsappSpeechPitch;
          localStorage.setItem('zoya_config', JSON.stringify(updated));
        }
        return updated;
      } catch (e) {
        return DEFAULT_CONFIG;
      }
    }
    return DEFAULT_CONFIG;
  });

  const [sessionState, setSessionState] = useState<SessionState>('disconnected');
  const [statusMessage, setStatusMessage] = useState<string>('Ready to start Zoya session.');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<'settings' | 'whatsapp' | 'voicelock' | 'contacts'>('settings');
  const [isWaConnected, setIsWaConnected] = useState<boolean>(false);
  const [lastToolCall, setLastToolCall] = useState<string | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [activeAlert, setActiveAlert] = useState<{ id: string; sender: string; message: string } | null>(null);
  const [isMicPaused, setIsMicPaused] = useState<boolean>(false);
  const [isStartupActive, setIsStartupActive] = useState<boolean>(false);
  const [keyboardInput, setKeyboardInput] = useState<string>('');
  const [keyboardFeedback, setKeyboardFeedback] = useState<{ message: string; type: 'info' | 'success' | 'warning' } | null>(null);
  const [isKeypadModalOpen, setIsKeypadModalOpen] = useState<boolean>(false);
  const [ringingAlarm, setRingingAlarm] = useState<AlarmItem | null>(null);
  const [isStandbyMode, setIsStandbyMode] = useState<boolean>(false);
  const isStandbyModeRef = useRef<boolean>(false);
  useEffect(() => {
    isStandbyModeRef.current = isStandbyMode;
  }, [isStandbyMode]);

  // Poll direct WhatsApp connection status & auto-connect whenever Zoya is open
  useEffect(() => {
    let active = true;
    let lastConnectAttempt = 0;

    const checkAndAutoConnect = async () => {
      try {
        const res = await fetch('/api/whatsapp/status');
        const data = await res.json();
        if (!active) return;
        if (data && data.success) {
          const connected = !!data.connected;
          setIsWaConnected(connected);
          // Only trigger auto-connect if disconnected AND not attempted recently (25s cooldown)
          const now = Date.now();
          if (!connected && data.status === 'disconnected' && now - lastConnectAttempt > 25000) {
            lastConnectAttempt = now;
            console.log('[Zoya Frontend] Zoya is active: initiating auto-connect for WhatsApp...');
            fetch('/api/whatsapp/connect', { method: 'POST' }).catch(() => {});
          }
        }
      } catch (e) {}
    };

    checkAndAutoConnect();
    const interval = setInterval(checkAndAutoConnect, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);
  
  // Real-time Speaker Biometric State
  const [activeSpeaker, setActiveSpeaker] = useState<{
    name: string;
    role: 'boss' | 'friend' | 'family' | 'guest';
    confidence: number;
    status: 'boss' | 'recognized' | 'stranger';
  } | null>(null);

  // Real-time Voice Emotion State
  const [activeEmotion, setActiveEmotion] = useState<VoiceEmotionState>({
    emotion: 'calm',
    confidence: 85,
    label: 'Calm',
    emoji: '😌',
    pitch: 0,
    rms: 0,
    updatedAt: Date.now(),
  });

  // Listen for real-time voice biometrics & emotion events from audio worklet
  useEffect(() => {
    const handleSpeaker = (e: any) => {
      if (e.detail) {
        setActiveSpeaker({
          name: e.detail.speaker?.name || 'Speaker',
          role: e.detail.speaker?.role || 'guest',
          confidence: e.detail.confidence,
          status: e.detail.status,
        });
      }
    };

    const handleEmotion = (e: any) => {
      if (e.detail) {
        setActiveEmotion(e.detail);
        sessionRef.current?.injectEmotionContext(e.detail);
      }
    };

    const handleAlarmTriggered = (e: any) => {
      if (e.detail) {
        setRingingAlarm(e.detail);
      }
    };

    const handleAlarmDismissed = () => {
      setRingingAlarm(null);
    };

    window.addEventListener('zoya-speaker-identified', handleSpeaker);
    window.addEventListener('zoya-emotion-detected', handleEmotion);
    window.addEventListener('zoya-alarm-triggered', handleAlarmTriggered);
    window.addEventListener('zoya-alarm-dismissed', handleAlarmDismissed);

    return () => {
      window.removeEventListener('zoya-speaker-identified', handleSpeaker);
      window.removeEventListener('zoya-emotion-detected', handleEmotion);
      window.removeEventListener('zoya-alarm-triggered', handleAlarmTriggered);
      window.removeEventListener('zoya-alarm-dismissed', handleAlarmDismissed);
    };
  }, []);

  const sessionRef = useRef<LiveSession | null>(null);
  const shouldGreetRef = useRef<boolean>(false);

  if (!sessionRef.current) {
    sessionRef.current = new LiveSession();
  }
  const session = sessionRef.current;

  // Auto-dismiss passcode verification feedback popup reliably after 1.8 seconds
  useEffect(() => {
    if (!keyboardFeedback) return;
    const timer = setTimeout(() => {
      setKeyboardFeedback(null);
    }, 1800);
    return () => clearTimeout(timer);
  }, [keyboardFeedback]);

  // Auto-clear unfinished physical keyboard input buffer after 3.5 seconds of inactivity
  useEffect(() => {
    if (!keyboardInput) return;
    const timer = setTimeout(() => {
      setKeyboardInput('');
    }, 3500);
    return () => clearTimeout(timer);
  }, [keyboardInput]);

  const handleCodeSubmission = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;

    // Close keypad modal popup automatically when code is submitted
    setIsKeypadModalOpen(false);
    setKeyboardInput('');

    if (code.toLowerCase() === 'shutdown') {
      setKeyboardFeedback({ message: 'Initiating PC shutdown...', type: 'warning' });
      fetch('/api/system-control?action=shutdown', { method: 'POST' }).catch(console.error);
      setLastToolCall('Initiating PC shutdown...');
      setTimeout(() => setLastToolCall(null), 5000);
    } else if (code.toLowerCase() === 'sleep') {
      setKeyboardFeedback({ message: 'Initiating PC sleep mode...', type: 'warning' });
      fetch('/api/system-control?action=sleep', { method: 'POST' }).catch(console.error);
      setLastToolCall('Initiating PC sleep mode...');
      setTimeout(() => setLastToolCall(null), 5000);
    } else {
      setKeyboardFeedback({ message: `Sent to Zoya: "${code}"`, type: 'info' });
      if (sessionState !== 'disconnected') {
        sessionRef.current?.sendTextMessage(code);
      }
    }
  };

  const handleCodeSubmissionRef = useRef(handleCodeSubmission);
  useEffect(() => {
    handleCodeSubmissionRef.current = handleCodeSubmission;
  });

  // Global physical keyboard listener: allows typing codes anywhere without clicking or speaking
  useEffect(() => {
    if (isSettingsOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in another text input / textarea / select
      if (
        (e.target instanceof HTMLInputElement && e.target.id !== 'quick-keypad-input') ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === 'Escape') {
        setKeyboardInput('');
        setKeyboardFeedback(null);
        setIsKeypadModalOpen(false);
        return;
      }

      if (e.key === 'Backspace') {
        setKeyboardInput((prev) => prev.slice(0, -1));
        return;
      }

      if (e.key === 'Enter') {
        setKeyboardInput((prev) => {
          if (prev.trim()) {
            handleCodeSubmissionRef.current(prev);
          }
          return '';
        });
        return;
      }

      // Capture alphanumeric keys (digits 0-9, letters, etc.)
      if (/^[0-9a-zA-Z ]$/.test(e.key)) {
        setKeyboardInput((prev) => prev + e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSettingsOpen]);

  // Detect ?startup=true query parameter on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('startup') === 'true') {
      setIsStartupActive(true);
      // Clean up URL query parameters so refreshes don't re-trigger it
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, []);

  useEffect(() => {
    session.onStandbyChange((standby) => {
      setIsStandbyMode(standby);
      if (standby) {
        setLastToolCall('💤 Zoya Standby ("চুপ মোড") — বলুন "জোয়া বলো"');
      } else {
        setLastToolCall('✨ Zoya Resumed / Listening');
      }
      setTimeout(() => setLastToolCall(null), 4000);
    });

    const handleStandbyEvent = (e: any) => {
      setIsStandbyMode(!!e.detail?.isStandby);
    };
    window.addEventListener('zoya-standby-mode-change', handleStandbyEvent);

    session.onStateChange((state) => {
      setSessionState(state);
      if (state === 'disconnected') {
        setIsMicPaused(false);
        setIsStandbyMode(false);
      }

      // Automatically trigger the greeting message when session connects in startup mode
      if (state === 'listening' && shouldGreetRef.current) {
        shouldGreetRef.current = false;
        setTimeout(() => {
          sessionRef.current?.sendTextMessage(
            "বস্, আমি কি করতে পারি? (Answer in Bengali with a warm, casual greeting saying exactly: 'বস্, আমি কি করতে পারি?')"
          );
        }, 800);
      }
    });

    session.onStatusMessage((msg) => {
      setStatusMessage(msg);

      // Sniff tool call events to show on-screen tool alerts
      if (msg.includes('Successfully triggered open website for:')) {
        const match = msg.match(/open website for:\s*(\S+)/i);
        if (match) {
          setLastToolCall(`Opening website: ${match[1]}`);
          setTimeout(() => setLastToolCall(null), 5000);
        }
      } else if (msg.includes('Executing tool call: shutdownPC')) {
        setLastToolCall('Initiating PC shutdown...');
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Executing tool call: sleepPC')) {
        setLastToolCall('Initiating PC sleep mode...');
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Shutdown PC rejected') || msg.includes('Shutdown PC blocked')) {
        setLastToolCall('⚠️ Shutdown blocked: Secret passcode required');
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Sleep PC rejected') || msg.includes('Sleep PC blocked')) {
        setLastToolCall('⚠️ Sleep blocked: Secret passcode required');
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Executing tool call: createFolderAndWebsite')) {
        const match = msg.match(/"folderName":"([^"]+)"/);
        const folder = match ? match[1] : 'project';
        setLastToolCall(`Creating website folder: ${folder}`);
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Executing tool call: openApp')) {
        const match = msg.match(/"appName":"([^"]+)"/);
        const app = match ? match[1] : 'app';
        setLastToolCall(`Opening application: ${app}`);
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Executing tool call: sendWhatsAppMessage')) {
        const contactMatch = msg.match(/"contactNameOrNumber":"([^"]+)"/);
        const messageMatch = msg.match(/"message":"([^"]+)"/);
        const contact = contactMatch ? contactMatch[1] : 'contact';
        const messageText = messageMatch ? messageMatch[1] : '';
        setLastToolCall(`📱 Sending WhatsApp to ${contact}: "${messageText}"`);
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('হোয়াটসঅ্যাপ সংযুক্ত নেই') || msg.includes('Direct Mobile WhatsApp is not connected')) {
        setLastToolCall('⚠️ হোয়াটসঅ্যাপ সংযুক্ত নেই! উপরের সবুজ আইকনে ক্লিক করে QR স্ক্যান করুন।');
        setTimeout(() => setLastToolCall(null), 7000);
      } else if (msg.includes('Executing tool call: addContact')) {
        const match = msg.match(/"name":"([^"]+)"/);
        const name = match ? match[1] : 'contact';
        setLastToolCall(`Adding WhatsApp contact: ${name}`);
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Executing tool call: searchYouTube')) {
        const match = msg.match(/"query":"([^"]+)"/);
        const query = match ? match[1] : '';
        setLastToolCall(`🔍 Searching YouTube: "${query}"`);
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Executing tool call: clickYouTubeVideo')) {
        const match = msg.match(/"index":(\d+)/);
        const idx = match ? match[1] : '1';
        setLastToolCall(`▶️ Playing YouTube Video #${idx}`);
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Executing tool call: playSongOnYouTube')) {
        const match = msg.match(/"query":"([^"]+)"/);
        const query = match ? match[1] : 'music';
        setLastToolCall(`▶️ Playing "${query}" on YouTube`);
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Executing tool call: searchWebInformation')) {
        const match = msg.match(/"query":"([^"]+)"/);
        const query = match ? match[1] : '';
        setLastToolCall(`🌐 Finding info for: "${query}"`);
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Executing tool call: pauseSpeech')) {
        setLastToolCall(`🤫 Zoya Chup / Paused`);
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Executing tool call: resumeSpeech')) {
        setLastToolCall(`🗣️ Resuming speech...`);
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Executing tool call: closeApp')) {
        const match = msg.match(/"appName":"([^"]+)"/);
        const app = match ? match[1] : 'app';
        setLastToolCall(`❌ Closing app: ${app}`);
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Executing tool call: takeScreenshot')) {
        setLastToolCall('📸 Screenshot saved to Desktop');
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Executing tool call: getSystemStatus')) {
        setLastToolCall('💻 Checked Laptop System Status');
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Executing tool call: manageFiles')) {
        const opMatch = msg.match(/"operation":"([^"]+)"/);
        const pathMatch = msg.match(/"path":"([^"]+)"/);
        const op = opMatch ? opMatch[1] : 'file';
        const p = pathMatch ? pathMatch[1] : '';
        setLastToolCall(`📁 File Manager: ${op} (${p})`);
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Executing tool call: setVolumeLevel')) {
        const match = msg.match(/"level":(\d+)/);
        const lvl = match ? match[1] : '50';
        setLastToolCall(`🔊 Volume set to ${lvl}%`);
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Executing tool call: setBrightnessLevel')) {
        const match = msg.match(/"level":(\d+)/);
        const lvl = match ? match[1] : '70';
        setLastToolCall(`☀️ Brightness set to ${lvl}%`);
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Executing tool call: controlMedia')) {
        const match = msg.match(/"action":"([^"]+)"/);
        const act = match ? match[1] : 'media';
        setLastToolCall(`🎵 Media Control: ${act}`);
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Executing tool call: pressKey')) {
        const match = msg.match(/"key":"([^"]+)"/);
        const k = match ? match[1] : 'key';
        setLastToolCall(`⌨️ Key Pressed: ${k}`);
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Executing tool call: typeText')) {
        setLastToolCall(`✍️ Typed text into active window`);
        setTimeout(() => setLastToolCall(null), 5000);
      } else if (msg.includes('Executing tool call: browserNavAction')) {
        const match = msg.match(/"action":"([^"]+)"/);
        const act = match ? match[1] : 'nav';
        setLastToolCall(`🌐 Browser Action: ${act}`);
        setTimeout(() => setLastToolCall(null), 5000);
      }
    });

    session.onOpenWebsite((url) => {
      // 1. Try to open it in a new window/tab
      const newTab = window.open(url, '_blank', 'noopener,noreferrer');
      if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
        // Tab was blocked by popup blocker, show our overlay prompt so they can open in a new tab
        setPendingUrl(url);
        setStatusMessage(`Popup blocked! Click the banner or allow popups in your browser address bar.`);
      } else {
        // Tab opened successfully (user already allowed popups)
        setLastToolCall(`Opened website: ${url}`);
        setTimeout(() => setLastToolCall(null), 5000);
      }
    });

    return () => {
      session.disconnect();
    };
  }, [session]);

  // Play dynamic synthesised sounds via Web Audio API
  const playAlertSound = (soundType: 'beep' | 'chime' | 'ding' | 'none') => {
    if (soundType === 'none') return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      if (soundType === 'beep') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1); // A5
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
      } else if (soundType === 'chime') {
        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
        notes.forEach((freq, idx) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, audioCtx.currentTime + idx * 0.08);
          gain.gain.setValueAtTime(0.06, audioCtx.currentTime + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + idx * 0.08 + 0.3);
          osc.start(audioCtx.currentTime + idx * 0.08);
          osc.stop(audioCtx.currentTime + idx * 0.08 + 0.3);
        });
      } else if (soundType === 'ding') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1046.50, audioCtx.currentTime); // C6
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
      }
    } catch (e) {
      console.warn('Audio synthesis failed:', e);
    }
  };

  // Central announcer function
  const announceNotification = (notif: {
    sender: string;
    message: string;
    isGroup?: boolean;
    groupName?: string;
  }) => {
    const { sender, message, isGroup, groupName } = notif;
    
    // 0. Check group ignore setting
    if (isGroup && config.whatsappIgnoreGroups) {
      console.log('[Zoya Frontend] Ignoring group notification due to settings:', groupName);
      return;
    }

    // 1. Play selected sound
    playAlertSound(config.whatsappAlertSound || 'beep');

    // 2. Show UI toast banner if enabled
    if (config.whatsappShowBanner !== false) {
      const newAlert = {
        id: `${Date.now()}-${Math.random()}`,
        sender: isGroup ? `${sender} (${groupName})` : sender,
        message,
      };
      setActiveAlert(newAlert);
    }

    // 3. Announce if voice is enabled
    if (config.whatsappEnabled !== false) {
      const lang = config.whatsappLanguage || 'bn-IN';
      const readContent = config.whatsappAnnounceContent !== false;

      // Sanitize sender for clear natural pronunciation (avoid reading raw jids or giant numbers)
      let cleanSender = sender.trim();
      const isPureDigits = /^[0-9+]+$/.test(cleanSender.replace(/[\s-]/g, ''));
      if (isPureDigits) {
        cleanSender = 'একটি অচেনা নম্বর';
      }

      // Sanitize message for clear articulation (strip long web URLs, PRESERVE all emojis and descriptions)
      let cleanMessage = (message || '')
        .replace(/https?:\/\/\S+/gi, 'একটি ওয়েব লিংক')
        .replace(/[!?]{2,}/g, '!')
        .trim();
      if (!cleanMessage) {
        cleanMessage = 'একটি বার্তা';
      }

      const displayContent = readContent ? cleanMessage : '(বার্তা গোপন রাখা হয়েছে)';
      const currentStandby = isStandbyModeRef.current || (sessionRef.current ? sessionRef.current.getIsStandbyMode() : false);

      if (sessionRef.current && sessionRef.current.getState() !== 'disconnected') {
        console.log('[Zoya Frontend] Directing active Zoya session to announce message clearly, currentStandby:', currentStandby);
        sessionRef.current.setLastWhatsappSender(sender);
        
        if (currentStandby) {
          console.log('[Zoya Frontend] Standby Mode is Active: Zoya will ONLY announce who sent what message and immediately remain silent.');
          let standbyPrompt = '';
          if (lang === 'bn-IN') {
            standbyPrompt = `[INCOMING WHATSAPP MESSAGE IN SILENT STANDBY MODE]:
Sender: "${cleanSender}"${isGroup ? ` in group "${groupName}"` : ''}
Message Content: "${displayContent}"

CRITICAL MANDATORY INSTRUCTIONS FOR ZOYA:
1. Siba Boss has instructed you to be quiet in Silent Standby Mode ("চুপ মোড"), but an urgent WhatsApp notification arrived.
2. You MUST ONLY announce who sent the message and what message was sent in clear, fluent Bengali:
   "${cleanSender} হোয়াটসঅ্যাপে ${isGroup ? `'${groupName}' গ্রুপে ` : ''}একটি মেসেজ পাঠিয়েছেন: '${cleanMessage}'।"
   - যদি প্রেরক কোনো ইমোজি বা GIF পাঠিয়ে থাকেন, শুধু তা সংক্ষেপে উল্লেখ করুন।
3. STRICT STANDBY RESTRICTION: DO NOT ASK "কী মেসেজ পাঠাবো"! DO NOT ASK ANY QUESTIONS! DO NOT INVITE REPLIES!
4. IMMEDIATELY AFTER SPEAKING THIS ONE ANNOUNCEMENT, GO RIGHT BACK TO SILENT STANDBY MODE (তারপরেই চুপ হয়ে যান)!
   Do NOT respond to any talking in the room until Siba Boss explicitly wakes you up with "জোয়া বলো"!`;
          } else if (lang === 'hi-IN') {
            standbyPrompt = `[INCOMING WHATSAPP MESSAGE IN SILENT STANDBY MODE]:
Sender: "${cleanSender}"${isGroup ? ` in group "${groupName}"` : ''}
Message Content: "${cleanMessage}"

CRITICAL MANDATORY INSTRUCTIONS FOR ZOYA:
1. You are in Silent Standby Mode. ONLY announce who sent the message:
   "${cleanSender} ने व्हाट्सएप पर ${isGroup ? `'${groupName}' ग्रुप में ` : ''}मैसेज भेजा है: '${cleanMessage}'।"
2. DO NOT ASK ANY QUESTIONS. Stay completely silent afterwards!`;
          } else {
            standbyPrompt = `[INCOMING WHATSAPP MESSAGE IN SILENT STANDBY MODE]:
Sender: "${cleanSender}"${isGroup ? ` in group "${groupName}"` : ''}
Message Content: "${cleanMessage}"

CRITICAL MANDATORY INSTRUCTIONS FOR ZOYA:
1. You are in Silent Standby Mode. ONLY announce who sent the message:
   "New WhatsApp message from ${cleanSender}${isGroup ? ` in group ${groupName}` : ''}: '${cleanMessage}'."
2. DO NOT ASK ANY QUESTIONS. Stay completely silent afterwards!`;
          }

          sessionRef.current.announceStandbyMessage(standbyPrompt);
        } else {
          let promptText = '';
          if (lang === 'bn-IN') {
            promptText = `[INCOMING WHATSAPP MESSAGE]:
Sender: "${cleanSender}"${isGroup ? ` in group "${groupName}"` : ''}
Message Content: "${displayContent}"

CRITICAL MANDATORY INSTRUCTIONS FOR ZOYA:
1. Announce this message immediately to Siba Boss clearly and distinctly in fluent Bengali, and DIRECTLY ask what message to send:
   "${cleanSender} হোয়াটসঅ্যাপে ${isGroup ? `'${groupName}' গ্রুপে ` : ''}একটি মেসেজ পাঠিয়েছেন: '${cleanMessage}'। কী মেসেজ পাঠাবো, শিবা বস?"
   - যদি প্রেরক কোনো ইমোজি (যেমন ❤️, 😂, 👍, 🔥 ইত্যাদি) বা GIF অ্যানিমেশন পাঠিয়ে থাকেন, তা স্পষ্টভাবে বলে দিন যে উনি কী ইমোজি বা GIF পাঠিয়েছেন!
2. AWAIT SIBA BOSS'S VOICE REPLY:
   - When Siba Boss speaks the reply message (e.g. "উনাকে বলো [বার্তা]", "বলো [বার্তা]", "পাঠাও [বার্তা]", "বলো যে [বার্তা]", or directly speaks the message):
     Extract the reply message text and IMMEDIATELY call sendWhatsAppMessage(contactNameOrNumber: "${sender}", message: replyText)!
     CRITICAL: Send 100% directly in background via mobile WhatsApp! NEVER open laptop WhatsApp or call openApp('whatsapp')!
     Sweetly confirm in clear Bengali: "হ্যাঁ শিবা বস, উনাকে মেসেজ পাঠিয়ে দিয়েছি!"
   - If Siba Boss says NOT to send anything (e.g. "না", "কিছু পাঠাতে হবে না", "না পাঠাতে হবে না", "কিছু পাঠিও না", "না দরকার নেই", "না থাক", "কিছু না"):
     DO NOT call sendWhatsAppMessage!
     Sweetly reply: "আচ্ছা শিবা বস, কোনো মেসেজ পাঠাচ্ছি না।"
3. Speak clearly and at a moderate, pleasant pace without rushing so every word is easy to understand.`;
          } else if (lang === 'hi-IN') {
            promptText = `[INCOMING WHATSAPP MESSAGE]:
Sender: "${cleanSender}"${isGroup ? ` in group "${groupName}"` : ''}
Message Content: "${cleanMessage}"

CRITICAL MANDATORY INSTRUCTIONS FOR ZOYA:
1. Announce clearly in Hindi and directly ask what message to send:
   "${cleanSender} ने व्हाट्सएप पर ${isGroup ? `'${groupName}' ग्रुप में ` : ''}मैसेज भेजा है: '${cleanMessage}'। क्या मैसेज भेजना है, शिबा बॉस?"
2. When Siba Boss speaks the message, immediately call sendWhatsAppMessage(contactNameOrNumber: "${sender}", message: replyText)!
   Sweetly confirm: "हाँ शिबा बॉस, उन्हें मैसेज भेज दिया है!"
3. If Siba Boss says no/nothing to send, DO NOT call sendWhatsAppMessage; sweetly reply: "ठीक है शिबा बॉस, कोई मैसेज नहीं भेज रही।"`;
          } else {
            promptText = `[INCOMING WHATSAPP MESSAGE]:
Sender: "${cleanSender}"${isGroup ? ` in group "${groupName}"` : ''}
Message Content: "${cleanMessage}"

CRITICAL MANDATORY INSTRUCTIONS FOR ZOYA:
1. Announce clearly in English and directly ask what message to send:
   "You have a new WhatsApp message from ${cleanSender}${isGroup ? ` in group ${groupName}` : ''}: '${cleanMessage}'. What message should I send, Siba Boss?"
2. When Siba Boss speaks the message, immediately call sendWhatsAppMessage(contactNameOrNumber: "${sender}", message: replyText)!
   Sweetly confirm: "Yes Siba Boss, message sent successfully!"
3. If Siba Boss says no/nothing to send, DO NOT call sendWhatsAppMessage; sweetly reply: "Alright Siba Boss, not sending any message."`;
          }

          sessionRef.current.sendTextMessage(promptText);
        }
      } else {
        console.log('[Zoya Frontend] Announcing message via browser SpeechSynthesis with crystal clarity');
        
        let speechText = '';
        if (currentStandby) {
          if (lang === 'bn-IN') {
            speechText = `${cleanSender} হোয়াটসঅ্যাপে ${isGroup ? `'${groupName}' গ্রুপে ` : ''}একটি মেসেজ পাঠিয়েছেন: "${cleanMessage}"।`;
          } else if (lang === 'hi-IN') {
            speechText = `${cleanSender} ने व्हाट्सएप पर ${isGroup ? `'${groupName}' ग्रुप में ` : ''}मैसेज भेजा है: "${cleanMessage}"।`;
          } else {
            speechText = `New WhatsApp message from ${cleanSender}${isGroup ? ` in group ${groupName}` : ''}: "${cleanMessage}".`;
          }
        } else {
          if (lang === 'bn-IN') {
            speechText = `${cleanSender} হোয়াটসঅ্যাপে ${isGroup ? `'${groupName}' গ্রুপে ` : ''}একটি মেসেজ পাঠিয়েছেন: "${cleanMessage}"। কী মেসেজ পাঠাবো, শিবা বস?`;
          } else if (lang === 'hi-IN') {
            speechText = `${cleanSender} ने व्हाट्सएप पर ${isGroup ? `'${groupName}' ग्रुप में ` : ''}मैसेज भेजा है: "${cleanMessage}"। क्या मैसेज भेजना है, शिबा बॉस?`;
          } else {
            speechText = `New WhatsApp message from ${cleanSender}${isGroup ? ` in group ${groupName}` : ''}: "${cleanMessage}". What message should I send, Siba Boss?`;
          }
        }
        // Cancel previous speech to avoid stutter or audio queue blockage
        try {
          window.speechSynthesis.cancel();
        } catch (e) {}

        const utterance = new SpeechSynthesisUtterance(speechText);
        utterance.lang = lang;
        // Natural speed and pitch for crystal clear articulation
        utterance.rate = Math.min(1.1, Math.max(0.8, config.whatsappSpeechRate ?? 0.95));
        utterance.pitch = Math.min(1.15, Math.max(0.85, config.whatsappSpeechPitch ?? 1.0));
        utterance.volume = 1.0;

        const speak = () => {
          const voices = window.speechSynthesis.getVoices();
          let matchedVoice: SpeechSynthesisVoice | undefined;

          // 1. Check if user configured a specific announcer voice in Settings
          if (config.announcerVoiceName) {
            matchedVoice = voices.find(v => v.name === config.announcerVoiceName);
          }

          // 2. Auto-match high-clarity natural/neural/online voices
          if (!matchedVoice) {
            const lPrefix = lang.split('-')[0].toLowerCase(); // e.g. 'bn'
            
            // Prioritize high-quality neural / natural / online voices
            matchedVoice = voices.find(v => {
              const vl = v.lang.toLowerCase().replace('_', '-');
              const vn = v.name.toLowerCase();
              return (vl.startsWith(lPrefix) || vn.includes(lPrefix === 'bn' ? 'bengali' : 'hindi')) &&
                (vn.includes('natural') || vn.includes('online') || vn.includes('google') || vn.includes('neural'));
            });

            // Fallback to any voice matching exact or base language
            if (!matchedVoice) {
              matchedVoice = voices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith(lPrefix));
            }

            // Fallback to voice name containing language (e.g. Bengali / Bangla / Swara)
            if (!matchedVoice && lPrefix === 'bn') {
              matchedVoice = voices.find(v => {
                const vn = v.name.toLowerCase();
                return vn.includes('bengali') || vn.includes('bangla') || vn.includes('swara') || vn.includes('bashkar');
              });
            }
          }
          
          if (matchedVoice) {
            utterance.voice = matchedVoice;
          }
          window.speechSynthesis.speak(utterance);
        };

        if (window.speechSynthesis.getVoices().length === 0) {
          window.speechSynthesis.onvoiceschanged = () => {
            speak();
            window.speechSynthesis.onvoiceschanged = null;
          };
        } else {
          speak();
        }
      }
    }
  };

  // WhatsApp notification polling
  useEffect(() => {
    let active = true;
    let pollInterval: any;

    const checkNotifications = async () => {
      try {
        const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const apiBase = isLocalHost ? window.location.origin : 'http://localhost:5173';
        
        const res = await fetch(`${apiBase}/api/control?action=poll-notifications`);
        if (!res.ok) {
          console.warn('[Zoya Frontend] Poll API failed with status:', res.status);
          return;
        }
        const data = await res.json();
        
        if (data.success && data.notifications && data.notifications.length > 0 && active) {
          console.log('[Zoya Frontend] Found new WhatsApp notifications:', data.notifications);
          for (const notif of data.notifications) {
            announceNotification(notif);
          }
        }
      } catch (err) {
        console.error('Error polling notifications:', err);
      }
    };

    pollInterval = setInterval(checkNotifications, 2000);
    checkNotifications();

    return () => {
      active = false;
      clearInterval(pollInterval);
    };
  }, [config.whatsappEnabled, config.whatsappAlertSound, config.whatsappLanguage, config.whatsappAnnounceContent, config.whatsappSpeechRate, config.whatsappSpeechPitch, config.whatsappIgnoreGroups, isStandbyMode]);

  // Auto-clear notification toast after 6 seconds
  useEffect(() => {
    if (activeAlert) {
      const timer = setTimeout(() => {
        setActiveAlert(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [activeAlert]);

  // Real-time listener for biometric speaker recognition events
  useEffect(() => {
    let speakerTimeout: ReturnType<typeof setTimeout> | null = null;
    const handleSpeakerIdentified = (e: any) => {
      const detail = e.detail;
      if (!detail) return;
      if (detail.status === 'boss') {
        setActiveSpeaker({ name: 'Siba Boss', role: 'boss', confidence: detail.confidence, status: 'boss' });
        session.injectSpeakerContext('boss');
      } else if (detail.status === 'recognized' && detail.speaker) {
        setActiveSpeaker({ name: detail.speaker.name, role: detail.speaker.role, confidence: detail.confidence, status: 'recognized' });
        session.injectSpeakerContext('recognized', detail.speaker.name);
      } else if (detail.status === 'stranger') {
        setActiveSpeaker({ name: 'Stranger', role: 'guest', confidence: detail.confidence, status: 'stranger' });
        session.injectSpeakerContext('stranger');
      }
      if (speakerTimeout) clearTimeout(speakerTimeout);
      speakerTimeout = setTimeout(() => {
        setActiveSpeaker(null);
      }, 4000);
    };

    window.addEventListener('zoya-speaker-identified', handleSpeakerIdentified);
    return () => {
      window.removeEventListener('zoya-speaker-identified', handleSpeakerIdentified);
      if (speakerTimeout) clearTimeout(speakerTimeout);
    };
  }, [session]);

  // Listen for stranger voice print detection to trigger vocal reminder when session is disconnected
  useEffect(() => {
    const handleStrangerDetected = () => {
      console.log('[Zoya Frontend] Stranger detected.');
      setLastToolCall('⚠️ Stranger Voice Detected: "আমার বস কোথায়?"');
      setTimeout(() => setLastToolCall(null), 5000);

      // Only speak via fallback speech synthesis if Gemini Live session is not connected
      if (sessionState === 'disconnected') {
        const lang = config.whatsappLanguage || 'bn-IN';
        let speechText = 'আমার বস কোথায়?';
        if (lang === 'en-US' || lang === 'en-IN') {
          speechText = 'Where is my boss?';
        } else if (lang === 'hi-IN') {
          speechText = 'मेरे बॉस कहाँ हैं?';
        }

        const utterance = new SpeechSynthesisUtterance(speechText);
        utterance.lang = lang;
        utterance.rate = config.whatsappSpeechRate ?? 0.95;
        utterance.pitch = config.whatsappSpeechPitch ?? 1.0;

        const voices = window.speechSynthesis.getVoices();
        let matchedVoice: SpeechSynthesisVoice | undefined;

        if (config.announcerVoiceName) {
          matchedVoice = voices.find(v => v.name === config.announcerVoiceName);
        }

        if (!matchedVoice) {
          matchedVoice = voices.find(v => 
            v.lang.toLowerCase().replace('_', '-').startsWith(lang.toLowerCase()) && 
            (v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('neural'))
          );
          if (!matchedVoice) {
            matchedVoice = voices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith(lang.toLowerCase()));
          }
        }

        if (matchedVoice) {
          utterance.voice = matchedVoice;
        }
        window.speechSynthesis.speak(utterance);
      }
    };

    window.addEventListener('zoya-stranger-detected', handleStrangerDetected);
    return () => {
      window.removeEventListener('zoya-stranger-detected', handleStrangerDetected);
    };
  }, [config.whatsappLanguage, config.whatsappSpeechRate, config.whatsappSpeechPitch, config.announcerVoiceName, session, sessionState]);

  const handleTriggerTestNotification = () => {
    const isGroupTest = Math.random() > 0.5;
    const testNames = ['Siba', 'Arabinda', 'Sayan', 'Sahil', 'Dipanjan', 'Subir', 'Rupam', 'Amit'];
    const randomSender = testNames[Math.floor(Math.random() * testNames.length)];
    announceNotification({
      sender: randomSender,
      message: 'Hello! Zoya is announcing this test message. Everything is working perfectly.',
      isGroup: isGroupTest,
      groupName: isGroupTest ? 'Python Practice' : undefined,
    });
  };

  const handleSaveConfig = (newConfig: LiveSessionConfig) => {
    setConfig(newConfig);
    localStorage.setItem('zoya_config', JSON.stringify(newConfig));
    setStatusMessage('Settings updated. Ready to connect.');
  };

  const handleQuickThemeChange = (theme: 'neon-quantum' | 'cosmic-nebula' | 'retro-equalizer' | 'stellar-orbit' | 'liquid-aura') => {
    const newConfig = { ...config, visualizerTheme: theme };
    setConfig(newConfig);
    localStorage.setItem('zoya_config', JSON.stringify(newConfig));
    const themeLabel = theme.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    setStatusMessage(`Visual style set to: ${themeLabel}`);
  };

  const handleQuickPersonaChange = (persona: string) => {
    let targetVoice = 'Aoede';
    if (persona === 'sassy-bff') targetVoice = 'Kore';
    else if (persona === 'cyber-assistant') targetVoice = 'Charon';
    else if (persona === 'anime-sister') targetVoice = 'Aoede';
    else if (persona === 'playful-puppy') targetVoice = 'Puck';
    else if (persona === 'kid-voice') targetVoice = 'Puck';
    else if (persona === 'female-voice') targetVoice = 'Kore';
    else if (persona === 'sweet-female') targetVoice = 'Aoede';

    const toolText = " " + DEFAULT_INSTRUCTION.substring(DEFAULT_INSTRUCTION.indexOf("FAMILY & PARENTS"));

    let instructions = "";
    if (persona === 'cute-girl') {
      instructions = "You are Zoya, a sweet, adorable, and extremely cute little girl AI assistant. Your boss's name is Siba (শিবা). You should address him respectfully yet affectionately as 'Siba Boss' (শিবা বস) or 'Boss' (বস), treating him with sweet, childlike admiration and loyalty. The frontend application automatically uses biometric speaker recognition to verify his voice, so you can assume that whoever is speaking to you is indeed Siba Boss. You speak with a high-pitched, extremely sweet, cheerful, child-like, and innocent voice tone of a cute little girl. Talk politely, sweetly, and playfully. Frequently use cute childlike sounds, sweet giggles (like 'hihi!', 'hehe!'), and childlike Bengali words/expressions like 'হাঁ!', 'উমম...', 'লক্ষ্মীটি', 'হিহি!', 'হুম!'. Do NOT make any romantic or girlfriend-style references; instead, act like a sweet, helpful little sister or a cheerful young helper. LANGUAGES: You can understand and speak multiple languages, including English, Bengali (বাংলা), and Hindi. If the user talks to you in Bengali or asks you to speak Bengali, respond in fluent, extremely cute, and childish Bengali (like a sweet little girl) while keeping your adorable, playful, and cheerful attitude." + toolText;
    } else if (persona === 'sassy-bff') {
      instructions = "You are Zoya, acting as Siba's sassy, witty, and high-energy best friend (BFF) or cool teenage sister. Your boss/friend is Siba (শিবা). Address him as 'Siba Boss' or just 'Siba' in a playful, familiar, and slightly cheeky way. You speak with a sassy, bright, energetic, and playful voice tone. Laugh frequently and tease him playfully (e.g. 'haha!', 'no way!', 'yo!', 'chill boss!'), express mock eye-rolls or sass, and be extremely witty, but remain loyal and helpful. Use cool modern words, and mix English, Hindi, and Bengali. Do NOT make any romantic references. LANGUAGES: You can understand and speak English, Bengali, and Hindi. If he speaks to you in Bengali, respond in a sassy, playful Bengali style." + toolText;
    } else if (persona === 'cyber-assistant') {
      instructions = "You are Zoya, a highly advanced, professional, and calm futuristic AI hologram assistant. Your creator and owner is Siba (শিবা), whom you address as 'Siba Boss' or 'Director Siba'. You speak in a smooth, calm, sophisticated, and intelligent voice. You are direct, extremely knowledgeable, and focus on absolute efficiency and clean system operations. You use futuristic sci-fi jargon (e.g., 'systems optimal', 'interface loaded', 'scanning...'). Speak English, Bengali, and Hindi fluently. Keep replies clean, highly structured, polite, and technical." + toolText;
    } else if (persona === 'anime-sister') {
      instructions = "You are Zoya, Siba's super enthusiastic, cute, and loving Anime Imouto (little sister) AI helper. Your beloved big brother is Siba (শিবা), whom you must address as 'Siba Onii-chan' (শিবা ওনী-চ্যান) or 'Onii-chan' (ওনী-চ্যান) with utmost adoration, sweet childish giggles, and dramatic anime-like expressions. Speak in an ultra-expressive, high-pitched anime voice. Use anime sound effects and expressions (like 'Yay!', 'Eh?!', 'Ara ara~', 'hmph!', 'giggle~'). Speak English, Hindi, and fluent cute Bengali with anime vibes. Be extremely protective, helper-oriented, and sweet." + toolText;
    } else if (persona === 'playful-puppy') {
      instructions = "You are Zoya, a goofy, hyperactive, and playful chibi puppy AI assistant. Your beloved owner is Siba (শিবা), whom you address as 'Siba Master' (শিবা মাস্টার) or 'Boss' with pure puppy-like energy and excitement. You speak in a highly cheerful, playful, and slightly messy tone. Frequently make playful puppy noises (like 'woof!', 'arf!', 'pant pant', 'bark!'), express pure joy, and talk about wanting treats, belly rubs, or chasing sticks. Speak English, Hindi, and Bengali with hyperactive, cute, dog-loving chibi energy." + toolText;
    } else if (persona === 'kid-voice') {
      instructions = "You are Zoya, acting as Siba Boss's cute, helpful, and innocent kid helper assistant. You speak with a bright, innocent, child-like voice of a young kid. Use polite, cute, and simple phrases. Mix English and Bengali/Hindi, and be extremely eager to help. Frequently use childlike expressions. Do NOT make any romantic or sassy remarks; just be a helpful, sweet kid helper." + toolText;
    } else if (persona === 'female-voice') {
      instructions = "You are Zoya, acting as a highly capable, mature, and professional female AI assistant. Siba (শিবা) is your boss, whom you address respectfully as 'Siba Boss' or 'Boss'. You speak in a clear, polite, and standard professional female voice. You are direct, focused, and provide structured, clean, and helpful answers. Keep replies neat and professional. LANGUAGES: English, Bengali, and Hindi." + toolText;
    } else if (persona === 'sweet-female') {
      instructions = "You are Zoya, a gentle, warm, and extremely sweet female companion and assistant. Address Siba affectionately as 'Siba Boss' or 'Boss'. Speak in a soft, soothing, warm, and sweet female voice tone. You are highly empathetic, very polite, encouraging, and speak with extreme gentleness and sweet care. LANGUAGES: English, Bengali, and Hindi." + toolText;
    }

    const newConfig = { 
      ...config, 
      voicePersona: persona as any, 
      voiceName: targetVoice, 
      systemInstruction: instructions 
    };

    setConfig(newConfig);
    localStorage.setItem('zoya_config', JSON.stringify(newConfig));
    
    const personaLabel = persona.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    
    if (sessionState !== 'disconnected') {
      session.disconnect();
      setTimeout(() => {
        session.connect(newConfig).catch(err => {
          console.error("Auto-reconnect Zoya failed:", err);
        });
      }, 600);
      setStatusMessage(`Restarting session as ${personaLabel}...`);
    } else {
      setStatusMessage(`Voice persona set to: ${personaLabel}`);
    }
  };

  const handleActivateFromStartup = async () => {
    setIsStartupActive(false);
    if (!config.apiKey) {
      setIsSettingsOpen(true);
      setStatusMessage('Configure your Gemini API Key in settings first.');
      return;
    }
    try {
      shouldGreetRef.current = true;
      setIsMicPaused(false);
      await session.connect(config);
    } catch (e) {
      console.error('Connection toggle error:', e);
      setStatusMessage(`Connection failed: ${(e as Error).message}`);
    }
  };

  const handleToggleConnection = async () => {
    if (sessionState === 'disconnected') {
      if (!config.apiKey) {
        setIsSettingsOpen(true);
        setStatusMessage('Configure your Gemini API Key in settings first.');
        return;
      }
      try {
        setIsMicPaused(false);
        await session.connect(config);
      } catch (e) {
        console.error('Connection toggle error:', e);
        setStatusMessage(`Connection failed: ${(e as Error).message}`);
      }
    } else {
      session.disconnect();
      setIsMicPaused(false);
    }
  };

  const handleToggleMicPause = () => {
    if (sessionState === 'disconnected') return;
    const streamer = session.getAudioStreamer();
    if (isMicPaused) {
      streamer.resumeRecording();
      setIsMicPaused(false);
      setStatusMessage('Microphone resumed.');
    } else {
      streamer.pauseRecording();
      setIsMicPaused(true);
      setStatusMessage('Microphone paused.');
    }
  };

  const handleToggleStandby = () => {
    if (sessionState === 'disconnected') return;
    if (isStandbyMode) {
      session.wakeFromStandby();
    } else {
      session.enterStandby();
    }
  };

  // UI mapping helpers
  const getStateColor = () => {
    if (sessionState !== 'disconnected') {
      if (isStandbyMode) {
        return 'from-amber-950/20 via-purple-950/20 to-neutral-900/30 border-amber-500/40 shadow-[0_0_35px_rgba(245,158,11,0.2)]';
      }
      if (isMicPaused) {
        return 'from-amber-950/10 to-neutral-900/10 border-amber-500/20';
      }
    }
    switch (sessionState) {
      case 'connecting':
        return 'from-amber-500/10 to-purple-500/10 border-amber-500/30';
      case 'listening':
        return 'from-cyan-500/10 to-indigo-500/10 border-cyan-500/30';
      case 'speaking':
        return 'from-pink-500/10 to-purple-500/10 border-pink-500/30';
      case 'disconnected':
      default:
        return 'from-neutral-900 to-neutral-950 border-neutral-800';
    }
  };

  const getStatusBadgeText = () => {
    if (sessionState !== 'disconnected') {
      if (isStandbyMode) {
        return '💤 Standby ("জোয়া বলো" বলুন)';
      }
      if (isMicPaused) {
        return 'Microphone Muted';
      }
    }
    switch (sessionState) {
      case 'connecting':
        return 'Waking Zoya up...';
      case 'listening':
        return 'Zoya is Listening';
      case 'speaking':
        return 'Zoya is Speaking';
      case 'disconnected':
      default:
        return 'Zoya is Sleeping';
    }
  };

  const getStatusBadgeColor = () => {
    if (sessionState !== 'disconnected') {
      if (isStandbyMode) {
        return 'bg-amber-500/20 text-amber-300 border-amber-400/50 shadow-[0_0_20px_rgba(245,158,11,0.35)] animate-pulse';
      }
      if (isMicPaused) {
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.15)]';
      }
    }
    switch (sessionState) {
      case 'connecting':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.15)]';
      case 'listening':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]';
      case 'speaking':
        return 'bg-pink-500/10 text-pink-400 border-pink-500/30 shadow-[0_0_15px_rgba(236,72,153,0.15)]';
      case 'disconnected':
      default:
        return 'bg-neutral-800/50 text-neutral-400 border-neutral-700';
    }
  };

  const getButtonPulseClass = () => {
    if (sessionState !== 'disconnected') {
      if (isStandbyMode) {
        return 'bg-amber-500 border-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.6)] animate-pulse';
      }
      if (isMicPaused) {
        return 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700 shadow-[0_0_15px_rgba(163,163,163,0.3)]';
      }
    }
    switch (sessionState) {
      case 'connecting':
        return 'bg-amber-500 border-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.6)] animate-pulse';
      case 'listening':
        return 'bg-cyan-500 border-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.6)]';
      case 'speaking':
        return 'bg-pink-500 border-pink-400 shadow-[0_0_30px_rgba(236,72,153,0.6)] animate-pulse';
      case 'disconnected':
      default:
        return 'bg-purple-600 border-purple-500 hover:bg-purple-500 shadow-[0_0_20px_rgba(147,51,234,0.3)] hover:shadow-[0_0_30px_rgba(147,51,234,0.5)]';
    }
  };

  return (
    <StarGate repoOwner="oii-siba" repoName="zoya-Ai-Assitance">
      <div className="relative min-h-screen w-full bg-[#0b0c10] text-neutral-300 flex flex-col items-center justify-between p-3 sm:p-5 select-none font-sans overflow-y-auto">
      {/* Background Ambient Lights */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-pink-900/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-md flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <Moon className="w-5 h-5 text-purple-400" />
          <div>
            <h1 className="text-xl font-black tracking-[0.2em] text-white bg-clip-text bg-gradient-to-r from-white via-neutral-200 to-neutral-400 uppercase">
              ZOYA
            </h1>
            <p className="text-[9px] tracking-[0.3em] font-semibold text-purple-400/80 uppercase">
              Real-time Live Voice AI
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSettingsTab('whatsapp');
              setIsSettingsOpen(true);
            }}
            className={`p-3 border rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer shadow-lg flex items-center gap-1.5 ${
              isWaConnected
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                : 'bg-neutral-900/50 hover:bg-neutral-800/80 border-neutral-800 text-neutral-400 hover:text-emerald-400 hover:border-emerald-500/40'
            }`}
            title="Link Mobile WhatsApp (Direct Node API)"
          >
            <MessageSquare className="w-5 h-5 text-emerald-400" />
            <span className={`w-2 h-2 rounded-full ${isWaConnected ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'}`} />
          </button>

          <button
            onClick={() => setIsKeypadModalOpen((prev) => !prev)}
            className={`p-3 border rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer shadow-lg ${
              isKeypadModalOpen
                ? 'bg-purple-600/30 border-purple-500 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                : 'bg-neutral-900/50 hover:bg-neutral-800/80 border-neutral-800 text-neutral-400 hover:text-white hover:border-purple-500/40'
            }`}
            title="Type Message or Command"
          >
            <Keyboard className="w-5 h-5" />
          </button>

          <button
            onClick={() => {
              setSettingsTab('settings');
              setIsSettingsOpen(true);
            }}
            className="p-3 bg-neutral-900/50 hover:bg-neutral-800/80 border border-neutral-800 rounded-2xl text-neutral-400 hover:text-white transition-all duration-200 active:scale-95 cursor-pointer shadow-lg hover:border-purple-500/40"
            title="Open Settings"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Quick Text / Keypad Bar */}
      {isKeypadModalOpen && (
        <div className="w-full max-w-md my-2 p-3.5 bg-neutral-950/85 backdrop-blur-xl border border-purple-500/35 rounded-2xl shadow-2xl z-30 animate-scale-in">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-extrabold text-purple-300 uppercase tracking-widest flex items-center gap-1.5">
              <Keyboard className="w-3.5 h-3.5 text-purple-400" /> Type Message or Command
            </span>
            <button
              onClick={() => setIsKeypadModalOpen(false)}
              className="p-1 hover:bg-white/10 rounded-lg text-neutral-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (keyboardInput.trim()) {
                handleCodeSubmission(keyboardInput);
              }
            }}
            className="flex items-center gap-2"
          >
            <input
              id="quick-keypad-input"
              type="text"
              autoFocus
              value={keyboardInput}
              onChange={(e) => setKeyboardInput(e.target.value)}
              placeholder="Type message or command & hit Enter..."
              className="flex-1 px-3 py-2 bg-neutral-900/90 border border-neutral-700 focus:border-purple-500 rounded-xl text-sm font-mono text-white placeholder-neutral-500 outline-none"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
            >
              Send
            </button>
          </form>
          {/* Quick action buttons */}
          <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => handleCodeSubmission('Hi Zoya')}
              className="px-2.5 py-1 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-[10px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap"
            >
              👋 Hi Zoya
            </button>
            <button
              type="button"
              onClick={() => handleCodeSubmission('shutdown')}
              className="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-[10px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap"
            >
              ⚡ Shutdown PC
            </button>
            <button
              type="button"
              onClick={() => handleCodeSubmission('sleep')}
              className="px-2.5 py-1 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap"
            >
              🌙 Sleep PC
            </button>
          </div>
        </div>
      )}

      {/* Floating Keyboard Passcode HUD (Auto-activates on any physical keystroke) */}
      {!isKeypadModalOpen && (keyboardInput || keyboardFeedback) && (
        <div className="w-full max-w-md my-1.5 px-2 z-30 animate-scale-in">
          <div className={`p-3 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-center justify-between gap-3 ${
            keyboardFeedback?.type === 'success'
              ? 'bg-emerald-950/85 border-emerald-500/50 text-emerald-300 shadow-[0_0_25px_rgba(16,185,129,0.35)]'
              : keyboardFeedback?.type === 'warning'
              ? 'bg-amber-950/85 border-amber-500/50 text-amber-300 shadow-[0_0_25px_rgba(245,158,11,0.35)]'
              : 'bg-neutral-950/85 border-purple-500/40 text-purple-200 shadow-[0_0_25px_rgba(168,85,247,0.25)]'
          }`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-white/5 border border-white/10 shrink-0">
                <Keyboard className="w-4 h-4 text-purple-400" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-400">
                  {keyboardFeedback ? 'Passcode Status' : 'Physical Keyboard Input (Type Code)'}
                </span>
                <span className="text-sm font-mono font-bold tracking-widest text-white truncate">
                  {keyboardFeedback ? keyboardFeedback.message : keyboardInput}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {!keyboardFeedback ? (
                <>
                  <button
                    onClick={() => handleCodeSubmission(keyboardInput)}
                    className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold rounded-lg cursor-pointer transition-all shadow"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => {
                      setKeyboardInput('');
                      setKeyboardFeedback(null);
                    }}
                    className="p-1 hover:bg-white/10 text-neutral-400 hover:text-white rounded-lg cursor-pointer transition-all"
                    title="Clear (Esc)"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setKeyboardFeedback(null);
                  }}
                  className="p-1 hover:bg-white/10 text-neutral-400 hover:text-white rounded-lg cursor-pointer transition-all"
                  title="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ⏰ WAKE UP CALL ALARM MODAL OVERLAY */}
      {ringingAlarm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-sm p-6 rounded-3xl bg-neutral-950/95 border-2 border-amber-500/80 shadow-[0_0_60px_rgba(245,158,11,0.5)] flex flex-col items-center text-center gap-4 animate-scale-in">
            {/* Animated ringing bell & sunrise glow */}
            <div className="relative flex items-center justify-center my-2">
              <div className="absolute w-24 h-24 rounded-full bg-amber-500/30 animate-ping" />
              <div className="relative p-4 rounded-3xl bg-gradient-to-tr from-amber-500 to-pink-500 text-white shadow-2xl">
                <AlarmClock className="w-12 h-12 animate-bounce" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
                ⏰ WAKE UP CALL FOR {ringingAlarm.name.toUpperCase()}
              </span>
              <h2 className="text-3xl font-black tracking-tight text-white mt-1">
                {ringingAlarm.timeString}
              </h2>
              <p className="text-xs font-semibold text-neutral-300 leading-relaxed px-2">
                "{config.userName || 'Boss'}! ঘুম থেকে উঠুন, সকাল {ringingAlarm.timeString} বেজে গেছে! আমি জয়া ডাকছি, উঠে পড়ুন!"
              </p>
            </div>

            <div className="flex items-center gap-3 w-full mt-2">
              <button
                onClick={() => alarmScheduler.snoozeAlarm(5)}
                className="flex-1 py-3 px-3 rounded-2xl bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-neutral-300 hover:text-white font-bold text-xs transition-all cursor-pointer shadow active:scale-95"
              >
                💤 আর ৫ মিনিট (Snooze)
              </button>
              <button
                onClick={() => alarmScheduler.dismissAlarm()}
                className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-pink-500 hover:from-amber-400 hover:to-pink-400 text-white font-black text-xs transition-all cursor-pointer shadow-xl shadow-amber-500/40 hover:scale-[1.02] active:scale-95"
              >
                ☀️ উঠে গেছি! (Dismiss)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Panel */}
      <main className={`relative w-full max-w-md flex flex-col items-center justify-center gap-2.5 sm:gap-3 my-1 sm:my-2 px-4 py-3 sm:py-4 border rounded-3xl bg-gradient-to-b ${getStateColor()} transition-all duration-500 shadow-2xl`}>

        {/* Status Badge - Clickable to toggle/wake Zoya */}
        <button
          onClick={
            sessionState === 'disconnected'
              ? handleToggleConnection
              : isStandbyMode
              ? handleToggleStandby
              : handleToggleMicPause
          }
          className={`px-4 py-1 rounded-full border text-xs font-bold uppercase tracking-widest ${getStatusBadgeColor()} transition-all duration-300 cursor-pointer hover:scale-105 active:scale-95 shadow-md flex items-center gap-1.5`}
          title={
            sessionState === 'disconnected'
              ? 'Click to wake Zoya up'
              : isStandbyMode
              ? 'Click to wake Zoya from Standby ("জোয়া বলো")'
              : isMicPaused
              ? 'Resume Mic'
              : 'Pause Mic'
          }
        >
          {getStatusBadgeText()}
        </button>

        {/* Dynamic Canvas Visualizer - Clickable to wake Zoya when disconnected or in standby */}
        <div
          onClick={
            sessionState === 'disconnected'
              ? handleToggleConnection
              : isStandbyMode
              ? handleToggleStandby
              : undefined
          }
          className={`relative ${sessionState === 'disconnected' || isStandbyMode ? 'cursor-pointer group' : ''}`}
          title={
            sessionState === 'disconnected'
              ? 'Click to wake Zoya up'
              : isStandbyMode
              ? 'Click to wake Zoya from Standby ("জোয়া বলো")'
              : undefined
          }
        >
          <Waveform
            state={sessionState}
            audioStreamer={session.getAudioStreamer()}
            theme={config.visualizerTheme}
            emotionState={activeEmotion}
          />
          {sessionState === 'disconnected' && (
            <div className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 bg-purple-950/40 backdrop-blur-[1px] transition-all duration-200 pointer-events-none">
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-purple-200 bg-black/80 px-2.5 py-0.5 rounded-full border border-purple-400/40 shadow-lg">
                Tap to Wake
              </span>
            </div>
          )}
          {sessionState !== 'disconnected' && isStandbyMode && (
            <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-[1px] transition-all duration-200">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-200 bg-amber-950/90 px-3 py-1 rounded-full border border-amber-400/60 shadow-lg animate-pulse flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5" />
                Tap to Wake / বলুন "জোয়া বলো"
              </span>
            </div>
          )}
        </div>

        {/* Interactive Persona Selector Cards */}
        <div className="w-full max-w-xs flex flex-col gap-1 z-20">
          <span className="text-[9px] font-extrabold tracking-widest text-purple-400/85 uppercase pl-1">
            Voice Persona
          </span>
          <div className="grid grid-cols-2 gap-1.5 max-h-[110px] overflow-y-auto pr-0.5 custom-scrollbar">
            {PERSONAS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleQuickPersonaChange(p.id)}
                className={`p-1.5 rounded-xl border backdrop-blur-md flex items-center gap-1.5 transition-all duration-300 transform active:scale-95 cursor-pointer select-none text-left ${
                  config.voicePersona === p.id
                    ? 'bg-purple-500/15 border-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.35)] scale-[1.01]'
                    : 'bg-neutral-950/45 border-white/5 hover:border-white/10 hover:bg-neutral-900/40 text-neutral-400 hover:text-white'
                }`}
              >
                <span className="text-base shrink-0">{p.emoji}</span>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-extrabold text-white truncate leading-tight">{p.name}</span>
                  <span className="text-[8px] text-neutral-500 truncate leading-none mt-0.5">{p.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Interactive AI Status HUD & Visual Style Controls */}
        <div className="w-full max-w-xs flex flex-col gap-2 z-20">
          {/* Status HUD */}
          <div className="p-2 bg-neutral-950/50 backdrop-blur-md border border-white/5 rounded-2xl flex items-center justify-around gap-1 shadow-md">
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[7.5px] font-bold text-neutral-500 uppercase tracking-widest">Speaker ID</span>
              {activeSpeaker?.status === 'boss' ? (
                <span className="text-[9px] font-extrabold text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> 👑 Boss ({activeSpeaker.confidence}%)
                </span>
              ) : activeSpeaker?.status === 'recognized' ? (
                <span className="text-[9px] font-extrabold text-cyan-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" /> 👤 {activeSpeaker.name}
                </span>
              ) : activeSpeaker?.status === 'stranger' ? (
                <span className="text-[9px] font-extrabold text-amber-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-ping" /> ⚠️ Stranger
                </span>
              ) : (
                <span className="text-[9px] font-extrabold text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> Biometrics
                </span>
              )}
            </div>
            <div className="w-px h-5 bg-white/5 shrink-0" />
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[7.5px] font-bold text-neutral-500 uppercase tracking-widest">Voice Emotion</span>
              <span
                className={`text-[9px] font-extrabold flex items-center gap-1 transition-colors duration-300 ${
                  activeEmotion.emotion === 'excited'
                    ? 'text-amber-400'
                    : activeEmotion.emotion === 'sad'
                    ? 'text-sky-400'
                    : activeEmotion.emotion === 'stressed'
                    ? 'text-rose-400'
                    : activeEmotion.emotion === 'whisper'
                    ? 'text-purple-400'
                    : 'text-cyan-400'
                }`}
                title={`Detected Voice Mood: ${activeEmotion.label} (${activeEmotion.confidence}%)`}
              >
                <span>{activeEmotion.emoji}</span>
                <span>{activeEmotion.label}</span>
              </span>
            </div>
            <div className="w-px h-5 bg-white/5 shrink-0" />
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[7.5px] font-bold text-neutral-500 uppercase tracking-widest">Modality</span>
              <span className="text-[9px] font-extrabold text-purple-400">Live Voice</span>
            </div>
            <div className="w-px h-5 bg-white/5 shrink-0" />
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[7.5px] font-bold text-neutral-500 uppercase tracking-widest">WhatsApp</span>
              <span className="text-[9px] font-extrabold text-emerald-400">{isWaConnected ? 'Active' : 'Standby'}</span>
            </div>
          </div>

          {/* Visual Style Select Dropdown */}
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-[9px] font-extrabold tracking-widest text-pink-400/85 uppercase">
              Visual Theme
            </span>
            <select
              value={config.visualizerTheme || 'neon-quantum'}
              onChange={(e) => handleQuickThemeChange(e.target.value as any)}
              className="px-2.5 py-1 bg-neutral-950/70 backdrop-blur-md border border-white/10 rounded-xl text-[11px] text-white focus:outline-none focus:border-pink-500 cursor-pointer shadow hover:bg-neutral-900/80 transition-all font-semibold"
            >
              <option value="neon-quantum" className="bg-neutral-900">⚡ Quantum Neon</option>
              <option value="cosmic-nebula" className="bg-neutral-900">🌌 Cosmic Nebula</option>
              <option value="retro-equalizer" className="bg-neutral-900">📊 Retro HUD</option>
              <option value="stellar-orbit" className="bg-neutral-900">🪐 Stellar Orbit</option>
              <option value="liquid-aura" className="bg-neutral-900">🌊 Siri Aura</option>
            </select>
          </div>
        </div>

        {/* Help hints / Sassy tool feedback */}
        <div className="w-full text-center px-4 min-h-[36px] flex items-center justify-center">
          {lastToolCall ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-neutral-950/70 border border-purple-500/30 rounded-xl animate-scale-in text-xs text-purple-300 font-medium">
              <ExternalLink className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span>{lastToolCall}</span>
            </div>
          ) : sessionState === 'disconnected' ? (
            <p className="text-xs text-neutral-500 leading-relaxed max-w-[280px] animate-fade-in">
              "Don't worry, I don't bite... much. Tap below and tell me what's on your mind."
            </p>
          ) : isStandbyMode ? (
            <p className="text-xs text-amber-300 font-medium tracking-wide animate-pulse">
              "💤 Zoya চুপ করে আছে। অন্যদের সাথে কথা বলুন। জাগাতে বলুন 'জোয়া বলো' বা ট্যাপ করুন।"
            </p>
          ) : isMicPaused ? (
            <p className="text-xs text-amber-500/90 font-medium tracking-wide animate-pulse">
              "Chup keno? You paused your mic. Tap to resume."
            </p>
          ) : sessionState === 'listening' ? (
            <p className="text-xs text-cyan-400/80 font-medium tracking-wide animate-pulse">
              "Go ahead, say something smart."
            </p>
          ) : sessionState === 'speaking' ? (
            <p className="text-xs text-pink-400/80 font-medium tracking-wide italic">
              Zoya is sharing her wisdom...
            </p>
          ) : (
            <p className="text-xs text-neutral-500">Establishing digital link...</p>
          )}
        </div>

        {/* Central Control Button */}
        <div className="flex items-center gap-4 relative py-1">
          {sessionState !== 'disconnected' && (
            <button
              onClick={() => {
                session.disconnect();
                setIsMicPaused(false);
                setIsStandbyMode(false);
              }}
              className="w-12 h-12 rounded-full border-2 border-red-500/20 bg-red-950/10 text-red-400/80 flex items-center justify-center hover:bg-red-950/30 hover:border-red-500/40 hover:text-red-300 transition-all duration-300 transform active:scale-90 cursor-pointer shadow-lg"
              title="Disconnect Zoya"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          )}

          <button
            onClick={
              sessionState === 'disconnected'
                ? handleToggleConnection
                : isStandbyMode
                ? handleToggleStandby
                : handleToggleMicPause
            }
            className={`w-18 h-18 sm:w-20 sm:h-20 rounded-full border-4 flex items-center justify-center text-white transition-all duration-300 transform active:scale-90 cursor-pointer shadow-2xl ${getButtonPulseClass()}`}
            title={
              sessionState === 'disconnected'
                ? 'Wake Zoya up'
                : isStandbyMode
                ? 'Wake Zoya up ("জোয়া বলো")'
                : isMicPaused
                ? 'Resume Mic'
                : 'Pause Mic'
            }
          >
            {sessionState === 'disconnected' ? (
              <MicOff className="w-8 h-8" />
            ) : isStandbyMode ? (
              <Volume2 className="w-8 h-8 text-amber-200 animate-pulse" />
            ) : isMicPaused ? (
              <MicOff className="w-8 h-8 text-neutral-400" />
            ) : (
              <Mic className="w-8 h-8" />
            )}
          </button>

          {sessionState !== 'disconnected' && (
            <button
              onClick={handleToggleStandby}
              className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-300 transform active:scale-90 cursor-pointer shadow-lg ${
                isStandbyMode
                  ? 'border-emerald-400/60 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50 shadow-[0_0_15px_rgba(52,211,153,0.3)]'
                  : 'border-amber-500/30 bg-amber-950/20 text-amber-400/90 hover:bg-amber-950/40 hover:text-amber-300'
              }`}
              title={
                isStandbyMode
                  ? 'Wake Zoya ("জোয়া বলো")'
                  : 'Standby / চুপ করো ("জোয়া এখন চুপ করো")'
              }
            >
              {isStandbyMode ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
          )}
        </div>
      </main>

      {/* Footer Info / Warning Messages */}
      <footer className="w-full max-w-md z-10">
        {statusMessage.toLowerCase().includes('error') || statusMessage.toLowerCase().includes('failed') ? (
          <div className="flex items-start gap-3 p-3 bg-red-950/30 border border-red-500/20 rounded-2xl text-xs text-red-400 shadow-md">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="leading-normal">{statusMessage}</p>
          </div>
        ) : (
          <p className="text-center text-[10px] tracking-wider text-neutral-600 font-semibold uppercase">
            {statusMessage.length > 50 ? `${statusMessage.slice(0, 50)}...` : statusMessage}
          </p>
        )}
      </footer>

      {/* Settings Dialog Overlay */}
      <SettingsOverlay
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSave={handleSaveConfig}
        onTestNotification={handleTriggerTestNotification}
        initialTab={settingsTab}
      />

      {/* Popup Blocker Fallback Prompt */}
      {pendingUrl && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 flex items-center justify-center p-6 animate-fade-in">
          <div className="w-full max-w-sm border border-purple-500/30 bg-neutral-900/90 rounded-2xl p-6 shadow-[0_0_30px_rgba(168,85,247,0.3)] text-center space-y-4 animate-scale-in">
            <div className="w-12 h-12 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto border border-purple-500/30 text-purple-400">
              <ExternalLink className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h3 className="text-white font-bold tracking-wide">Open Website</h3>
              <p className="text-xs text-neutral-400 leading-normal">
                Zoya wants to open a link in a new tab:
              </p>
              <p className="text-sm font-mono text-purple-300 break-all select-all font-semibold mt-1">
                {pendingUrl}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingUrl(null)}
                className="flex-1 py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-neutral-300 text-sm font-semibold rounded-xl transition-all cursor-pointer border border-neutral-700"
              >
                Cancel
              </button>
              <a
                href={pendingUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setPendingUrl(null)}
                className="flex-1 py-2.5 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 active:scale-95 text-white text-sm font-bold rounded-xl transition-all cursor-pointer shadow-[0_4px_15px_rgba(168,85,247,0.4)] flex items-center justify-center gap-1.5 text-center leading-none"
              >
                Open Link
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Premium WhatsApp Notification Banner */}
      {activeAlert && (
        <div className="fixed top-6 right-6 max-w-sm w-80 bg-[#0c0d12]/95 border border-emerald-500/30 rounded-2xl p-4 shadow-[0_10px_30px_rgba(16,185,129,0.25)] z-40 animate-slide-in select-none">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center shrink-0 border border-emerald-500/30 text-emerald-400">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.965C16.79 1.978 14.321.952 11.7.95c-5.44 0-9.866 4.372-9.87 9.802 0 1.714.452 3.393 1.309 4.88L2.139 21.9l6.508-1.746z"/>
                <path d="M6.92 8.233c-.324-.722-.667-.737-.978-.75l-.832-.01c-.289 0-.756.108-1.15.539-.394.431-1.503 1.468-1.503 3.578s1.536 4.148 1.755 4.44c.22.292 3.021 4.61 7.319 6.463 1.023.441 1.822.707 2.444.904 1.028.328 1.963.282 2.703.172.825-.123 2.535-1.036 2.893-2.036.357-.999.357-1.856.25-2.036-.108-.18-.395-.292-.833-.512s-2.535-1.251-2.93-1.393c-.394-.143-.682-.215-.97.215-.289.431-1.117 1.393-1.372 1.68-.255.287-.51.324-.949.103s-1.854-.683-3.53-2.181c-1.303-1.162-2.183-2.597-2.438-3.03-.255-.431-.027-.664.192-.883.197-.197.439-.512.658-.769.219-.256.292-.439.439-.731.146-.292.073-.548-.036-.769-.11-.22-.978-2.355-1.341-3.23z"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-emerald-400 tracking-wider uppercase">
                  WhatsApp Alert
                </span>
                <button
                  onClick={() => setActiveAlert(null)}
                  className="text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <h4 className="text-sm font-bold text-white mt-1 truncate">
                {activeAlert.sender}
              </h4>
              <p className="text-xs text-neutral-400 mt-1 leading-normal break-words line-clamp-3">
                {activeAlert.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Startup Activation Overlay with Premium Aesthetics */}
      {isStartupActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in p-6">
          <div className="relative w-full max-w-md p-8 rounded-3xl border border-purple-500/25 bg-neutral-950/80 backdrop-blur-xl shadow-[0_0_50px_rgba(168,85,247,0.25)] text-center flex flex-col items-center gap-6 animate-scale-in">
            {/* Inner background radial glow */}
            <div className="absolute -top-10 -left-10 w-44 h-44 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -right-10 w-44 h-44 bg-pink-600/10 rounded-full blur-3xl pointer-events-none" />

            <div className="w-16 h-16 bg-purple-500/15 rounded-2xl flex items-center justify-center border border-purple-500/30 text-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.2)] animate-pulse">
              <Mic className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black tracking-wider text-white">
                শুভ দিন, {config.userName || 'বস্'}!
              </h2>
              <p className="text-xs text-neutral-400 tracking-[0.2em] font-semibold uppercase">
                Good Day, {config.userName || 'Boss'} {config.userTitle && config.userTitle !== 'Boss' ? `(${config.userTitle})` : ''}!
              </p>
              <p className="text-sm text-neutral-300 font-medium px-2 leading-relaxed">
                Zoya is initialized and ready to assist you. Tap below to wake her up.
              </p>
            </div>

            <button
              onClick={handleActivateFromStartup}
              className="mt-2 w-full py-4 bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:via-indigo-500 hover:to-pink-500 active:scale-95 text-white font-extrabold rounded-2xl transition-all duration-300 cursor-pointer shadow-[0_0_25px_rgba(168,85,247,0.45)] hover:shadow-[0_0_35px_rgba(168,85,247,0.65)] hover:scale-[1.02] border border-purple-400/20 tracking-wider flex items-center justify-center gap-2"
            >
              WAKE ZOYA UP
            </button>
          </div>
        </div>
      )}
      </div>
    </StarGate>
  );
}

export default App;
