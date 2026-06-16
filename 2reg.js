const { chromium } = require('playwright');
const TwoCaptcha = require('@2captcha/2captcha');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LIST_EMAIL_FILE = path.join(__dirname, 'list.txt');
const DAFTAR_AKUN_FILE = path.join(__dirname, 'daftar-akun.json');
const COOKIE_OUTPUT_FILE = path.join(__dirname, 'cookie.json');

const PASSWORD_DEFAULT = "Pasword";   
const KODE_REFERRAL = "5F16B70F";      
const TWOCAPTCHA_API_KEY = "MASUKKAN_API_KEY_2CAPTCHA_DISINI"; 
const SITE_KEY_TURNSTILE = "0x4AAAAAAA-YOUR-SITE-KEY"; 

const solver = new TwoCaptcha.Solver(TWOCAPTCHA_API_KEY);

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

function hitungMaksimalDotTrick(email) {
    const [username] = email.split('@');
    const n = username.length;
    if (n <= 1) return 1;
    return Math.pow(2, Math.min(n - 1, 30));
}

function generateNamaAcakPremium() {
    const namaDepanGlobal = [
        'Budi', 'Andi', 'Eko', 'Siti', 'Dewi', 'Rian', 'Hendra', 'Roni', 'Dika', 'Gani', 'Yanto', 'Santi', 'Mega', 'Adit', 'Feri', 'Aris', 'Fahmi', 'Dodi', 'Agus', 'Hadi', 'Irwan', 'Yudi', 'Rudi', 'Doni', 'Reza', 'Taufik', 'Irfan', 'Bayu', 'Riki', 'Slamet', 'Putu', 'Agung', 'Anisa', 'Fitri', 'Indah', 'Rizky', 'Aditya', 'Putra', 'Arif', 'Taufiq',
        'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles', 'Christopher', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Paul', 'Andrew', 'Joshua', 'Kenneth', 'Kevin', 'Brian', 'George', 'Edward', 'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen', 'Nancy', 'Lisa', 'Betty', 'Margaret', 'Sandra',
        'Jean', 'Pierre', 'Lucas', 'Louis', 'Hans', 'Klaus', 'Jürgen', 'Dieter', 'Giovanni', 'Marco', 'Alessandro', 'Antonio', 'Carlos', 'Juan', 'Miguel', 'Luis', 'Aleksandr', 'Sergey', 'Dmitry', 'Vladimir', 'Emma', 'Chloé', 'Marie', 'Anna', 'Sofia', 'Giulia', 'Elena', 'Olga', 'Natasha', 'Heidi',
        'Muhammad', 'Ahmed', 'Ali', 'Omar', 'Youssef', 'Ibrahim', 'Mahmoud', 'Mustafa', 'Yasin', 'Hamza', 'Tariq', 'Zayd', 'Fatima', 'Aisha', 'Zainab', 'Mariam', 'Amira', 'Layla', 'Yasmin', 'Khadija',
        'Hiroshi', 'Kenji', 'Takashi', 'Yuki', 'Min-jun', 'Seo-jun', 'Ji-hoon', 'Wei', 'Min', 'Jun', 'Sakura', 'Haruka', 'Mei', 'Ji-woo', 'Seo-yeon',
        'Aarav', 'Arjun', 'Rahul', 'Amit', 'Vijay', 'Deepak', 'Sanjay', 'Ananya', 'Priya', 'Divya', 'Neha', 'Aditi'
    ];

    const namaTengahGlobal = [
        'Kurnia', 'Susanto', 'Eka', 'Putri', 'Sari', 'Prasetio', 'Budiman', 'Utama', 'Wulandari', 'Kusuma', 'Gunawan', 'Hidayat', 'Setiawan', 'Nugraha',
        'Alan', 'Alexander', 'Benjamin', 'Francis', 'Grace', 'Henry', 'Lee', 'Marie', 'Oliver', 'Rose', 'Samuel', 'Vincent',
        'Al-Fatih', 'Bin', 'Binti', 'De', 'Von', 'Van', 'Kumar', 'Singh'
    ];

    const namaBelakangGlobal = [
        'Santoso', 'Wijaya', 'Saputra', 'Lestari', 'Pratama', 'Kurniawan', 'Utami', 'Nugroho', 'Siregar', 'Lubis', 'Nasution', 'Simanjuntak', 'Mulyono', 'Suwito', 'Purnama', 'Kusuma', 'Hidayat',
        'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
        'Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Ivanov', 'Smirnov', 'Petrov', 'Sidorov',
        'Li', 'Wang', 'Zhang', 'Liu', 'Chen', 'Yang', 'Zhao', 'Huang', 'Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Khan', 'Ali', 'Ahmed', 'Hassan', 'Hussein',
        'Sharma', 'Verma', 'Gupta', 'Patel', 'Reddy', 'Joshi'
    ];
    
    const depan = namaDepanGlobal[Math.floor(Math.random() * namaDepanGlobal.length)];
    const tengah = namaTengahGlobal[Math.floor(Math.random() * namaTengahGlobal.length)];
    const belakang = namaBelakangGlobal[Math.floor(Math.random() * namaBelakangGlobal.length)];
    const angka = Math.floor(100 + Math.random() * 900);

    const acakPola = Math.random();
    if (acakPola < 0.4) {
        return `${depan} ${belakang} ${angka}`;
    } else if (acakPola < 0.8) {
        return `${depan} ${tengah} ${belakang}`;
    } else {
        return `${depan} ${belakang}`;
    }
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

    let totalKapasitasMaksimal = 0;
    const infoEmail = listEmailUtama.map(email => {
        const cap = hitungMaksimalDotTrick(email);
        totalKapasitasMaksimal += cap;
        return { email, kapasitas: cap };
    });

    console.log(`📡 Memulai Registrasi Berdasarkan Batas Maksimal Dot Trick...`);
    console.log(`📂 Total email utama: ${listEmailUtama.length}`);
    console.log(`📊 Total kombinasi titik unik maksimum yang bisa dibuat: ${totalKapasitasMaksimal} akun\n`);

    let hitunganGlobal = 0;
    let indexPutaran = 0;

    while (true) {
        const emailUtamaDipilih = listEmailUtama[indexPutaran % listEmailUtama.length];
        const indeksVariasi = Math.floor(indexPutaran / listEmailUtama.length);
        
        const batasKapasitasEmailIni = infoEmail.find(x => x.email === emailUtamaDipilih).kapasitas;
        if (indeksVariasi >= batasKapasitasEmailIni) {
            if (hitunganGlobal >= totalKapasitasMaksimal) {
                console.log(`\n🛑 [SELESAI] Semua variasi dot trick dari semua email di list.txt sudah habis digunakan.`);
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
        const [lebar, tinggi] = dapatkanUkuranWindowKecil();

        console.log(`=============================================================`);
        console.log(`👤 [ANTREAN ${hitunganGlobal + 1} / Maksimal ${totalKapasitasMaksimal}]`);
        console.log(`   📝 Nama  : ${namaAcak}`);
        console.log(`   📧 Email : ${emailDotTrick}`);
        console.log(`   🔑 Pass  : ${PASSWORD_DEFAULT}`);

        let browser;
        try {
            browser = await chromium.launch({
                headless: false,
                args: [`--window-size=${lebar},${tinggi}`]
            });

            const context = await browser.newContext({
                viewport: { width: lebar, height: tinggi }
            });

            const page = await context.newPage();

            await page.goto('https://billsonchain.io/register', {
                waitUntil: 'networkidle',
                timeout: 60000
            });

            await new Promise(res => setTimeout(res, 3000));
            console.log(`   [PROSES] Mengetik data pendaftaran...`);
            
            await humanType(page, 'input[id="name"]', namaAcak);

            await humanType(page, 'input[type="email"]', emailDotTrick);

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

            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            await new Promise(res => setTimeout(res, 500));

            try {
                const btnSubmit = await page.$('button[type="submit"]');
                if (btnSubmit) await btnSubmit.scrollIntoViewIfNeeded();
            } catch (e) {}

            console.log(`   🤖 [2CAPTCHA] Mengirim request bypass Cloudflare Turnstile...`);
            try {
                let siteKey = SITE_KEY_TURNSTILE;
                if (siteKey.includes('YOUR-SITE-KEY')) {
                    siteKey = await page.evaluate(() => {
                        const turnstileElem = document.querySelector('[class*="cf-turnstile"], [data-sitekey]');
                        return turnstileElem ? turnstileElem.getAttribute('data-sitekey') : null;
                    });
                }

                if (!siteKey) {
                    siteKey = "0x4AAAAAAA-YOUR-SITE-KEY"; 
                }

                const result = await solver.cloudflareTurnstile({
                    pageurl: 'https://billsonchain.io/register',
                    sitekey: siteKey
                });

                console.log(`   ✅ [2CAPTCHA] Token didapatkan! Memasukkan token...`);
                
                await page.evaluate((token) => {
                    const cfInput = document.querySelector('input[name="cf-turnstile-response"]');
                    if (cfInput) {
                        cfInput.value = token;
                    }
                    if (typeof window.turnstile !== 'undefined' && window.turnstile.setResponse) {
                        window.turnstile.setResponse(token);
                    }
                }, result.data);

                await new Promise(res => setTimeout(res, 2000));
            } catch (captchaErr) {
                console.error(`   ⚠️ [2CAPTCHA ERROR]: ${captchaErr.message}. Beralih ke verifikasi manual.`);
                await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 45000 });
            }

            await page.click('button[type="submit"]');

            console.log(`   [INFO] Menunggu redirect dashboard...`);
            await page.waitForURL(url => !url.toString().includes('/register'), {
                timeout: 120000
            });

            console.log(`   ✅ [SUKSES] Akun terdaftar!`);

            const playCookies = await context.cookies();
            const cookieString = playCookies.map(c => `${c.name}=${c.value}`).join('; ');

            const dataAkunFix = {
                accountName: namaLabel,
                fullName: namaAcak,
                email: emailDotTrick,
                password: PASSWORD_DEFAULT
            };

            simpanDataKeJsonRealtime(DAFTAR_AKUN_FILE, dataAkunFix, 'email');
            
            const dataCookieFix = { ...dataAkunFix, cookie: cookieString, savedAt: new Date().toISOString() };
            simpanDataKeJsonRealtime(COOKIE_OUTPUT_FILE, dataCookieFix, 'email');
            
            hitunganGlobal++;

        } catch (err) {
            console.error(`   ❌ [ERROR]: ${err.message}`);
        } finally {
            if (browser) {
                await browser.close();
                console.log(`   🔒 Jendela akun ditutup.`);
            }
        }

        indexPutaran++;

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
