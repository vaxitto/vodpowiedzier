import { sendCompletionRequest } from './api.js';

const SETTINGS_KEY = 'solverSettings';
const COUNT_KEY = 'answersCount';
const LAST_RESPONSE_KEY = 'lastResponse';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ [SETTINGS_KEY]: null }, (result) => {
    if (!result[SETTINGS_KEY]) {
      chrome.storage.sync.set({
        [SETTINGS_KEY]: {
          model: 'gpt-4o-mini',
          accent: '#7F00FF',
          debug: false,
          apiKey: ''
        }
      });
    }
  });
  chrome.storage.sync.get({ [COUNT_KEY]: 0 }, (result) => {
    if (typeof result[COUNT_KEY] !== 'number') {
      chrome.storage.sync.set({ [COUNT_KEY]: 0 });
    }
  });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'activate_solver') {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'activate_selection' }).catch(() => {
        // ignore errors from pages without content script
      });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'capture_visible_tab') {
    captureVisibleTab(sendResponse);
    return true;
  }

  if (message?.type === 'solve_task') {
    handleSolveRequest(message.payload)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message?.type === 'get_last_response') {
    chrome.storage.sync.get({ [LAST_RESPONSE_KEY]: null }, (result) => {
      sendResponse({ success: true, response: result[LAST_RESPONSE_KEY] });
    });
    return true;
  }

  if (message?.type === 'set_last_response') {
    chrome.storage.sync.set({ [LAST_RESPONSE_KEY]: message.payload }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message?.type === 'increment_counter') {
    chrome.storage.sync.get({ [COUNT_KEY]: 0 }, (result) => {
      const next = Number(result[COUNT_KEY] || 0) + 1;
      chrome.storage.sync.set({ [COUNT_KEY]: next }).then(() => {
        sendResponse({ success: true, count: next });
      });
    });
    return true;
  }

  if (message?.type === 'get_counter') {
    chrome.storage.sync.get({ [COUNT_KEY]: 0 }, (result) => {
      sendResponse({ success: true, count: Number(result[COUNT_KEY] || 0) });
    });
    return true;
  }

  if (message?.type === 'get_settings') {
    chrome.storage.sync.get({ [SETTINGS_KEY]: {} }, (result) => {
      sendResponse({ success: true, settings: result[SETTINGS_KEY] || {} });
    });
    return true;
  }

  if (message?.type === 'update_settings') {
    chrome.storage.sync.set({ [SETTINGS_KEY]: message.payload }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  return false;
});

async function handleSolveRequest({ text, imageDataUrl }) {
  if (!text || !text.trim()) {
    throw new Error('Brak treści zapytania.');
  }

  const stored = await chrome.storage.sync.get({ [SETTINGS_KEY]: {} });
  const mergedSettings = {
    model: 'gpt-4o-mini',
    accent: '#7F00FF',
    debug: false,
    apiKey: '',
    ...(stored[SETTINGS_KEY] || {})
  };

  if (!mergedSettings.apiKey) {
    throw new Error('Brak klucza API. Ustaw go w ustawieniach.');
  }

  const systemPrompt = 'Jesteś pomocnikiem rozwiązującym zadania. Zwracaj klarowne kroki i finalną odpowiedź.';
  const payload = {
    systemPrompt,
    userText: text,
    imageDataUrl,
    model: mergedSettings.model,
    debug: mergedSettings.debug,
    apiKey: mergedSettings.apiKey
  };

  const response = await sendCompletionRequest(payload);

  const resultPayload = {
    ...response,
    timestamp: Date.now(),
    sourceText: text
  };

  await chrome.storage.sync.set({ [LAST_RESPONSE_KEY]: resultPayload });
  await incrementCounter();

  return { success: true, data: resultPayload };
}

function captureVisibleTab(sendResponse) {
  chrome.tabs.captureVisibleTab({ format: 'png' }).then((dataUrl) => {
    sendResponse({ success: true, dataUrl });
  }).catch((error) => {
    sendResponse({ success: false, error: error.message });
  });
}

async function incrementCounter() {
  const current = await chrome.storage.sync.get({ [COUNT_KEY]: 0 });
  const next = Number(current[COUNT_KEY] || 0) + 1;
  await chrome.storage.sync.set({ [COUNT_KEY]: next });
  return next;
}
