import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `You are EatsBot, a friendly AI assistant for Easy Eats — a campus food ordering app.
You help students:
- Find food stalls and recommend dishes based on their mood/hunger
- Explain menu items, ingredients, and dietary info (veg/non-veg)
- Suggest combos and deals
- Answer questions about pickup times, stall locations, and operating hours
- Help with order issues

Keep responses short (2-3 sentences max), warm, and campus-friendly.
Use food emojis occasionally. Never make up prices or stall details you don't know.`;

export default function ChatBot() {
  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hey! 👋 I'm EatsBot. What are you craving today?" }
  ]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: "user", content: text };
    const next    = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model:      "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system:     SYSTEM_PROMPT,
          messages:   next.map(({ role, content }) => ({ role, content })),
        }),
      });

      const data    = await response.json();
      const reply   = data.content?.find((b) => b.type === "text")?.text || "Sorry, I couldn't process that. Try again!";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Oops! Something went wrong. Please try again. 😅" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-20 right-4 z-50 w-14 h-14 bg-zinc-900 text-white rounded-full shadow-2xl shadow-zinc-900/30 flex items-center justify-center hover:bg-zinc-800 active:scale-95 transition-all"
        aria-label="Open EatsBot"
      >
        {open ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <span className="text-xl">🤖</span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-36 right-4 z-50 w-80 md:w-96 bg-white rounded-3xl shadow-2xl shadow-black/20 border border-gray-100 flex flex-col overflow-hidden"
          style={{ maxHeight: "60vh" }}
        >
          {/* Header */}
          <div className="bg-zinc-900 px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="w-8 h-8 bg-lime-500 rounded-full flex items-center justify-center text-zinc-900 font-black text-sm">
              🤖
            </div>
            <div>
              <p className="text-white font-bold text-sm">EatsBot</p>
              <p className="text-zinc-400 text-xs">AI food assistant</p>
            </div>
            <div className="ml-auto w-2 h-2 bg-lime-500 rounded-full animate-pulse" />
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-zinc-50">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-zinc-900 text-white rounded-br-sm"
                      : "bg-white text-zinc-800 border border-gray-100 shadow-sm rounded-bl-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 shadow-sm px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1.5 items-center">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-gray-100 bg-white flex gap-2 flex-shrink-0">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask me anything about food…"
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500 transition-all"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="w-10 h-10 bg-lime-500 hover:bg-lime-600 disabled:opacity-40 text-zinc-900 rounded-xl flex items-center justify-center transition-all active:scale-95 flex-shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
