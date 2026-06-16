const { createCanvas } = require('canvas');
const { Camoufox } = require('camoufox-js');
const fs   = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

const DAFTAR_AKUN_FILE = path.join(__dirname, 'daftar-akun.json');
const COOKIE_FILE = path.join(__dirname, 'cookie.json');
const OUTPUT_DIR = path.join(__dirname, 'struck');
const JEDA_UPLOAD_MS = 5000;

const apiClient = axios.create({
    baseURL: 'https://bocapi.billsonchain.io/api',
    timeout: 25000,
    headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'origin': 'https://billsonchain.io',
        'referer': 'https://billsonchain.io/'
    }
});

function mulberry32(seed) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
let rng = Math.random;

const pad  = (n, l = 2) => String(n).padStart(l, '0');
const pick = arr => arr[Math.floor(rng() * arr.length)];
const ri   = (min, max) => Math.floor(rng() * (max - min + 1)) + min;

function formatRupiah(n) {
    return 'Rp' + n.toLocaleString('id-ID');
}

// ====================================================================
// 🛠️ UTALITAS BOT AUTOMATION (HUMANIZER & WINDOW)
// ====================================================================
function loadDaftarAkun() {
    if (!fs.existsSync(DAFTAR_AKUN_FILE)) {
        console.error("❌ File daftar-akun.json tidak ditemukan! Silakan jalankan script register terlebih dahulu.");
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(DAFTAR_AKUN_FILE, 'utf-8'));
}

async function humanType(page, selector, text) {
    await page.waitForSelector(selector, { state: 'visible', timeout: 15000 });
    await page.focus(selector);
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    for (const char of text) {
        await page.keyboard.type(char, { delay: 40 + Math.random() * 50 });
    }
    await new Promise(res => setTimeout(res, 500));
}

function dapatkanUkuranWindowKecil() {
    const listUkuran = [[960, 680], [850, 700], [800, 650]];
    return listUkuran[Math.floor(Math.random() * listUkuran.length)];
}

