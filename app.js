import express from 'express';
import axios from 'axios';
import fs from 'fs/promises';

const app = express();
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));

const PORT = 3000;
const BASE_URL = 'https://bocapi.billsonchain.io';
const SECRET_API_KEY = "1111"; 

// ==========================================
// DATABASE SEMENTARA (IN-MEMORY CACHE)
// ==========================================
let CACHED_DASHBOARD = {
    accounts: [],
    totalAccounts: 0,
    totalReward: 0,
    totalProcessing: 0,
    totalCompleted: 0,
    totalFailed: 0,
    lastUpdate: "Belum ada data",
    status: "Menunggu inisialisasi..."
};

// ==========================================
// ROUTE & MIDDLEWARE AUTH
// ==========================================
function requireAuth(req, res, next) {
    const cookies = req.headers.cookie || '';
    if (cookies.includes(`apikey=${SECRET_API_KEY}`)) {
        next();
    } else {
        res.redirect('/login');
    }
}

app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', (req, res) => {
    if (req.body.apikey === SECRET_API_KEY) {
        res.setHeader('Set-Cookie', `apikey=${SECRET_API_KEY}; Max-Age=86400; HttpOnly; Path=/`);
        res.redirect('/');
    } else {
        res.render('login', { error: 'API Key tidak valid!' });
    }
});
app.get('/logout', (req, res) => {
    res.setHeader('Set-Cookie', `apikey=; Max-Age=0; HttpOnly; Path=/`);
    res.redirect('/login');
});

// ==========================================
// FUNGSI BOT CORE & DELAY
// ==========================================
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Jumlah akun yang dicek secara paralel dalam 1 batch
// Semakin besar = semakin cepat, tapi risiko rate limit lebih tinggi
const CONCURRENCY_LIMIT = 5;

async function checkAccount(account, maxRetries = 3) {
    const headers = {
        'User-Agent': account.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': account.cookie,
        'Origin': 'https://billsonchain.io',
        'Referer': 'https://billsonchain.io/',
        'Content-Length': '0'
    };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const axiosConfig = { headers, timeout: 10000 };
            const sessionRes = await axios.get(`${BASE_URL}/api/auth/get-session`, axiosConfig);
            const statsRes = await axios.post(`${BASE_URL}/api/user/stats/refresh`, {}, axiosConfig);
            
            const data = statsRes.data?.data || {};
            return { 
                name: sessionRes.data?.user?.name || account.accountName,
                email: sessionRes.data?.user?.email || '-',
                reward: data.rewardBalance || 0,
                pipeline: data.pipeline || { processing: 0, completed: 0, failed: 0, total: 0 },
                totalBills: data.totalBills || 0,
                status: 'OK' 
            };
        } catch (error) {
            if (attempt === maxRetries) {
                return { name: account.accountName, email: '-', reward: 0, pipeline: { processing: 0, completed: 0, failed: 0, total: 0 }, totalBills: 0, status: 'Error' };
            }
            await delay(2000 * attempt);
        }
    }
}

// ==========================================
// FUNGSI BULK CHECK (PARALEL DENGAN BATCH)
// ==========================================
async function checkAccountsBulk(accounts) {
    const results = [];
    
    for (let i = 0; i < accounts.length; i += CONCURRENCY_LIMIT) {
        const batch = accounts.slice(i, i + CONCURRENCY_LIMIT);
        const batchNumber = Math.floor(i / CONCURRENCY_LIMIT) + 1;
        const totalBatches = Math.ceil(accounts.length / CONCURRENCY_LIMIT);
        
        console.log(`[PANSA GROUP BOT] 🚀 Batch ${batchNumber}/${totalBatches} — Mengecek ${batch.length} akun secara paralel...`);
        
        // Jalankan pengecekan paralel dalam batch ini
        const batchPromises = batch.map((acc, idx) => {
            const globalIndex = i + idx + 1;
            console.log(`[PANSA GROUP BOT] ⏳ Cek ${globalIndex}/${accounts.length}: ${acc.accountName}`);
            return checkAccount(acc);
        });
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Jeda singkat antar batch agar lebih aman
        if (i + CONCURRENCY_LIMIT < accounts.length) {
            await delay(1500);
        }
    }
    
    return results;
}

// ==========================================
// BACKGROUND WORKER (BERJALAN DI BELAKANG LAYAR)
// ==========================================
async function startBackgroundWorker() {
    while (true) { // Loop abadi
        try {
            CACHED_DASHBOARD.status = "Sedang Sinkronisasi...";
            const rawData = await fs.readFile('cookie.json', 'utf-8');
            const accounts = JSON.parse(rawData);
            
            const results = [];
            console.log(`\n[PANSA GROUP BOT] 🔄 Memulai putaran cek ${accounts.length} akun (Bulk Mode - ${CONCURRENCY_LIMIT} paralel per batch)...`);

            // Gunakan bulk check paralel (bukan 1 per 1 lagi)
            const bulkResults = await checkAccountsBulk(accounts);
            results.push(...bulkResults);
            
            // Perbarui cache data untuk ditampilkan ke EJS
            CACHED_DASHBOARD = {
                accounts: results,
                totalAccounts: accounts.length,
                totalReward: results.reduce((sum, acc) => sum + (acc.reward || 0), 0),
                totalProcessing: results.reduce((sum, acc) => sum + (acc.pipeline?.processing || 0), 0),
                totalCompleted: results.reduce((sum, acc) => sum + (acc.pipeline?.completed || 0), 0),
                totalFailed: results.reduce((sum, acc) => sum + (acc.pipeline?.failed || 0), 0),
                lastUpdate: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
                status: "Standby"
            };

            console.log(`[PANSA GROUP BOT] ✅ Putaran selesai! Menunggu siklus berikutnya...`);
            
            // Jeda 5 menit sebelum bot mengecek dari awal lagi (Ubah sesuai kebutuhan)
            await delay(5 * 60 * 1000); 

        } catch (error) {
            console.error("[PANSA GROUP BOT] ❌ Gagal baca file / error sistem:", error.message);
            await delay(10000); // Tunggu 10 detik sebelum mencoba lagi jika error fatal
        }
    }
}

// Jalankan bot secara independen tanpa memblokir server Express
startBackgroundWorker();

// ==========================================
// ROUTE DASHBOARD (INSTANT LOAD)
// ==========================================
app.get('/', requireAuth, (req, res) => {
    // Render akan INSTAN karena hanya membaca variabel CACHED_DASHBOARD
    res.render('dashboard', CACHED_DASHBOARD);
});

app.listen(PORT, () => {
    console.log(`🚀 PANSA GROUP Dashboard Aktif: http://localhost:${PORT}`);
});
