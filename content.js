const SETTINGS_KEY = 'solverSettings';
const COUNT_KEY = 'answersCount';
const LAST_RESPONSE_KEY = 'lastResponse';

let shadowRoot;
let panelElements = {};
let panelState = {
  docked: true,
  dragOffset: { x: 0, y: 0 }
};
let currentAccent = '#7F00FF';

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'solve_clipboard') {
    ensureUI();
    handleClipboardSolve();
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
        <div class="solver-message" data-placeholder="Brak odpowiedzi. Użyj Ctrl+I, aby rozwiązać tekst ze schowka."></div>
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

async function handleClipboardSolve() {
  ensureUI();
  showStatus('Pobieranie treści ze schowka...', false);
  if (!navigator.clipboard?.readText) {
    displayError('API schowka jest niedostępne w tej karcie.');
    return;
  }
  try {
    const text = await navigator.clipboard.readText();
    const trimmed = text.trim();
    if (!trimmed) {
      displayError('Schowek nie zawiera tekstu do rozwiązania.');
      return;
    }
    await processTask({ text: trimmed });
  } catch (error) {
    console.warn('[Solver] Clipboard read failed', error);
    displayError('Nie udało się odczytać schowka. Upewnij się, że przyznano uprawnienia.');
  }
}

async function processTask({ text }) {
  showStatus('Wysyłanie zapytania...', false);
  panelElements.panel.setAttribute('data-loading', 'true');
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'solve_task',
      payload: { text }
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

function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleString();
}
