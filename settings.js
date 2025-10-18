const SETTINGS_KEY = 'solverSettings';
const defaultSettings = {
  apiKey: '',
  model: 'gpt-4o-mini',
  accent: '#7F00FF',
  debug: false
};

const form = document.getElementById('settings-form');
const statusEl = form.querySelector('.status');

initialize();

async function initialize() {
  const stored = await chrome.storage.sync.get({ [SETTINGS_KEY]: defaultSettings });
  const settings = { ...defaultSettings, ...stored[SETTINGS_KEY] };
  form.apiKey.value = settings.apiKey;
  form.model.value = settings.model;
  form.accent.value = settings.accent || defaultSettings.accent;
  form.debug.checked = Boolean(settings.debug);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = {
      apiKey: form.apiKey.value.trim(),
      model: form.model.value,
      accent: form.accent.value,
      debug: form.debug.checked
    };

    try {
      await chrome.storage.sync.set({ [SETTINGS_KEY]: data });
      showStatus('Zapisano ustawienia.');
    } catch (error) {
      showStatus('Nie udało się zapisać.', true);
    }
  });
}

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#ff6b6b' : 'rgba(255, 255, 255, 0.75)';
  setTimeout(() => {
    statusEl.textContent = '';
  }, 4000);
}
