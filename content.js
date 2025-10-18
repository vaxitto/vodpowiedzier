const SETTINGS_KEY = 'solverSettings';
const COUNT_KEY = 'answersCount';
const LAST_RESPONSE_KEY = 'lastResponse';

let shadowRoot;
let panelElements = {};
let selectionState = {
  active: false,
  hintEl: null,
  popupEl: null
};
let panelState = {
  docked: true,
  dragOffset: { x: 0, y: 0 }
};
let currentAccent = '#7F00FF';

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'activate_selection') {
    ensureUI();
    activateSelectionMode();
  }
});

initializeUI();

async function initializeUI() {
  ensureUI();
  await applyAccentColor();
  updateCounter();
  loadLastResponse();
  chrome.storage.onChanged.addListener(handleStorageChange);
}

function ensureUI() {
  if (shadowRoot) {
    return;
  }
  const host = document.createElement('div');
  host.id = 'solver-shadow-host';
  host.style.all = 'initial';
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '0';
  host.style.zIndex = '2147483646';
  document.documentElement.appendChild(host);

  shadowRoot = host.attachShadow({ mode: 'open' });
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = chrome.runtime.getURL('styles/fluent.css');
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = chrome.runtime.getURL('fonts/inter.css');
  shadowRoot.append(styleLink, fontLink);

  const container = document.createElement('div');
  container.className = 'solver-container';
  container.innerHTML = createPanelTemplate();
  shadowRoot.appendChild(container);

  panelElements.panel = container.querySelector('.solver-panel');
  panelElements.counter = container.querySelector('.solver-counter');
  panelElements.message = container.querySelector('.solver-message');
  panelElements.status = container.querySelector('.solver-status');
  panelElements.copyButton = container.querySelector('.solver-copy-button');
  panelElements.settingsButton = container.querySelector('.solver-settings-button');
  panelElements.debugBlock = container.querySelector('.solver-debug-block');
  panelElements.debugPre = container.querySelector('.solver-debug-pre');
  panelElements.usageBlock = container.querySelector('.solver-usage');
  panelElements.dockButton = container.querySelector('.solver-dock-button');
  panelElements.modalContainer = container.querySelector('.solver-modal-container');

  panelElements.copyButton.addEventListener('click', handleCopy);
  panelElements.settingsButton.addEventListener('click', openSettingsModal);
  panelElements.dockButton.addEventListener('click', toggleDockMode);

  setupDrag(panelElements.panel.querySelector('.solver-header'));
}

function createPanelTemplate() {
  return `
    <div class="solver-panel solver-panel--docked" data-docked="true">
      <div class="solver-header" tabindex="0">
        <button class="solver-dock-button" aria-label="Przełącz dokowanie" title="Przełącz dokowanie">⇱</button>
        <div class="solver-title">
          <span class="solver-counter">Odpowiedzi: 0</span>
        </div>
        <div class="solver-header-actions">
          <button class="solver-copy-button" aria-label="Kopiuj odpowiedź">Kopiuj</button>
          <button class="solver-settings-button" aria-label="Ustawienia">⚙</button>
        </div>
      </div>
      <div class="solver-body">
        <div class="solver-message" data-placeholder="Brak odpowiedzi. Użyj Ctrl+I, aby rozpocząć."></div>
        <div class="solver-usage" hidden></div>
        <div class="solver-debug-block" hidden>
          <h4>Debug</h4>
          <pre class="solver-debug-pre"></pre>
        </div>
      </div>
      <div class="solver-status" role="status" aria-live="polite"></div>
    </div>
    <div class="solver-modal-container" hidden></div>
  `;
}

async function activateSelectionMode() {
  if (selectionState.active) {
    return;
  }
  selectionState.active = true;
  const hint = document.createElement('div');
  hint.className = 'solver-selection-hint';
  hint.textContent = 'Zaznacz tekst zadania';
  shadowRoot.appendChild(hint);
  selectionState.hintEl = hint;

  const handleMouseUp = async () => {
    if (!selectionState.active) {
      return;
    }
    const text = window.getSelection().toString().trim();
    if (text.length === 0) {
      cleanupSelection();
      return;
    }
    await showImagePrompt(text);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      cleanupSelection();
    }
  };

  selectionState.mouseupHandler = handleMouseUp;
  selectionState.keyHandler = handleKeyDown;
  document.addEventListener('mouseup', handleMouseUp, { once: true });
  document.addEventListener('keydown', handleKeyDown, { once: true });
}

