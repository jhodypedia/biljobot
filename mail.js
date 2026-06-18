import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const CONFIG = {
  accounts: [
    {
      label: 'akun-1',
      email: '@gmail.com',
      appPassword: 'xxxx xxxx xxxx xxxx',
    }
  ],
  targetSender: 'support@billsonchain.io',
  targetSubjectPattern: /verify your email/i, // hanya proses email dengan subject ini
  mailbox: 'INBOX',
  allowedLinkDomains: ['billsonchain.io'],
  fetchTimeoutMs: 15000,
  reconnectDelayMs: 10000,
};

const URL_REGEX = /https?:\/\/[^\s"'<>\)\]]+/gi;

const BUTTON_TEXT_PATTERNS = [
  /verify/i,
  /confirm/i,
  /activate/i,
  /validate/i,
  /click here/i,
];

const URL_KEYWORDS = [
  'verify',
  'verification',
  'confirm',
  'confirmation',
  'activate',
  'activation',
  'validate',
  'auth',
  'token',
];

const IGNORE_TEXT_PATTERNS = [
  /learn more/i,
  /unsubscribe/i,
  /privacy/i,
  /terms/i,
  /help center/i,
  /support center/i,
  /contact us/i,
  /facebook|twitter|instagram|linkedin|x\.com/i,
];

const IGNORE_URL_KEYWORDS = [
  'unsubscribe',
  'privacy',
  'terms',
  'facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'linkedin.com',
];

function cleanUrl(url) {
  return url.replace(/[.,;:!?'")\]]+$/g, '');
}

function isIgnoredUrl(url) {
  const lower = url.toLowerCase();
  return IGNORE_URL_KEYWORDS.some((kw) => lower.includes(kw));
}

function extractAllUrlsFromText(text) {
  if (!text) return [];
  const matches = text.match(URL_REGEX) || [];
  return matches.map(cleanUrl);
}

function extractVerificationLink(parsedMail, opts = {}) {
  const { allowedDomains = [] } = opts;

  const filterDomain = (url) => {
    if (!allowedDomains || allowedDomains.length === 0) return true;
    try {
      const { hostname } = new URL(url);
      return allowedDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`));
    } catch {
      return false;
    }
  };

  if (parsedMail.html) {
    const $ = cheerio.load(parsedMail.html);
    const anchors = $('a[href]')
      .map((_, el) => ({
        href: cleanUrl($(el).attr('href') || ''),
        text: $(el).text().trim(),
      }))
      .get()
      .filter((a) => /^https?:\/\//i.test(a.href))
      .filter((a) => filterDomain(a.href))
      .filter((a) => !isIgnoredUrl(a.href))
      .filter((a) => !IGNORE_TEXT_PATTERNS.some((p) => p.test(a.text)));

    const byText = anchors.find((a) => BUTTON_TEXT_PATTERNS.some((p) => p.test(a.text)));
    if (byText) return byText.href;

    const byHrefKeyword = anchors.find((a) =>
      URL_KEYWORDS.some((kw) => a.href.toLowerCase().includes(kw))
    );
    if (byHrefKeyword) return byHrefKeyword.href;

    if (anchors.length > 0) return anchors[0].href;
  }

  let urls = extractAllUrlsFromText(parsedMail.text)
    .filter(filterDomain)
    .filter((u) => !isIgnoredUrl(u));

  if (urls.length === 0) return null;

  const keywordMatch = urls.find((url) =>
    URL_KEYWORDS.some((kw) => url.toLowerCase().includes(kw))
  );

  return keywordMatch || urls[0];
}

function log(label, ...args) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${label}]`, ...args);
}

async function fetchVerificationLink(url, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.fetchTimeoutMs);

  try {
    log(label, `Auto-fetching link: ${url}`);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
    });
    log(label, `Fetch result: HTTP ${res.status} ${res.statusText} (final URL: ${res.url})`);
    return { ok: res.ok, status: res.status, finalUrl: res.url };
  } catch (err) {
    log(label, `Fetch FAILED: ${err.message}`);
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function handleNewMessage(client, uid, label, processedUids) {
  const uidKey = `${label}:${uid}`;
  if (processedUids.has(uidKey)) {
    return;
  }

  let message;
  try {
    message = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true });
  } catch (err) {
    log(label, `Gagal fetch message uid=${uid}: ${err.message}`);
    return;
  }
  if (!message || !message.source) return;

  const fromAddr = (message.envelope?.from?.[0]?.address || '').toLowerCase();
  if (fromAddr !== CONFIG.targetSender.toLowerCase()) {
    return;
  }

  const subject = message.envelope?.subject || '';
  if (CONFIG.targetSubjectPattern && !CONFIG.targetSubjectPattern.test(subject)) {
    log(label, `Sender cocok tapi subject tidak relevan, skip: "${subject}"`);
    return;
  }

  // Tandai sebagai sudah diproses SEBELUM fetch link, supaya event duplikat
  // dari IMAP tidak memicu fetch kedua pada token yang sama (token sekali pakai).
  processedUids.add(uidKey);

  log(label, `Email target ditemukan dari ${fromAddr}, subject: "${subject}"`);

  const parsed = await simpleParser(message.source);
  const link = extractVerificationLink(parsed, { allowedDomains: CONFIG.allowedLinkDomains });

  if (!link) {
    log(label, 'Tidak ada link verifikasi ditemukan di body email.');
    return;
  }

  await fetchVerificationLink(link, label);
}

async function runAccountWorker(account) {
  const label = account.label || account.email;
  const processedUids = new Set();

  while (true) {
    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: {
        user: account.email,
        pass: account.appPassword,
      },
      logger: false,
    });

    try {
      log(label, 'Menghubungkan ke IMAP Gmail...');
      await client.connect();
      log(label, 'Terhubung. Membuka mailbox', CONFIG.mailbox);

      const lock = await client.getMailboxLock(CONFIG.mailbox);

      try {
        client.on('exists', async (data) => {
          try {
            const range = `${data.prevCount + 1}:${data.count}`;
            for await (const msg of client.fetch(range, { uid: true })) {
              await handleNewMessage(client, msg.uid, label, processedUids);
            }
          } catch (err) {
            log(label, `Error saat handle pesan baru: ${err.message}`);
          }
        });

        log(label, `Listening (IDLE) untuk email baru dari ${CONFIG.targetSender}...`);
        await client.idle();
      } finally {
        lock.release();
      }
    } catch (err) {
      log(label, `Koneksi error: ${err.message}`);
    }

    try {
      await client.logout();
    } catch {
      // ignore
    }

    log(label, `Koneksi putus, reconnect dalam ${CONFIG.reconnectDelayMs / 1000} detik...`);
    await new Promise((r) => setTimeout(r, CONFIG.reconnectDelayMs));
  }
}

function validateConfig() {
  if (!Array.isArray(CONFIG.accounts) || CONFIG.accounts.length === 0) {
    throw new Error('CONFIG.accounts kosong.');
  }
  for (const acc of CONFIG.accounts) {
    if (!acc.email || !acc.appPassword) {
      throw new Error(
        `Akun "${acc.label || acc.email}" belum diisi. Set env GMAIL_USER dan GMAIL_APP_PASSWORD.`
      );
    }
  }
}

async function main() {
  try {
    validateConfig();
    console.log(`Memuat ${CONFIG.accounts.length} akun. Target sender: ${CONFIG.targetSender}`);

    CONFIG.accounts.forEach((account) => {
      runAccountWorker(account).catch((err) => {
        console.error(`[${account.label || account.email}] Worker crash fatal:`, err);
      });
    });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

main();
