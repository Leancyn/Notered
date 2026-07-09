/**
 * challenge.js - Random Challenge Feature for Notered
 * 
 * Provides interactive daily writing challenges with a cute cat mascot
 * and chat bubble interface, designed specifically for female users.
 */

const STORAGE_KEY_CHALLENGE = 'notered_challenge_log';
const STORAGE_KEY_COMPLETED = 'notered_completed_challenges';

// SVG icons for the cat mascot (for use in text where emoji would be)
const CAT_ICON_SVG = '<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:var(--cat-pink);vertical-align:middle;"><circle cx="12" cy="12" r="10"/><path d="M8 10c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm8 0c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z"/><path d="M12 17c-1.1 0-2-.9-2-2h2c0 .55.45 1 1 1s1-.45 1-1c0-1.1-.9-2-2-2-1.1 0-2 .9-2 2H9c0-1.1.9-2 2-2 1.1 0 2 .9 2 2s-.9 2-2 2z"/></svg>';

// Action icons for challenge actions
const ICONS_START = '<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
const ICONS_COMPLETE = '<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
const ICONS_WRITE = '<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
const ICONS_DRAW = '<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;"><path d="M12 19l7-7 3 3-7 7-3-3zM2 7l3-3 7 7-3 3-7-7z"/></svg>';
const ICONS_NEXT = '<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 6.59L12 20l8-8-8-8z"/></svg>';

// Export icons for use in app.js
export { CAT_ICON_SVG, ICONS_START, ICONS_COMPLETE, ICONS_WRITE, ICONS_DRAW, ICONS_NEXT };

// SVG icons for categories (replacing emoji)
const ICONS = {
  selfLove: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
  gratitude: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/></svg>',
  creativity: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-5-5 1.41-1.41L11 14.17l7.59-7.59L20 8l-9 9z"/></svg>',
  reflection: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;"><path d="M12 3v10l3 3"/><path d="M12 5a7 7 0 1 0 7 7 7 7 0 0 0-7-7z"/><path d="M5 12h2"/><path d="M15 12h2"/></svg>',
  fun: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
};

