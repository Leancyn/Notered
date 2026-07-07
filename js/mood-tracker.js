/**
 * mood-tracker.js - Daily Mood Tracker & Journal Prompts for Notered
 *
 * Provides mood selection, daily journaling prompts, and streak tracking
 * to enhance the writing experience with emotional reflection.
 * Uses SVG icons instead of emojis for a polished, app-like experience.
 */

const STORAGE_KEY_MOOD = 'notered_mood_log';
const STORAGE_KEY_STREAK = 'notered_writing_streak';

// Mood options with SVG icon, label, and color
const MOOD_OPTIONS = [
  {
    label: 'Senang',
    color: '#F5C542',
    bg: 'rgba(245,197,66,0.15)',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>'
  },
  {
    label: 'Sayang',
    color: '#FFB5C2',
    bg: 'rgba(255,181,194,0.15)',
    svg: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
  },
  {
    label: 'Cantik',
    color: '#F0A8D0',
    bg: 'rgba(240,168,208,0.15)',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/></svg>'
  },
  {
    label: 'Bersemangat',
    color: '#FFD93D',
    bg: 'rgba(255,217,61,0.15)',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
  },
  {
    label: 'Tenang',
    color: '#A8D8EA',
    bg: 'rgba(168,216,234,0.15)',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
  },
  {
    label: 'Lelah',
    color: '#C0C0C0',
    bg: 'rgba(192,192,192,0.15)',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 17s-2 2-4 2-4-2-4-2"/><line x1="8" y1="7" x2="10" y2="9"/><line x1="14" y1="7" x2="16" y2="9"/></svg>'
  },
  {
    label: 'Sedih',
    color: '#A0A0D0',
    bg: 'rgba(160,160,208,0.15)',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 15s2-2 4-2 4 2 4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>'
  },
  {
    label: 'Marah',
    color: '#E07070',
    bg: 'rgba(224,112,112,0.15)',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 9l2 2M14 9l2 2M8 16h8"/></svg>'
  },
];

const JOURNAL_PROMPTS = [
  "Apa hal kecil yang membuatmu tersenyum hari ini?",
  "Tulis 3 hal yang kamu syukuri saat ini",
  "Apa mimpimu yang paling indah akhir-akhir ini?",
  "Ceritakan tentang seseorang yang kamu sayangi",
  "Apa yang membuatmu merasa cantik hari ini?",
  "Tulis surat cinta untuk dirimu sendiri",
  "Apa lagu yang mewakili perasaanmu?",
  "Hal apa yang ingin kamu pelajari minggu ini?",
  "Apa tempat favoritmu untuk bersantai?",
  "Ceritakan memori indah masa kecilmu",
  "Apa yang akan kamu lakukan jika tidak ada batasan?",
  "Tulis afirmasi positif untuk hari esok",
  "Apa warna yang mewakili perasaanmu hari ini?",
  "Hal baik yang kamu lakukan untuk dirimu hari ini?",
  "Apa yang kamu tunggu-tunggu saat ini?",
  "Ceritakan tentang sahabat terbaikmu",
  "Apa hal paling berani yang pernah kamu lakukan?",
  "Tulis tentang buku/film yang menginspirasimu",
  "Apa rutinitas kecil yang membuatmu bahagia?",
  "Jika kamu punya satu hari sempurna, seperti apa?",
];

const AFFIRMATIONS = [
  "Kamu cukup, apa adanya.",
  "Hari ini adalah hadiah, nikmati setiap detiknya.",
  "Kamu kuat, bahkan di hari yang terasa berat.",
  "Cantik itu bukan penampilan, tapi hatimu yang hangat.",
  "Setiap langkah kecilmu berarti besar.",
  "Kamu pantas mendapatkan cinta dan kebahagiaan.",
  "Berhenti membandingkan dirimu dengan orang lain.",
  "Kamu adalah karya seni yang sedang dalam proses.",
  "Izinkan dirimu untuk beristirahat.",
  "Kamu berharga, jangan pernah lupakan itu.",
  "Tersenyumlah, hari baru telah menanti.",
  "Kamu hebat karena kamu bertahan sejauh ini.",
  "Hari yang indah dimulai dari pikiran yang indah.",
  "Kamu layak untuk hal-hal baik dalam hidup.",
  "Jangan lupa tersenyum pada bayanganmu di cermin.",
];

