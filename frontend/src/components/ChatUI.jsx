import { useState, useEffect, useRef } from "react";
import axios from "axios";

export default function ChatUI({ initialQuery = "" }) {
  const [query, setQuery] = useState(initialQuery);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (initialQuery) {
      sendQuery(initialQuery);
    }
  }, [initialQuery]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendQuery = async (customQuery = query) => {
    if (!customQuery.trim()) return;
    setLoading(true);

    const userMessage = { role: "user", text: customQuery };
    setMessages((prev) => [...prev, userMessage]);
    setQuery("");

    try {
      const res = await axios.get(
        `http://localhost:5001/api/search?q=${encodeURIComponent(customQuery)}`
      );
      const { query: q, answer, categories } = res.data;

      setMessages((prev) => [
        ...prev.filter((m) => m !== userMessage),
        { role: "user", text: q, categories },
        { role: "assistant", text: answer, categories },
      ]);
    } catch (err) {
      console.error("Error fetching data:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "❌ Could not connect to the server." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="p-4 text-xl font-bold bg-gray-800 shadow-md border-b border-gray-700">
        Repo Mind
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`p-4 rounded-2xl max-w-lg shadow-md ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-100"
              }`}
            >
              <div>{msg.text}</div>
              {msg.categories?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {msg.categories.map((c, j) => (
                    <span
                      key={j}
                      className="px-2 py-1 bg-gray-600 rounded-full text-xs"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-700 p-3 rounded-2xl max-w-xs flex space-x-1">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></span>
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-300"></span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </main>

      {/* Input */}
      <footer className="p-4 bg-gray-800 border-t border-gray-700">
        <div className="flex items-center space-x-2">
          <input
            className="flex-1 p-3 rounded-lg bg-gray-700 text-white outline-none focus:ring-2 focus:ring-blue-500"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendQuery()}
            placeholder="Type your message..."
          />
          <button
            onClick={() => sendQuery()}
            className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-500 transition"
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}
