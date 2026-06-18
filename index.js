import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { createCanvas } from 'canvas';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
// import { HttpsProxyAgent } from 'https-proxy-agent';
import UserAgent from 'user-agents';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DAFTAR_AKUN_FILE = path.join(__dirname, 'daftar-akun.json');
const COOKIE_FILE = path.join(__dirname, 'cookie.json');
const OUTPUT_DIR = path.join(__dirname, 'struck');

// Helper Proxy
// const getProxyAgent = () => process.env.PROXY_URL ? new HttpsProxyAgent(process.env.PROXY_URL) : null;

// Axios Client Dinamis dengan Proteksi AbortSignal & Inject CookieJar
const createApiClient = (cookie = null, customTimeout = 25000) => {
    const jar = new CookieJar();
    const config = {
        baseURL: process.env.BASE_API_URL,
        timeout: customTimeout,
        signal: AbortSignal.timeout(customTimeout + 5000), // Proteksi hang di level TCP proxy
        headers: {
            'user-agent': new UserAgent({ deviceCategory: 'desktop' }).toString(),
            'accept': '*/*',
            'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'origin': 'https://billsonchain.io',
            'referer': 'https://billsonchain.io/'
        },
        httpsAgent: getProxyAgent(),
        httpAgent: getProxyAgent(),
        jar,
        withCredentials: true
    };
    if (cookie) config.headers['cookie'] = cookie;
    
    const client = wrapper(axios.create(config));
    client.jar = jar; // Ekspos object jar agar bisa dibaca langsung setelah login
    return client;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = (min, max) => sleep(Math.floor(Math.random() * (max - min + 1) + min));
let rng = Math.random;

function mulberry32(seed) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

const pad = (n, l = 2) => String(n).padStart(l, '0');
const pick = arr => arr[Math.floor(rng() * arr.length)];
const ri = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
const formatRupiah = n => 'Rp' + n.toLocaleString('id-ID');

async function loadDaftarAkun() {
    try {
        const data = await fs.readFile(DAFTAR_AKUN_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        console.error(`[ERROR] Gagal memuat ${DAFTAR_AKUN_FILE}`);
        process.exit(1);
    }
}

async function ambilCookieLokal(email) {
    try {
        const cookiesData = JSON.parse(await fs.readFile(COOKIE_FILE, 'utf-8'));
        const dataAkun = cookiesData.find(item => item.email === email);
        return dataAkun && dataAkun.cookie ? dataAkun.cookie : null;
    } catch (e) {
        return null;
    }
}

async function simpanDataKeJsonRealtime(filePath, dataBaru, keyUnique = 'email') {
    let listLama = [];
    try {
        const rawData = await fs.readFile(filePath, 'utf-8');
        listLama = JSON.parse(rawData);
    } catch (e) {
        listLama = [];
    }
    const indexSama = listLama.findIndex(item => item[keyUnique] === dataBaru[keyUnique]);
    if (indexSama !== -1) listLama[indexSama] = dataBaru;
    else listLama.push(dataBaru);
    
    await fs.writeFile(filePath, JSON.stringify(listLama, null, 4));
}

async function cekApakahCookieValid(client) {
    try {
        const response = await client.get('/auth/get-session');
        if (response.data?.session) {
            const waktuExpired = new Date(response.data.session.expiresAt).getTime();
            if (waktuExpired > Date.now()) return true;
        }
        return false;
    } catch (error) { 
        return false; 
    }
}

async function dapatkanStatsUser(client) {
    try {
        const response = await client.post('/user/stats/refresh', {});
        return response.data?.ok ? response.data.data : null;
    } catch (error) { 
        return null; 
    }
}

async function solveTurnstile2Captcha() {
    const submitUrl = "https://2captcha.com/in.php";
    const payload = { key: process.env.CAPTCHA_API_KEY, method: "turnstile", sitekey: process.env.SITE_KEY, pageurl: process.env.PAGE_URL, json: 1 };
    try {
        const submitResp = await axios.post(submitUrl, new URLSearchParams(payload).toString(), { timeout: 30000 });
        if (submitResp.data.status !== 1) return { token: null, error: submitResp.data };
        const taskId = submitResp.data.request;
        const resultUrl = "https://2captcha.com/res.php";
        
        for (let attempt = 0; attempt < 40; attempt++) {
            await sleep(2000);
            const resResp = await axios.get(resultUrl, { params: { key: process.env.CAPTCHA_API_KEY, action: "get", id: taskId, json: 1 }, timeout: 30000 });
            if (resResp.data.status === 1) return { token: resResp.data.request, error: null };
            if (resResp.data.request !== "CAPCHA_NOT_READY") return { token: null, error: resResp.data };
        }
        return { token: null, error: "TIMEOUT" };
    } catch (err) { return { token: null, error: err.message }; }
}

async function solveTurnstileAntiCaptcha() {
    const createUrl = "https://api.anti-captcha.com/createTask";
    const payload = { clientKey: process.env.CAPTCHA_API_KEY, task: { type: "TurnstileTaskProxyless", websiteURL: process.env.PAGE_URL, websiteKey: process.env.SITE_KEY } };
    try {
        const createResp = await axios.post(createUrl, payload, { timeout: 30000 });
        if (createResp.data.errorId !== 0) return { token: null, error: createResp.data };
        const taskId = createResp.data.taskId;
        const resultUrl = "https://api.anti-captcha.com/getTaskResult";
        
        for (let attempt = 0; attempt < 40; attempt++) {
            await sleep(2000);
            const resResp = await axios.post(resultUrl, { clientKey: process.env.CAPTCHA_API_KEY, taskId: taskId }, { timeout: 30000 });
            if (resResp.data.status === "ready") return { token: resResp.data.solution.token, error: null };
            if (resResp.data.status !== "processing") return { token: null, error: resResp.data };
        }
        return { token: null, error: "TIMEOUT" };
    } catch (err) { return { token: null, error: err.message }; }
}

async function dapatkanTokenCaptcha() {
    return process.env.CAPTCHA_SERVICE === "anticaptcha" ? await solveTurnstileAntiCaptcha() : await solveTurnstile2Captcha();
}

// Mutex antrean login
let sedangProsesLogin = false;

async function pemicuLoginOtomatisAkun(akun) {
    // SISTEM ANTREAN (MUTEX)
    while (sedangProsesLogin) {
        await sleep(2000); 
    }
    sedangProsesLogin = true; 

    try {
        console.log(`[${akun.accountName}] Memulai login... Meminta token Turnstile (Captcha).`);
        const { token: turnstileToken, error: captchaErr } = await dapatkanTokenCaptcha();
        
        if (captchaErr || !turnstileToken) {
            console.log(`[${akun.accountName}] Gagal memecahkan Captcha:`, captchaErr || "Token kosong");
            return null;
        }
        console.log(`[${akun.accountName}] Captcha selesai. Langsung menembak API Login...`);
        
        const client = createApiClient(null, 30000); 
        
        const loginUrl = `${process.env.BASE_API_URL}/auth/sign-in/email`;
        const dataPayload = { 
            email: akun.email, 
            password: akun.password, 
            callbackURL: "https://billsonchain.io/dashboard" 
        };
        const headersPayload = { 
            "content-type": "application/json", 
            "x-turnstile-token": turnstileToken,
            "accept": "application/json, text/plain, */*"
        };
        
        const resp = await client.post(loginUrl, dataPayload, { 
            headers: headersPayload, 
            timeout: 30000, 
            maxRedirects: 5, 
            validateStatus: () => true 
        });
        
        if ([200, 201, 302].includes(resp.status)) {
            // Ambil cookie langsung menggunakan library tough-cookie bawaan jar
            let cookieString = client.jar.getCookieStringSync('https://billsonchain.io');
            
            // Fallback jika session_token terlewat (jarang terjadi jika client.jar diset dengan benar)
            if (!cookieString || !cookieString.toLowerCase().includes('session_token')) {
                const rawSetCookie = resp.headers['set-cookie'];
                if (rawSetCookie) cookieString = rawSetCookie.map(c => c.split(';')[0]).join('; ');
            }
            
            const dataCookieFix = { 
                accountName: akun.accountName, 
                fullName: akun.fullName || akun.accountName, 
                email: akun.email, 
                password: akun.password, 
                cookie: cookieString, 
                savedAt: new Date().toISOString() 
            };
            
            await simpanDataKeJsonRealtime(COOKIE_FILE, dataCookieFix, 'email');
            console.log(`[${akun.accountName}] ✅ Login berhasil, sesi Cookie tersimpan.`);
            return cookieString;
        }
        
        console.log(`[${akun.accountName}] ❌ Login ditolak. Status: ${resp.status}`);
        if (resp.data) {
            console.log(`[${akun.accountName}] Alasan penolakan dari server:`, JSON.stringify(resp.data));
        }
        return null;

    } catch (e) { 
        const errorMessage = e.code === 'ECONNABORTED' ? 'Koneksi Proxy/Server Timeout' : e.message;
        console.log(`[${akun.accountName}] ❌ Request login terputus: ${errorMessage}`);
        return null; 
    } finally {
        // Buka kembali gerbang antrean login
        sedangProsesLogin = false; 
    }
}

const KOTA_JAWA_TIMUR = ["SURABAYA", "SIDOARJO", "GRESIK", "MALANG", "MOJOKERTO", "PASURUAN", "JOMBANG", "MADIUN", "KEDIRI", "BLITAR", "PROBOLINGGO", "TULUNGAGUNG", "NGANJUK", "LAMONGAN", "TUBAN", "BOJONEGORO", "NGAWI", "MAGETAN", "PONOROGO", "PACITAN", "TRENGGALEK", "LUMAJANG", "JEMBER", "BANYUWANGI"];
const REKAYASA_STORE = ["Trijaya Toko Utama", "Maju Jaya Abadi", "Sumber Berkah Retail", "Pansa Corp Labs", "Sentosa Jaya Retail", "Nusantara Jaya Utama", "Sultan Berkah Mart", "Glow Central Minimarket", "Inti Berkah Food", "Sinar Utama Cell", "Delta Digital Cash", "Warung Berkah Utama", "Kedai Kita Bersama", "Barokah Abadi Mart", "Lancar Jaya Retail"];
const REKAYASA_ACQUIRER = ["Shopee", "DANA", "GOPAY", "OVO", "LinkAja", "BCA", "Mandiri", "BNI", "BRI"];

function generateData() {
    const kota = pick(KOTA_JAWA_TIMUR);
    const namaToko = pick(REKAYASA_STORE);
    const acquirer = pick(REKAYASA_ACQUIRER);
    const nominalTeracak = ri(11, 240) * 1000 + pick([100, 200, 300, 400, 500, 600, 700, 800, 900]);
    const d = new Date(); d.setDate(d.getDate() - ri(1, 6)); d.setHours(ri(7, 21), ri(0, 59), ri(0, 59));
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
    const dateStr = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} • ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const tsTag = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
    
    return {
        merchant: { name: namaToko.toUpperCase(), fullIdentity: `${namaToko} KAB. ${kota} ID`.toUpperCase(), location: `KAB. ${kota}, ${ri(61100, 69900)}, ID`, nmid: `ID1026${crypto.randomInt(10000000, 99999999)}` },
        acquirer, nominal: nominalTeracak, dateStr, 
        txId: `TX${tsTag}${crypto.randomInt(1000, 9999)}${crypto.randomInt(100, 999)}`, 
        pan: `936009${crypto.randomInt(100000, 999999)}${crypto.randomInt(1000, 9999)}04`, 
        terminalId: crypto.randomInt(1000000, 9999999).toString(), 
        cpan: `936009${crypto.randomInt(100000, 999999)}${crypto.randomInt(1000, 9999)}44`, 
        rrn: `${crypto.randomInt(1000, 9999)}${crypto.randomInt(1000, 9999)}${crypto.randomInt(1000, 9999)}`, 
        fileUniqueTag: `${tsTag}_${crypto.randomInt(1000, 9999)}`, payMethod: 'DANA Balance'
    };
}

function drawReceipt(data) {
    const SCALE = 2; const BASE_W = 420; const BASE_H = 880;
    const canvas = createCanvas(BASE_W * SCALE, BASE_H * SCALE); const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    
    const angleJitter = (rng() * 0.36 - 0.18) * Math.PI / 180;
    ctx.translate(BASE_W / 2, BASE_H / 2);
    ctx.transform(1, (rng() * 0.006 - 0.003), (rng() * 0.006 - 0.003), 1, 0, 0);
    ctx.rotate(angleJitter);
    ctx.translate(-BASE_W / 2, -BASE_H / 2);
    
    const jY = () => ri(-2, 2); const jX = () => ri(-2, 2);
    const p = 16; const marginX = ri(-2, 2); const marginY = ri(-2, 2);
    
    ctx.fillStyle = `rgb(${ri(10, 16)}, ${ri(136, 142)}, ${ri(231, 239)})`; ctx.fillRect(0, 0, BASE_W, BASE_H);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(p + marginX, p + 40 + marginY, BASE_W - (p * 2), BASE_H - (p * 2) - 80);
    
    ctx.fillStyle = '#000000'; ctx.textAlign = 'center'; ctx.font = `bold ${ri(36,39)}px Arial`; ctx.fillText("QRIS", BASE_W / 2 + jX(), 130 + jY());
    ctx.fillStyle = '#555555'; ctx.font = '14px Arial'; ctx.textAlign = 'left'; ctx.fillText(data.dateStr, p + 22 + marginX, 195 + jY());
    ctx.textAlign = 'right'; ctx.fillText("DANA ID 0821••••6061", BASE_W - p - 22 + marginX, 195 + jY());
    
    ctx.strokeStyle = '#ebeeef'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p + 20 + marginX, 225 + marginY); ctx.lineTo(BASE_W - p - 20 + marginX, 225 + marginY); ctx.stroke();
    ctx.fillStyle = '#01b169'; ctx.beginPath(); ctx.arc(p + 30 + marginX, 255 + jY(), 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center'; ctx.fillText('✓', p + 30 + marginX, 259 + jY());
    ctx.fillStyle = '#333333'; ctx.font = 'bold 15px Arial'; ctx.textAlign = 'left'; ctx.fillText("Transaction success!", p + 52 + marginX, 260 + jY());
    
    ctx.fillStyle = '#000000'; ctx.font = 'bold 17px Arial'; ctx.fillText(`Payment to ${data.merchant.name}`, p + 20 + marginX, 300 + jY());
    ctx.fillStyle = `rgb(${ri(232, 237)}, ${ri(243, 247)}, ${ri(251, 255)})`; ctx.fillRect(p + 20 + marginX, 335 + jY(), BASE_W - (p * 2) - 40, 55);
    ctx.fillStyle = '#000000'; ctx.font = 'bold 16px Arial'; ctx.fillText("Total Payment", p + 35 + marginX, 368 + jY());
    ctx.textAlign = 'right'; ctx.font = `bold ${ri(20,22)}px Arial`; ctx.fillText(formatRupiah(data.nominal), BASE_W - p - 35 + marginX, 368 + jY());
    
    ctx.fillStyle = '#444444'; ctx.font = '15px Arial'; ctx.textAlign = 'left'; ctx.fillText("Payment Method", p + 20 + marginX, 425 + jY());
    ctx.textAlign = 'right'; ctx.fillStyle = '#000000'; ctx.fillText(data.payMethod, BASE_W - p - 20 + marginX, 425 + jY());
    
    ctx.strokeStyle = '#dce1e5'; ctx.beginPath(); ctx.moveTo(p + 20 + marginX, 455 + marginY); ctx.lineTo(BASE_W - p - 20 + marginX, 455 + marginY); ctx.stroke();
    ctx.fillStyle = '#000000'; ctx.font = 'bold 17px Arial'; ctx.textAlign = 'left'; ctx.fillText("Transaction Detail", p + 20 + marginX, 495 + jY());
    
    const line = (lbl, val, y) => {
        const offset = jY();
        ctx.fillStyle = '#444444'; ctx.font = '15px Arial'; ctx.textAlign = 'left'; ctx.fillText(lbl, p + 20 + jX() + marginX, y + offset);
        ctx.fillStyle = '#000000'; ctx.font = 'bold 15px Arial'; ctx.textAlign = 'right'; ctx.fillText(val, BASE_W - p - 20 + jX() + marginX, y + offset);
    };
    line("Acquirer Name", data.acquirer, 535); line("Merchant Name", data.merchant.fullIdentity, 575); 
    line("Merchant Location", data.merchant.location, 615); line("Merchant PAN", data.pan, 655); 
    line("Terminal ID", data.terminalId, 695); line("CPAN", data.cpan, 735); line("RRN", data.rrn, 775);
    
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#0f8beb'; ctx.lineWidth = 2;
    ctx.fillRect(p + 20 + marginX, BASE_H - 85 + marginY, BASE_W - (p * 2) - 40, 45); ctx.strokeRect(p + 20 + marginX, BASE_H - 85 + marginY, BASE_W - (p * 2) - 40, 45);
    ctx.fillStyle = '#0f8beb'; ctx.font = 'bold 15px Arial'; ctx.textAlign = 'center'; ctx.fillText("NEED SOME HELP?", BASE_W / 2 + jX(), BASE_H - 58 + jY());
    
    const imgData = ctx.getImageData(0, 0, BASE_W * SCALE, BASE_H * SCALE);
    const dataPix = imgData.data;
    for (let i = 0; i < dataPix.length; i += 4) {
        if (rng() > 0.85) { 
            const noise = ri(-8, 8);
            dataPix[i] = Math.min(255, Math.max(0, dataPix[i] + noise));
            dataPix[i+1] = Math.min(255, Math.max(0, dataPix[i+1] + noise));
            dataPix[i+2] = Math.min(255, Math.max(0, dataPix[i+2] + noise));
        }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
}

async function saveReceipt(canvas, uniqueId) {
    if (!fsSync.existsSync(OUTPUT_DIR)) {
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
    }
    const filename = `receipt_${uniqueId}.png`; 
    const fp = path.join(OUTPUT_DIR, filename);
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(fp, buffer);
    return { fp, filename, buffer };
}

async function generateAndSaveReceiptData() {
    const data = generateData(); 
    const canvas = drawReceipt(data);
    const { fp, filename, buffer } = await saveReceipt(canvas, data.fileUniqueTag);
    return { fp, filename, buffer, data };
}

async function uploadAndConfirmReceipt(client, filename, buffer, fp) {
    try {
        const initResponse = await client.post('/bill/init', { filename, contentType: 'image/png', fileSizeBytes: buffer.length });
        if (!initResponse.data || !initResponse.data.ok) {
            if ((initResponse.data?.error?.code || '').includes('LIMIT')) {
                await fs.unlink(fp).catch(() => {});
                return { status: 'LIMIT' };
            }
            throw new Error('INIT_ERROR');
        }
        const { billId, uploadUrl = initResponse.data.data.uploadUrl } = initResponse.data.data;
        
        await axios.put(uploadUrl, buffer, { headers: { 'Content-Type': 'image/png' } });
        await fs.unlink(fp).catch(() => {});
        
        // Error handling stream timeout/macet
        try {
            const streamResponse = await client.get(`/bill/${billId}/status/stream`, { responseType: 'stream', timeout: 10000 });
            if (streamResponse.data && typeof streamResponse.data.destroy === 'function') {
                streamResponse.data.destroy();
            }
        } catch (streamErr) {
            console.log(`[ID: ${billId}] Peringatan: Gagal memutus stream, melanjutkan ke konfirmasi...`);
        }
        
        await client.post(`/bill/${billId}/confirm`, {});
        
        let attempts = 0;
        while (attempts < 25) {
            attempts++;
            await randomDelay(3000, 6000); 
            const statusResponse = await client.get(`/bill/${billId}/status`);
            if (statusResponse.data && statusResponse.data.ok) {
                const currentStatus = statusResponse.data.data.status;
                console.log(`[ID: ${billId}] [CHECK ${attempts}] Status: ${currentStatus}`);
                if (currentStatus === 'fraud_passed' || currentStatus === 'dedup_passed') return { status: 'SUCCESS' };
                if (currentStatus === 'failed' || currentStatus === 'fraud_rejected' || statusResponse.data.data.failureReason) return { status: 'REJECTED' };
            }
        }
        return { status: 'TIMEOUT' };
    } catch (error) {
        await fs.unlink(fp).catch(() => {});
        const httpStatus = error.response?.status;
        const resDataString = error.response?.data ? JSON.stringify(error.response.data).toUpperCase() : '';
        if (httpStatus === 429 || resDataString.includes('LIMIT')) return { status: 'LIMIT' };
        return { status: 'ERROR' };
    }
}

async function runAccountLoop(account) {
    console.log(`[${account.accountName}] Memulai pengecekan sesi cookie...`);
    let cookieAktif = await ambilCookieLokal(account.email);
    let client = createApiClient(cookieAktif, 25000); 
    
    let butuhLoginBrowser = true;
    if (cookieAktif) {
        const apaValid = await cekApakahCookieValid(client);
        if (apaValid) {
            console.log(`[${account.accountName}] Sesi valid. Langsung memproses struk.`);
            butuhLoginBrowser = false;
        } else {
            console.log(`[${account.accountName}] Sesi kedaluwarsa. Membutuhkan login ulang.`);
        }
    } else {
        console.log(`[${account.accountName}] Cookie tidak ditemukan. Membutuhkan login.`);
    }
    
    if (butuhLoginBrowser) {
        cookieAktif = await pemicuLoginOtomatisAkun(account);
        client = createApiClient(cookieAktif, 25000); 
    }
    
    if (!cookieAktif) {
        console.log(`[${account.accountName}] GAGAL MENDAPATKAN SESI. Melewati akun ini.`);
        return 0;
    }
    
    const initialStats = await dapatkanStatsUser(client);
    let isRunning = true; let uploadedCount = 0;
    
    while (isRunning) {
        const { fp, filename, buffer, data } = await generateAndSaveReceiptData();
        console.log(`[${account.accountName}] Mengunggah: ${data.merchant.name} | ${formatRupiah(data.nominal)}`);
        
        const result = await uploadAndConfirmReceipt(client, filename, buffer, fp);
        
        if (result.status === 'LIMIT') {
            isRunning = false;
            console.log(`[${account.accountName}] Limit harian tercapai.`);
        } else {
            uploadedCount++;
            const userDelay = parseInt(process.env.JEDA_UPLOAD_MS, 10) || 5000;
            await randomDelay(userDelay, userDelay + 5000); 
        }
    }
    return uploadedCount;
}

async function main() {
    console.log(`=============================================================`);
    console.log(`🚀 WELCOME BOT - PANSA GROUP LABS`);
    console.log(`=============================================================`);
    
    const accounts = await loadDaftarAkun();
    const validAccounts = accounts.filter(acc => acc.email && acc.email !== 'email@gmail.com');
    
    const args = process.argv.slice(2);
    if (args.includes('--seed')) {
        const index = args.indexOf('--seed');
        const seedVal = parseInt(args[index + 1], 10);
        if (!isNaN(seedVal)) { rng = mulberry32(seedVal); }
    }

    // Eksekusi Paralel (Batching)
    const BATCH_SIZE = 1; 
    for (let i = 0; i < validAccounts.length; i += BATCH_SIZE) {
        const batch = validAccounts.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (account) => {
            const totalUploaded = await runAccountLoop(account);
            console.log(`[${account.accountName}] Selesai memproses ${totalUploaded} struk.`);
        }));
        if (i + BATCH_SIZE < validAccounts.length) {
            console.log(`Memasuki batch berikutnya...`);
            await randomDelay(5000, 10000);
        }
    }
}

main();
