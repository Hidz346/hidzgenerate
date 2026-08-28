import { supabase, BUCKET, SUPABASE_ANON_KEY, RESUMABLE_ENDPOINT, RESUMABLE_ENDPOINT_FALLBACK } from './supabase-config.js';
// tus-js-client dimuat sebagai <script> UMD biasa di index.html (bukan ESM dari
// esm.sh), karena build ESM esm.sh salah deteksi environment jadi Node.js alih-alih
// browser, yang bikin error "source object may only be an instance of Buffer or
// Readable in this environment" begitu mulai upload. Build UMD dari dist/tus.min.js
// dibangun khusus dari source browser, jadi bebas dari masalah deteksi itu.
// Variabel `tus` di bawah ini otomatis tersedia secara global dari script tag itu.

const tabs = document.querySelectorAll('.tab');
const modePanels = document.querySelectorAll('.mode-body');

const linkInput = document.getElementById('link-input');
const btnGenerateLink = document.getElementById('btn-generate-link');

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const fileQueueEl = document.getElementById('file-queue');
const btnUploadFiles = document.getElementById('btn-upload-files');

const resultSection = document.getElementById('result-section');
const resultCanvas = document.getElementById('result-canvas');
const resultLabel = document.getElementById('result-label');
const btnDownload = document.getElementById('btn-download');
const btnCopy = document.getElementById('btn-copy');

const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');

const btnReset = document.getElementById('btn-reset');
const themeToggle = document.getElementById('theme-toggle');

const styleSwatchRow = document.getElementById('style-swatch-row');
const bgPresetRow = document.getElementById('bg-preset-row');
const fgColorInput = document.getElementById('fg-color-input');
const bgColorInput = document.getElementById('bg-color-input');
const contrastWarning = document.getElementById('contrast-warning');
const logoInput = document.getElementById('logo-input');
const logoPreviewWrap = document.getElementById('logo-preview-wrap');
const logoPreviewImg = document.getElementById('logo-preview-img');
const btnRemoveLogo = document.getElementById('btn-remove-logo');

let queue = [];
let currentResultUrl = '';
let currentQr = null;

/* ---------- tema (mode gelap/terang) ---------- */
// Nilai awal atribut data-theme sudah di-set lebih dulu lewat inline script
// di index.html (biar nggak ada kedipan tema salah pas halaman baru kebuka).
// Di sini cuma ngurusin klik tombolnya + nyimpen pilihan buat kunjungan berikutnya.

const THEME_KEY = 'hidzgenerate:theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
}

// Cuma nyimpen ke localStorage pas usernya sendiri yang klik — kalau tema awal
// masih ngikutin preferensi sistem (belum pernah di-klik), biarin tetap ngikut
// preferensi sistem itu buat kunjungan berikutnya, bukan dikunci diam-diam.
themeToggle.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // storage nggak tersedia (mis. mode private ketat) — tema tetap jalan,
    // cuma nggak keinget buat kunjungan berikutnya
  }
});

applyTheme(document.documentElement.getAttribute('data-theme') || 'light');

/* ---------- tabs ---------- */

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const mode = tab.dataset.mode;
    tabs.forEach((t) => {
      const active = t === tab;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', String(active));
    });
    modePanels.forEach((panel) => {
      const match = panel.dataset.modePanel === mode;
      panel.classList.toggle('is-hidden', !match);
      panel.hidden = !match;
    });
  });
});

/* ---------- link mode ---------- */

btnGenerateLink.addEventListener('click', () => {
  const value = linkInput.value.trim();
  if (!value) {
    linkInput.focus();
    return;
  }
  generateAndShow(value, value);
});

linkInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnGenerateLink.click();
});

/* ---------- reset: balik ke tampilan kosong ---------- */

btnReset.addEventListener('click', () => {
  linkInput.value = '';
  queue = [];
  renderQueue();

  resultSection.classList.add('is-hidden');
  currentResultUrl = '';
  currentQr = null;

  const activeTab = document.querySelector('.tab.is-active');
  (activeTab?.dataset.mode === 'file' ? dropzone : linkInput).focus();
  document.querySelector('.panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ---------- file mode: pick & drag-drop ---------- */

dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

['dragover', 'dragenter'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('is-dragover');
  })
);

['dragleave', 'drop'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-dragover');
  })
);

dropzone.addEventListener('drop', (e) => {
  addFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', () => {
  addFiles(fileInput.files);
  fileInput.value = '';
});

