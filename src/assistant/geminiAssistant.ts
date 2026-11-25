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
    const executedToolCalls: Array<{ name: string; args: Record<string, any>; result: any }> = [];

    // First model turn with function calling enabled
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
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

    // Second model turn providing tool responses back
    const secondTurnResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: question }] },
        candidate!.content!,
        { role: 'user', parts: toolResponseParts },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });

    return {
      ok: true,
      text: secondTurnResponse.text || 'Answer generated based on sales data.',
      toolCallsExecuted: executedToolCalls,
    };
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    const status = err?.status || err?.statusCode;

    if (
      status === 429 ||
      msg.includes('429') ||
      msg.toLowerCase().includes('quota') ||
      msg.includes('RESOURCE_EXHAUSTED')
    ) {
      return {
        ok: false,
        text: '',
        errorType: 'RATE_LIMIT',
        message: 'Gemini API rate limit or quota exceeded (429). Please try again in a few moments.',
      };
    }

    if (
      status === 400 ||
      status === 401 ||
      status === 403 ||
      msg.toLowerCase().includes('api key')
    ) {
      return {
        ok: false,
        text: '',
        errorType: 'INVALID_API_KEY',
        message: 'Invalid Gemini API key. Please check your VITE_GEMINI_API_KEY configuration.',
      };
    }

    return {
      ok: false,
      text: '',
      errorType: 'NETWORK_ERROR',
      message: `Failed to communicate with Gemini assistant: ${msg}`,
    };
  }
}
