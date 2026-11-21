/**
 * Alarm & Timed Wake-Up Call Scheduler for Zoya AI
 * Schedules exact wake-up alarms and reminders with persistent localStorage,
 * Web Audio morning chimes, and vocal name-calling in fluent Bengali.
 */

export interface AlarmItem {
  id: string;
  targetTimestamp: number; // unix ms
  timeString: string; // e.g. "07:00 AM" or "10 mins"
  name: string; // "Siba Boss"
  purpose: string; // "ঘুম থেকে ওঠা" / "wake up"
  active: boolean;
  createdAt: number;
}

const STORAGE_KEY = 'zoya_scheduled_alarms';

export class AlarmSchedulerService {
  private alarms: AlarmItem[] = [];
  private checkInterval: any = null;
  private audioCtx: AudioContext | null = null;
  private isAlarmRinging = false;
  private activeRingingAlarm: AlarmItem | null = null;
  private ringingSpeechInterval: any = null;

  constructor() {
    this.loadAlarms();
    this.startTicker();
  }

  private loadAlarms(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: AlarmItem[] = JSON.parse(stored);
        // Retain only active alarms that haven't expired more than 10 mins ago
        const now = Date.now();
        this.alarms = parsed.filter(a => a.active && a.targetTimestamp > now - 600000);
      }
    } catch (e) {
      this.alarms = [];
    }
  }

  private saveAlarms(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.alarms));
    } catch (e) {}
  }

  private startTicker(): void {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.checkInterval = setInterval(() => {
      this.checkDueAlarms();
    }, 1000);
  }

  private checkDueAlarms(): void {
    const now = Date.now();
    for (const alarm of this.alarms) {
      if (alarm.active && now >= alarm.targetTimestamp) {
        alarm.active = false;
        this.saveAlarms();
        this.triggerAlarm(alarm);
        break;
      }
    }
  }

  /**
   * Triggers the alarm: plays sound, speaks Siba Boss's name, and dispatches UI event
   */
  public triggerAlarm(alarm: AlarmItem): void {
    this.isAlarmRinging = true;
    this.activeRingingAlarm = alarm;

    console.log(`[AlarmScheduler] WAKE-UP ALARM TRIGGERED for "${alarm.name}" at ${alarm.timeString}!`);

    // 1. Dispatch custom event for UI Overlay
    window.dispatchEvent(
      new CustomEvent('zoya-alarm-triggered', {
        detail: alarm,
      })
    );

    // 2. Play beautiful melodic chime
    this.playWakeUpMelody();

    // 3. Vocally call Siba Boss by his name
    this.speakWakeUpCall(alarm);

    // Repeat vocal call every 8 seconds until dismissed
    if (this.ringingSpeechInterval) clearInterval(this.ringingSpeechInterval);
    this.ringingSpeechInterval = setInterval(() => {
      if (!this.isAlarmRinging) {
        clearInterval(this.ringingSpeechInterval);
        return;
      }
      this.playWakeUpMelody();
      this.speakWakeUpCall(alarm);
    }, 8500);
  }

  /**
   * Speaks the wake-up call calling Siba Boss's name out loud
   */
  private speakWakeUpCall(alarm: AlarmItem): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const name = alarm.name || 'শিবা বস';
    const timeStr = alarm.timeString;
    
    // Construct rich natural Bengali wake up message
    const wakeUpText = `${name}! ${name}! উঠুন, সময় হয়ে গেছে! এখন ${timeStr} বাজে! গুড মর্নিং ${name}! ঘুম থেকে উঠে পড়ুন!`;

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(wakeUpText);
      utterance.lang = 'bn-IN';
      utterance.rate = 1.0;
      utterance.pitch = 1.1;

      // Try to find a pleasant Bengali or Hindi or female voice
      const voices = window.speechSynthesis.getVoices();
      const bnVoice = voices.find(v => v.lang.includes('bn') || v.name.toLowerCase().includes('bengali'));
      const hiVoice = voices.find(v => v.lang.includes('hi') || v.name.toLowerCase().includes('hindi'));
      const femaleVoice = voices.find(v => v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('zira') || v.name.toLowerCase().includes('google'));

      if (bnVoice) utterance.voice = bnVoice;
      else if (hiVoice) utterance.voice = hiVoice;
      else if (femaleVoice) utterance.voice = femaleVoice;

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('[AlarmScheduler] Speech error:', e);
    }
  }

  /**
   * Plays a gentle, pleasant morning bell melody via Web Audio API
   */
  public playWakeUpMelody(): void {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const ctx = this.audioCtx;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 (Bright cheerful chord)
      const now = ctx.currentTime;

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.18);

        gain.gain.setValueAtTime(0.001, now + idx * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.25, now + idx * 0.18 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.18 + 1.2);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.18);
        osc.stop(now + idx * 0.18 + 1.3);
      });
    } catch (e) {
      console.warn('[AlarmScheduler] Audio melody error:', e);
    }
  }

  /**
   * Stops the currently ringing alarm
   */
  public dismissAlarm(): void {
    this.isAlarmRinging = false;
    this.activeRingingAlarm = null;
    if (this.ringingSpeechInterval) {
      clearInterval(this.ringingSpeechInterval);
      this.ringingSpeechInterval = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      // Sweet acknowledgment
      const ack = new SpeechSynthesisUtterance('আচ্ছা শিবা বস! গুড মর্নিং, আপনার দিনটি অনেক সুন্দর কাটুক!');
      ack.lang = 'bn-IN';
      window.speechSynthesis.speak(ack);
    }
    window.dispatchEvent(new CustomEvent('zoya-alarm-dismissed'));
  }

  /**
   * Snoozes the alarm by 5 minutes
   */
  public snoozeAlarm(minutes = 5): AlarmItem | null {
    if (!this.activeRingingAlarm) return null;
    const old = this.activeRingingAlarm;
    this.dismissAlarm();
    const result = this.scheduleAlarm(`in ${minutes} minutes`, old.name, old.purpose);
    return result.alarm || null;
  }

  /**
   * Parses time input and schedules a new wake-up alarm or reminder
   */
  public scheduleAlarm(timeStr: string, name = 'Siba Boss', purpose = 'ঘুম থেকে ওঠা'): {
    success: boolean;
    alarm?: AlarmItem;
    formattedTime?: string;
    remainingMinutes?: number;
    error?: string;
  } {
    if (!timeStr) {
      return { success: false, error: 'Time string is required' };
    }

    const cleanInput = this.normalizeDigits(timeStr.toLowerCase().trim());
    const now = new Date();
    let targetTime: Date | null = null;

    // Pattern 1: Relative duration ("in 10 minutes", "10 min", "10 minute", "5m", "1 hour", "1 ghonta")
    const relMinMatch = cleanInput.match(/(\d+)\s*(?:m|min|mins|minute|minutes|মিনিট)/);
    const relHourMatch = cleanInput.match(/(\d+)\s*(?:h|hr|hrs|hour|hours|ঘন্টা|ঘণ্টা)/);
    const relSecMatch = cleanInput.match(/(\d+)\s*(?:s|sec|secs|second|seconds|সেকেন্ড)/);

    if (relMinMatch || relHourMatch || relSecMatch) {
      let addMs = 0;
      if (relMinMatch) addMs += parseInt(relMinMatch[1], 10) * 60 * 1000;
      if (relHourMatch) addMs += parseInt(relHourMatch[1], 10) * 60 * 60 * 1000;
      if (relSecMatch) addMs += parseInt(relSecMatch[1], 10) * 1000;

      targetTime = new Date(now.getTime() + addMs);
    } else {
      // Pattern 2: Absolute time (e.g. "07:00", "7:30", "7:00 am", "8 pm", "7 ta", "shokal 7 tay", "rat 10 tay")
      let isPM = cleanInput.includes('pm') || cleanInput.includes('রাত') || cleanInput.includes('সন্ধ্যা') || cleanInput.includes('বিকাল') || cleanInput.includes('দুপুর');
      let isAM = cleanInput.includes('am') || cleanInput.includes('সকাল') || cleanInput.includes('ভোর');

      // Extract hours and minutes
      const timeMatch = cleanInput.match(/(\d{1,2})(?::(\d{2}))?/);
      if (timeMatch) {
        let hour = parseInt(timeMatch[1], 10);
        const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;

        if (isPM && hour < 12) hour += 12;
        if (isAM && hour === 12) hour = 0;

        targetTime = new Date(now);
        targetTime.setHours(hour, minute, 0, 0);

        // If target time has already passed today, schedule for tomorrow!
        if (targetTime.getTime() <= now.getTime()) {
          targetTime.setDate(targetTime.getDate() + 1);
        }
      }
    }

    if (!targetTime || isNaN(targetTime.getTime())) {
      return { success: false, error: `Could not understand time: "${timeStr}"` };
    }

    const diffMinutes = Math.round((targetTime.getTime() - now.getTime()) / 60000);
    const formatted = targetTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const newAlarm: AlarmItem = {
      id: `alarm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      targetTimestamp: targetTime.getTime(),
      timeString: formatted,
      name: name || 'Siba Boss',
      purpose: purpose || 'ঘুম থেকে ওঠা',
      active: true,
      createdAt: Date.now(),
    };

    this.alarms.push(newAlarm);
    this.saveAlarms();

    console.log(`[AlarmScheduler] Scheduled alarm for ${newAlarm.name} at ${formatted} (in ${diffMinutes} mins).`);

    return {
      success: true,
      alarm: newAlarm,
      formattedTime: formatted,
      remainingMinutes: diffMinutes,
    };
  }

  public cancelAllAlarms(): number {
    const count = this.alarms.filter(a => a.active).length;
    this.alarms = [];
    this.saveAlarms();
    return count;
  }

  public getActiveAlarms(): AlarmItem[] {
    const now = Date.now();
    return this.alarms.filter(a => a.active && a.targetTimestamp > now);
  }

  public getIsRinging(): boolean {
    return this.isAlarmRinging;
  }

  public getActiveRingingAlarm(): AlarmItem | null {
    return this.activeRingingAlarm;
  }

  private normalizeDigits(str: string): string {
    const bDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    let res = str;
    bDigits.forEach((d, idx) => {
      res = res.replaceAll(d, String(idx));
    });
    return res;
  }
}

export const alarmScheduler = new AlarmSchedulerService();