function addFiles(fileList) {
  Array.from(fileList).forEach((file) => {
    const id = `f${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    queue.push({ id, file, status: 'pending', progress: 0, errorMessage: '' });
  });
  renderQueue();
}

function renderQueue() {
  fileQueueEl.innerHTML = '';

  queue.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'file-row';
    if (item.status === 'done') li.classList.add('is-done');
    if (item.status === 'error') li.classList.add('is-error');
    li.dataset.id = item.id;

    const thumb = document.createElement('div');
    thumb.className = 'file-thumb';
    if (item.file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(item.file);
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:4px;';
      thumb.appendChild(img);
    } else {
      thumb.textContent = categoryIcon(item.file.type);
    }

    const info = document.createElement('div');
    info.className = 'file-info';

    const name = document.createElement('div');
    name.className = 'file-name';
    name.textContent = item.file.name;

    const size = document.createElement('div');
    size.className = 'file-size';
    size.textContent = formatBytes(item.file.size);

    const progressWrap = document.createElement('div');
    progressWrap.className = 'file-progress';
    const progressBar = document.createElement('div');
    progressBar.className = 'file-progress-bar';
    progressBar.style.width = `${item.progress}%`;
    progressWrap.appendChild(progressBar);

    info.append(name, size, progressWrap);

    if (item.status === 'error') {
      const errorMsg = document.createElement('div');
      errorMsg.className = 'file-error-msg';
      errorMsg.textContent = `⚠ ${item.errorMessage || 'Gagal upload, coba lagi.'}`;
      info.appendChild(errorMsg);
    }

    li.append(thumb, info);

    if (item.status === 'pending' || item.status === 'error') {
      const actions = document.createElement('div');
      actions.className = 'file-row-actions';

      if (item.status === 'error') {
        const retryBtn = document.createElement('button');
        retryBtn.className = 'file-retry';
        retryBtn.type = 'button';
        retryBtn.textContent = 'Coba lagi';
        retryBtn.addEventListener('click', async () => {
          item.status = 'uploading';
          item.progress = 0;
          renderQueue();
          await uploadOne(item);
        });
        actions.appendChild(retryBtn);
      }

      const removeBtn = document.createElement('button');
      removeBtn.className = 'file-remove';
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', `Hapus ${item.file.name}`);
      removeBtn.addEventListener('click', () => {
        queue = queue.filter((q) => q.id !== item.id);
        renderQueue();
      });
      actions.appendChild(removeBtn);

      li.appendChild(actions);
    }

    fileQueueEl.appendChild(li);
  });

  const hasPending = queue.some((q) => q.status === 'pending');
  btnUploadFiles.classList.toggle('is-hidden', !hasPending);
}

function categoryIcon(mime) {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime === 'application/pdf') return '📄';
  if (/zip|rar|7z|tar/.test(mime)) return '🗂️';
  return '✨';
}

/* ---------- upload to Supabase Storage (resumable / TUS) ---------- */

btnUploadFiles.addEventListener('click', async () => {
  const pending = queue.filter((q) => q.status === 'pending');
  if (pending.length === 0) return;

  if (!supabase || !RESUMABLE_ENDPOINT || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('ISI_')) {
    const message = 'Supabase belum dikonfigurasi. Isi Project URL dan anon public key di supabase-config.js.';
    pending.forEach((item) => {
      item.status = 'error';
      item.errorMessage = message;
    });
    renderQueue();
    return;
  }

  btnUploadFiles.disabled = true;
  btnUploadFiles.textContent = 'Mengupload...';

  await Promise.all(pending.map(uploadOne));

  btnUploadFiles.disabled = false;
  btnUploadFiles.textContent = 'Upload & Buat QR';
});

function uploadOne(item) {
  item.status = 'uploading';
  item.errorMessage = '';
  const safeName = item.file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const path = `${datePath()}/${Date.now()}-${safeName}`;

  // Anon key format lama berupa JWT (selalu diawali "eyJ") dan memang wajib
  // dikirim lewat header Authorization: Bearer. Publishable key format baru
  // ("sb_publishable_...") BUKAN JWT — kalau tetap dikirim lewat header
  // Authorization, Supabase menolaknya dengan "Invalid JWT" (lihat dok resmi:
  // https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).
  // Untuk format baru, cukup header apikey saja.
  const isLegacyJwtKey = SUPABASE_ANON_KEY.startsWith('eyJ');

  return new Promise((resolve) => {
    // endpoint storage langsung (RESUMABLE_ENDPOINT) dicoba dulu karena lebih
    // cepat, tapi subdomain-nya kadang belum ke-resolve di sebagian jaringan/DNS
    // walau project-nya sendiri aktif & sehat. Kalau itu yang terjadi (nggak ada
    // response sama sekali, bukan ditolak server), otomatis coba sekali lagi
    // lewat RESUMABLE_ENDPOINT_FALLBACK di domain project utama sebelum
    // benar-benar dianggap gagal.
    const attemptUpload = (endpoint, canFallback) => {
      const upload = new tus.Upload(item.file, {
        endpoint,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        chunkSize: 6 * 1024 * 1024, // wajib persis 6MB, ketentuan dari sisi Supabase
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        headers: {
          apikey: SUPABASE_ANON_KEY,
          ...(isLegacyJwtKey ? { authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {}),
          'x-upsert': 'false',
        },
        metadata: {
          bucketName: BUCKET,
          objectName: path,
          contentType: item.file.type || 'application/octet-stream',
          cacheControl: '3600',
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          item.progress = Math.round((bytesUploaded / bytesTotal) * 100);
          const bar = fileQueueEl.querySelector(`[data-id="${item.id}"] .file-progress-bar`);
          if (bar) bar.style.width = `${item.progress}%`;
        },
        onError: (error) => {
          const noResponse = !error?.originalResponse?.getStatus?.();
          if (canFallback && noResponse && endpoint !== RESUMABLE_ENDPOINT_FALLBACK) {
            console.warn('Endpoint storage langsung tidak terjangkau, coba endpoint fallback...', error);
            attemptUpload(RESUMABLE_ENDPOINT_FALLBACK, false);
            return;
          }
          item.status = 'error';
          item.errorMessage = describeUploadError(error);
          console.error('Upload gagal:', error);
          renderQueue();
          resolve();
        },
        onSuccess: () => {
          const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
          item.status = 'done';
          item.progress = 100;
          renderQueue();
          generateAndShow(publicUrlData.publicUrl, item.file.name, path);
          resolve();
        },
      });

      // Kalau koneksi sempat putus di tengah jalan pada file yang sama, lanjutkan
      // dari titik terakhir alih-alih upload ulang dari nol. Kalau proses cek ini
      // sendiri yang gagal (mis. akses ke penyimpanan browser diblokir), jangan
      // sampai upload-nya nyangkut diam-diam tanpa error — langsung mulai upload
      // baru sebagai fallback.
      upload.findPreviousUploads()
        .then((previousUploads) => {
          if (previousUploads.length > 0) {
            upload.resumeFromPreviousUpload(previousUploads[0]);
          }
          upload.start();
        })
        .catch(() => {
          upload.start();
        });
    };

    attemptUpload(RESUMABLE_ENDPOINT, true);
  });
}

// Ubah error tus-js-client (yang isinya teknis) jadi pesan singkat buat user,
// tapi tetap sertakan status code + pesan asli dari server biar gampang didiagnosa.
function describeUploadError(error) {
  const res = error?.originalResponse;
  const status = res?.getStatus?.();

  let detail = '';
  if (res) {
    try {
      const parsed = JSON.parse(res.getBody());
      detail = parsed.message || parsed.error || '';
    } catch {
      // body bukan JSON / kosong, abaikan
    }
  }

  if (!status) {
    // Nggak ada response sama sekali dari server. Bedain dulu: perangkatnya
    // memang offline, atau perangkat online tapi request-nya gagal nyampe/dijawab
    // (paling sering karena project Supabase-nya unreachable, misal auto-paused).
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return 'Nggak ada koneksi internet. Cek koneksi kamu, lalu coba lagi.';
    }
    return 'Server Supabase nggak merespons. Cek apakah project-nya masih aktif (project gratis auto-pause kalau lama nggak dipakai) dan URL/anon key di supabase-config.js sudah benar.';
  }
  if (status === 401 || status === 403) return `Ditolak server (${status}): ${detail || 'cek API key & policy bucket.'}`;
  if (status === 404) return `Bucket tidak ditemukan (404): ${detail || 'cek nama bucket sudah dibuat.'}`;
  if (status === 400) return `Ditolak server (400): ${detail || 'file sudah ada / bucket belum publik.'}`;
  return `Gagal upload (${status})${detail ? `: ${detail}` : ', coba lagi.'}`;
}

function datePath() {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* ---------- gaya QR: bentuk blok, warna, latar, logo ---------- */

const DOT_STYLES = [
  { key: 'square', label: 'Kotak', dotsType: 'square', cornersSquareType: 'square', cornersDotType: 'square' },
  { key: 'dots', label: 'Lingkaran', dotsType: 'dots', cornersSquareType: 'dot', cornersDotType: 'dot' },
  { key: 'rounded', label: 'Kotak Membulat', dotsType: 'rounded', cornersSquareType: 'extra-rounded', cornersDotType: 'dot' },
  { key: 'classy', label: 'Elegan', dotsType: 'classy', cornersSquareType: 'extra-rounded', cornersDotType: 'dot' },
  { key: 'classy-rounded', label: 'Elegan Membulat', dotsType: 'classy-rounded', cornersSquareType: 'extra-rounded', cornersDotType: 'dot' },
  { key: 'extra-rounded', label: 'Sangat Membulat', dotsType: 'extra-rounded', cornersSquareType: 'extra-rounded', cornersDotType: 'dot' },
];

// Preset latar belakang yang sudah dipasangkan sama warna bloknya, biar kontrasnya
// selalu aman buat di-scan (bukan cuma bagus dilihat).
const BG_PRESETS = [
  { key: 'cream', label: 'Cream Klasik', bg: '#FFF7E3', fg: '#0A0A0A' },
  { key: 'white', label: 'Putih (kontras terbaik)', bg: '#FFFFFF', fg: '#0A0A0A' },
  { key: 'dark', label: 'Gelap', bg: '#0A0A0A', fg: '#FFF7E3' },
  { key: 'cyan', label: 'Cyan Pop', bg: '#0A0A0A', fg: '#00D9C0' },
  { key: 'pink', label: 'Pink Pop', bg: '#0A0A0A', fg: '#FF3E8E' },
  { key: 'transparent', label: 'Transparan', bg: 'transparent', fg: '#0A0A0A' },
];

let qrStyle = {
  fg: '#0A0A0A',
  bg: '#FFF7E3',
  dotStyleKey: 'square',
  logoDataUrl: '',
};

function styleIconSvg(type) {
  const shapes = {
    square: (x, y) => `<rect x="${x}" y="${y}" width="7" height="7"/>`,
    dots: (x, y) => `<circle cx="${x + 3.5}" cy="${y + 3.5}" r="3.5"/>`,
    rounded: (x, y) => `<rect x="${x}" y="${y}" width="7" height="7" rx="2.4"/>`,
    classy: (x, y) => `<rect x="${x}" y="${y}" width="7" height="7" rx="3" ry="0.5"/>`,
    'classy-rounded': (x, y) => `<rect x="${x}" y="${y}" width="7" height="7" rx="3.5" ry="1"/>`,
    'extra-rounded': (x, y) => `<rect x="${x}" y="${y}" width="7" height="7" rx="3.5"/>`,
  };
  const cells = [[0, 0], [9, 0], [18, 0], [0, 9], [18, 9], [0, 18], [9, 18], [18, 18]];
  const fn = shapes[type] || shapes.square;
  return `<svg viewBox="0 0 25 25" class="style-icon" aria-hidden="true">${cells.map(([x, y]) => fn(x, y)).join('')}</svg>`;
}

function renderStyleSwatches() {
  styleSwatchRow.innerHTML = DOT_STYLES.map((s) => `
    <button type="button" class="style-swatch${s.key === qrStyle.dotStyleKey ? ' is-active' : ''}" data-style="${s.key}" aria-pressed="${s.key === qrStyle.dotStyleKey}">
      ${styleIconSvg(s.dotsType)}
      <span class="style-swatch-label">${s.label}</span>
    </button>
  `).join('');
}

function renderBgPresets() {
  bgPresetRow.innerHTML = BG_PRESETS.map((p) => {
    const swatchBg = p.bg === 'transparent'
      ? 'repeating-conic-gradient(#d8d8d8 0% 25%, #fff 0% 50%) 0 0 / 10px 10px'
      : p.bg;
    return `
      <button type="button" class="bg-preset${p.bg === qrStyle.bg && p.fg === qrStyle.fg ? ' is-active' : ''}" data-key="${p.key}" data-fg="${p.fg}" data-bg="${p.bg}" title="${p.label}">
        <span class="bg-preset-swatch" style="background:${swatchBg}">
          <span class="bg-preset-dot" style="background:${p.fg}"></span>
        </span>
        <span class="bg-preset-label">${p.label}</span>
      </button>
    `;
  }).join('');
}

function toHexColor(v) {
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '#ffffff';
}

function relLuminance(hex) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.substring(i, i + 2), 16) / 255);
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(hexA, hexB) {
  const [l1, l2] = [relLuminance(hexA), relLuminance(hexB)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

function updateContrastWarning() {
  if (qrStyle.bg === 'transparent') {
    contrastWarning.classList.add('is-hidden');
    return;
  }
  const ratio = contrastRatio(qrStyle.fg, qrStyle.bg);
  contrastWarning.classList.toggle('is-hidden', ratio >= 2.5);
}

function clearActivePreset() {
  bgPresetRow.querySelectorAll('.bg-preset').forEach((b) => b.classList.remove('is-active'));
}

styleSwatchRow.addEventListener('click', (e) => {
  const btn = e.target.closest('.style-swatch');
  if (!btn) return;
  qrStyle.dotStyleKey = btn.dataset.style;
  styleSwatchRow.querySelectorAll('.style-swatch').forEach((b) => {
    b.classList.toggle('is-active', b === btn);
    b.setAttribute('aria-pressed', String(b === btn));
  });
  refreshLivePreview();
});

bgPresetRow.addEventListener('click', (e) => {
  const btn = e.target.closest('.bg-preset');
  if (!btn) return;
  qrStyle.fg = btn.dataset.fg;
  qrStyle.bg = btn.dataset.bg;
  bgPresetRow.querySelectorAll('.bg-preset').forEach((b) => b.classList.toggle('is-active', b === btn));
  fgColorInput.value = toHexColor(qrStyle.fg);
  bgColorInput.value = toHexColor(qrStyle.bg);
  updateContrastWarning();
  refreshLivePreview();
});

fgColorInput.addEventListener('input', () => {
  qrStyle.fg = fgColorInput.value;
  clearActivePreset();
  updateContrastWarning();
  refreshLivePreview();
});

bgColorInput.addEventListener('input', () => {
  qrStyle.bg = bgColorInput.value;
  clearActivePreset();
  updateContrastWarning();
  refreshLivePreview();
});

logoInput.addEventListener('change', () => {
  const file = logoInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    qrStyle.logoDataUrl = reader.result;
    logoPreviewImg.src = reader.result;
    logoPreviewWrap.classList.remove('is-hidden');
    refreshLivePreview();
  };
  reader.readAsDataURL(file);
});

btnRemoveLogo.addEventListener('click', () => {
  qrStyle.logoDataUrl = '';
  logoInput.value = '';
  logoPreviewWrap.classList.add('is-hidden');
  refreshLivePreview();
});

renderStyleSwatches();
renderBgPresets();
fgColorInput.value = qrStyle.fg;
bgColorInput.value = qrStyle.bg;

/* ---------- QR generation ---------- */

function buildQrOptions(text, size, style) {
  const dotStyle = DOT_STYLES.find((s) => s.key === style.dotStyleKey) || DOT_STYLES[0];
  const hasLogo = Boolean(style.logoDataUrl);
  return {
    width: size,
    height: size,
    type: 'svg',
    data: text,
    margin: 12,
    qrOptions: { errorCorrectionLevel: hasLogo ? 'H' : 'Q' },
    dotsOptions: { color: style.fg, type: dotStyle.dotsType },
    cornersSquareOptions: { color: style.fg, type: dotStyle.cornersSquareType },
    cornersDotOptions: { color: style.fg, type: dotStyle.cornersDotType },
    backgroundOptions: { color: style.bg },
    ...(hasLogo ? {
      image: style.logoDataUrl,
      imageOptions: { margin: 6, imageSize: 0.28, hideBackgroundDots: true },
    } : {}),
  };
}

function generateAndShow(text, label, storagePath) {
  presentResult(text, label);
  addHistoryEntry(text, label, storagePath);
}

function renderResultQr(text, style) {
  resultCanvas.innerHTML = '';
  currentQr = new QRCodeStyling(buildQrOptions(text, 900, style));
  currentQr.append(resultCanvas);
}

function presentResult(text, label) {
  currentResultUrl = text;
  resultSection.classList.remove('is-hidden');
  renderResultQr(text, { ...qrStyle });
  resultLabel.textContent = label;
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function refreshLivePreview() {
  if (resultSection.classList.contains('is-hidden') || !currentResultUrl) return;
  renderResultQr(currentResultUrl, { ...qrStyle });
}

/* ---------- riwayat: kesimpen permanen di localStorage ----------
   Sengaja pakai localStorage (bukan sessionStorage): riwayat harus tetap ada
   walau tab ditutup, browser di-restart, atau halaman ini ditinggal lalu
   dibuka lagi lain waktu. Satu-satunya jalan riwayat hilang adalah lewat
   tombol hapus di kartunya masing-masing. */

const HISTORY_KEY = 'hidzgenerate:history';
let historyEntries = loadHistory();

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(historyEntries));
  } catch {
    // Paling sering kepenuhan kuota gara-gara logo custom (base64) yang
    // numpuk. Coba simpan ulang tanpa data logo dulu, biar riwayatnya
    // sendiri tetap kesimpen walau nanti logo di kartu lama nggak muncul.
    try {
      const lean = historyEntries.map((entry) => ({ ...entry, style: { ...entry.style, logoDataUrl: '' } }));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(lean));
    } catch {
      // Tetap gagal — biarkan, riwayat cuma hidup buat sesi ini. Fitur
      // generate QR-nya sendiri harus tetap jalan normal.
    }
  }
}

const HISTORY_ICONS = {
  download: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M10 11v6M14 11v6"/></svg>',
};

function addHistoryEntry(text, label, storagePath) {
  const entry = {
    id: `h${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
    text,
    label,
    storagePath: storagePath || '',
    style: { ...qrStyle },
  };
  historyEntries.unshift(entry);
  saveHistory();

  historyEmpty.classList.add('is-hidden');
  historyList.prepend(buildHistoryCard(entry));
}

function buildHistoryCard(entry) {
  const { text, label, style } = entry;

  const li = document.createElement('li');
  li.className = 'history-card';

  const thumb = document.createElement('div');
  thumb.className = 'history-card-thumb';
  li.appendChild(thumb);

  const qrInstance = new QRCodeStyling(buildQrOptions(text, 600, style));
  qrInstance.append(thumb);

  const body = document.createElement('div');
  body.className = 'history-card-body';

  const labelEl = document.createElement('p');
  labelEl.className = 'history-card-label';
  labelEl.textContent = label;
  labelEl.title = label;
  body.appendChild(labelEl);

  // Buat riwayat dari mode Upload File, label-nya nama file (pendek) tapi
  // yang ke-encode di QR adalah URL publiknya (panjang) — tampilkan dua-duanya,
  // sama seperti mode Link/Teks yang cukup satu baris karena label & isinya sama.
  if (text !== label) {
    const metaEl = document.createElement('p');
    metaEl.className = 'history-card-meta';
    metaEl.textContent = text;
    metaEl.title = text;
    body.appendChild(metaEl);
  }

  li.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'history-card-actions';

  const dlBtn = document.createElement('button');
  dlBtn.type = 'button';
  dlBtn.className = 'history-icon-btn';
  dlBtn.title = 'Unduh QR';
  dlBtn.setAttribute('aria-label', `Unduh QR ${label}`);
  dlBtn.innerHTML = HISTORY_ICONS.download;
  dlBtn.addEventListener('click', () => qrInstance.download({ name: `qr-${slugify(label)}`, extension: 'png' }));

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'history-icon-btn';
  copyBtn.title = 'Salin link';
  copyBtn.setAttribute('aria-label', `Salin link ${label}`);
  copyBtn.innerHTML = HISTORY_ICONS.copy;
  copyBtn.addEventListener('click', () => copyHistoryLink(text, copyBtn));

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'history-icon-btn history-icon-btn--danger';
  delBtn.title = 'Hapus';
  delBtn.setAttribute('aria-label', `Hapus riwayat ${label}`);
  delBtn.innerHTML = HISTORY_ICONS.trash;
  delBtn.addEventListener('click', () => deleteHistoryCard(li, delBtn, entry));

  actions.append(dlBtn, copyBtn, delBtn);
  li.appendChild(actions);

  return li;
}

/* ---------- modal konfirmasi hapus ---------- */
// Dialog confirm() bawaan browser ikut nampilin origin halaman ini ke
// pengguna (kebaca jelas kalau halamannya lagi ditanam sebagai iframe di
// domain lain), jadi diganti modal sendiri di bawah ini biar domain aslinya
// nggak pernah kelihatan sama sekali.

const confirmOverlay = document.getElementById('confirm-overlay');
const confirmMessageEl = document.getElementById('confirm-message');
const confirmOkBtn = document.getElementById('confirm-ok');
const confirmCancelBtn = document.getElementById('confirm-cancel');
let resolveConfirm = null;

function askConfirm(message) {
  confirmMessageEl.textContent = message;
  confirmOverlay.classList.remove('is-hidden');
  confirmCancelBtn.focus();
  return new Promise((resolve) => {
    resolveConfirm = resolve;
  });
}

function closeConfirm(result) {
  confirmOverlay.classList.add('is-hidden');
  resolveConfirm?.(result);
  resolveConfirm = null;
}

confirmOkBtn.addEventListener('click', () => closeConfirm(true));
confirmCancelBtn.addEventListener('click', () => closeConfirm(false));
confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) closeConfirm(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !confirmOverlay.classList.contains('is-hidden')) closeConfirm(false);
});

