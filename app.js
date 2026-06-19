import express from 'express';
import axios from 'axios';
import fs from 'fs/promises';
import pLimit from 'p-limit';

const app = express();

// Konfigurasi EJS sebagai template engine
app.set('view engine', 'ejs');

const PORT = 3000;
const BASE_URL = 'https://bocapi.billsonchain.io';

async function checkAccount(account) {
    // Header statis menyerupai browser untuk melewati proteksi Cloudflare
    const headers = {
        'User-Agent': account.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
        'Cookie': account.cookie,
        'Origin': 'https://billsonchain.io',
        'Referer': 'https://billsonchain.io/',
        'Accept': '*/*',
        'Content-Length': '0' // Wajib untuk POST tanpa body
    };

    try {
        // 1. Ambil Session untuk mendapatkan Email dan Nama User yang valid
        const sessionRes = await axios.get(`${BASE_URL}/api/auth/get-session`, { headers });
        
        // 2. Refresh Statistik (POST) untuk mengambil Reward, Pipeline, dan Total Bills
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
        // Logika fallback jika cookie mati atau terkena limit
        const statusCode = error.response?.status || 'Unknown Error';
        console.log(`❌ [${account.accountName}] Gagal memuat data (Status: ${statusCode})`);
        
        return { 
            name: account.accountName, 
            email: '-', 
            reward: 0, 
            pipeline: { processing: 0, completed: 0, failed: 0, total: 0 }, 
            totalBills: 0, 
            status: 'Error' 
        };
    }
}

app.get('/', async (req, res) => {
    try {
        const rawData = await fs.readFile('cookie.json', 'utf-8');
        const accounts = JSON.parse(rawData);
        
        // Batasi request maksimal 5 secara bersamaan agar aman dari Rate Limit
        const limit = pLimit(5);
        const results = await Promise.all(accounts.map(acc => limit(() => checkAccount(acc))));
        
        // Render file views/dashboard.ejs dengan menyisipkan data 'accounts'
        res.render('dashboard', { accounts: results });
    } catch (error) {
        console.error("Fatal Error saat membaca file:", error.message);
        res.status(500).send("Gagal memuat sistem. Pastikan file cookie.json tersedia dan berformat JSON yang valid.");
    }
});

app.listen(PORT, () => {
    console.log('=========================================');
    console.log(`🚀 PansaGroup Dashboard Aktif: http://localhost:${PORT}`);
    console.log('=========================================');
});
