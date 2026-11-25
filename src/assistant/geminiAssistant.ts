import { GoogleGenAI } from '@google/genai';
import appendixMenu from '../fixtures/appendixMenu.json';
import {
  getAverageOrderValue,
  getBestSellingOption,
  getCouponAppliedStats,
  getOrderCount,
  getOrdersByDate,
  getRevenueByPaymentMethod,
  getTotalRevenue,
} from '../engine/statsEngine';
import type { MenuFixture, StoredOrder } from '../types/order';

const menu = appendixMenu as MenuFixture;

export const FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

export const PRIMARY_MODEL = 'gemini-2.5-flash';
export const FALLBACK_MODEL = 'gemini-2.0-flash';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ParsedErrorInfo {
  status?: number;
  message: string;
  rawText: string;
}

export function parseErrorInfo(err: any): ParsedErrorInfo {
  const rawText = String(err?.message || err || '');
  let status: number | undefined = err?.status || err?.statusCode;
  let message = rawText;

  // Extract clean message and code from embedded JSON if present
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*"error"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed?.error) {
        if (!status && typeof parsed.error.code === 'number') {
          status = parsed.error.code;
        }
        if (parsed.error.message && typeof parsed.error.message === 'string') {
          message = parsed.error.message;
        }
      }
    }
  } catch {
    // Ignore JSON parsing errors
  }

  // Extract status code from patterns like [503 Service Unavailable] or [429]
  if (!status) {
    const statusMatch = rawText.match(/\[(\d{3})\b/);
    if (statusMatch) {
      status = parseInt(statusMatch[1], 10);
    }
  }

  // Clean GoogleGenerativeAI Error prefix if present
  message = message.replace(/^\[GoogleGenerativeAI Error\]:\s*/i, '').trim();

  return { status, message, rawText };
}

function isAuthError(info: ParsedErrorInfo): boolean {
  const combined = (info.rawText + ' ' + info.message).toLowerCase();
  return (
    info.status === 400 ||
    info.status === 401 ||
    info.status === 403 ||
    combined.includes('api_key_invalid') ||
    combined.includes('api key not valid') ||
    combined.includes('invalid api key') ||
    combined.includes('permission_denied')
  );
}

function isRetryableError(info: ParsedErrorInfo): boolean {
  const combined = (info.rawText + ' ' + info.message).toLowerCase();
  return (
    info.status === 503 ||
    info.status === 429 ||
    info.status === 404 ||
    combined.includes('503') ||
    combined.includes('unavailable') ||
    combined.includes('high demand') ||
    combined.includes('overloaded') ||
    combined.includes('429') ||
    combined.includes('rate limit') ||
    combined.includes('quota') ||
    combined.includes('resource_exhausted') ||
    combined.includes('404') ||
    combined.includes('not found') ||
    combined.includes('no longer available')
  );
}

export interface AssistantResponse {
  ok: boolean;
  text: string;
  toolCallsExecuted?: Array<{ name: string; args: Record<string, any>; result: any }>;
  errorType?: 'MISSING_API_KEY' | 'INVALID_API_KEY' | 'RATE_LIMIT' | 'NETWORK_ERROR' | 'UNKNOWN';
  message?: string;
}

export type AssistantRunner = (
  question: string,
  liveOrders: StoredOrder[]
) => Promise<AssistantResponse>;

let customRunner: AssistantRunner | null = null;

/**
 * Sets a custom runner for deterministic unit testing without real network calls.
 */
export function setAssistantRunner(runner: AssistantRunner | null): void {
  customRunner = runner;
}

/**
 * Function declaration definitions matching Checkpoint C2 in DECISIONS.md.
 */
export const toolDeclarations = [
  {
    functionDeclarations: [
      {
        name: 'getOrderCount',
        description: 'Returns the total number of orders placed.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'getTotalRevenue',
        description: 'Returns the total revenue collected in BDT and exact integer poisha.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'getBestSellingOption',
        description: 'Returns the best-selling menu option by total units sold across all orders.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'getRevenueByPaymentMethod',
        description: 'Returns a breakdown of revenue grouped by payment method (card, bkash, cash).',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'getAverageOrderValue',
        description: 'Returns the average order value (AOV) across all orders in BDT.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'getCouponAppliedStats',
        description: 'Returns counts and breakdown of orders where a coupon was applied vs rejected.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'getOrdersByDate',
        description: 'Returns the orders count, IDs, and revenue on a specific date (YYYY-MM-DD) in Asia/Dhaka (+06:00).',
        parameters: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'Date in YYYY-MM-DD format (Asia/Dhaka time)',
            },
          },
          required: ['date'],
        },
      },
    ],
  },
];

const SYSTEM_INSTRUCTION = `You are the Smart Order Builder Sales Assistant for restaurant staff.
CRITICAL RULES:
1. Always ground all numerical answers strictly in the data returned by tool function calls. Never calculate or invent numbers yourself.
2. If asked about customer names, customer profiles, or "Who is our best customer?", you must explicitly state that customer names or personal profiles are not recorded in the order data and therefore cannot be determined (as specified in Decision D5). Never invent customer names.
3. Keep your answers concise, direct, professional, and friendly. Answer in English, or in Bangla if the user asks in Bangla.`;

/**
 * Executes a tool function against the live orders array.
 */