// Hapus 1 kartu riwayat. Kalau riwayatnya berasal dari mode Upload File
// (storagePath terisi), file aslinya di Supabase Storage ikut dihapus juga —
// jadi link publik yang sudah kepatri di QR itu langsung mati dan QR-nya
// otomatis nggak bisa dipakai lagi begitu di-scan. Riwayat dari mode Link/Teks
// nggak nyimpen apa-apa di server, jadi cukup dihapus dari daftar & localStorage.
async function deleteHistoryCard(li, delBtn, entry) {
  const confirmMsg = entry.storagePath
    ? 'Hapus riwayat ini? File yang sudah diupload ikut terhapus dan QR-nya jadi nggak bisa dipakai lagi. Lanjutkan?'
    : 'Hapus riwayat ini?';
  const ok = await askConfirm(confirmMsg);
  if (!ok) return;

  if (entry.storagePath) {
    if (!supabase) {
      flashClass(delBtn, 'is-error');
      return;
    }

    delBtn.disabled = true;
    const { error } = await supabase.storage.from(BUCKET).remove([entry.storagePath]);
    delBtn.disabled = false;
    if (error) {
      console.error('Gagal menghapus file:', error);
      flashClass(delBtn, 'is-error');
      return;
    }
  }

  historyEntries = historyEntries.filter((item) => item.id !== entry.id);
  saveHistory();
  li.remove();
  if (!historyList.children.length) historyEmpty.classList.remove('is-hidden');
}

