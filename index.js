const { createCanvas } = require('canvas');
const fs   = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

// Menggunakan wrapper cookie untuk menjaga session login tetap bertahan layaknya browser
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const DAFTAR_AKUN_FILE = path.join(__dirname, 'daftar-akun.json');
const COOKIE_FILE = path.join(__dirname, 'cookie.json');
const OUTPUT_DIR = path.join(__dirname, 'struck');
const JEDA_UPLOAD_MS = 5000;

// ============================================================
// 🔑 CONFIG CAPTCHA BYPASS (Ubah sesuai API Key Anda)
// ============================================================
const CAPTCHA_API_KEY = "";
const CAPTCHA_SERVICE = "2captcha";   // "2captcha" atau "anticaptcha"
const SITE_KEY        = "0x4AAAAAADKR0bu1HvcUPYJ1";
const PAGE_URL        = "https://billsonchain.io/login";
// ============================================================

const apiClient = axios.create({
    baseURL: 'https://bocapi.billsonchain.io/api',
    timeout: 25000,
    headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9',
        'origin': 'https://billsonchain.io',
        'referer': 'https://billsonchain.io/'
    }
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

function loadDaftarAkun() {
    if (!fs.existsSync(DAFTAR_AKUN_FILE)) {
        console.error("❌ File daftar-akun.json tidak ditemukan!");
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(DAFTAR_AKUN_FILE, 'utf-8'));
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
            if (waktuExpired > Date.now()) return true;
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
// 🌏 SOLVER TURNSTILE CAPTCHA VIA THIRD PARTY API
// ====================================================================
async function solveTurnstile2Captcha() {
    const submitUrl = "https://2captcha.com/in.php";
    const payload = {
        key: CAPTCHA_API_KEY,
        method: "turnstile",
        sitekey: SITE_KEY,
        pageurl: PAGE_URL,
        json: 1,
    };

    try {
        const submitResp = await axios.post(submitUrl, new URLSearchParams(payload).toString(), { timeout: 30000 });
        if (submitResp.data.status !== 1) return { token: null, error: `Submit error: ${JSON.stringify(submitResp.data)}` };

        const taskId = submitResp.data.request;
        const resultUrl = "https://2captcha.com/res.php";

        for (let attempt = 0; attempt < 40; attempt++) {
            await sleep(2000);
            const resResp = await axios.get(resultUrl, {
                params: { key: CAPTCHA_API_KEY, action: "get", id: taskId, json: 1 },
                timeout: 30000
            });
            if (resResp.data.status === 1) return { token: resResp.data.request, error: null };
            if (resResp.data.request !== "CAPCHA_NOT_READY") return { token: null, error: `Solve error: ${JSON.stringify(resResp.data)}` };
        }
        return { token: null, error: "2Captcha timeout 80s" };
    } catch (err) {
        return { token: null, error: err.message };
    }
}

async function solveTurnstileAntiCaptcha() {
    const createUrl = "https://api.anti-captcha.com/createTask";
    const payload = {
        clientKey: CAPTCHA_API_KEY,
        task: { type: "TurnstileTaskProxyless", websiteURL: PAGE_URL, websiteKey: SITE_KEY }
    };

    try {
        const createResp = await axios.post(createUrl, payload, { timeout: 30000 });
        if (createResp.data.errorId !== 0) return { token: null, error: `Create error: ${JSON.stringify(createResp.data)}` };

        const taskId = createResp.data.taskId;
        const resultUrl = "https://api.anti-captcha.com/getTaskResult";

        for (let attempt = 0; attempt < 40; attempt++) {
            await sleep(2000);
            const resResp = await axios.post(resultUrl, { clientKey: CAPTCHA_API_KEY, taskId: taskId }, { timeout: 30000 });
            if (resResp.data.status === "ready") return { token: resResp.data.solution.token, error: null };
            if (resResp.data.status !== "processing") return { token: null, error: `Solve error: ${JSON.stringify(resResp.data)}` };
        }
        return { token: null, error: "Anti-Captcha timeout 80s" };
    } catch (err) {
        return { token: null, error: err.message };
    }
}

async function dapatkanTokenCaptcha() {
    if (CAPTCHA_SERVICE === "anticaptcha") return await solveTurnstileAntiCaptcha();
    return await solveTurnstile2Captcha();
}

// ====================================================================
// 🚀 API-BASED LOGIN ENGINE (MURNI TEMBAKAN HTTP REQUEST)
// ====================================================================
async function pemicuLoginOtomatisAkun(akun) {
    console.log(`   [API LOGIN] Memulai proses solver Turnstile Captcha...`);
    const { token: turnstileToken, error: captchaErr } = await dapatkanTokenCaptcha();
    
    if (captchaErr) {
        console.error(`   ❌ [CAPTCHA ERROR]: ${captchaErr}`);
        return null;
    }
    console.log(`   ✅ [CAPTCHA] Token berhasil didapatkan.`);

    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar, withCredentials: true }));
    
    client.defaults.headers.common = {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9',
        'origin': 'https://billsonchain.io',
        'referer': 'https://billsonchain.io/login'
    };

    let csrfToken = "";
    try {
        // Step 1: Hit halaman login untuk memancing CSRF Cookie dari Better Auth
        await client.get(PAGE_URL, { timeout: 15000 });
        const cookies = await jar.getCookies(PAGE_URL);
        for (const cookie of cookies) {
            if (cookie.key.toLowerCase().includes("csrf")) {
                csrfToken = cookie.value;
                break;
            }
        }
    } catch (err) {
        console.error(`   ❌ [CSRF ERROR]: Gagal mendapatkan token awal.`);
        return null;
    }

    // Step 2: Kirim payload login langsung ke endpoint callback Better Auth
    const loginUrl = 'https://bocapi.billsonchain.io/api/auth/callback/credentials';
    const dataPayload = {
        email: akun.email,
        password: akun.password,
        callbackUrl: "https://billsonchain.io/dashboard",
        redirect: "false",
        turnstileToken: turnstileToken
    };
    if (csrfToken) dataPayload.csrfToken = csrfToken;

    const headersPayload = {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-turnstile-token": turnstileToken
    };

    try {
        console.log(`   [API LOGIN] Mengirimkan kredensial dan token bypass...`);
        const resp = await client.post(loginUrl, new URLSearchParams(dataPayload).toString(), {
            headers: headersPayload,
            timeout: 20000,
            maxRedirects: 0,
            validateStatus: (status) => true
        });

        if (resp.status === 200 || resp.status === 302) {
            const currentCookies = await jar.getCookies(PAGE_URL);
            const cookieString = currentCookies.map(c => `${c.key}=${c.value}`).join('; ');

            if (!cookieString.toLowerCase().includes('session')) {
                console.error(`   ❌ [LOGIN FAILED]: Kredensial valid tetapi session token tidak dikeluarkan.`);
                return null;
            }

            console.log(`   ✅ [API LOGIN] Login sukses via HTTP POST.`);
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
        } else {
            console.error(`   ❌ [LOGIN FAILED]: Server merespons dengan status ${resp.status}`);
            return null;
        }
    } catch (e) {
        console.error(`   ❌ [API ENGINE ERROR]: ${e.message}`);
        return null;
    }
}

