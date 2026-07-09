/**
 * typo-patterns.js — Comprehensive Indonesian typo pattern library.
 *
 * Design:
 * - Single-source-of-truth for all hardcoded correction mappings.
 * - Phonetic variants generated lazily per-query (not at module load).
 * - All maps are frozen Object.create(null) for fast property lookup.
 */

// ---------------------------------------------------------------------------
// Tidak-baku (informal/colloquial) → baku corrections
// These are style flags, not outright errors.
// ---------------------------------------------------------------------------
const TIDAK_BAKU_MAP = Object.freeze(Object.assign(Object.create(null), {
  // === Abbreviations / slang (Wattpad/chat style) ===
  'aja'   : 'saja',
  'aj'    : 'saja',
  'sj'    : 'saja',
  'banget': 'sekali',
  'bgt'   : 'sekali',
  'bgtu'  : 'begitupun',
  'bner'  : 'benar',
  'gini'  : 'begini',
  'gitu'  : 'begitu',
  'gtu'   : 'begitu',
  'gt'    : 'begitu',
  'gimana': 'bagaimana',
  'gmn'   : 'bagaimana',
  'gmna'  : 'bagaimana',
  'kayak' : 'seperti',
  'kaya'  : 'seperti',
  'kyk'   : 'seperti',
  'cuma'  : 'hanya',
  'cuman' : 'hanya',
  'emang' : 'memang',
  'mang'  : 'memang',
  'udah'  : 'sudah',
  'dah'   : 'sudah',
  'blm'   : 'belum',
  'blom'  : 'belum',
  'nggak' : 'tidak',
  'ngak'  : 'tidak',
  'gak'   : 'tidak',
  'ga'    : 'tidak',
  'ngga'  : 'tidak',
  'g'     : 'tidak',
  'dgn'   : 'dengan',
  'dg'    : 'dengan',
  'utk'   : 'untuk',
  'dlm'   : 'dalam',
  'ttg'   : 'tentang',
  'krn'   : 'karena',
  'krna'  : 'karena',
  'knapa' : 'mengapa',
  'knp'   : 'mengapa',
  'yg'    : 'yang',
  'adl'   : 'adalah',
  'sy'    : 'saya',
  'sya'   : 'saya',
  'syaa'  : 'saya',
  'kmrn'  : 'kemarin',
  'bsk'   : 'besok',
  'jm'    : 'jam',
  'mnt'   : 'menit',
  'dtk'   : 'detik',
  'hr'    : 'hari',
  'hari'  : 'hari',
  'jgn'   : 'jangan',
  'jangan': 'jangan',
  'skrg'  : 'sekarang',
  'skrng' : 'sekarang',
  'sikat' : 'tangkap',
  'brg'   : 'barang',
  'sdh'   : 'sudah',
  'tdk'   : 'tidak',
  'blm2'  : 'belum',
  'jg'    : 'juga',
  'spt'   : 'seperti',
  'kpd'   : 'kepada',
  'dr'    : 'dari',
  'pd'    : 'pada',
  'sm'    : 'sama',
  'ama'   : 'sama',

  // Kata tidak baku per KBBI
  'faham'  : 'paham',
  'hapak'  : 'hapak',
  'praktek': 'praktik',
  'sistim' : 'sistem',
  'resiko' : 'risiko',
  'analisa': 'analisis',
  'aktip'  : 'aktif',
  'nopember': 'november',
  'pebruari': 'februari',
  'ijin'   : 'izin',
  'jaman'  : 'zaman',
  'sholat' : 'salat',
  'shalat' : 'salat',
  'insyaallah': 'insyaallah',
  'subhanallah': 'subhanallah',
  'alhamdulilah': 'alhamdulillah',
  'terimakasih': 'terima kasih',
  'terima kasih': 'terima kasih',
  'tanda tangan': 'tanda tangan',
  'silahkan': 'silakan',
  'klo'   : 'kalau',
  'kalo'  : 'kalau',
  'dulu'  : 'dahulu',
  'dlu'   : 'dahulu',
  // === Informal pronouns & possessives ===
  'gw'    : 'saya',
  'gue'   : 'saya',
  'lo'    : 'kamu',
  'lu'    : 'kamu',
  'elo'   : 'kamu',
  'ente'  : 'kamu',
  'kau'   : 'kamu',
  'anda'  : 'kamu',
  'aku'   : 'saya',
  'gue'   : 'saya',
  'ane'   : 'saya',
  'han'   : 'saya',
  'hendi' : 'saya',
  'saya'  : 'saya',
  
  // === Future / uncertainty ===
  'bakal' : 'akan',
  'kan'   : 'akan',
  'entar' : 'nanti',
  'ntar'  : 'nanti',
  'nntn'  : 'nanti',
  'siapa' : 'siapa',
  'sapa'  : 'siapa',
  'kapan' : 'kapan',
  'kpn'   : 'kapan',
  'dimana': 'di mana',
  'mna'   : 'mana',
  'kenapa': 'mengapa',
  'knp'   : 'mengapa',
  'nape'  : 'mengapa',
  
  // === Bahasa Betawi (Jakarta slang) ===
  'begah' : 'begah', 'begah2' : 'begah',
  'gede'  : 'besar', 'gedhang' : 'pisang',
  'buaya' : 'buaya', 'bocah' : 'anak', 'bocil' : 'anak kecil',
  'cewek' : 'perempuan', 'cowok' : 'laki-laki',
  'nyet'  : 'anjing', 'kampret' : 'kampret',
  'brengsek' : 'brengsek', 'breng' : 'brengsek',
  'jancok' : 'jancok', 'jancuk' : 'jancuk',
  'bangsat' : 'bangsat', 'kampret' : 'kampret',
  'goblok' : 'goblok', 'tolol' : 'tolol',
  'idiot' : 'idiot', 'gagal' : 'gagal',
  'keren' : 'keren', 'kece' : 'keren',
  'gercep' : 'cepat', 'cepat' : 'cepat',
  'cepet'  : 'cepat', 'cepil' : 'cepat',
  'galak'  : 'galak', 'garang' : 'garang',
  'barang' : 'barang', 'barang2' : 'barang-barang',
  'dagelan' : 'dagelan', 'lawak' : 'lucu',
  'libur'  : 'libur', 'liburan' : 'liburan',
  'kerja'  : 'kerja', 'kerjanya' : 'kerjanya',
  'pulang' : 'pulang', 'plg' : 'pulang',
  'makan'  : 'makan', 'makanan' : 'makanan',
  'minum'  : 'minum', 'ngombe' : 'minum',
  'mandi'  : 'mandi', 'mandiin' : 'mandikan',
  'tidur'  : 'tidur', 'turu' : 'tidur',
  'bangun' : 'bangun', 'banget' : 'sekali',
  'sedang' : 'sedang', 'lg' : 'lagi',
  'lagi'   : 'lagi', 'lg' : 'lagi',
  'capek'  : 'capek', 'cape' : 'capek',
  'lelah'  : 'lelah', 'lemes' : 'lemas',
  'sakit'  : 'sakit', 'sakit2' : 'sakit-sakit',
  'pusing' : 'pusing', 'pusing2' : 'pusing-pusing',
  'tenggorokan' : 'tenggorokan', 'geli' : 'jijik',
  
  // === Bahasa Jawa ===
  'mlebu'  : 'masuk', 'metu' : 'keluar',
  'saka'   : 'dari', 'saking' : 'dari',
  'mriko'  : 'sana', 'mrene' : 'sini',
  'neng'   : 'di', 'nengendi' : 'dimana',
  'kowe'   : 'kamu', 'kowé' : 'kamu',
  'kulo'   : 'saya', 'dalem' : 'saya',
  'dhèwèké': 'dia', 'dheweke' : 'dia',
  'mangan' : 'makan', 'ngombe' : 'minum',
  'turu'   : 'tidur', 'tangi' : 'bangun',
  'mlaku'  : 'jalan', 'mlayu' : 'lari',
  'golek'  : 'cari', 'gojek' : 'cari',
  'buka'   : 'buka', 'tutup' : 'tutup',
  'urus'   : 'urus', 'urusan' : 'urusan',
  'gratis' : 'gratis', 'pisan' : 'sangat',
  'pinter' : 'pintar', 'pinter2' : 'pintar-pintar',
  'alhamdulillah': 'alhamdulillah',
  'matur'  : 'matur', 'matur nuwun' : 'terima kasih',
  'nuwun'  : 'minta', 'nunggu' : 'tunggu',
  'nggih'  : 'iya', 'mbok' : 'jangan',
  'aja'    : 'jangan', 'aja2' : 'jangan-jangan',
  'meneng' : 'diam', 'menenga' : 'diam',
  
  // === Bahasa Sunda ===
  'minggat' : 'pergi', 'balik' : 'kembali',
  'pondes'  : 'ganteng', 'nuang' : 'cantik',
  'katut'   : 'ikut', 'sokat' : 'dapat',
  'sorang'  : 'satu', 'deui' : 'lagi',
  'ulantik' : 'panjang', 'pendek' : 'pendek',
  'ngagara' : 'sakit', 'nginum' : 'minum',
  'leu'     : 'lari', 'rurumpa' : 'buru-buru',
  'nginum'  : 'minum', 'kanyah' : 'makan',
  'hati'    : 'hati', 'hati-hati' : 'hati-hati',
  'sare'    : 'tidur', 'tumbeu' : 'bangun',
  'tungtung': 'tunggu', 'katung' : 'tunggu',
  'nginget' : 'ingat', 'ngalup' : 'lupa',
  'paham'   : 'paham', 'ngartos' : 'mengerti',
  'teu'     : 'tidak', 'hiji' : 'satu',
  'dua'     : 'dua', 'tilu' : 'tiga',
  'opat'    : 'empat', 'lima' : 'lima',
  'genep'   : 'enam', 'pitu' : 'tujuh',
  'daé'     : 'delapan', 'salapan' : 'sembilan',
  'sapuluh' : 'sepuluh', 'belas' : 'belas',
  'puluh'   : 'puluh', 'atus' : 'ratus',
  'beta'    : 'saya', 'maneh' : 'kamu',
  'anjeun'  : 'kamu', 'anjeunna' : 'dia',
  'urang'   : 'kita', 'barudak' : 'anak-anak',
  'purwa'   : 'baru', 'lila' : 'lama',
  
  // === Common actions ===
  'abis'  : 'habis',
  'abiss' : 'habis',
  'abis2' : 'habis',
  'bentar': 'sebentar',
  'sebentar': 'sebentar',
  'ketemu': 'bertemu',
  'ketemuan': 'bertemu',
  'ketmu' : 'bertemu',
  'bawa'  : 'bawa',
  'bawain': 'bawakan',
  'bawaan': 'bawaan',
  'kasih' : 'beri',
  'kasiin': 'berikan',
  'kasian': 'kasihan',
  'nyari' : 'mencari',
  'cari'  : 'mencari',
  'cariin': 'mencari',
  'liat'  : 'lihat',
  'nyalon': 'menyalon',
  'nyobain': 'mencoba',
  'coba'  : 'mencoba',
  'cobain': 'mencoba',
  'ngeliat': 'melihat',
  'ngelihat': 'melihat',
  'ngeliatin': 'melihat',
  'ngomong': 'berbicara',
  'omong' : 'berbicara',
  'omel'  : 'omelan',
  'bikin' : 'membuat',
  'bikin2': 'membuat',
  'dpt'   : 'dapat',
  'dapet' : 'dapat',
  'dapetin': 'mendapat',
  'dikasih': 'diberikan',
  'dikasihin': 'diberikan',
  'kita'  : 'kita',
  'kami'  : 'kami',
  'ngerasain': 'merasakan',
  'ngerasainnya': 'merasakannya',
  'tinggal': 'tinggal',
  'tinggalin': 'tinggalkan',
  'tinggalkn': 'tinggalkan',
  'harus' : 'harus',
  'hrs'   : 'harus',
  'bisa'  : 'bisa',
  'bsa'   : 'bisa',
  't mau': 'tidak mau',
  'tidaak': 'tidak',
  'tidakk': 'tidak',
  'tida'  : 'tidak',
  'ngga'  : 'tidak',
  'nggak' : 'tidak',
  'balik' : 'kembali',
  'balikin': 'kembalikan',
  'pulang': 'pulang',
  'plg'   : 'pulang',
  'jd'    : 'jadi',
  'jdi'   : 'jadi',
  'jga'   : 'juga',
  'juga'  : 'juga',
  'j'     : 'juga',
  'krg'   : 'kurang',
  'kurang' : 'kurang',
  'kp'    : 'kepada',
  'lm'    : 'lama',
  'lama'  : 'lama',
  'lg'    : 'lagi',
  'lagii' : 'lagi',
  'lekas' : 'lekas',
  'lgs'   : 'langsung',
  'langsung': 'langsung',
  'malam' : 'malam',
  'malem' : 'malam',
  'mlm'   : 'malam',
  'pagi'  : 'pagi',
  'pgi'   : 'pagi',
  'sore'  : 'sore',
  'siang' : 'siang',
  'sng'   : 'sangat',
  'sangat' : 'sangat',
  'sgt'   : 'sangat',
  'sangat2': 'sangat-sangat',

  // === Food & beverages (kehidupan sehari-hari) ===
  'nasi'  : 'nasi', 'nasi goreng' : 'nasi goreng',
  'goreng': 'goreng', 'gorengan' : 'gorengan',
  'sate'  : 'sate', 'sate ayam' : 'sate',
  'rendang' : 'rendang', 'padang' : 'padang',
  'makanan': 'makanan', 'minuman' : 'minuman',
  'kopi'  : 'kopi', 'teh' : 'teh',
  'es'    : 'es', 'dingin' : 'dingin',
  'panas' : 'panas', 'hangat' : 'hangat',
  'pedas' : 'pedas', 'asin' : 'asin',
  'manis' : 'manis', 'pahit' : 'pahit',
  'asam'  : 'asam', 'asin' : 'asin',
  'segar' : 'segar', 'fresh' : 'segar',
  'enak'  : 'enak', 'lezat' : 'lezat',
  'masak' : 'masak', 'memasak' : 'memasak',
  'bumbu' : 'bumbu', 'bumbui' : 'membumbui',
  'resep' : 'resep', 'menu' : 'menu',
  'sarapan': 'sarapan', 'makan siang' : 'makan siang',
  'makan malam' : 'makan malam', 'snack' : 'camilan',
  'camilan': 'camilan', 'jajan' : 'jajan',
  'jagung' : 'jagung', 'singkong' : 'singkong',
  'ubi'   : 'ubi', 'kentang' : 'kentang',
  'sayur' : 'sayur', 'buah' : 'buah',
  'daging': 'daging', 'ayam' : 'ayam',
  'ikan'  : 'ikan', 'udang' : 'udang',
  'sapi'  : 'sapi', 'kambing' : 'kambing',
  'bumbu' : 'bumbu', 'merica' : 'merica',
  'garam' : 'garam', 'gula' : 'gula',
  'minyak': 'minyak', 'susu' : 'susu',
  'telur' : 'telur', 'roti' : 'roti',
  'mie'   : 'mie', 'pasta' : 'pasta',
  'sushi' : 'sushi', 'pizza' : 'pizza',
  'burger': 'burger', 'hotdog' : 'hotdog',
  'fried chicken' : 'ayam goreng', 'kfc' : 'kfc',
  
  // === Transportation (transportasi sehari-hari) ===
  'mobil' : 'mobil', 'motor' : 'motor',
  'sepeda': 'sepeda', 'helmet' : 'helm',
  'helm'  : 'helm', 'seatbelt' : 'sabuk pengaman',
  'ojol'  : 'ojol', 'gojek' : 'gojek',
  'grab'  : 'grab', 'uber' : 'uber',
  'angkot': 'angkot', 'bus' : 'bus',
  'becak' : 'becak', 'bemo' : 'bemo',
  'kereta': 'kereta', 'kerta api' : 'kereta api',
  'taksi' : 'taksi', 'toll' : 'tol',
  'jalan' : 'jalan', 'jalanan' : 'jalanan',
  'lalu lintas' : 'lalu lintas', 'macet' : 'macet',
  'macet' : 'macet', 'pemadam' : 'pemadam',
  'parkir': 'parkir', 'parkiran' : 'parkiran',
  'stasiun': 'stasiun', 'bandara' : 'bandara',
  'pelabuhan' : 'pelabuhan', 'kapal' : 'kapal',
  'pesawat': 'pesawat', 'penerbangan' : 'penerbangan',
  
  // === Housing & daily life ===
  'rumah' : 'rumah', 'apartemen' : 'apartemen',
  'kost'  : 'kost', 'kontrakan' : 'kontrakan',
  'sewa'  : 'sewa', 'sewaan' : 'sewaan',
  'beli'  : 'beli', 'jual' : 'jual',
  'tukar' : 'tukar', 'nego' : 'negosiasi',
  'harga' : 'harga', 'mahal' : 'mahal',
  'murah' : 'murah', 'diskon' : 'diskon',
  'promo' : 'promo', 'sale' : 'sale',
  'kamar' : 'kamar', 'kamar mandi' : 'kamar mandi',
  'toilet': 'toilet', 'wc' : 'toilet',
  'dapur' : 'dapur', 'ruang tamu' : 'ruang tamu',
  'kantin' : 'kantin', 'cafe' : 'kafe',
  'restoran' : 'restoran', 'warung' : 'warung',
  'toko'  : 'toko', 'supermarket' : 'supermarket',
  'mall'  : 'mall', 'plaza' : 'plaza',
  
  // === Work & school ===
  'kerja' : 'kerja', 'pekerjaan' : 'pekerjaan',
  'bosan' : 'bosan', 'stres' : 'stres',
  'deadline' : 'deadline', 'tugas' : 'tugas',
  'proyek' : 'proyek', 'project' : 'proyek',
  'rapat' : 'rapat', 'meeting' : 'rapat',
  'presentasi' : 'presentasi', 'slide' : 'slide',
  'email' : 'email', 'chat' : 'chat',
  'telepon' : 'telepon', 'call' : 'panggilan',
  'video call' : 'video call', 'zoom' : 'zoom',
  'sekolah' : 'sekolah', 'kuliah' : 'kuliah',
  'kampus': 'kampus', 'dosen' : 'dosen',
  'guru'  : 'guru', 'murid' : 'murid',
  'ujian' : 'ujian', 'exam' : 'ujian',
  'nilai' : 'nilai', 'grade' : 'nilai',
  'lulus' : 'lulus', 'gagal' : 'gagal',
  'siswa' : 'siswa', 'mahasiswa' : 'mahasiswa',
  
  // === Health & medical ===
  'sakit' : 'sakit', 'pusing' : 'pusing',
  'batuk' : 'batuk', 'pilek' : 'pilek',
  'demam' : 'demam', 'flu' : 'flu',
  'hospital' : 'rumah sakit', 'rs' : 'rumah sakit',
  'dokter': 'dokter', 'dr' : 'dokter',
  'obat'  : 'obat', 'medicine' : 'obat',
  'vitamin' : 'vitamin', 'suplemen' : 'suplemen',
  'check up' : 'periksa', 'medical' : 'medis',
  'fisio' : 'fisioterapi', 'psikiater' : 'psikiater',
  'psikolog' : 'psikolog', 'konseling' : 'konseling',
  'terapi' : 'terapi', 'healing' : 'healing',
  'relaks' : 'relaks', 'meditasi' : 'meditasi',
  'yoga'  : 'yoga', 'sport' : 'olahraga',
  'gym'   : 'gym', 'fitness' : 'fitness',
  'olahraga' : 'olahraga', 'lari' : 'lari',
  'jogging' : 'jogging', 'sepeda' : 'sepeda',
  'renang': 'renang', 'basket' : 'basket',
  'sepak bola' : 'sepak bola', 'bola' : 'bola',
  'futsal' : 'futsal', 'badminton' : 'bulu tangkis',
  'tennis' : 'tennis', 'renang' : 'renang',
  
  // === Shopping & money ===
  'beli'  : 'beli', 'jual' : 'jual',
  'tukar' : 'tukar', 'bayar' : 'bayar',
  'harga' : 'harga', 'mahal' : 'mahal',
  'murah' : 'murah', 'promo' : 'promo',
  'diskon': 'diskon', 'cashback' : 'cashback',
  'cod'   : 'cod', 'transfer' : 'transfer',
  'rekening' : 'rekening', 'bank' : 'bank',
  'atm'   : 'atm', 'saldo' : 'saldo',
  'tabungan' : 'tabungan', 'investasi' : 'investasi',
  'uang'  : 'uang', 'duit' : 'duit',
  'rupiah': 'rupiah', 'rb' : 'ribu',
  'jam'   : 'jam', 'menit' : 'menit',
  'detik' : 'detik', 'hari' : 'hari',
  'minggu': 'minggu', 'bulan' : 'bulan',
  'tahun' : 'tahun', 'waktu' : 'waktu',
  'sekarang' : 'sekarang', 'skrg' : 'sekarang',
  'nanti' : 'nanti', 'ntar' : 'nanti',
  'sebelum' : 'sebelum', 'sesudah' : 'sesudah',
  'kemarin' : 'kemarin', 'kmrn' : 'kemarin',
  'besok' : 'besok', 'bsk' : 'besok',
  'hari ini' : 'hari ini', 'today' : 'hari ini',
  'tomorrow' : 'besok', 'yesterday' : 'kemarin',

  // Abbreviations from common usage
  'dll'   : 'dan lain-lain',
  'dsb'   : 'dan sebagainya',
  'dst'   : 'dan seterusnya',
  'dkk'   : 'dan kawan-kawan',
  'tsb'   : 'tersebut',
  'tdk'   : 'tidak',
  'sdh'   : 'sudah',
  'blm2'  : 'belum',
  'jg'    : 'juga',
  'juga'  : 'juga',
  'spt'   : 'seperti',
  'kpd'   : 'kepada',
  'dr'    : 'dari',
  'pd'    : 'pada',
  'dg'    : 'dengan',
  'sm'    : 'sama',
  'ama'   : 'sama',

  // Common word confusions
  'sangat2': 'sangat-sangat',
}));

