const API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export async function sendCompletionRequest({
  apiKey,
  systemPrompt,
  userText,
  model,
  debug
}) {
  const trimmedText = (userText || '').trim();
  if (!trimmedText) {
    throw new Error('Brak danych do wysłania.');
  }

  const messages = [
    {
      role: 'system',
      content: systemPrompt
    },
    {
      role: 'user',
      content: trimmedText
    }
  ];

  const body = {
    model: model || 'gpt-4o-mini',
    messages,
    temperature: 0.2
  };

  const maskedKey = maskKey(apiKey);

  let attempts = 0;
  let lastError;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      if (debug) {
        console.info('[Solver][Debug] Sending request', {
          endpoint: API_ENDPOINT,
          model: body.model,
          maskedKey
        });
      }

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorPayload = await safeJson(response);
        const message = errorPayload?.error?.message || `Błąd API (${response.status})`;
        throw new Error(message);
      }

      const data = await response.json();
      clearTimeout(timeout);

      const choice = data.choices?.[0];
      const content = choice?.message?.content || '';

      const result = {
        message: content,
        raw: debug ? data : null,
        usage: data.usage || null
      };

      if (debug) {
        console.info('[Solver][Debug] Response received', {
          maskedKey,
          usage: data.usage,
          finishReason: choice?.finish_reason
        });
      }

      return result;
    } catch (error) {
      lastError = error;
      clearTimeout(timeout);
      if (debug) {
        console.warn('[Solver][Debug] Attempt failed', {
          attempt: attempts,
          maskedKey,
          error: error?.message || String(error)
        });
      }
      if (attempts >= maxAttempts) {
        throw error;
      }
      await wait(1000 * 2 ** (attempts - 1));
    }
  }

  throw lastError || new Error('Nieznany błąd.');
}

function maskKey(key) {
  if (!key) return '';
  if (key.length <= 8) return `${key.slice(0, 2)}***${key.slice(-2)}`;
  return `${key.slice(0, 4)}***${key.slice(-4)}`;
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}
