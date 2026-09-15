const state = { images: [], busy: false };
const $ = (id) => document.getElementById(id);
const baseUrl = $('baseUrl');
const apiKey = $('apiKey');
const model = $('model');
const prompt = $('prompt');
let historyDbPromise;

function openHistoryDb() {
  if (historyDbPromise) return historyDbPromise;
  historyDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('image2-studio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images', { keyPath: 'id', autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return historyDbPromise;
}

async function loadHistory() {
  try {
    const db = await openHistoryDb();
    state.images = await new Promise((resolve, reject) => {
      const request = db.transaction('images', 'readonly').objectStore('images').getAll();
      request.onsuccess = () => resolve(request.result.reverse());
      request.onerror = () => reject(request.error);
    });
  } catch (_) {
    $('canvasMessage').textContent = '浏览器存储不可用，历史记录只保留在当前页面';
  }
  renderGallery();
}

async function saveHistory(item) {
  try {
    const db = await openHistoryDb();
    const id = await new Promise((resolve, reject) => {
      const request = db.transaction('images', 'readwrite').objectStore('images').add({ src: item.src, prompt: item.prompt, model: item.model, time: item.time });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    item.id = id;
  } catch (_) {
    $('canvasMessage').textContent = '图片已生成，但浏览器存储空间不足，未能写入历史记录';
  }
}

async function clearHistory() {
  try {
    const db = await openHistoryDb();
    await new Promise((resolve, reject) => {
      const request = db.transaction('images', 'readwrite').objectStore('images').clear();
      request.onsuccess = resolve; request.onerror = () => reject(request.error);
    });
  } catch (_) { /* keep the in-memory clear even if storage is unavailable */ }
  state.images = []; renderGallery(); $('canvasMessage').textContent = '历史记录已清空';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/, '');
}

function endpoint(path) {
  const base = normalizeBaseUrl(baseUrl.value);
  return `${base}${path}`;
}

function setConnection(status, text) {
  const badge = $('connectionBadge');
  badge.className = `connection-badge ${status}`;
  $('connectionText').textContent = text;
}

function setMessage(target, text, type = '') {
  target.textContent = text;
  target.className = `field-message ${type}`;
}

function persistSettings() {
  const settings = { baseUrl: baseUrl.value, model: model.value, size: $('size').value, quality: $('quality').value, responseFormat: $('responseFormat').value, autoDownload: $('autoDownload').checked };
  localStorage.setItem('image2-settings', JSON.stringify(settings));
  if ($('rememberKey').checked && apiKey.value) localStorage.setItem('image2-api-key', apiKey.value);
  else localStorage.removeItem('image2-api-key');
}

function restoreSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('image2-settings') || '{}');
    Object.entries(saved).forEach(([id, value]) => {
      if (!$(id) || value === undefined || value === null) return;
      if ($(id).type === 'checkbox') $(id).checked = Boolean(value);
      else $(id).value = value;
    });
    const savedKey = localStorage.getItem('image2-api-key');
    if (savedKey) { apiKey.value = savedKey; $('rememberKey').checked = true; }
  } catch (_) { /* ignore malformed local preferences */ }
}

function updateSummary() {
  $('summaryModel').textContent = model.value.trim() || 'image2';
  $('summarySize').textContent = $('size').value === 'auto' ? '自动尺寸' : $('size').value.replace('x', ' × ');
  const count = Number($('count').value) || 1;
  $('summaryCount').textContent = `${count} image${count > 1 ? 's' : ''}`;
  $('promptCount').textContent = `${prompt.value.length} / 4000`;
}

function parseImageResult(json) {
  if (!Array.isArray(json?.data)) throw new Error(json?.error?.message || '响应中没有找到图片数据');
  return json.data.map((item) => {
    if (item.url) return item.url;
    if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
    return null;
  }).filter(Boolean);
}