// ---------------------------------------------------------------------------
// Pure typo corrections (keyboard errors, transpositions, missing letters)
// These are marked as "error" in spell check, not "tidak_baku".
// ---------------------------------------------------------------------------
const TYPO_MAP = Object.freeze(Object.assign(Object.create(null), {
  // "aplikasi" family
  'apliksi'  : 'aplikasi',
  'aplkasi'  : 'aplikasi',
  'apliksii' : 'aplikasi',
  'apliksai' : 'aplikasi',
  'aplikais' : 'aplikasi',
  'aplkasi'  : 'aplikasi',
  'aplkiasi' : 'aplikasi',
  'apliaksi' : 'aplikasi',

  // Common keyboard typos
  'tuliss'   : 'tulis',
  'membacaa' : 'membaca',
  'menuliss' : 'menulis',
  'bukak'    : 'buka',
  'memasukan': 'memasukkan',
  'mempergunakan': 'menggunakan',
  'mempergunakan': 'menggunakan',
  'diliat'   : 'dilihat',
  'diambilkan': 'diambilkan',
  'kerjaan'  : 'pekerjaan',

  // Number-related
  'st'       : 'satu',
  'dua'      : 'dua',

  // Doubled letters
  'membacaaa': 'membaca',
  'menulisss': 'menulis',
}));

