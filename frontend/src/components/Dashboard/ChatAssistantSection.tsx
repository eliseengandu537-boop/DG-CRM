'use client';

import React, { useCallback, useState } from 'react';
import { FiArrowUpRight, FiMic, FiMicOff } from 'react-icons/fi';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

/**
 * ChatAssistantSection Component
 * AI chat interface for dashboard queries
 */

interface ChatMessage {
  sender: 'user' | 'bot';
  text: string;
  time: string;
}

interface ChatAssistantProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
}

export const ChatAssistantSection: React.FC<ChatAssistantProps> = ({
  messages,
  onSendMessage,
  isLoading = false,
}) => {
  const [input, setInput] = useState('');
  const handleTranscript = useCallback((text: string) => {
    setInput(text);
  }, []);
  const {
    isSupported: isVoiceSupported,
    isListening: isVoiceListening,
    start: startVoice,
    stop: stopVoice,
  } = useSpeechRecognition(handleTranscript);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    onSendMessage(input);
    setInput('');
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm flex flex-col min-h-[360px]">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-stone-900">Mr Leo Chat</h3>
          <p className="text-xs text-stone-500">AI Assistant - Full System Knowledge</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative flex shrink-0 justify-center sm:block">
          <img src="/dogchat.png" alt="DG-CRM Assistant" className="h-40 w-40 object-contain" />
        </div>
        <div className="flex-1">
          <div className="max-h-48 space-y-3 overflow-y-auto pr-2">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`w-full max-w-[360px] text-sm ${
                  msg.sender === 'user'
                    ? 'ml-auto rounded-2xl bg-blue-600 px-4 py-3 text-white shadow-md'
                    : 'mr-auto rounded-2xl border border-stone-200 bg-white p-4 text-stone-700 shadow-md'
                }`}
              >
                <p className="leading-relaxed">{msg.text}</p>
                <p
                  className={`mt-2 text-[11px] ${
                    msg.sender === 'user' ? 'text-blue-100' : 'text-stone-400'
                  }`}
                >
                  {msg.time}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-auto flex flex-wrap items-center justify-end gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about your CRM system..."
          className="w-full max-w-[360px] rounded-2xl border border-stone-200 bg-white px-4 py-2 text-xs text-stone-600 shadow-md outline-none focus:border-blue-300"
          disabled={isLoading}
        />
        <button
          onClick={() => (isVoiceListening ? stopVoice() : startVoice())}
          className={`flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 text-stone-500 shadow-md transition hover:bg-stone-50 ${
            !isVoiceSupported ? 'cursor-not-allowed opacity-50' : ''
          }`}
          title={isVoiceSupported ? 'Voice input' : 'Voice input not supported'}
          type="button"
          disabled={!isVoiceSupported}
        >
          {isVoiceListening ? <FiMicOff /> : <FiMic />}
        </button>
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          <FiArrowUpRight size={18} />
        </button>
      </form>
    </div>
  );
};
