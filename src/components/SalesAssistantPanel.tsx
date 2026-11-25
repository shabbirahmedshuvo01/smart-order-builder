import React, { useState } from 'react';
import { askSalesAssistant } from '../assistant/geminiAssistant';
import type { StoredOrder } from '../types/order';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  error?: boolean;
}

interface SalesAssistantPanelProps {
  liveOrders: StoredOrder[];
}

const SAMPLE_QUESTIONS = [
  'How many orders?',
  'What is the total revenue?',
  'What is the best-selling option?',
  'Revenue by payment method',
  'What is the average order value?',
  'How many orders got the coupon?',
  'How many orders on 2026-11-22?',
  'Who is our best customer?',
];

export const SalesAssistantPanel: React.FC<SalesAssistantPanelProps> = ({ liveOrders }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: 'Hello! I am your Sales Assistant. Ask me anything about order volumes, revenues, top items, or promo statistics.',
    },
  ]);
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSend = async (questionText: string) => {
    const q = questionText.trim();
    if (!q || isLoading) return;

    setErrorMessage(null);
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await askSalesAssistant(q, liveOrders);
      if (!res.ok) {
        setErrorMessage(res.message || 'An error occurred while answering your question.');
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: res.message || 'Sorry, I encountered an issue processing your request.',
            error: true,
          },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', text: res.text }]);
      }
    } catch (err: any) {
      const msg = err?.message || 'Unexpected communication failure.';
      setErrorMessage(msg);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: msg, error: true },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 flex flex-col h-[650px]">
      {/* Header */}
      <div className="border-b pb-3 mb-3">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <span>AI Sales Assistant</span>
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">
            Gemini Flash
          </span>
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Answers grounded strictly in live sales data ({liveOrders.length} orders loaded).
        </p>
      </div>

      {/* Sample Question Chips */}
      <div className="mb-3">
        <div className="text-xs font-semibold text-slate-600 mb-1.5">Quick Questions:</div>
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
          {SAMPLE_QUESTIONS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => handleSend(chip)}
              disabled={isLoading}
              className="text-[11px] px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full border border-slate-200 transition-colors disabled:opacity-50"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Error Alert Banner */}
      {errorMessage && (
        <div role="alert" className="mb-3 p-2.5 bg-red-50 border border-red-300 text-red-700 text-xs rounded-lg flex justify-between items-center">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-[10px] text-red-600 underline font-semibold ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${
              m.role === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-[85%] p-2.5 rounded-lg leading-relaxed ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-none'
                  : m.error
                  ? 'bg-red-100 text-red-900 border border-red-200 rounded-bl-none'
                  : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none shadow-sm'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce"></span>
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce [animation-delay:0.2s]"></span>
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce [animation-delay:0.4s]"></span>
            <span className="ml-1 text-slate-500 text-[11px]">Querying sales data...</span>
          </div>
        )}
      </div>

      {/* Input Field */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend(input);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about sales, items, or promos..."
          disabled={isLoading}
          className="flex-1 px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
};
