import { ALL_OUTCOMES, normalizeConfidence, normalizeOutcome } from './taxonomy.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const SYSTEM_PROMPT = `You are a manufacturing quality inspector assistant.
Classify the photographed unit into exactly one of: ${ALL_OUTCOMES.join(', ')}.
Use "No Defect" when the unit looks clean. Report confidence between 0 and 1.
Answer only with JSON.`;

// Gemini constrains its output to this schema; we still validate the result ourselves.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    predicted_defect_type: { type: 'STRING', enum: ALL_OUTCOMES },
    confidence: { type: 'NUMBER' },
  },
  required: ['predicted_defect_type', 'confidence'],
};

/** Raised when the model answered, but not with something we can trust. */
export class AiOutputError extends Error {
  constructor(message, raw = null) {
    super(message);
    this.raw = raw;
  }
}

function parseJsonLoose(text) {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text.replace(/```(?:json)?/g, '').trim());
  } catch {
    return null;
  }
}

/** Turns a raw Gemini response into a validated { predicted, confidence, raw }. */
export function extractPrediction(response) {
  const blockReason = response?.promptFeedback?.blockReason;
  if (blockReason) throw new AiOutputError(`Request was blocked by the model (${blockReason})`);

  const candidate = response?.candidates?.[0];
  const text = candidate?.content?.parts?.find((part) => typeof part.text === 'string')?.text;
  const payload = parseJsonLoose(text);

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const reason = candidate?.finishReason ? ` (finish reason: ${candidate.finishReason})` : '';
    throw new AiOutputError(`Model returned no structured output${reason}`, text ?? null);
  }
  const predicted = normalizeOutcome(payload.predicted_defect_type);
  if (!predicted) {
    throw new AiOutputError('Model returned an unsupported defect category', payload);
  }
  return { predicted, confidence: normalizeConfidence(payload.confidence), raw: payload };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createClassifier({
  apiKey,
  model,
  timeoutMs = 30000,
  maxRetries = 2,
  retryDelayMs = 1000,
  fetchImpl = fetch,
}) {
  async function callGemini(body) {
    for (let attempt = 0; ; attempt += 1) {
      let res;
      try {
        res = await fetchImpl(`${API_BASE}/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        if (attempt < maxRetries && err.name !== 'TimeoutError') {
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }
        throw new Error(err.name === 'TimeoutError' ? 'AI request timed out' : 'AI request failed');
      }
      if (res.ok) return res.json();
      if (RETRYABLE_STATUS.has(res.status) && attempt < maxRetries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      // Status only: response bodies and headers could echo request details.
      throw new Error(`Gemini request failed with status ${res.status}`);
    }
  }

  return {
    model,
    async classify({ buffer, mimeType }) {
      if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
      const response = await callGemini({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: 'user',
            parts: [
              { inline_data: { mime_type: mimeType, data: buffer.toString('base64') } },
              { text: 'Inspect this unit.' },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      });
      return extractPrediction(response);
    },
  };
}