async function downloadImage(src, index, modelName) {
  const filename = `image2-${modelName.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40) || 'image'}-${Date.now()}-${index + 1}.png`;
  let href = src;
  let objectUrl = '';
  try {
    if (!src.startsWith('data:')) {
      const response = await fetch(src, { mode: 'cors' });
      if (!response.ok) throw new Error('image fetch failed');
      objectUrl = URL.createObjectURL(await response.blob());
      href = objectUrl;
    }
    const link = document.createElement('a');
    link.href = href; link.download = filename; link.rel = 'noopener';
    document.body.appendChild(link); link.click(); link.remove();
  } catch (_) {
    // Cross-origin URL responses may not permit blob downloads; opening the URL is the fallback.
    const link = document.createElement('a');
    link.href = src; link.target = '_blank'; link.rel = 'noopener';
    document.body.appendChild(link); link.click(); link.remove();
  } finally {
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

async function testConnection() {
  if (!normalizeBaseUrl(baseUrl.value)) return setMessage($('connectionMessage'), '请先填写 Base URL', 'error');
  const button = $('testConnection');
  button.classList.add('loading');
  setMessage($('connectionMessage'), '正在连接…');
  try {
    const res = await fetch(endpoint('/models'), { headers: apiKey.value ? { Authorization: `Bearer ${apiKey.value}` } : {} });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setConnection('ok', '已连接');
    setMessage($('connectionMessage'), '连接成功，可以开始生成', 'ok');
  } catch (error) {
    setConnection('error', '连接失败');
    setMessage($('connectionMessage'), error.message.includes('Failed to fetch') ? '请求被浏览器拦截，通常是 CORS 设置问题' : `连接失败：${error.message}`, 'error');
  } finally { button.classList.remove('loading'); }
}

async function fetchModels() {
  const list = $('modelList');
  list.hidden = false;
  list.innerHTML = '<div class="model-option">读取模型列表…</div>';
  try {
    const res = await fetch(endpoint('/models'), { headers: apiKey.value ? { Authorization: `Bearer ${apiKey.value}` } : {} });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const models = (json.data || []).map((item) => item.id).filter(Boolean);
    if (!models.length) throw new Error('未返回模型');
    list.innerHTML = models.map((id) => `<button class="model-option" type="button" data-model="${escapeHtml(id)}">${escapeHtml(id)}</button>`).join('');
    list.querySelectorAll('[data-model]').forEach((item) => item.addEventListener('click', () => { model.value = item.dataset.model; list.hidden = true; updateSummary(); persistSettings(); }));
  } catch (error) { list.innerHTML = `<div class="model-option">${error.message.includes('Failed to fetch') ? 'CORS 或网络错误' : error.message}</div>`; }
}

function renderGallery() {
  const gallery = $('gallery');
  $('resultCount').textContent = `${state.images.length} image${state.images.length === 1 ? '' : 's'}`;
  if (!state.images.length) { gallery.innerHTML = '<div id="emptyState" class="empty-state"><div class="empty-icon"><i data-lucide="image"></i></div><h3>还没有历史记录</h3><p>生成的图片会自动保存在此浏览器中。</p></div>'; window.lucide?.createIcons(); return; }
  gallery.innerHTML = state.images.map((item, index) => `<article class="image-card"><div class="image-frame"><img src="${item.src}" alt="${escapeHtml(item.prompt)}" loading="lazy"/><div class="image-overlay"><button type="button" title="下载图片" data-download="${index}"><i data-lucide="download"></i></button><button type="button" title="复制图片地址" data-copy="${index}"><i data-lucide="copy"></i></button></div></div><div class="image-card-info"><div class="card-index">${String(index + 1).padStart(2, '0')} · ${escapeHtml(item.model)}</div><div class="card-prompt">${escapeHtml(item.prompt)}</div><div class="card-time">${escapeHtml(item.time)}</div></div></article>`).join('');
  window.lucide?.createIcons();
  gallery.querySelectorAll('.image-frame img').forEach((image) => image.addEventListener('click', () => openLightbox(image.src, image.alt)));
  gallery.querySelectorAll('[data-download]').forEach((button) => button.addEventListener('click', () => { const item = state.images[button.dataset.download]; const link = document.createElement('a'); link.href = item.src; link.download = `image2-${Date.now()}.png`; link.click(); }));
  gallery.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', async () => { const item = state.images[button.dataset.copy]; try { await navigator.clipboard.writeText(item.src); $('canvasMessage').textContent = '图片地址已复制'; setTimeout(() => { $('canvasMessage').textContent = ''; }, 1800); } catch (_) { $('canvasMessage').textContent = '浏览器不允许复制图片地址'; } }));
}

function openLightbox(src, alt) {
  $('lightboxImage').src = src;
  $('lightboxImage').alt = alt || '放大图片';
  $('lightbox').hidden = false;
  document.body.style.overflow = 'hidden';
  $('closeLightbox').focus();
}

function closeLightbox() {
  $('lightbox').hidden = true;
  $('lightboxImage').src = '';
  document.body.style.overflow = '';
}

async function generate() {
  if (state.busy) return;
  const text = prompt.value.trim();
  if (!normalizeBaseUrl(baseUrl.value) || !apiKey.value.trim()) { $('canvasMessage').textContent = '请先填写 Base URL 和 API key'; setConnection('error', '需要配置'); return; }
  if (!text) { $('canvasMessage').textContent = '先写一句 prompt'; prompt.focus(); return; }
  const count = Math.min(4, Math.max(1, Number($('count').value) || 1));
  state.busy = true;
  const button = $('generate'); button.classList.add('loading'); button.querySelector('span').textContent = '生成中…';
  $('canvasMessage').textContent = '正在请求图像接口，请稍候'; setConnection('idle', '生成中');
  const body = { model: model.value.trim() || 'image2', prompt: text, n: 1, size: $('size').value, quality: $('quality').value, response_format: $('responseFormat').value };
  try {
    const requestImage = async () => {
      const res = await fetch(endpoint('/images/generations'), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.value.trim()}` }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
      return parseImageResult(json);
    };
    // Send one-image requests concurrently because many image2-compatible APIs ignore n > 1.
    const batches = await Promise.all(Array.from({ length: count }, requestImage));
    const allSources = batches.flat();
    // Some providers may still return multiple images from one n=1 request.
    // Keep the UI result count aligned with the user's requested quantity.
    const sources = allSources.slice(0, count);
    const newItems = sources.map((src) => ({ src, prompt: text, model: body.model, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }));
    for (const item of newItems) { await saveHistory(item); state.images.unshift(item); }
    if ($('autoDownload').checked) {
      for (const [index, src] of sources.entries()) {
        await downloadImage(src, index, body.model);
        if (index < sources.length - 1) await new Promise((resolve) => setTimeout(resolve, 180));
      }
    }
    renderGallery(); setConnection('ok', '已连接');
    $('canvasMessage').textContent = allSources.length === sources.length
      ? `完成，并发请求 ${count} 次，收到 ${sources.length} 张图片`
      : `完成，并发请求 ${count} 次，接口返回 ${allSources.length} 张，已按设置保留 ${sources.length} 张`;
  } catch (error) { setConnection('error', '请求失败'); $('canvasMessage').textContent = error.message.includes('Failed to fetch') ? '请求失败：请检查 CORS、Base URL 或网络连接' : `请求失败：${error.message}`; }
  finally { state.busy = false; button.classList.remove('loading'); button.querySelector('span').textContent = '生成图像'; }
}

restoreSettings(); updateSummary(); renderGallery(); loadHistory(); window.lucide?.createIcons();
['baseUrl', 'apiKey', 'model', 'size', 'quality', 'responseFormat', 'rememberKey', 'autoDownload'].forEach((id) => $(id).addEventListener('change', () => { updateSummary(); persistSettings(); }));
prompt.addEventListener('input', updateSummary);
$('toggleKey').addEventListener('click', () => { apiKey.type = apiKey.type === 'password' ? 'text' : 'password'; $('toggleKey').innerHTML = `<i data-lucide="${apiKey.type === 'password' ? 'eye' : 'eye-off'}"></i>`; window.lucide?.createIcons(); });
$('testConnection').addEventListener('click', testConnection); $('fetchModels').addEventListener('click', fetchModels); $('generate').addEventListener('click', generate);
$('examplePrompt').addEventListener('click', () => { prompt.value = 'A quiet coastal observatory at blue hour, warm lights inside, long exposure stars, editorial photography'; updateSummary(); prompt.focus(); });
document.querySelectorAll('[data-prompt]').forEach((chip) => chip.addEventListener('click', () => { prompt.value = `${prompt.value.trim()}${prompt.value.trim() ? ', ' : ''}${chip.dataset.prompt}`; updateSummary(); prompt.focus(); }));
document.querySelectorAll('[data-step]').forEach((button) => button.addEventListener('click', () => { const input = $('count'); input.value = Math.min(4, Math.max(1, Number(input.value) + Number(button.dataset.step))); updateSummary(); persistSettings(); }));
$('clearSession').addEventListener('click', () => { if (state.images.length && window.confirm('确定清空全部历史记录吗？图片将无法恢复。')) clearHistory(); });
prompt.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') generate(); });
$('closeLightbox').addEventListener('click', closeLightbox);
$('lightbox').addEventListener('click', (event) => { if (event.target === $('lightbox')) closeLightbox(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('lightbox').hidden) closeLightbox(); });