export class MoodTracker {
  constructor() {
    this._todayMood = null;
    this._init();
  }

  _init() {
    const today = this._getTodayKey();
    const stored = this._loadMoodLog();
    if (stored[today] !== undefined) {
      this._todayMood = stored[today];
    }
  }

  static getMoodOptions() { return MOOD_OPTIONS; }

  static getDailyPrompt() {
    const today = new Date();
    const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    return JOURNAL_PROMPTS[dayOfYear % JOURNAL_PROMPTS.length];
  }

  static getAllPrompts() { return JOURNAL_PROMPTS; }

  static getRandomAffirmation() {
    return AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)];
  }

  static getAllAffirmations() { return AFFIRMATIONS; }

  setMood(moodIndex) {
    const mood = MOOD_OPTIONS[moodIndex];
    if (!mood) return;
    const today = this._getTodayKey();
    const stored = this._loadMoodLog();
    stored[today] = moodIndex;
    this._saveMoodLog(stored);
    this._todayMood = moodIndex;
    this._updateStreak();
  }

  getTodayMood() {
    if (this._todayMood !== null && this._todayMood !== undefined) {
      return MOOD_OPTIONS[this._todayMood] || null;
    }
    return null;
  }

  getMoodHistory(days = 7) {
    const stored = this._loadMoodLog();
    const history = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const key = this._formatDateKey(date);
      const moodIdx = stored[key];
      history.push({
        date: key,
        dateLabel: date.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' }),
        moodIndex: moodIdx !== undefined ? moodIdx : null,
        mood: moodIdx !== undefined ? MOOD_OPTIONS[moodIdx] || null : null,
      });
    }
    return history;
  }

  getStreak() { return this._loadStreak(); }

  markWrittenToday() { this._updateStreak(); }

  _getTodayKey() { return this._formatDateKey(new Date()); }

  _formatDateKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
  }

  _loadMoodLog() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_MOOD) || '{}'); }
    catch { return {}; }
  }

  _saveMoodLog(log) {
    try { localStorage.setItem(STORAGE_KEY_MOOD, JSON.stringify(log)); }
    catch (e) { console.warn('Failed to save mood log:', e); }
  }

  _loadStreak() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_STREAK) || '{"count":0,"lastDate":null}'); }
    catch { return { count: 0, lastDate: null }; }
  }

  _saveStreak(data) {
    try { localStorage.setItem(STORAGE_KEY_STREAK, JSON.stringify(data)); }
    catch (e) { console.warn('Failed to save streak:', e); }
  }

  _updateStreak() {
    const today = this._getTodayKey();
    const streak = this._loadStreak();
    if (streak.lastDate === today) return;
    const yesterday = this._formatDateKey(new Date(Date.now() - 86400000));
    if (streak.lastDate === yesterday) streak.count += 1;
    else if (streak.lastDate !== today) streak.count = 1;
    streak.lastDate = today;
    this._saveStreak(streak);
  }

  getStats() {
    const stored = this._loadMoodLog();
    const entries = Object.keys(stored).length;
    const moodCounts = {};
    Object.values(stored).forEach((idx) => { moodCounts[idx] = (moodCounts[idx] || 0) + 1; });
    let mostCommonIdx = null, mostCommonCount = 0;
    Object.entries(moodCounts).forEach(([idx, count]) => {
      if (count > mostCommonCount) { mostCommonCount = count; mostCommonIdx = parseInt(idx); }
    });
    return { totalEntries: entries, mostCommonMood: mostCommonIdx !== null ? MOOD_OPTIONS[mostCommonIdx] : null, moodCounts };
  }
}