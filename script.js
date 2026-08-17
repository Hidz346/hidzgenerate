import { supabase, BUCKET, SUPABASE_ANON_KEY, RESUMABLE_ENDPOINT } from './supabase-config.js';
import * as tus from 'https://esm.sh/tus-js-client@4.3.1';

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
    const upload = new tus.Upload(item.file, {
      endpoint: RESUMABLE_ENDPOINT,
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
        generateAndShow(publicUrlData.publicUrl, item.file.name);
        resolve();
      },
    });

    // Kalau koneksi sempat putus di tengah jalan pada file yang sama, lanjutkan
    // dari titik terakhir alih-alih upload ulang dari nol.
    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    });
  });
}

// Ubah error tus-js-client (yang isinya teknis) jadi pesan singkat buat user.
function describeUploadError(error) {
  const status = error?.originalResponse?.getStatus?.();
  if (status === 401 || status === 403) return 'Ditolak server (cek API key & policy bucket di Supabase).';
  if (status === 404) return 'Bucket tidak ditemukan (cek nama bucket di Supabase Storage).';
  if (status === 400) return 'Permintaan ditolak server (kemungkinan file sudah ada / bucket belum publik).';
  if (!navigator.onLine) return 'Koneksi internet terputus.';
  return 'Gagal upload, coba lagi.';
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

function generateAndShow(text, label) {
  presentResult(text, label);
  addHistoryCard(text, label);
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

function addHistoryCard(text, label) {
  historyEmpty.classList.add('is-hidden');
  const styleSnapshot = { ...qrStyle };

  const li = document.createElement('li');
  li.className = 'history-card';

  const qrContainer = document.createElement('div');
  qrContainer.className = 'history-card-qr';
  li.appendChild(qrContainer);

  const qrInstance = new QRCodeStyling(buildQrOptions(text, 600, styleSnapshot));
  qrInstance.append(qrContainer);

  const labelEl = document.createElement('div');
  labelEl.className = 'history-card-label';
  labelEl.textContent = label;
  labelEl.title = label;
  li.appendChild(labelEl);

  const actions = document.createElement('div');
  actions.className = 'history-card-actions';

  const dlBtn = document.createElement('button');
  dlBtn.type = 'button';
  dlBtn.textContent = 'Unduh';
  dlBtn.addEventListener('click', () => qrInstance.download({ name: `qr-${slugify(label)}`, extension: 'png' }));

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.textContent = 'Salin';
  copyBtn.addEventListener('click', () => copyText(text, copyBtn));

  actions.append(dlBtn, copyBtn);
  li.appendChild(actions);

  historyList.prepend(li);
}

/* ---------- result actions ---------- */

btnDownload.addEventListener('click', () => {
  if (!currentQr) return;
  currentQr.download({ name: `qr-${slugify(resultLabel.textContent)}`, extension: 'png' });
});
btnCopy.addEventListener('click', () => copyText(currentResultUrl, btnCopy));

async function copyText(text, btnEl) {
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
  flashButton(btnEl, 'Tersalin!');
}

function flashButton(btnEl, msg) {
  const original = btnEl.textContent;
  btnEl.textContent = msg;
  setTimeout(() => { btnEl.textContent = original; }, 1200);
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
