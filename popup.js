const responseEl = document.querySelector('.popup-response');
const usageEl = document.querySelector('.popup-usage');
const debugEl = document.querySelector('.popup-debug');
const debugPre = debugEl.querySelector('pre');
const counterEl = document.querySelector('.popup-counter');
const rootEl = document.documentElement;

init();

async function init() {
  await refreshData();
  document.getElementById('copy-response').addEventListener('click', copyResponse);
  document.getElementById('open-settings').addEventListener('click', openSettings);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.answersCount) {
      updateCounter(Number(changes.answersCount.newValue || 0));
    }
    if (changes.lastResponse) {
      applyResponse(changes.lastResponse.newValue || null);
    }
    if (changes.solverSettings) {
      applyAccent(changes.solverSettings.newValue?.accent || '#7F00FF');
    }
  });
}

async function refreshData() {
  try {
    const [{ count }, lastResponse, settingsResponse] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'get_counter' }),
      chrome.runtime.sendMessage({ type: 'get_last_response' }),
      chrome.runtime.sendMessage({ type: 'get_settings' })
    ]);
    updateCounter(Number(count || 0));
    applyResponse(lastResponse?.response || null);
    applyAccent(settingsResponse?.settings?.accent || '#7F00FF');
  } catch (error) {
    responseEl.textContent = 'Nie udało się pobrać danych.';
  }
}

function applyResponse(data) {
  if (!data?.message) {
    responseEl.textContent = '';
    responseEl.classList.remove('has-content');
    usageEl.hidden = true;
    debugEl.hidden = true;
    debugPre.textContent = '';
    return;
  }
  responseEl.textContent = data.message;
  responseEl.classList.add('has-content');
  if (data.usage) {
    usageEl.hidden = false;
    usageEl.textContent = `Zużycie: prompt ${data.usage.prompt_tokens || 0}, odpowiedź ${data.usage.completion_tokens || 0}, łącznie ${data.usage.total_tokens || 0}.`;
  } else {
    usageEl.hidden = true;
    usageEl.textContent = '';
  }
  if (data.raw) {
    debugEl.hidden = false;
    debugPre.textContent = JSON.stringify(data.raw, null, 2);
  } else {
    debugEl.hidden = true;
    debugPre.textContent = '';
  }
}

function updateCounter(count) {
  counterEl.dataset.count = count;
  counterEl.textContent = `Odpowiedzi: ${count}`;
}

function applyAccent(accent) {
  if (!accent) return;
  rootEl.style.setProperty('--accent', accent);
  document.body.style.setProperty('--accent', accent);
  counterEl.style.background = `color-mix(in srgb, ${accent} 35%, transparent)`;
}

function copyResponse() {
  const text = responseEl.textContent.trim();
  if (!text) {
    return;
  }
  navigator.clipboard.writeText(text).catch(() => {
    console.warn('Nie udało się skopiować odpowiedzi.');
  });
}

function openSettings() {
  chrome.runtime.openOptionsPage();
}
