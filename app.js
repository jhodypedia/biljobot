import express from 'express';
import axios from 'axios';
import fs from 'fs/promises';
import pLimit from 'p-limit';

const app = express();

// Konfigurasi EJS dan Form Parser
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true })); // Untuk membaca data dari form login

const PORT = 3000;
const BASE_URL = 'https://bocapi.billsonchain.io';

// ==========================================
// KONFIGURASI KEAMANAN (Ubah sesuai selera)
// ==========================================
const SECRET_API_KEY = "1111"; 

// Middleware untuk memblokir akses jika tidak punya akses/cookie
function requireAuth(req, res, next) {
    const cookies = req.headers.cookie || '';
    if (cookies.includes(`apikey=${SECRET_API_KEY}`)) {
        next(); // Lanjut ke dashboard
    } else {
        res.redirect('/login'); // Lempar ke halaman login
    }
}

// ==========================================
// ROUTE LOGIN & LOGOUT
// ==========================================
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    const inputKey = req.body.apikey;
    if (inputKey === SECRET_API_KEY) {
        // Set cookie yang berlaku 1 hari (86400 detik)
        res.setHeader('Set-Cookie', `apikey=${SECRET_API_KEY}; Max-Age=86400; HttpOnly; Path=/`);
        res.redirect('/');
    } else {
        res.render('login', { error: 'API Key tidak valid! Akses ditolak.' });
    }
});

app.get('/logout', (req, res) => {
    // Hapus cookie
    res.setHeader('Set-Cookie', `apikey=; Max-Age=0; HttpOnly; Path=/`);
    res.redirect('/login');
});

// ==========================================
// FUNGSI BOT CORE
// ==========================================
async function checkAccount(account) {
    const headers = {
        'User-Agent': account.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': account.cookie,
        'Origin': 'https://billsonchain.io',
        'Referer': 'https://billsonchain.io/',
        'Content-Length': '0'
    };

    try {
        const sessionRes = await axios.get(`${BASE_URL}/api/auth/get-session`, { headers });
        const statsRes = await axios.post(`${BASE_URL}/api/user/stats/refresh`, {}, { headers });
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
        return { 
            name: account.accountName, 
            email: '-', reward: 0, pipeline: { processing: 0, completed: 0, failed: 0, total: 0 }, totalBills: 0, 
            status: 'Error' 
        };
    }
}

// ==========================================
// ROUTE DASHBOARD (DILINDUNGI)
// ==========================================
app.get('/', requireAuth, async (req, res) => {
    try {
        const rawData = await fs.readFile('cookie.json', 'utf-8');
        const accounts = JSON.parse(rawData);
        
        const limit = pLimit(5);
        const results = await Promise.all(accounts.map(acc => limit(() => checkAccount(acc))));
        
        const totalAccounts = accounts.length;
        const totalReward = results.reduce((sum, acc) => sum + (acc.reward || 0), 0);
        const totalProcessing = results.reduce((sum, acc) => sum + (acc.pipeline?.processing || 0), 0);
        const totalCompleted = results.reduce((sum, acc) => sum + (acc.pipeline?.completed || 0), 0);
        const totalFailed = results.reduce((sum, acc) => sum + (acc.pipeline?.failed || 0), 0);

        res.render('dashboard', { 
            accounts: results,
            totalAccounts,
            totalReward,
            totalProcessing,
            totalCompleted,
            totalFailed
        });
    } catch (error) {
        res.status(500).send("Gagal memuat sistem. Pastikan file cookie.json tersedia.");
    }
});

app.listen(PORT, () => {
    console.log(`🚀 PANSA GROUP Dashboard Aktif: http://localhost:${PORT}`);
});