// ---------------------------------------------------------------------------
// Phonetic variant rules (applied lazily per-query)
// ---------------------------------------------------------------------------

/** Generate common phonetic/orthographic variants of an Indonesian word */
export function generatePhoneticVariants(word) {
  const lower = (word ?? '').toLowerCase();
  const variants = new Set();

  // 1. ny ↔ ng swap
  if (lower.includes('ng')) variants.add(lower.replace(/ng/g, 'ny'));
  if (lower.includes('ny')) variants.add(lower.replace(/ny/g, 'ng'));

  // 2. Collapse triple+ letters to double (gassss → gass)
  const collapsed = lower.replace(/([a-z])\1{2,}/gi, '$1$1');
  if (collapsed !== lower) variants.add(collapsed);

  // 3. Collapse double letters to single (tuliss → tulis)
  const singleCollapsed = lower.replace(/([a-z])\1+/gi, '$1');
  if (singleCollapsed !== lower && singleCollapsed.length >= 3) variants.add(singleCollapsed);

  // 4. Common Indonesian phonetic substitutions
  // f ↔ p
  if (lower.includes('f')) variants.add(lower.replace(/f/g, 'p'));
  if (lower.includes('p')) variants.add(lower.replace(/p/g, 'f'));

  // z ↔ j
  if (lower.includes('z')) variants.add(lower.replace(/z/g, 'j'));
  if (lower.includes('j')) variants.add(lower.replace(/j/g, 'z'));

  // v ↔ f ↔ w
  if (lower.includes('v')) {
    variants.add(lower.replace(/v/g, 'f'));
    variants.add(lower.replace(/v/g, 'w'));
  }

  // 5. Vowel confusion a ↔ e
  if (lower.includes('e')) variants.add(lower.replace(/e/g, 'a'));
  if (lower.includes('a')) {
    const withE = lower.replace(/a(?=[^aiou\s])/g, 'e');
    if (withE !== lower) variants.add(withE);
  }

  // Remove the original word itself from variants
  variants.delete(lower);

  return Array.from(variants);
}

/** Direct lookup from combined typo + tidak-baku maps */
export function checkCommonTypos(word) {
  const lower = (word ?? '').toLowerCase();
  return TYPO_MAP[lower] || TIDAK_BAKU_MAP[lower] || null;
}

/** Get a combined map (used for Autocorrect candidate seeding) */
export function getCommonTypoMap() {
  // Merge: typo_map has priority
  return { ...TIDAK_BAKU_MAP, ...TYPO_MAP };
}

/** Expose individual maps for SpellChecker classification */
export { TIDAK_BAKU_MAP, TYPO_MAP };