function cleanupSelection() {
  selectionState.active = false;
  if (selectionState.hintEl?.isConnected) {
    selectionState.hintEl.remove();
  }
  selectionState.hintEl = null;
}

async function showImagePrompt(selectedText) {
  cleanupSelection();
  ensureUI();

  const popup = document.createElement('div');
  popup.className = 'solver-image-popup';
  popup.tabIndex = -1;
  popup.innerHTML = `
    <div class="solver-image-popup-content" role="dialog" aria-modal="true">
      <p>Czy chcesz dodać zdjęcie?</p>
      <div class="solver-image-popup-actions">
        <button class="solver-image-yes"><u><b>T</b></u>ak</button>
        <button class="solver-image-no"><u><b>N</b></u>ie</button>
      </div>
    </div>
  `;

  selectionState.popupEl = popup;
  shadowRoot.appendChild(popup);
  popup.focus({ preventScroll: true });

  const dispose = () => {
    popup.remove();
    selectionState.popupEl = null;
    document.removeEventListener('keydown', keyHandler);
  };

  const yesButton = popup.querySelector('.solver-image-yes');
  const noButton = popup.querySelector('.solver-image-no');

  yesButton.addEventListener('click', async () => {
    dispose();
    await handleWithImage(selectedText);
  });

  noButton.addEventListener('click', async () => {
    dispose();
    await handleTextOnly(selectedText);
  });

  const keyHandler = async (event) => {
    if (event.key === 'Escape') {
      dispose();
    }
    if (event.key === 't' || event.key === 'T') {
      event.preventDefault();
      dispose();
      await handleWithImage(selectedText);
    }
    if (event.key === 'n' || event.key === 'N' || event.key === 'Enter') {
      event.preventDefault();
      dispose();
      await handleTextOnly(selectedText);
    }
  };

  document.addEventListener('keydown', keyHandler);
}

async function handleTextOnly(text) {
  await processTask({ text });
}

async function handleWithImage(text) {
  try {
    const region = await startRegionSelection();
    if (!region) {
      return;
    }
    const screenshot = await captureVisibleTab();
    if (!screenshot?.success) {
      throw new Error(screenshot?.error || 'Nie udało się pobrać zrzutu ekranu.');
    }
    if (!screenshot.dataUrl) {
      throw new Error('Brak danych zrzutu ekranu.');
    }
    const cropped = await cropScreenshot(screenshot.dataUrl, region);
    await processTask({ text, imageDataUrl: cropped });
  } catch (error) {
    showStatus(error.message || 'Wystąpił błąd podczas przechwytywania obrazu.', true);
  }
}

async function processTask({ text, imageDataUrl }) {
  showStatus('Wysyłanie zapytania...', false);
  panelElements.panel.setAttribute('data-loading', 'true');
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'solve_task',
      payload: { text, imageDataUrl }
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Nieznany błąd.');
    }

    displayResponse(response.data);
  } catch (error) {
    displayError(error.message || 'Nie udało się uzyskać odpowiedzi.');
    if (error.message?.includes('Brak klucza API')) {
      openSettingsModal();
    }
  } finally {
    panelElements.panel.removeAttribute('data-loading');
  }
}

function displayResponse(data) {
  const { message, raw, usage, timestamp } = data;
  panelElements.message.textContent = message || 'Brak treści odpowiedzi.';
  panelElements.message.setAttribute('data-has-content', message ? 'true' : 'false');
  showStatus(`Odpowiedź wygenerowana ${formatTimestamp(timestamp)}`, false);
  updateCounter();
  updateDebug(raw, usage);
}

function displayError(errorMessage) {
  panelElements.message.textContent = '';
  panelElements.message.setAttribute('data-has-content', 'false');
  showStatus(errorMessage, true);
  updateDebug(null, null);
}

function showStatus(message, isError) {
  if (!panelElements.status) return;
  panelElements.status.textContent = message || '';
  panelElements.status.setAttribute('data-error', isError ? 'true' : 'false');
}