// Challenge categories with feminine-focused themes
const CHALLENGE_CATEGORIES = [
  {
    label: 'Self Love',
    icon: ICONS.selfLove,
    challenges: [
      "Tulis 5 hal yang paling kamu suka dari diri sendiri hari ini, misalnya mau gimana aja",
      "Apa yang bikin kamu merasa cantik tanpa makeup? Ceritain dong!",
      "Tulis surat cinta buat diri kamu sendiri yang udah bertahan sejauh ini",
      "Deskripsikan momen bahagiamu yang paling intense pernah kamu alami",
      "Apa pencapaian kecil yang bikin kamu senyum-senyum sendiri belakangan ini?",
      "Ceritakan kekuatan yang kamu punya tapi belum sadari seberat apanya",
      "Apa yang mau kamu ubah dari cara kamu melihat diri sendiri?",
      "Mau mulai tradisi apa untuk diri sendiri? Tulis rencananya yuk!",
    ]
  },
  {
    label: 'Gratitude',
    icon: ICONS.gratitude,
    challenges: [
      "Sebutin 10 hal yang kamu syukuri hari ini, dari besar sampai kecil",
      "Tuliskan orang yang paling kamu sayang dan kenapa dia spesial buat kamu",
      "Apa keajaiban kecil yang selama ini kamu abaikan?",
      "Ceritakan sahabat yang udah mengguncang hidupmu dengan kehadirannya",
      "Apa pengalaman yang bikin kamu makin grateful karena jadi wanita?",
      "Tuliskan makanan yang bikin kamu ingat rumah dan keluarga",
      "Apa bantuan kecil yang orang lakuin buat kamu hari ini?",
    ]
  },
  {
    label: 'Creativity',
    icon: ICONS.creativity,
    challenges: [
      "Buat cerpen tentang kucing yang bisa ngomong apa aja, ada nggak nih?",
      "Tulislah puisi tentang senja di kotamu yang paling kamu suka",
      "Bayangin kamu punya kekuatan super, langsung tulis petualanganmu",
      "Tuliskan dialog obrolan seru antara kamu dan 10 tahun kemudaan",
      "Buat wishlist 10 tahun kedepan, mau jadi apa kamu?",
      "Ceritakan dunia di mana kamu bisa jadi superhero yang mana?",
      "Tulisin surat buat diri kamu versi impian 5 tahun lagi",
      "Mau keterampilan apa yang pengin kamu kuasai? Tulis planningnya!",
    ]
  },
  {
    label: 'Reflection',
    icon: ICONS.reflection,
    challenges: [
      "Tuliskan keputusan penting yang udah kamu ambil tahun ini",
      "Apa pelajaran terberat yang kamu dapat akhir-akhir ini?",
      "Ceritakan momen ajaib ketika kamu merasa 'ini memang hidupku'",
      "Apa yang mau kamu pelajari dari perjalanan diri sendiri?",
      "Mau mulai perubahan kecil apa buat diri kamu mulai hari ini?",
      "Tabiat buruk apa yang pengin kamu putuskan sekarang juga?",
      "Kebiasaan baru apa yang mau kamu tanam di hidup?",
      "1 bulan lagi mau capai apa? Tulis resolusinya yuk!",
    ]
  },
  {
    label: 'Fun',
    icon: ICONS.fun,
    challenges: [
      "Petualangan apa yang pengin kamu alami di hidup nyata?",
      "Buat daftar 'things to try before 30' versi kamu sendiri",
      "Liburan impianmu di mana? Ceritain detailnya dong!",
      "Skill apa yang mau kamu kuasai tapi belum sempat coba?",
      "Restoran apa yang mau jadi tempat makan malam pertama?",
      "Rencanakan surprise ulang tahunmu yang akan datang!",
      "Buat playlist lagu buat mood-mood berbeda yang kamu punya",
      "Aktivitas seru bareng sahabatmu kapan terakhir kali?",
    ]
  }
];

// Motivational messages from the cat mascot
const CHALLENGE_MESSAGES = [
  "Aku yakin kamu pasti bisa ngerjain tantangan ini, sayang!",
  "Kamu hebat, aku yakin bisa menyelesaikannya dengan mudah!",
  "Tulis dengan bahagia, aku tunggu di sini sambil ngemil snack virtual!",
  "Aku kangen liat hasilnya nih, seru banget pasti!",
  "Wanita super! Ayo selesaikan tantangan ini yuk!",
  "Kayaknya tantangan ini pas banget buat kamu hari ini deh!",
  "Aku beli kopi virtual buat kamu yang udah ngeyelesaikan!",
  "Cantik dan kuat! Ayo tulis hal yang menginspirasi kamu!",
];

// Encouragement messages based on completion count
const ENCOURAGEMENT_MESSAGES = [
  "Hai, cantik! Siap ngelatih menulis hari ini?",
  "Waktunya nulis! Kamu pasti bakal hebat!",
  "Ada tantangan baru nih, ayooo langsung cobain!",
  "Hari baru, tantangan baru! Yuk mulai sekarang!",
  "Kamu sudah berhasil sejauh ini, lanjutkan yuk!",
  "Aku bangga sama kamu, teruslah berkarya ya!",
];

export class ChallengeManager {
  constructor(options = {}) {
    this.onShowChallenge = options.onShowChallenge || (() => {});
    this.onComplete = options.onComplete || (() => {});
    
    this._currentChallenge = null;
    this._completedCount = this._loadCompletedCount();
    this._todayCompleted = this._checkTodayCompleted();
  }

  /** Get all challenge categories */
  static getCategories() {
    return CHALLENGE_CATEGORIES.map((cat, index) => ({
      label: cat.label,
      icon: cat.icon,
      count: cat.challenges.length
    }));
  }