// ====================================================================
// 🌏 DATABASE MERCHANT & WILAYAH (Sisa kode pembuatan struk & loop tetap sama)
// ====================================================================
function generateMerchantUnik() {
    const tipeBisnis = ['WARUNG', 'TOKO', 'KEDAI', 'CAFE', 'COFFEE', 'MART', 'CELL', 'BOUTIQUE', 'RESTO', 'MINIMARKET'];
    const namaUnik = ['PANSA', 'PANSAGROUP', 'JAYA', 'MAKMUR', 'BERKAH', 'SARI', 'UTAMA', 'SUMBER'];
    const wilayah = ['SURABAYA', 'SIDOARJO', 'GRESIK', 'MALANG', 'JAKARTA', 'BANDUNG', 'MEDAN'];
    const imbuhan = ['CENTRAL', 'EXPRESS', 'UTAMA', 'SUKSES', 'PRIMA', 'DIGITAL'];

    const t = pick(tipeBisnis); const n = pick(namaUnik); const w = pick(wilayah); const i = pick(imbuhan);
    let namaToko = `${t} ${n} ${w}`;
    if (namaToko.length > 26) namaToko = namaToko.substring(0, 26);

    const versiNmid = pick(['ID10', 'ID20', 'ID30']);
    const digitTahun = pick(['24', '25', '26']);
    const sisaDigit = pad(crypto.randomInt(10000000, 99999999), 8);

    return { name: namaToko.toUpperCase(), nmid: `${versiNmid}${digitTahun}${sisaDigit}` };
}