function updateDebug(raw, usage) {
  if (!panelElements.debugBlock) return;
  if (raw) {
    panelElements.debugBlock.hidden = false;
    panelElements.debugPre.textContent = JSON.stringify(raw, null, 2);
  } else {
    panelElements.debugBlock.hidden = true;
    panelElements.debugPre.textContent = '';
  }

  if (usage) {
    panelElements.usageBlock.hidden = false;
    panelElements.usageBlock.textContent = `Zużycie: prompt ${usage.prompt_tokens || 0} tokenów, odpowiedź ${usage.completion_tokens || 0} tokenów, łącznie ${usage.total_tokens || 0}.`;
  } else {
    panelElements.usageBlock.hidden = true;
    panelElements.usageBlock.textContent = '';
  }
}

function handleCopy() {
  const text = panelElements.message?.textContent?.trim();
  if (!text) {
    showStatus('Brak treści do skopiowania.', true);
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    showStatus('Skopiowano odpowiedź do schowka.', false);
  }).catch(() => {
    showStatus('Nie udało się skopiować.', true);
  });
}

function openSettingsModal() {
  ensureUI();
  if (!panelElements.modalContainer) return;
  panelElements.modalContainer.innerHTML = '';
  const overlay = document.createElement('div');
  overlay.className = 'solver-settings-overlay';
  overlay.innerHTML = `
    <div class="solver-settings-modal" role="dialog" aria-modal="true">
      <iframe src="${chrome.runtime.getURL('settings.html')}" title="Ustawienia"></iframe>
      <button class="solver-modal-close" aria-label="Zamknij">×</button>
    </div>
  `;
  panelElements.modalContainer.appendChild(overlay);
  panelElements.modalContainer.hidden = false;

  const close = () => {
    panelElements.modalContainer.hidden = true;
    panelElements.modalContainer.innerHTML = '';
    document.removeEventListener('keydown', escHandler);
  };

  overlay.querySelector('.solver-modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });
  const escHandler = function handleEsc(event) {
    if (event.key === 'Escape') {
      close();
    }
  };
  document.addEventListener('keydown', escHandler);
}

function toggleDockMode() {
  panelState.docked = !panelState.docked;
  const panel = panelElements.panel;
  panel.dataset.docked = panelState.docked ? 'true' : 'false';
  if (panelState.docked) {
    panel.classList.add('solver-panel--docked');
    panel.style.removeProperty('top');
    panel.style.removeProperty('left');
    panelElements.dockButton.textContent = '⇱';
  } else {
    panel.classList.remove('solver-panel--docked');
    panel.style.top = '80px';
    panel.style.left = `${window.innerWidth - panel.offsetWidth - 32}px`;
    panelElements.dockButton.textContent = '🡼';
  }
}

function setupDrag(header) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  header.addEventListener('mousedown', (event) => {
    if (panelState.docked) return;
    if (event.target.closest('button')) return;
    dragging = true;
    startX = event.clientX - (parseInt(panelElements.panel.style.left || '0', 10));
    startY = event.clientY - (parseInt(panelElements.panel.style.top || '0', 10));
    event.preventDefault();
  });

  window.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    panelElements.panel.style.left = `${event.clientX - startX}px`;
    panelElements.panel.style.top = `${event.clientY - startY}px`;
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
  });
}

async function applyAccentColor() {
  const stored = await chrome.storage.sync.get({ [SETTINGS_KEY]: {} });
  const accent = (stored[SETTINGS_KEY] && stored[SETTINGS_KEY].accent) || '#7F00FF';
  currentAccent = accent;
  if (shadowRoot) {
    shadowRoot.host.style.setProperty('--accent', accent);
  }
  document.documentElement.style.setProperty('--solver-accent', accent);
}

function handleStorageChange(changes, namespace) {
  if (namespace !== 'sync') return;
  if (changes[COUNT_KEY]) {
    panelElements.counter.textContent = `Odpowiedzi: ${Number(changes[COUNT_KEY].newValue || 0)}`;
  }
  if (changes[SETTINGS_KEY]) {
    applyAccentColor();
    const debugEnabled = changes[SETTINGS_KEY].newValue?.debug;
    if (!debugEnabled) {
      updateDebug(null, null);
    }
  }
  if (changes[LAST_RESPONSE_KEY]) {
    const response = changes[LAST_RESPONSE_KEY].newValue;
    if (response) {
      displayResponse(response);
    }
  }
}

