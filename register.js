import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import readline from 'readline';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LIST_EMAIL_FILE = path.join(__dirname, 'list.txt');
const DAFTAR_AKUN_FILE = path.join(__dirname, 'daftar-akun.json');
const COOKIE_OUTPUT_FILE = path.join(__dirname, 'cookie.json');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function loadListEmailUtama() {
    if (!fs.existsSync(LIST_EMAIL_FILE)) {
        fs.writeFileSync(LIST_EMAIL_FILE, "contohgmail@gmail.com\n");
        process.exit(1);
    }
    return fs.readFileSync(LIST_EMAIL_FILE, 'utf-8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && line.includes('@gmail.com'));
}

function hitungMaksimalDotTrick(email) {
    const [username] = email.split('@');
    const n = username.length;
    if (n <= 1) return 1;
    return Math.pow(2, Math.min(n - 1, 30));
}

function generateNamaAcakPremium() {
    const namaDepan = ['Budi', 'Andi', 'Eko', 'Siti', 'Dewi', 'Rian', 'Hendra', 'Roni', 'Dika', 'Gani', 'Yanto', 'Santi', 'Mega', 'Adit', 'Feri', 'Aris', 'Fahmi', 'Dodi', 'Agus', 'Hadi', 'Irwan', 'Yudi', 'Rudi', 'Doni', 'Reza', 'Taufik', 'Irfan', 'Bayu', 'Riki'];
    const namaTengah = ['Kurnia', 'Susanto', 'Eka', 'Putra', 'Putri', 'Sari', 'Indah', 'Jaya', 'Agustina', 'Prasetio', 'Budiman', 'Utama', 'Rahma', 'Wulandari', 'Kusuma', 'Gunawan', 'Hidayat', 'Fadilah', 'Setiawan', 'Nugraha'];
    const namaBelakang = ['Santoso', 'Wijaya', 'Saputra', 'Lestari', 'Pratama', 'Hidayat', 'Kurniawan', 'Utami', 'Setiawan', 'Nugroho', 'Siregar', 'Lubis', 'Nasution', 'Simanjuntak', 'Mulyono', 'Suwito', 'Purnama'];
    const depan = namaDepan[Math.floor(Math.random() * namaDepan.length)];
    const tengah = namaTengah[Math.floor(Math.random() * namaTengah.length)];
    const belakang = namaBelakang[Math.floor(Math.random() * namaBelakang.length)];
    const angka = Math.floor(100 + Math.random() * 900);
    return Math.random() > 0.4 ? `${depan} ${belakang} ${angka}` : `${depan} ${tengah} ${belakang}`;
}

function generateDotTrickPintar(emailUtama, indexVariasi) {
    const [username, domain] = emailUtama.split('@');
    if (indexVariasi === 0) return emailUtama;
    let hasil = "";
    let posisiTitik = indexVariasi;
    for (let i = 0; i < username.length; i++) {
        hasil += username[i];
        if (i < username.length - 1 && (posisiTitik & (1 << i))) {
            hasil += ".";
        }
    }
    return `${hasil}@${domain}`;
}

function simpanDataKeJsonRealtime(filePath, dataBaru, keyUnique = 'email') {
    let listLama = [];
    if (fs.existsSync(filePath)) {
        try { listLama = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch (e) { listLama = []; }
    }
    const indexSama = listLama.findIndex(item => item[keyUnique] === dataBaru[keyUnique]);
    if (indexSama !== -1) {
        listLama[indexSama] = dataBaru;
    } else {
        listLama.push(dataBaru);
    }
    fs.writeFileSync(filePath, JSON.stringify(listLama, null, 4));
}

async function solveTurnstile2Captcha() {
    const submitUrl = "https://2captcha.com/in.php";
    const payload = { key: process.env.CAPTCHA_API_KEY, method: "turnstile", sitekey: process.env.SITE_KEY, pageurl: process.env.REGISTER_PAGE_URL, json: 1 };
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
    } catch (err) {
        return { token: null, error: err.message };
    }
}

async function solveTurnstileAntiCaptcha() {
    const createUrl = "https://api.anti-captcha.com/createTask";
    const payload = { clientKey: process.env.CAPTCHA_API_KEY, task: { type: "TurnstileTaskProxyless", websiteURL: process.env.REGISTER_PAGE_URL, websiteKey: process.env.SITE_KEY } };
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
    } catch (err) {
        return { token: null, error: err.message };
    }
}

async function dapatkanTokenCaptcha() {
    if (process.env.CAPTCHA_SERVICE === "anticaptcha") return await solveTurnstileAntiCaptcha();
    return await solveTurnstile2Captcha();
}