function simpanDataKeJsonRealtime(filePath, dataBaru, keyUnique = 'email') {
    let listLama = [];
    if (fs.existsSync(filePath)) {
        try { listLama = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch (e) { listLama = []; }
    }
    const indexSama = listLama.findIndex(item => item[keyUnique] === dataBaru[keyUnique]);
    if (indexSama !== -1) listLama[indexSama] = dataBaru;
    else listLama.push(dataBaru);
    fs.writeFileSync(filePath, JSON.stringify(listLama, null, 4));
}

function ambilCookieLokal(email) {
    if (!fs.existsSync(COOKIE_FILE)) return null;
    try {
        const cookiesData = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
        const dataAkun = cookiesData.find(item => item.email === email);
        return dataAkun && dataAkun.cookie ? dataAkun.cookie : null;
    } catch (e) {
        return null;
    }
}

async function cekApakahCookieValid(cookie) {
    try {
        const response = await apiClient.get('/auth/get-session', { 
            headers: { 'cookie': cookie },
            timeout: 12000 
        });

        if (response.data && response.data.session) {
            const waktuExpired = new Date(response.data.session.expiresAt).getTime();
            const waktuSekarang = Date.now();
            if (waktuExpired > waktuSekarang) return true;
        }
        return false;
    } catch (error) {
        return false;
    }
}

async function dapatkanStatsUser(cookie) {
    try {
        const response = await apiClient.post('/user/stats/refresh', {}, { 
            headers: { 'cookie': cookie },
            timeout: 15000 
        });
        if (response.data && response.data.ok) return response.data.data;
        return null;
    } catch (error) {
        return null;
    }
}

// ====================================================================
// 🌏 DATABASE MERCHANT & WILAYAH NUSANTARA (FULL INDONESIA)
// ====================================================================
function generateMerchantUnik() {
    const tipeBisnis = [
        'WARUNG', 'TOKO', 'KEDAI', 'CAFE', 'COFFEE', 'MART', 'CELL', 'BOUTIQUE', 'LAUNDRY', 
        'RESTO', 'APOTEK', 'MINIMARKET', 'BARBERSHOP', 'GRILL', 'KITCHEN', 'BAKERY', 'DISTRO', 
        'JUICE', 'SEAFOOD', 'STEAK', 'GELATO', 'SALON', 'CLOTHING', 'FURNITURE', 'VAPE STORE',
        'FOTOCOPY', 'STATIONERY', 'PETSHOP', 'AUTOCARE', 'SNAK TIME', 'BURGER', 'WARMINDO',
        'ANGKRINGAN', 'DEPOT', 'COCO', 'FRUIT', 'GLOW', 'MEAT', 'MILKSHAKE', 'ICE CREAM'
    ];
    
    const namaUnik = [
        'PANSA', 'PANSAGROUP', 'JAYA', 'MAKMUR', 'BERKAH', 'SARI', 'UTAMA', 'SUMBER', 'REJEKI', 
        'AGUNG', 'KURNIA', 'SENTOSA', 'ABADI', 'MULIA', 'SEJAHTERA', 'BAROKAH', 'DANA', 'CHICKEN', 
        'BOBA', 'SATE', 'BAKSO', 'AMANAH', 'LESTARI', 'SUBUR', 'HIDAYAH', 'LANCAR', 'MANDIRI',
        'NUSA', 'KENCANA', 'RASA', 'WANGI', 'SULTAN', 'REBORN', 'UPGRADE', 'SIGNATURE', 'BINTANG',
        'KAYU', 'BUMI', 'MAJU', 'FITRI', 'HIJRAH', 'SADULUR', 'TALENTA', 'MADANI'
    ];
    
    const wilayah = [
        // Jawa & Jabodetabek
        'SURABAYA', 'SIDOARJO', 'GRESIK', 'MALANG', 'MOJOKERTO', 'PASURUAN', 'JOMBANG', 'BATU', 'MADIUN', 'KEDIRI', 'BLITAR',
        'JAKARTA', 'BOGOR', 'DEPOK', 'TANGERANG', 'BEKASI', 'BANDUNG', 'SEMARANG', 'YOGYAKARTA', 'SOLO', 'CILEGON', 'SERANG',
        // Sumatera
        'MEDAN', 'PALEMBANG', 'PADANG', 'PEKANBARU', 'BANDAR LAMPUNG', 'JAMBI', 'BENGKULU', 'BANDA ACEH', 'PANGKALPINANG', 'BATAM',
        // Kalimantan
        'PONTIANAK', 'BANJARMASIN', 'BALIKPAPAN', 'SAMARINDA', 'PALANGKARAYA', 'TARAKAN', 'NUNUKAN', 'BONTANG',
        // Sulawesi
        'MAKASSAR', 'MANADO', 'PALU', 'KENDARI', 'GORONTALO', 'BITUNG', 'BAUBAU', 'TOMOHON',
        // Bali & Nusa Tenggara
        'DENPASAR', 'MATARAM', 'KUPANG', 'SINGARAJA', 'UBUD', 'LABUAN BAJO', 'ATAMBUA',
        // Maluku & Papua
        'AMBON', 'TERNATE', 'JAYAPURA', 'SORONG', 'MANOKWARI', 'MERAUKE', 'MIMIKA', 'WAKATOBI'
    ];
    
    const imbuhan = [
        'CENTRAL', 'EXPRESS', 'UTAMA', 'SUKSES', 'SADAR', 'PODOMORO', 'PRIMA', 'FLASH', 'DIGITAL', 
        '24 JAM', 'STATION', 'CORNER', 'HUB', 'PREMIUM', 'BOUTIQUE', 'MINI', 'MAXI', 'SUPER', 'CONCEPT',
        'COLLECTION', 'DELUXE', 'CLASSIC', 'STREET', 'INDONESIA', 'PLUS', 'ECO'
    ];

    const t = pick(tipeBisnis);
    const n = pick(namaUnik);
    const w = pick(wilayah);
    const i = pick(imbuhan);

    const polaNama = ri(1, 6);
    let namaToko = '';
    if (polaNama === 1) namaToko = `${t} ${n} ${w}`;
    else if (polaNama === 2) namaToko = `${n} ${t} ${w}`;
    else if (polaNama === 3) namaToko = `${t} ${n} ${i} ${w}`;
    else if (polaNama === 4) namaToko = `${n} ${i} ${w}`;
    else if (polaNama === 5) namaToko = `${t} ${i} ${w}`;
    else namaToko = `${n} ${w} ${i}`;

    if (namaToko.length > 26) namaToko = namaToko.substring(0, 26);

    const versiNmid = pick(['ID10', 'ID20', 'ID30']);
    const digitTahun = pick(['22', '23', '24', '25', '26']);
    const sisaDigit = pad(crypto.randomInt(10000000, 99999999), 8);

    return { name: namaToko.toUpperCase(), nmid: `${versiNmid}${digitTahun}${sisaDigit}` };
}

// ====================================================================
// 💳 KOMPILASI PAYMENT METHOD MASSAL
// ====================================================================
const PAYMENT_METHODS = [
    'Saldo DANA', 'DANA Pay Later', 'Rekening BCA', 'Rekening Mandiri', 'Kartu Debit BNI',
    'QRIS Bank Mega', 'Saldo GoPay', 'GoPay Later', 'OVO Cash', 'ShopeePay Balance',
    'SPayLater', 'LinkAja', 'Debit BRI', 'Debit Bank Jatim', 'Debit CIMB Niaga',
    'Permata Net', 'BNC Balance', 'Allo Bank', 'SeaBank', 'Blu by BCA', 'LINE Bank',
    'Danamon QR', 'Maybank Wallet', 'Sinarmas Pay', 'Bank Muamalat QR', 'BTN Mobile'
];

function generateData() {
    const merchant = generateMerchantUnik();
    const steps   = Math.floor((2000000 - 10000) / 5000);
    const nominal = 10000 + ri(0, steps) * 5000;

    const d = new Date();
    d.setDate(d.getDate() - ri(0, 10));
    d.setHours(ri(7, 22), ri(0, 59), ri(0, 59));

    const MONTHS  = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
    const dateStr = `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const tsTag    = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
    
    const microRand1 = crypto.randomInt(1000, 9999);
    const microRand2 = crypto.randomInt(100000, 999999);
    const uniqueSuffix = Date.now().toString().slice(-4);

    const txId     = `${tsTag}111212${microRand1}${microRand2}`;
    const rrn      = `${crypto.randomInt(100000, 999999)}${crypto.randomInt(100000, 999999)}`;
    const approval = pad(ri(100000, 999999), 6);
    const termId   = `EDC${ri(10000000, 99999999)}`;
    
    const fileUniqueTag = `${tsTag}_${uniqueSuffix}_${microRand1}`;
    const payMethod = pick(PAYMENT_METHODS);
    const refNum   = `REF${tsTag}${microRand1}`;

    return { merchant, nominal, dateStr, txId, rrn, approval, termId, fileUniqueTag, payMethod, refNum };
}

function drawQR(ctx, cx, cy, size) {
    const M     = 25; 
    const cell  = size / M;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - size/2, cy - size/2, size, size);

    const fill = (col, row, color = '#1a1a1a') => {
        ctx.fillStyle = color;
        ctx.fillRect(cx - size/2 + col * cell + 0.3, cy - size/2 + row * cell + 0.3, cell - 0.6, cell - 0.6);
    };

    const finder = (sc, sr) => {
        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
                if (r===0||r===6||c===0||c===6 || (r>=2&&r<=4&&c>=2&&c<=4)) fill(sc+c, sr+r);
                else fill(sc+c, sr+r, '#ffffff');
            }
        }
    };
    finder(0, 0); finder(M - 7, 0); finder(0, M - 7);
    
    for (let r = 0; r < M; r++) {
        for (let c = 0; c < M; c++) {
            if (!(r<9 && c<9) && !(r<9 && c>=M-8) && !(r>=M-8 && c<9) && r!==6 && c!==6) {
                if (rng() > 0.52) fill(c, r);
            }
        }
    }
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function drawReceipt(data) {
    const SCALE = 3; const BASE_W = 420, BASE_H = 880;
    const W = BASE_W * SCALE, H = BASE_H * SCALE;
    const canvas = createCanvas(W, H); const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    
    const BLUE = '#108ee9', BGOUT = '#e8edf2', WHITE = '#ffffff', GREEN = '#00b278', DARK = '#222222', GREY = '#777777', LGREY = '#f8f9fa', LINE = '#eef0f2';
    const PAD = 24, RX = PAD, RY = 32, RW = BASE_W - PAD * 2, RH = 780;

    ctx.fillStyle = BGOUT; ctx.fillRect(0, 0, BASE_W, BASE_H);
    const grad = ctx.createLinearGradient(0, 0, 0, BASE_H); grad.addColorStop(0, '#dce3eb'); grad.addColorStop(1, '#ecf0f5');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, BASE_W, BASE_H);

    ctx.save(); ctx.shadowColor = 'rgba(16, 36, 54, 0.12)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
    ctx.fillStyle = WHITE; roundRect(ctx, RX, RY, RW, RH, 14); ctx.fill(); ctx.restore();

    ctx.save(); ctx.fillStyle = BLUE; roundRect(ctx, RX, RY, RW, 72, 14); ctx.fill(); ctx.fillRect(RX, RY + 55, RW, 17); ctx.restore();
    ctx.fillStyle = WHITE; ctx.font = 'bold 22px Arial, Helvetica, sans-serif'; ctx.fillText('DANA', RX + 24, RY + 44);
    ctx.font = '12px Arial'; ctx.textAlign = 'right'; ctx.fillText('0821 •••• 6061', RX + RW - 24, RY + 44);

    const ICO_Y = RY + 105;
    ctx.save(); ctx.fillStyle = GREEN; ctx.beginPath(); ctx.arc(BASE_W / 2, ICO_Y, 25, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = WHITE; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    ctx.moveTo(BASE_W/2 - 10, ICO_Y); ctx.lineTo(BASE_W/2 - 2, ICO_Y + 8); ctx.lineTo(BASE_W/2 + 12, ICO_Y - 9); ctx.stroke(); ctx.restore();

    ctx.fillStyle = DARK; ctx.font = 'bold 17px Arial'; ctx.textAlign = 'center'; ctx.fillText('Pembayaran Berhasil', BASE_W / 2, ICO_Y + 48);
    ctx.fillStyle = GREY; ctx.font = '12px Arial'; ctx.fillText(data.dateStr, BASE_W / 2, ICO_Y + 68);

    const NOM_Y = ICO_Y + 102; ctx.fillStyle = LGREY; ctx.fillRect(RX, NOM_Y - 30, RW, 60);
    ctx.fillStyle = GREY; ctx.font = '12px Arial'; ctx.fillText('Total Pembayaran', BASE_W / 2, NOM_Y - 6);
    ctx.fillStyle = DARK; ctx.font = 'bold 28px Arial'; ctx.fillText(formatRupiah(data.nominal), BASE_W / 2, NOM_Y + 24);

    ctx.strokeStyle = LINE; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(RX + 20, NOM_Y + 45); ctx.lineTo(RX + RW - 20, NOM_Y + 45); ctx.stroke(); // Fix typo ctx.stroke()
    
    const QR_Y = NOM_Y + 110; drawQR(ctx, BASE_W / 2, QR_Y, 115);
    ctx.strokeStyle = '#dddddd'; ctx.lineWidth = 1; ctx.strokeRect(BASE_W/2 - 115/2 - 1, QR_Y - 115/2 - 1, 117, 117);

    ctx.fillStyle = '#333333'; ctx.font = 'bold 12px Arial'; ctx.fillText('QRIS', BASE_W / 2, QR_Y + 76);
    ctx.fillStyle = GREY; ctx.font = '10px Arial'; ctx.fillText(`NMID: ${data.merchant.nmid}`, BASE_W / 2, QR_Y + 92);

    ctx.beginPath(); ctx.moveTo(RX + 20, QR_Y + 108); ctx.lineTo(RX + RW - 20, QR_Y + 108); ctx.stroke();

    const DY = QR_Y + 132;
    ctx.fillStyle = DARK; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'left'; ctx.fillText('Detail Transaksi', RX + 20, DY);
    
    const renderRow = (label, val, y) => {
        ctx.fillStyle = GREY; ctx.font = '12px Arial'; ctx.textAlign = 'left'; ctx.fillText(label, RX + 20, y);
        ctx.fillStyle = DARK; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'right'; ctx.fillText(val, RX + RW - 20, y);
    };
    renderRow('Nama Merchant', data.merchant.name, DY + 28);
    renderRow('Metode Bayar', data.payMethod, DY + 54);
    renderRow('No. Referensi', data.refNum, DY + 80);
    renderRow('No. RRN', data.rrn, DY + 106);
    renderRow('ID Transaksi', data.txId, DY + 132);

    const TEAR_Y = RY + RH - 55; const TOOTH = 10; const TEETH = Math.ceil(RW / TOOTH);
    ctx.fillStyle = BGOUT; ctx.beginPath(); ctx.moveTo(RX, TEAR_Y);
    for (let i = 0; i <= TEETH; i++) {
        const px = RX + i * TOOTH; const py = TEAR_Y - (i % 2 === 0 ? TOOTH : 0);
        ctx.lineTo(Math.min(px, RX + RW), py);
    }
    ctx.lineTo(RX + RW, BASE_H); ctx.lineTo(RX, BASE_H); ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#aaaaaa'; ctx.font = '10px Arial'; ctx.textAlign = 'center'; ctx.fillText('🔒 Dilindungi oleh DANA Protection', BASE_W / 2, TEAR_Y + 20);
    return canvas;
}

function saveReceipt(canvas, uniqueId) {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const filename = `receipt_${uniqueId}.png`;
    const fp = path.join(OUTPUT_DIR, filename);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(fp, buffer);
    return { fp, filename, buffer };
}

function generateAndSaveReceiptData() {
    const data = generateData();
    const canvas = drawReceipt(data);
    const { fp, filename, buffer } = saveReceipt(canvas, data.fileUniqueTag);
    return { fp, filename, buffer, data };
}

async function pemicuLoginOtomatisAkun(akun) {
    const ukuranWindow = dapatkanUkuranWindowKecil();
    console.log(`   [LOGIN ENGINE] Membuka jendela login Camoufox (${ukuranWindow[0]}x${ukuranWindow[1]})...`);
    
    let browser;
    try {
        browser = await Camoufox({
            headless: false,
            os: 'windows',
            humanize: true,
            geoip: true,
            window: ukuranWindow, 
        });

        const page = await browser.newPage();
        await page.goto('https://billsonchain.io/login', { waitUntil: 'networkidle', timeout: 60000 });
        await new Promise(res => setTimeout(res, 3000));

        console.log(`   [LOGIN ENGINE] Mengisi kredensial form...`);
        await humanType(page, 'input[type="email"]', akun.email);
        await humanType(page, 'input[type="password"]', akun.password);

        await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
        try {
            const btnSubmit = await page.$('button[type="submit"]');
            if (btnSubmit) await btnSubmit.scrollIntoViewIfNeeded();
        } catch (e) {}

        console.log(`   🚨 [MANUAL] Selesaikan Cloudflare Turnstile pada Jendela Browser sekarang!`);
        await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 180000 });
        
        await page.click('button[type="submit"]');
        console.log(`   [LOGIN ENGINE] Menunggu pengalihan dashboard...`);
        
        await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 120000 });
        console.log(`   ✅ [LOGIN ENGINE] Login berhasil terverifikasi.`);

        const context = page.context();
        const playCookies = await context.cookies();
        const cookieString = playCookies.map(c => `${c.name}=${c.value}`).join('; ');

        const dataCookieFix = {
            accountName: akun.accountName,
            fullName: akun.fullName || akun.accountName,
            email: akun.email,
            password: akun.password,
            cookie: cookieString,
            savedAt: new Date().toISOString()
        };

        simpanDataKeJsonRealtime(COOKIE_FILE, dataCookieFix, 'email');
        return cookieString;

    } catch (e) {
        console.error(`   ❌ [LOGIN ENGINE ERROR]: ${e.message}`);
        return null;
    } finally {
        if (browser) {
            await browser.close();
            console.log(`   🔒 Jendela login tertutup.`);
        }
    }
}

async function uploadAndConfirmReceipt(cookie, filename, buffer, fp) {
    try {
        const fileSize = buffer.length;
        const initResponse = await apiClient.post('/bill/init', 
            { filename, contentType: 'image/png', fileSizeBytes: fileSize },
            { headers: { 'cookie': cookie } }
        );

        if (!initResponse.data || !initResponse.data.ok) {
            const errCode = initResponse.data?.error?.code || '';
            if (errCode.includes('LIMIT') || errCode.includes('EXCEEDED')) {
                console.log(`   ⚠️ [LIMIT DETECTED] Akun terkena limit harian API pada fase init.`);
                if (fs.existsSync(fp)) fs.unlinkSync(fp);
                return { status: 'LIMIT' };
            }
            throw new Error('Gagal inisialisasi berkas.');
        }

        const { billId, uploadUrl = initResponse.data.data.uploadUrl } = initResponse.data.data;
        console.log(`   [API] 1/4 Init Sukses. ID: ${billId}`);

        await axios.put(uploadUrl, buffer, { headers: { 'Content-Type': 'image/png' } });
        console.log(`   [S3]  2/4 Unggah berkas gambar sukses.`);

        if (fs.existsSync(fp)) fs.unlinkSync(fp);

        const streamResponse = await apiClient.get(`/bill/${billId}/status/stream`, {
            headers: { 'cookie': cookie }, responseType: 'stream'
        });
        if (streamResponse.data && typeof streamResponse.data.destroy === 'function') {
            streamResponse.data.destroy();
        }
        console.log(`   [API] 3/4 Sinkronisasi stream dipicu.`);

        await apiClient.post(`/bill/${billId}/confirm`, {}, { headers: { 'cookie': cookie } });
        console.log(`   [API] 4/4 Konfirmasi pengolahan berkas dikirim.`);

        console.log(`   [POLLING] Menunggu hasil verifikasi data OCR backend...`);
        let attempts = 0;
        while (attempts < 20) { 
            attempts++;
            await new Promise(res => setTimeout(res, 2000)); 

            const statusResponse = await apiClient.get(`/bill/${billId}/status`, { headers: { 'cookie': cookie } });
            if (statusResponse.data && statusResponse.data.ok) {
                const currentStatus = statusResponse.data.data.status;
                console.log(`   [CHECK ${attempts}] Status Server: ${currentStatus}`);

                if (currentStatus === 'fraud_passed' || currentStatus === 'dedup_passed') {
                    console.log(`   🚀 [PASSED] Bill ${billId} LOLOS VERIFIKASI SISTEM (${currentStatus})!`);
                    return { status: 'SUCCESS' };
                } else if (currentStatus === 'failed' || statusResponse.data.data.failureReason) {
                    console.log(`   ❌ [REJECTED] Berkas ditolak. Alasan: ${statusResponse.data.data.failureReason}`);
                    return { status: 'REJECTED' };
                }
            }
        }
        return { status: 'TIMEOUT' };

    } catch (error) {
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
        const resData = error.response?.data;
        const httpStatus = error.response?.status;

        if (httpStatus === 429 || (resData && JSON.stringify(resData).toUpperCase().includes('LIMIT'))) {
            console.log(`   ⚠️ [LIMIT DETECTED] Akun menyentuh batas limit harian API (HTTP: ${httpStatus}).`);
            return { status: 'LIMIT' };
        }

        console.error(`   ❌ [PIPELINE ERROR]:`, resData ? JSON.stringify(resData) : error.message);
        return { status: 'ERROR' };
    }
}

async function runAccountLoop(account) {
    console.log(`\n=============================================================`);
    console.log(`👤 MEMULAI SESI AKUN: [ ${account.accountName} ]`);
    console.log(`=============================================================`);
    
    let cookieAktif = ambilCookieLokal(account.email);
    let butuhLoginBrowser = true;

    if (cookieAktif) {
        console.log(`   [CHECK] Menemukan data cookie lokal. Menembak /auth/get-session...`);
        const apaValid = await cekApakahCookieValid(cookieAktif);
        
        if (apaValid) {
            console.log(`   🚀 [VALID] Session cookie terverifikasi AKTIF! Lewati buka browser.`);
            butuhLoginBrowser = false;
        } else {
            console.log(`   ⚠️ [EXPIRED] Session cookie mati/habis masa aktif. Menyiapkan browser...`);
        }
    }

    if (butuhLoginBrowser) {
        console.log(`[${account.accountName}] Memicu login otomatis untuk mengambil session cookie baru...`);
        cookieAktif = await pemicuLoginOtomatisAkun(account);
    }
    
    if (!cookieAktif) {
        console.log(`❌ [SKIP ACCOUNT] Gagal memanen session login untuk akun [${account.accountName}].`);
        return 0;
    }

    // 💡 BYPASS TOTAL HITUNGAN HARIAN: Mengabaikan limit cache data kemarin
    console.log(`   [STATS ENGINE] Memeriksa sisa kuota harian akun...`);
    const initialStats = await dapatkanStatsUser(cookieAktif);
    
    if (initialStats && initialStats.pipeline) {
        const totalHariIni = initialStats.pipeline.total || 0;
        const limitMaksimum = initialStats.pipeline.max || 'Dinamis'; 
        
        console.log(`   📊 [STATS REPORT] Total Bills terunggah di sistem: ${totalHariIni} / ${limitMaksimum}`);
        console.log(`   🚀 [BYPASS] Mengabaikan hitungan angka harian. Memaksa bot untuk tetap gempur upload...`);
        
        /* Pengecekan otomatis di bawah sengaja dimatikan (di-comment) agar data 30 transaksi kemarin
        tidak menghentikan bot untuk mencoba push upload struk hari ini.
        
        if (initialStats.pipeline.max && totalHariIni >= initialStats.pipeline.max) {
            console.log(`   🛑 [AUTO LIMIT] Akun terpantau sudah limit.`);
            return 0;
        }
        */
    }

    let isRunning = true;
    let uploadedCount = 0;

    // Bot akan terus berjalan sampai mendapatkan respon penolakan LIMIT / 429 asli dari server saat upload berjalan
    while (isRunning) {
        const { fp, filename, buffer, data } = generateAndSaveReceiptData();
        console.log(`\n[${account.accountName}] Membuat berkas: ${data.merchant.name} | ${formatRupiah(data.nominal)} | NMID: ${data.merchant.nmid}`);
        
        const result = await uploadAndConfirmReceipt(cookieAktif, filename, buffer, fp);
        
        if (result.status === 'LIMIT') {
            console.log(`🛑 [STOP ACCOUNT] Sesi akun [${account.accountName}] diselesaikan karena LIMIT harian resmi tercapai.`);
            isRunning = false;
        } else {
            uploadedCount++;
            console.log(`⏳ Memasang jeda aman selama ${JEDA_UPLOAD_MS / 1000} detik sebelum memproses struk baru...`);
            await new Promise(res => setTimeout(res, JEDA_UPLOAD_MS));
        }
    }
    return uploadedCount;
}

async function main() {
    const accounts = loadDaftarAkun();
    console.log(`📡 Terbaca total: ${accounts.length} akun dalam basis daftar-akun.json.`);
    
    const args = process.argv.slice(2);
    if (args.includes('--seed')) {
        const index = args.indexOf('--seed');
        const seedVal = parseInt(args[index + 1], 10);
        if (!isNaN(seedVal)) { rng = mulberry32(seedVal); }
    }

    for (const account of accounts) {
        if (!account.email || account.email === 'email@gmail.com') continue;
        const totalUploaded = await runAccountLoop(account);
        console.log(`\n✨ Sesi Beres → Akun [${account.accountName}] selesai memproses total ${totalUploaded} struck.`);
        console.log(`-------------------------------------------------------------`);
    }
    console.log(`\n✔️ [ALL DONE] Seluruh akun pada daftar-akun.json telah selesai dipanen.`);
}

main();