export function executeTool(
  name: string,
  args: Record<string, any>,
  liveOrders: StoredOrder[]
): any {
  switch (name) {
    case 'getOrderCount':
      return getOrderCount(liveOrders);
    case 'getTotalRevenue':
      return getTotalRevenue(liveOrders);
    case 'getBestSellingOption':
      return getBestSellingOption(liveOrders, menu);
    case 'getRevenueByPaymentMethod':
      return getRevenueByPaymentMethod(liveOrders);
    case 'getAverageOrderValue':
      return getAverageOrderValue(liveOrders);
    case 'getCouponAppliedStats':
      return getCouponAppliedStats(liveOrders);
    case 'getOrdersByDate':
      return getOrdersByDate(liveOrders, String(args.date || ''));
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/**
 * Sends a staff question to the Gemini Sales Assistant with function calling.
 * Automatically loops through function calls and feeds tool outputs back to Gemini.
 */
export async function askSalesAssistant(
  question: string,
  liveOrders: StoredOrder[]
): Promise<AssistantResponse> {
  // If a mock runner is installed for testing, delegate directly
  if (customRunner) {
    return customRunner(question, liveOrders);
  }

  const apiKey = (import.meta.env.VITE_GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return {
      ok: false,
      text: '',
      errorType: 'MISSING_API_KEY',
      message:
        'Gemini API key is not configured. Please add VITE_GEMINI_API_KEY to your .env.local file.',
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    let lastError: any = null;

    // Iterate through models sequentially with fallback
    for (let modelIndex = 0; modelIndex < FALLBACK_MODELS.length; modelIndex++) {
      const currentModel = FALLBACK_MODELS[modelIndex];
      const executedToolCalls: Array<{ name: string; args: Record<string, any>; result: any }> = [];

      try {
        // First model turn with function calling
        const response = await ai.models.generateContent({
          model: currentModel,
          contents: [{ role: 'user', parts: [{ text: question }] }],
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: toolDeclarations as any,
          },
        });

        const candidate = response.candidates?.[0];
        const functionCalls = candidate?.content?.parts?.filter(
          (part: any) => part.functionCall
        );

        // If no tool was called, return the direct text response
        if (!functionCalls || functionCalls.length === 0) {
          return {
            ok: true,
            text: response.text || 'No response generated.',
            toolCallsExecuted: executedToolCalls,
          };
        }

        // Execute all tool calls against live orders
        const toolResponseParts = functionCalls.map((part: any) => {
          const call = part.functionCall;
          const result = executeTool(call.name, call.args || {}, liveOrders);
          executedToolCalls.push({
            name: call.name,
            args: call.args || {},
            result,
          });

          return {
            functionResponse: {
              name: call.name,
              response: result,
            },
          };
        });

        // Second model turn providing tool responses back with retry/fallback
        let secondTurnResponse: any = null;
        for (let turn2Index = modelIndex; turn2Index < FALLBACK_MODELS.length; turn2Index++) {
          const turn2Model = FALLBACK_MODELS[turn2Index];
          try {
            secondTurnResponse = await ai.models.generateContent({
              model: turn2Model,
              contents: [
                { role: 'user', parts: [{ text: question }] },
                candidate!.content!,
                { role: 'user', parts: toolResponseParts },
              ],
              config: {
                systemInstruction: SYSTEM_INSTRUCTION,
              },
            });
            break;
          } catch (turn2Err: any) {
            const turn2Info = parseErrorInfo(turn2Err);
            if (isAuthError(turn2Info)) {
              throw turn2Err;
            }
            if (isRetryableError(turn2Info) && turn2Index < FALLBACK_MODELS.length - 1) {
              await sleep(400);
              continue;
            }
            throw turn2Err;
          }
        }

        return {
          ok: true,
          text: secondTurnResponse?.text || 'Answer generated based on sales data.',
          toolCallsExecuted: executedToolCalls,
        };
      } catch (err: any) {
        lastError = err;
        const errInfo = parseErrorInfo(err);

        // Fail immediately on invalid API key without wasting retries
        if (isAuthError(errInfo)) {
          return {
            ok: false,
            text: '',
            errorType: 'INVALID_API_KEY',
            message: 'Invalid Gemini API key. Please check your VITE_GEMINI_API_KEY configuration.',
          };
        }

        // Fall back to next model on transient/availability errors after 400ms
        if (isRetryableError(errInfo) && modelIndex < FALLBACK_MODELS.length - 1) {
          await sleep(400);
          continue;
        }

        break;
      }
    }

    // If all models failed, format a clean user-facing error message
    const finalInfo = parseErrorInfo(lastError);
    const combined = (finalInfo.rawText + ' ' + finalInfo.message).toLowerCase();

    if (
      finalInfo.status === 503 ||
      combined.includes('503') ||
      combined.includes('unavailable') ||
      combined.includes('overloaded') ||
      combined.includes('high demand')
    ) {
      return {
        ok: false,
        text: '',
        errorType: 'NETWORK_ERROR',
        message: 'Gemini models are temporarily busy (503). Please try again in a few seconds.',
      };
    }

    if (
      finalInfo.status === 429 ||
      combined.includes('429') ||
      combined.includes('quota') ||
      combined.includes('resource_exhausted')
    ) {
      return {
        ok: false,
        text: '',
        errorType: 'RATE_LIMIT',
        message: 'Gemini API rate limit or quota exceeded (429). Please try again in a few moments.',
      };
    }

    if (
      finalInfo.status === 404 ||
      combined.includes('404') ||
      combined.includes('not found') ||
      combined.includes('no longer available')
    ) {
      return {
        ok: false,
        text: '',
        errorType: 'NETWORK_ERROR',
        message: 'The requested Gemini models are currently not available. Please try again shortly.',
      };
    }

    return {
      ok: false,
      text: '',
      errorType: 'NETWORK_ERROR',
      message: `Failed to communicate with Gemini assistant: ${finalInfo.message || finalInfo.rawText}`,
    };
  } catch (err: any) {
    const info = parseErrorInfo(err);
    return {
      ok: false,
      text: '',
      errorType: 'NETWORK_ERROR',
      message: `Failed to communicate with Gemini assistant: ${info.message || info.rawText}`,
    };
  }
}