async function prosesPendaftaranApi(nama, email, label) {
    const preDelay = 1500 + Math.floor(Math.random() * 2000);
    await sleep(preDelay);
    const { token: turnstileToken, error: captchaErr } = await dapatkanTokenCaptcha();
    if (captchaErr) {
        return { success: false, reason: 'CAPTCHA_FAILED' };
    }
    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar, withCredentials: true }));
    client.defaults.headers.common = {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'origin': 'https://billsonchain.io',
        'referer': 'https://billsonchain.io/register'
    };
    let csrfToken = "";
    try {
        await client.get(process.env.REGISTER_PAGE_URL, { timeout: 15000 });
        const cookies = await jar.getCookies(process.env.REGISTER_PAGE_URL);
        for (const cookie of cookies) {
            if (cookie.key.toLowerCase().includes("csrf")) {
                csrfToken = cookie.value;
                break;
            }
        }
    } catch (err) {
        return { success: false, reason: 'CSRF_FAILED' };
    }
    const dataPayload = { name: nama, email: email, password: process.env.PASSWORD_DEFAULT, callbackURL: "https://billsonchain.io/dashboard", termsAccepted: true };
    const headersPayload = { "Content-Type": "application/json", "x-turnstile-token": turnstileToken };
    if (csrfToken) {
        headersPayload["x-csrf-token"] = csrfToken;
    }
    try {
        const resp = await client.post(process.env.REGISTER_API_URL, dataPayload, { headers: headersPayload, timeout: 25000, maxRedirects: 0, validateStatus: (status) => true });
        if (resp.status === 200 || resp.status === 201 || resp.status === 302) {
            const currentCookies = await jar.getCookies(process.env.REGISTER_PAGE_URL);
            const cookieString = currentCookies.map(c => `${c.key}=${c.value}`).join('; ');
            const dataAkunFix = { accountName: label, fullName: nama, email: email, password: process.env.PASSWORD_DEFAULT, verified: false };
            simpanDataKeJsonRealtime(DAFTAR_AKUN_FILE, dataAkunFix, 'email');
            const dataCookieFix = { ...dataAkunFix, cookie: cookieString, savedAt: new Date().toISOString() };
            simpanDataKeJsonRealtime(COOKIE_OUTPUT_FILE, dataCookieFix, 'email');
            return { success: true };
        } else {
            return { success: false, reason: resp.status };
        }
    } catch (e) {
        return { success: false, reason: e.message };
    }
}

function tanyaTargetJumlah() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question('Masukkan jumlah akun yang ingin Anda daftarkan: ', (jawaban) => {
            rl.close();
            resolve(parseInt(jawaban, 10));
        });
    });
}

async function jalankanPendaftarMassal() {
    console.log(`=============================================================`);
    console.log(`🚀 WELCOME BOT - CREATED BY PANSSTR`);
    console.log(`=============================================================`);
    
    const targetJumlah = await tanyaTargetJumlah();
    if (isNaN(targetJumlah) || targetJumlah <= 0) {
        process.exit(1);
    }

    const listEmailUtama = loadListEmailUtama();
    if (listEmailUtama.length === 0) {
        process.exit(1);
    }

    let totalKapasitasMaksimal = 0;
    const infoEmail = listEmailUtama.map(email => {
        const cap = hitungMaksimalDotTrick(email);
        totalKapasitasMaksimal += cap;
        return { email, kapasitas: cap };
    });

    let hitunganGlobal = 0;
    let indexPutaran = 0;
    let totalGagalBeruntun = 0;

    while (hitunganGlobal < targetJumlah) {
        if (totalGagalBeruntun >= 10) {
            break;
        }
        const emailUtamaDipilih = listEmailUtama[indexPutaran % listEmailUtama.length];
        const indeksVariasi = Math.floor(indexPutaran / listEmailUtama.length);
        const batasKapasitasEmailIni = infoEmail.find(x => x.email === emailUtamaDipilih).kapasitas;
        if (indeksVariasi >= batasKapasitasEmailIni) {
            if (hitunganGlobal >= totalKapasitasMaksimal) {
                break;
            }
            indexPutaran++;
            continue;
        }
        const emailDotTrick = generateDotTrickPintar(emailUtamaDipilih, indeksVariasi);
        const namaAcak = generateNamaAcakPremium();
        const idUnikAcak = crypto.randomBytes(2).toString('hex');
        const waktuUnik = Date.now().toString().slice(-4); 
        const namaLabel = `PANSA-${waktuUnik}-${idUnikAcak}`;

        console.log(`\n[ANTREAN ${hitunganGlobal + 1} / Target ${targetJumlah}] -> ${emailDotTrick}`);
        const result = await prosesPendaftaranApi(namaAcak, emailDotTrick, namaLabel);
        if (result.success) {
            hitunganGlobal++;
            totalGagalBeruntun = 0; 
        } else {
            totalGagalBeruntun++;
        }
        indexPutaran++;
        if (hitunganGlobal < targetJumlah) {
            const minJeda = parseInt(process.env.JEDA_REGISTER_MIN_MS, 10);
            const maxJeda = parseInt(process.env.JEDA_REGISTER_MAX_MS, 10);
            const jedaAcak = minJeda + Math.floor(Math.random() * (maxJeda - minJeda)); 
            await sleep(jedaAcak);
        }
    }
    console.log(`\n=============================================================`);
}

jalankanPendaftarMassal();