const PAYMENT_METHODS = ['Saldo DANA', 'Rekening BCA', 'Rekening Mandiri', 'Saldo GoPay', 'OVO Cash', 'ShopeePay Balance'];

function generateData() {
    const merchant = generateMerchantUnik();
    const steps   = Math.floor((2000000 - 10000) / 5000);
    const nominal = 10000 + ri(0, steps) * 5000;

    const d = new Date(); d.setDate(d.getDate() - ri(0, 10)); d.setHours(ri(7, 22), ri(0, 59), ri(0, 59));
    const MONTHS  = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
    const dateStr = `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const tsTag    = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
    
    const microRand1 = crypto.randomInt(1000, 9999);
    const microRand2 = crypto.randomInt(100000, 999999);
    const uniqueSuffix = Date.now().toString().slice(-4);

    return {
        merchant, nominal, dateStr,
        txId: `${tsTag}111212${microRand1}${microRand2}`,
        rrn: `${crypto.randomInt(100000, 999999)}${crypto.randomInt(100000, 999999)}`,
        approval: pad(ri(100000, 999999), 6),
        termId: `EDC${ri(10000000, 99999999)}`,
        fileUniqueTag: `${tsTag}_${uniqueSuffix}_${microRand1}`,
        payMethod: pick(PAYMENT_METHODS),
        refNum: `REF${tsTag}${microRand1}`
    };
}

function drawQR(ctx, cx, cy, size) {
    const M = 25; const cell = size / M;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - size/2, cy - size/2, size, size);
    const fill = (col, row, color = '#1a1a1a') => {
        ctx.fillStyle = color; ctx.fillRect(cx - size/2 + col * cell + 0.3, cy - size/2 + row * cell + 0.3, cell - 0.6, cell - 0.6);
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
            if (!(r<9 && c<9) && !(r<9 && c>=M-8) && !(r>=M-8 && c<9) && r!==6 && c!==6) { if (rng() > 0.52) fill(c, r); }
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

    ctx.strokeStyle = LINE; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(RX + 20, NOM_Y + 45); ctx.lineTo(RX + RW - 20, NOM_Y + 45); ctx.stroke(); 
    
    const QR_Y = NOM_Y + 110; drawQR(ctx, BASE_W / 2, QR_Y, 115);
    ctx.strokeStyle = '#dddddd'; ctx.lineWidth = 1; ctx.strokeRect(BASE_W/2 - 115/2 - 1, QR_Y - 115/2 - 1, 117, 117);

    ctx.fillStyle = '#333333'; ctx.font = 'bold 12px Arial'; ctx.fillText('QRIS', BASE_W / 2, QR_Y + 76);
    ctx.fillStyle = GREY; ctx.font = '10px Arial'; ctx.fillText(`NMID: ${data.merchant.nmid}`, BASE_W / 2, QR_Y + 92);

    ctx.beginPath(); ctx.moveTo(RX + 20, QR_Y + 108); ctx.lineTo(RX + RW - 20, QR_Y + 108); stroke();

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
    fs.writeFileSync(fp, canvas.toBuffer('image/png'));
    return { fp, filename, buffer: canvas.toBuffer('image/png') };
}

function generateAndSaveReceiptData() {
    const data = generateData();
    const canvas = drawReceipt(data);
    return saveReceipt(canvas, data.fileUniqueTag);
}

async function uploadAndConfirmReceipt(cookie, filename, buffer, fp) {
    try {
        const initResponse = await apiClient.post('/bill/init', 
            { filename, contentType: 'image/png', fileSizeBytes: buffer.length },
            { headers: { 'cookie': cookie } }
        );

        if (!initResponse.data || !initResponse.data.ok) {
            if ((initResponse.data?.error?.code || '').includes('LIMIT')) {
                console.log(`   ⚠️ [LIMIT DETECTED] Akun terkena limit harian.`);
                if (fs.existsSync(fp)) fs.unlinkSync(fp);
                return { status: 'LIMIT' };
            }
            throw new Error('Gagal init berkas.');
        }

        const { billId, uploadUrl = initResponse.data.data.uploadUrl } = initResponse.data.data;
        await axios.put(uploadUrl, buffer, { headers: { 'Content-Type': 'image/png' } });
        if (fs.existsSync(fp)) fs.unlinkSync(fp);

        await apiClient.post(`/bill/${billId}/confirm`, {}, { headers: { 'cookie': cookie } });

        let attempts = 0;
        while (attempts < 20) {
            attempts++;
            await sleep(2000);
            const statusResponse = await apiClient.get(`/bill/${billId}/status`, { headers: { 'cookie': cookie } });
            if (statusResponse.data && statusResponse.data.ok) {
                const currentStatus = statusResponse.data.data.status;
                if (currentStatus === 'fraud_passed' || currentStatus === 'dedup_passed') return { status: 'SUCCESS' };
                if (currentStatus === 'failed' || statusResponse.data.data.failureReason) return { status: 'REJECTED' };
            }
        }
        return { status: 'TIMEOUT' };
    } catch (error) {
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
        if (error.response?.status === 429) return { status: 'LIMIT' };
        return { status: 'ERROR' };
    }
}

async function runAccountLoop(account) {
    console.log(`\n=============================================================`);
    console.log(`👤 SESI AKUN: [ ${account.accountName} ]`);
    console.log(`=============================================================`);
    
    let cookieAktif = ambilCookieLokal(account.email);
    let butuhLogin = true;

    if (cookieAktif && await cekApakahCookieValid(cookieAktif)) {
        console.log(`   🚀 [VALID] Cookie lokal masih aktif! Lewati login API.`);
        butuhLogin = false;
    }

    if (butuhLogin) {
        cookieAktif = await pemicuLoginOtomatisAkun(account);
    }
    
    if (!cookieAktif) {
        console.log(`❌ [SKIP] Gagal mendapatkan session login untuk akun [${account.accountName}].`);
        return 0;
    }

    let isRunning = true; let uploadedCount = 0;
    while (isRunning) {
        const { fp, filename, buffer, data } = generateAndSaveReceiptData();
        const result = await uploadAndConfirmReceipt(cookieAktif, filename, buffer, fp);
        
        if (result.status === 'LIMIT') {
            console.log(`🛑 [STOP] Akun [${account.accountName}] diselesaikan karena LIMIT.`);
            isRunning = false;
        } else {
            uploadedCount++;
            await sleep(JEDA_UPLOAD_MS);
        }
    }
    return uploadedCount;
}

async function main() {
    const accounts = loadDaftarAkun();
    const args = process.argv.slice(2);
    if (args.includes('--seed')) {
        const index = args.indexOf('--seed');
        const seedVal = parseInt(args[index + 1], 10);
        if (!isNaN(seedVal)) { rng = mulberry32(seedVal); }
    }

    for (const account of accounts) {
        if (!account.email || account.email === 'email@gmail.com') continue;
        const totalUploaded = await runAccountLoop(account);
        console.log(`\n✨ Akun [${account.accountName}] selesai memproses ${totalUploaded} struk.`);
    }
}

main();