  /** Get a random challenge by category or all */
  getRandomChallenge(categoryIndex = null) {
    if (categoryIndex !== null && CHALLENGE_CATEGORIES[categoryIndex]) {
      const challenges = CHALLENGE_CATEGORIES[categoryIndex].challenges;
      const challenge = challenges[Math.floor(Math.random() * challenges.length)];
      return {
        text: challenge,
        category: CHALLENGE_CATEGORIES[categoryIndex].label,
        icon: CHALLENGE_CATEGORIES[categoryIndex].icon,
        id: `${categoryIndex}_${Date.now()}`
      };
    }
    
    // Random from all categories
    const catIndex = Math.floor(Math.random() * CHALLENGE_CATEGORIES.length);
    const challenges = CHALLENGE_CATEGORIES[catIndex].challenges;
    const challenge = challenges[Math.floor(Math.random() * challenges.length)];
    
    return {
      text: challenge,
      category: CHALLENGE_CATEGORIES[catIndex].label,
      icon: CHALLENGE_CATEGORIES[catIndex].icon,
      id: `random_${Date.now()}`
    };
  }

  /** Get today's challenge (deterministic based on date) */
  getTodaysChallenge() {
    const today = new Date();
    const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    
    // Use day of year to get consistent challenge for the day
    const catIndex = dayOfYear % CHALLENGE_CATEGORIES.length;
    const challengeIndex = Math.floor(dayOfYear / 7) % CHALLENGE_CATEGORIES[catIndex].challenges.length;
    
    const challenge = CHALLENGE_CATEGORIES[catIndex].challenges[challengeIndex];
    
    return {
      text: challenge,
      category: CHALLENGE_CATEGORIES[catIndex].label,
      icon: CHALLENGE_CATEGORIES[catIndex].icon,
      id: `today_${today.toISOString().split('T')[0]}`
    };
  }

  /** Get a random motivational message from the cat mascot */
  static getMotivationalMessage() {
    return CHALLENGE_MESSAGES[Math.floor(Math.random() * CHALLENGE_MESSAGES.length)];
  }

  /** Get a random encouragement message */
  static getEncouragementMessage() {
    const hour = new Date().getHours();
    let idx = hour % ENCOURAGEMENT_MESSAGES.length;
    return ENCOURAGEMENT_MESSAGES[idx];
  }

  /** Complete the current challenge */
  completeChallenge() {
    if (this._todayCompleted) return false;
    
    this._completedCount++;
    this._todayCompleted = true;
    
    const today = new Date().toISOString().split('T')[0];
    const completed = this._loadCompletedChallenges();
    completed.push(today);
    this._saveCompletedChallenges(completed);
    this._saveCompletedCount();
    
    this.onComplete(this._completedCount);
    return true;
  }

  /** Check if today's challenge is already completed */
  isTodayCompleted() {
    return this._todayCompleted;
  }

  /** Get total completed challenges count */
  getCompletedCount() {
    return this._completedCount;
  }

  /** Load completed count from storage */
  _loadCompletedCount() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY_COMPLETED) || '{"count":0}');
      return data.count || 0;
    } catch {
      return 0;
    }
  }

  /** Save completed count to storage */
  _saveCompletedCount() {
    try {
      localStorage.setItem(STORAGE_KEY_COMPLETED, JSON.stringify({ count: this._completedCount }));
    } catch (e) {
      console.warn('Failed to save challenge count:', e);
    }
  }

  /** Load completed dates */
  _loadCompletedChallenges() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_CHALLENGE) || '[]');
    } catch {
      return [];
    }
  }

  /** Save completed dates */
  _saveCompletedChallenges(dates) {
    try {
      localStorage.setItem(STORAGE_KEY_CHALLENGE, JSON.stringify(dates));
    } catch (e) {
      console.warn('Failed to save completed challenges:', e);
    }
  }

  /** Check if today's challenge was completed */
  _checkTodayCompleted() {
    const completed = this._loadCompletedChallenges();
    const today = new Date().toISOString().split('T')[0];
    return completed.includes(today);
  }
}

// Create singleton instance
let challengeManagerInstance = null;
export function getChallengeManager() {
  if (!challengeManagerInstance) {
    challengeManagerInstance = new ChallengeManager();
  }
  return challengeManagerInstance;
}