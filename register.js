const { Camoufox } = require('camoufox-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LIST_EMAIL_FILE = path.join(__dirname, 'list.txt');
const DAFTAR_AKUN_FILE = path.join(__dirname, 'daftar-akun.json');
const COOKIE_OUTPUT_FILE = path.join(__dirname, 'cookie.json');

// ==========================================
// CONFIGURATION TARGET
// ==========================================
const PASSWORD_DEFAULT = "Pasword";   // Password default semua akun
const KODE_REFERRAL = "5F16B70F";      // Kode referral tujuan

function loadListEmailUtama() {
    if (!fs.existsSync(LIST_EMAIL_FILE)) {
        fs.writeFileSync(LIST_EMAIL_FILE, "contohgmail@gmail.com\n");
        console.error("❌ File list.txt tidak ditemukan! Silakan isi dahulu dengan Gmail utama Anda.");
        process.exit(1);
    }
    return fs.readFileSync(LIST_EMAIL_FILE, 'utf-8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && line.includes('@gmail.com'));
}

// Fungsi menghitung kapasitas maksimal dot trick dari satu email
function hitungMaksimalDotTrick(email) {
    const [username] = email.split('@');
    const n = username.length;
    if (n <= 1) return 1;
    // Rumus 2^(n-1). Diturunkan ke batas aman Bitwise Javascript (maksimal 30 bit)
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
    if (indexSama !== -1) {
        listLama[indexSama] = dataBaru;
    } else {
        listLama.push(dataBaru);
    }
    fs.writeFileSync(filePath, JSON.stringify(listLama, null, 4));
}

async function jalankanPendaftarMassal() {
    const listEmailUtama = loadListEmailUtama();

    if (listEmailUtama.length === 0) {
        console.error("❌ Tidak ada email Gmail valid di dalam list.txt!");
        return;
    }

    // Hitung total kombinasi maksimum yang tersedia dari semua email di list.txt
    let totalKapasitasMaksimal = 0;
    const infoEmail = listEmailUtama.map(email => {
        const cap = hitungMaksimalDotTrick(email);
        totalKapasitasMaksimal += cap;
        return { email, kapasitas: cap };
    });

    console.log(`📡 Memulai Camoufox Registrasi Berdasarkan Batas Maksimal Dot Trick...`);
    console.log(`📂 Total email utama: ${listEmailUtama.length}`);
    console.log(`📊 Total kombinasi titik unik maksimum yang bisa dibuat: ${totalKapasitasMaksimal} akun\n`);

    let hitunganGlobal = 0;
    let indexPutaran = 0;

    while (true) {
        // Ambil email berdasarkan giliran putaran secara merata
        const emailUtamaDipilih = listEmailUtama[indexPutaran % listEmailUtama.length];
        const indeksVariasi = Math.floor(indexPutaran / listEmailUtama.length);
        
        // Cek apakah email yang dipilih ini sudah melewati kapasitas dot trick-nya sendiri
        const batasKapasitasEmailIni = infoEmail.find(x => x.email === emailUtamaDipilih).kapasitas;
        if (indeksVariasi >= batasKapasitasEmailIni) {
            // Jika email ini habis variasinya, cek apakah seluruh kapasitas global sudah habis total
            if (hitunganGlobal >= totalKapasitasMaksimal) {
                console.log(`\n🛑 [SELESAI] Semua variasi dot trick dari semua email di list.txt sudah habis digunakan.`);
                break;
            }
            // Jika belum habis total, lewati email ini dan lanjut cari email lain di list.txt yang masih sisa ketersediaannya
            indexPutaran++;
            continue;
        }

        const emailDotTrick = generateDotTrickPintar(emailUtamaDipilih, indeksVariasi);
        const namaAcak = generateNamaAcakPremium();
        const idUnikAcak = crypto.randomBytes(2).toString('hex');
        const waktuUnik = Date.now().toString().slice(-4); 
        const namaLabel = `PANSA-${waktuUnik}-${idUnikAcak}`;
        const ukuranWindow = dapatkanUkuranWindowKecil();

        console.log(`=============================================================`);
        console.log(`👤 [ANTREAN ${hitunganGlobal + 1} / Maksimal ${totalKapasitasMaksimal}]`);
        console.log(`   📝 Nama  : ${namaAcak}`);
        console.log(`   📧 Email : ${emailDotTrick}`);
        console.log(`   🔑 Pass  : ${PASSWORD_DEFAULT}`);

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

            await page.goto('https://billsonchain.io/register', {
                waitUntil: 'networkidle',
                timeout: 60000
            });

            await new Promise(res => setTimeout(res, 3000));
            console.log(`   [PROSES] Mengetik data pendaftaran...`);
            
            // 1. Input Nama
            await humanType(page, 'input[id="name"]', namaAcak);

            // 2. Input Email
            await humanType(page, 'input[type="email"]', emailDotTrick);

            // 3. Input Password & Confirm Password
            const passwordInputs = await page.$$('input[type="password"]');
            if (passwordInputs.length >= 2) {
                await passwordInputs[0].focus();
                await passwordInputs[0].click({ clickCount: 3 });
                await page.keyboard.press('Backspace');
                await page.keyboard.type(PASSWORD_DEFAULT, { delay: 40 });
                await new Promise(res => setTimeout(res, 1500));

                await passwordInputs[1].focus();
                await passwordInputs[1].click({ clickCount: 3 });
                await page.keyboard.press('Backspace');
                await page.keyboard.type(PASSWORD_DEFAULT, { delay: 40 });
                await new Promise(res => setTimeout(res, 500));
            }

            // 4. Klik opsi "I have a referral code" dan input kodenya
            console.log(`   [PROSES] Mengaktifkan opsi referral code...`);
            try {
                const reffCheckboxLabel = await page.$('text="I have a referral code"');
                if (reffCheckboxLabel) {
                    await reffCheckboxLabel.click();
                } else {
                    await page.click('input[type="checkbox"]:nth-of-type(1)', { force: true });
                }
                
                await new Promise(res => setTimeout(res, 1000));

                const inputReferral = await page.$('input[placeholder*="referral" i], input[name*="ref" i]');
                if (inputReferral) {
                    await inputReferral.focus();
                    await page.keyboard.type(KODE_REFERRAL, { delay: 40 });
                } else {
                    await page.type('input[type="text"]:not([id="name"])', KODE_REFERRAL, { delay: 40 });
                }
            } catch (e) {}

            // 5. Centang Terms & Conditions
            try {
                const termsLabel = await page.$('text="I agree to the"');
                if (termsLabel) {
                    await termsLabel.click();
                } else {
                    const checkboxes = await page.$$('input[type="checkbox"]');
                    if (checkboxes.length > 0) {
                        await checkboxes[checkboxes.length - 1].click({ force: true });
                    }
                }
            } catch (e) {}

            // 6. Auto Scroll ke Bawah
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            await new Promise(res => setTimeout(res, 500));

            try {
                const btnSubmit = await page.$('button[type="submit"]');
                if (btnSubmit) await btnSubmit.scrollIntoViewIfNeeded();
            } catch (e) {}

            // 7. Menunggu Verifikasi Manual
            console.log(`   🚨 [MANUAL] Silakan tuntaskan Turnstile Cloudflare di browser!`);
            try {
                await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 180000 });
                console.log(`   👉 [INFO] Terverifikasi. Mengirim formulir...`);
            } catch {
                console.log(`   ⚠️ [TIMEOUT] Mencoba submit paksa.`);
            }

            await page.click('button[type="submit"]');

            console.log(`   [INFO] Menunggu redirect dashboard...`);
            await page.waitForURL(url => !url.toString().includes('/register'), {
                timeout: 120000
            });

            console.log(`   ✅ [SUKSES] Akun terdaftar!`);

            // Ambil cookie session aktif
            const context = page.context();
            const playCookies = await context.cookies();
            const cookieString = playCookies.map(c => `${c.name}=${c.value}`).join('; ');

            const dataAkunFix = {
                accountName: namaLabel,
                fullName: namaAcak,
                email: emailDotTrick,
                password: PASSWORD_DEFAULT
            };

            // Simpan secara realtime
            simpanDataKeJsonRealtime(DAFTAR_AKUN_FILE, dataAkunFix, 'email');
            
            const dataCookieFix = { ...dataAkunFix, cookie: cookieString, savedAt: new Date().toISOString() };
            simpanDataKeJsonRealtime(COOKIE_OUTPUT_FILE, dataCookieFix, 'email');
            
            hitunganGlobal++; // Naikkan counter global hanya jika pendaftaran benar-benar berhasil

        } catch (err) {
            console.error(`   ❌ [ERROR]: ${err.message}`);
        } finally {
            if (browser) {
                await browser.close();
                console.log(`   🔒 Jendela akun ditutup.`);
            }
        }

        indexPutaran++;

        // Jeda waktu antar akun jika siklus belum selesai sepenuhnya
        if (hitunganGlobal < totalKapasitasMaksimal) {
            console.log(`\n⏳ Jeda 4 detik sebelum antrean berikutnya...\n`);
            await new Promise(res => setTimeout(res, 4000));
        }
    }

    console.log(`\n=============================================================`);
    console.log(`✨ [SELESAI TOTAL] Semua variasi dot trick yang valid telah diproses.`);
    console.log(`=============================================================`);
}

jalankanPendaftarMassal();
