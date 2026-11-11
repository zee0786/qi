import Anthropic from '@anthropic-ai/sdk';
import { ALL_OUTCOMES, normalizeConfidence, normalizeOutcome } from './taxonomy.js';

const TOOL_NAME = 'report_defect';

const TOOL = {
  name: TOOL_NAME,
  description: 'Report the single most visible manufacturing defect in the photographed unit.',
  input_schema: {
    type: 'object',
    properties: {
      predicted_defect_type: { type: 'string', enum: ALL_OUTCOMES },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['predicted_defect_type', 'confidence'],
  },
};

const SYSTEM_PROMPT = `You are a manufacturing quality inspector assistant.
Classify the photographed unit into exactly one of: ${ALL_OUTCOMES.join(', ')}.
Use "No Defect" when the unit looks clean. Report confidence between 0 and 1.
Always answer by calling the ${TOOL_NAME} tool.`;

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

/** Turns a raw model response into a validated { predicted, confidence, raw }. */
export function extractPrediction(response) {
  const blocks = Array.isArray(response?.content) ? response.content : [];
  const toolBlock = blocks.find((b) => b.type === 'tool_use' && b.name === TOOL_NAME);
  const textBlock = blocks.find((b) => b.type === 'text');
  const payload = toolBlock?.input ?? parseJsonLoose(textBlock?.text);

  if (!payload || typeof payload !== 'object') {
    throw new AiOutputError('Model returned no structured output', textBlock?.text ?? null);
  }
  const predicted = normalizeOutcome(payload.predicted_defect_type);
  if (!predicted) {
    throw new AiOutputError('Model returned an unsupported defect category', payload);
  }
  return { predicted, confidence: normalizeConfidence(payload.confidence), raw: payload };
}

export function createClassifier({ apiKey, model, timeoutMs = 30000, client }) {
  const sdk =
    client ?? (apiKey ? new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 2 }) : null);
  return {
    model,
    async classify({ buffer, mimeType }) {
      if (!sdk) throw new Error('ANTHROPIC_API_KEY is not configured');
      const response = await sdk.messages.create({
        model,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mimeType, data: buffer.toString('base64') },
              },
              { type: 'text', text: 'Inspect this unit.' },
            ],
          },
        ],
      });
      return extractPrediction(response);
    },
  };
}