// Riwayat dari kunjungan sebelumnya (kesimpen di localStorage) dirender di
// sini pas halaman dibuka, urutannya tetap terbaru di paling atas.
historyEntries.forEach((entry) => historyList.appendChild(buildHistoryCard(entry)));
if (historyEntries.length) historyEmpty.classList.add('is-hidden');

/* ---------- result actions ---------- */

btnDownload.addEventListener('click', () => {
  if (!currentQr) return;
  currentQr.download({ name: `qr-${slugify(resultLabel.textContent)}`, extension: 'png' });
});
btnCopy.addEventListener('click', () => copyText(currentResultUrl, btnCopy));

async function writeToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

async function copyText(text, btnEl) {
  await writeToClipboard(text);
  flashButton(btnEl, 'Tersalin!');
}

// Versi buat tombol ikon di kartu riwayat: nggak ada ruang buat teks,
// jadi ikonnya sendiri yang sementara ganti jadi centang.
async function copyHistoryLink(text, btnEl) {
  await writeToClipboard(text);
  flashIconButton(btnEl, HISTORY_ICONS.check, 'is-copied');
}

function flashButton(btnEl, msg) {
  const original = btnEl.textContent;
  btnEl.textContent = msg;
  setTimeout(() => { btnEl.textContent = original; }, 1200);
}

function flashIconButton(btnEl, iconHtml, className, duration = 1200) {
  const original = btnEl.innerHTML;
  btnEl.innerHTML = iconHtml;
  btnEl.classList.add(className);
  setTimeout(() => {
    btnEl.innerHTML = original;
    btnEl.classList.remove(className);
  }, duration);
}

function flashClass(el, className, duration = 1200) {
  el.classList.add(className);
  setTimeout(() => el.classList.remove(className), duration);
}

/* ---------- utils ---------- */

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function slugify(str) {
  const clean = str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
  return clean || 'hidzgenerate';
}