async function updateCounter() {
  const response = await chrome.runtime.sendMessage({ type: 'get_counter' }).catch(() => null);
  const count = response?.count ?? 0;
  panelElements.counter.textContent = `Odpowiedzi: ${count}`;
}

async function loadLastResponse() {
  const response = await chrome.runtime.sendMessage({ type: 'get_last_response' }).catch(() => null);
  if (response?.response) {
    displayResponse(response.response);
  }
}

async function startRegionSelection() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'solver-region-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0, 0, 0, 0.55)',
      cursor: 'crosshair',
      zIndex: '2147483645'
    });
    overlay.tabIndex = -1;
    document.body.appendChild(overlay);
    overlay.focus({ preventScroll: true });

    const selectionBox = document.createElement('div');
    selectionBox.className = 'solver-region-selection';
    Object.assign(selectionBox.style, {
      position: 'fixed',
      border: `2px solid ${currentAccent}`,
      background: hexToRgba(currentAccent, 0.2),
      borderRadius: '10px',
      display: 'none',
      pointerEvents: 'none'
    });
    const tooltip = document.createElement('div');
    tooltip.className = 'solver-region-tooltip';
    Object.assign(tooltip.style, {
      position: 'fixed',
      padding: '6px 10px',
      background: 'rgba(30, 30, 40, 0.95)',
      color: '#f5f5f5',
      borderRadius: '12px',
      fontSize: '12px',
      display: 'none',
      transform: 'translate(-50%, -100%)',
      whiteSpace: 'nowrap',
      boxShadow: '0 18px 48px rgba(0, 0, 0, 0.45)',
      pointerEvents: 'none'
    });
    overlay.append(selectionBox, tooltip);

    let startX = 0;
    let startY = 0;
    let isDrawing = false;

    const cleanup = () => {
      overlay.remove();
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('mouseup', onMouseUp, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };

    const onMouseDown = (event) => {
      isDrawing = true;
      startX = event.clientX;
      startY = event.clientY;
      updateSelection(event.clientX, event.clientY);
      selectionBox.style.display = 'block';
      tooltip.style.display = 'block';
      event.preventDefault();
    };

    const onMouseMove = (event) => {
      if (!isDrawing) return;
      updateSelection(event.clientX, event.clientY);
      event.preventDefault();
    };

    const onMouseUp = (event) => {
      if (!isDrawing) {
        cleanup();
        resolve(null);
        return;
      }
      isDrawing = false;
      updateSelection(event.clientX, event.clientY);
      const rect = buildRect(startX, startY, event.clientX, event.clientY);
      cleanup();
      if (rect.width < 5 || rect.height < 5) {
        resolve(null);
      } else {
        resolve(rect);
      }
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    };

    const updateSelection = (currentX, currentY) => {
      const rect = buildRect(startX, startY, currentX, currentY);
      selectionBox.style.left = `${rect.left}px`;
      selectionBox.style.top = `${rect.top}px`;
      selectionBox.style.width = `${rect.width}px`;
      selectionBox.style.height = `${rect.height}px`;
      tooltip.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)} px`;
      tooltip.style.left = `${rect.left + rect.width / 2}px`;
      const tooltipTop = Math.max(rect.top - 32, 12);
      tooltip.style.top = `${tooltipTop}px`;
    };

    overlay.addEventListener('mousedown', onMouseDown, { once: true });
    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('keydown', onKeyDown, true);
  });
}

function buildRect(x1, y1, x2, y2) {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(x1 - x2);
  const height = Math.abs(y1 - y2);
  return { left, top, width, height };
}

async function captureVisibleTab() {
  return chrome.runtime.sendMessage({ type: 'capture_visible_tab' });
}

async function cropScreenshot(dataUrl, rect) {
  const scale = window.devicePixelRatio || 1;
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(rect.width * scale);
  canvas.height = Math.floor(rect.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    image,
    rect.left * scale,
    rect.top * scale,
    rect.width * scale,
    rect.height * scale,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return canvas.toDataURL('image/png', 1.0);
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Nie można załadować obrazu.'));
    img.src = dataUrl;
  });
}

function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function hexToRgba(hex, alpha = 1) {
  if (!hex) return `rgba(127, 0, 255, ${alpha})`;
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(sanitized.length === 3 ? sanitized.repeat(2) : sanitized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
