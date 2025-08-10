import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { ArrowUp, Code, Sparkles, GitBranch } from "lucide-react";

// Simple Markdown renderer component
const MarkdownRenderer = ({ content }) => {
  const renderMarkdown = (text) => {
    return text
      // Headers
      .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold text-gray-800 mt-4 mb-2">$1</h3>')
      .replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold text-gray-800 mt-6 mb-3">$1</h2>')
      .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold text-gray-800 mt-6 mb-4">$1</h1>')
      
      // Bold text
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
      
      // Italic text
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      
      // Inline code
      .replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm font-mono">$1</code>')
      
      // Code blocks
      .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-gray-50 border border-gray-200 rounded-lg p-4 my-4 overflow-x-auto"><code class="text-sm font-mono text-gray-800">$2</code></pre>')
      
      // Tables
      .replace(/\|(.+)\|/g, (match, content) => {
        const cells = content.split('|').map(cell => cell.trim()).filter(cell => cell);
        const isHeader = match.includes('**') || /Method|Path|Purpose/.test(match);
        
        if (isHeader) {
          return `<tr class="bg-blue-50 border-b border-blue-200">${cells.map(cell => 
            `<th class="px-4 py-3 text-left text-sm font-semibold text-blue-900">${cell.replace(/\*\*(.*?)\*\*/g, '$1')}</th>`
          ).join('')}</tr>`;
        } else if (cells[0] && !cells[0].includes('-')) {
          return `<tr class="border-b border-gray-200 hover:bg-gray-50">${cells.map(cell => 
            `<td class="px-4 py-3 text-sm text-gray-700">${cell.replace(/\*\*(.*?)\*\*/g, '<strong class="font-medium text-gray-900">$1</strong>')}</td>`
          ).join('')}</tr>`;
        }
        return '';
      })
      
      // Wrap tables
      .replace(/(<tr[\s\S]*?<\/tr>\s*)+/g, '<div class="overflow-x-auto my-4"><table class="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm">$&</table></div>')
      
      // Lists
      .replace(/^\d+\. (.*$)/gm, '<li class="ml-4 mb-2 text-gray-700">$1</li>')
      .replace(/^- (.*$)/gm, '<li class="ml-4 mb-2 text-gray-700">$1</li>')
      .replace(/(<li[\s\S]*<\/li>)/g, '<ul class="my-3 space-y-1">$1</ul>')
      
      // Block quotes
      .replace(/^> (.*$)/gm, '<blockquote class="border-l-4 border-blue-300 pl-4 py-2 my-4 bg-blue-50 text-gray-700 italic">$1</blockquote>')
      
      // Line breaks
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  };

  return (
    <div 
      className="prose max-w-none"
      dangerouslySetInnerHTML={{ 
        __html: renderMarkdown(content) 
      }} 
    />
  );
};

export default function App() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    adjustTextareaHeight();
  }, [query]);

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
    }
  };

  const sendQuery = async () => {
    if (!query.trim() || loading) return;
    
    console.log("Sending query:", query.trim());
    
    setLoading(true);
    const userMessage = { role: "user", text: query.trim(), timestamp: Date.now() };
    const currentQuery = query.trim();
    
    setMessages((prev) => [...prev, userMessage]);
    setQuery("");

    try {
      console.log("Making API call to:", `http://localhost:5001/api/search?q=${encodeURIComponent(currentQuery)}`);
      
      const res = await axios.get(
        `http://localhost:5001/api/search?q=${encodeURIComponent(currentQuery)}`
      );
      
      console.log("API Response:", res.data);
      
      const { answer, categories } = res.data;

      const assistantMessage = {
        role: "assistant",
        text: answer,
        categories,
        timestamp: Date.now()
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error("Detailed API Error:", err);
      console.error("Error response:", err.response?.data);
      console.error("Error status:", err.response?.status);
      
      const errorMessage = {
        role: "assistant",
        text: `❌ API Error: ${err.message}. Check console for details.`,
        timestamp: Date.now()
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuery();
    }
  };

  const isEmpty = messages.length === 0 && !loading;

  const suggestedQuestions = [
    "Explain the main architecture of this codebase",
    "What are the key components and their relationships?",
    "Show me the API endpoints and their functionality",
    "How does the authentication system work?"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex flex-col relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-blue-400/20 to-purple-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-indigo-400/20 to-pink-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-white/20 px-6 py-6 sticky top-0 z-20 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl shadow-lg">
              <Code className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
                Repo Mind
              </h1>
              <p className="text-sm text-gray-500 font-medium">AI-Powered Code Intelligence</p>
            </div>
          </div>
          <div className="hidden md:flex items-center space-x-2 text-xs text-gray-500">
            <GitBranch className="w-4 h-4" />
            <span>Connected</span>
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 relative z-10">
        {/* Empty State */}
        {isEmpty && (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-center space-y-8 max-w-2xl">
              <div className="relative">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-600 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-blue-500/25">
                  <Sparkles className="w-10 h-10 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
                </div>
              </div>
              
              <div className="space-y-4">
                <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-800 via-gray-700 to-gray-600 bg-clip-text text-transparent">
                  Unlock Your Codebase
                </h2>
                <p className="text-gray-600 text-lg leading-relaxed">
                  Ask me anything about your repository. I'll analyze code structure, explain functionality, and help you understand complex systems instantly.
                </p>
              </div>

              {/* Suggested Questions */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Try asking:</p>
                <div className="grid gap-3">
                  {suggestedQuestions.map((question, i) => (
                    <button
                      key={i}
                      onClick={() => setQuery(question)}
                      className="text-left p-4 bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl hover:bg-white/80 hover:border-blue-200 transition-all duration-300 shadow-sm hover:shadow-md group"
                    >
                      <span className="text-gray-700 group-hover:text-gray-800 transition-colors">
                        {question}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        {!isEmpty && (
          <div className="flex-1 py-8 space-y-6">
            {messages.map((msg, i) => (
              <div key={i} className="flex flex-col space-y-4 animate-fadeIn">
                <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-3xl ${
                    msg.role === "user" 
                      ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/25" 
                      : "bg-white/80 backdrop-blur-sm border border-white/40 text-gray-800 shadow-lg"
                  } rounded-2xl px-6 py-4 transition-all duration-300 hover:shadow-xl`}>
                    {msg.role === "user" ? (
                      <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
                    ) : (
                      <MarkdownRenderer content={msg.text} />
                    )}
                    {msg.categories?.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {msg.categories.map((category, j) => (
                          <span
                            key={j}
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              msg.role === "user"
                                ? "bg-white/20 text-white/90"
                                : "bg-gradient-to-r from-blue-100 to-purple-100 text-blue-800 border border-blue-200/50"
                            }`}
                          >
                            {category}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start animate-fadeIn">
                <div className="bg-white/80 backdrop-blur-sm border border-white/40 rounded-2xl px-6 py-4 max-w-xs shadow-lg">
                  <div className="flex items-center space-x-3">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{animationDelay: "0.1s"}}></div>
                      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{animationDelay: "0.2s"}}></div>
                    </div>
                    <span className="text-sm text-gray-600 font-medium">Analyzing...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        )}

        {/* Input Area */}
        <div className="py-6 sticky bottom-0">
          <div className="bg-white/80 backdrop-blur-xl border border-white/30 rounded-2xl shadow-2xl shadow-gray-900/10 focus-within:border-blue-300 focus-within:shadow-2xl focus-within:shadow-blue-500/20 transition-all duration-300">
            <div className="flex items-end px-6 py-4">
              <textarea
                ref={textareaRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything about your codebase..."
                rows="1"
                disabled={loading}
                className="flex-1 resize-none bg-transparent outline-none text-gray-800 placeholder-gray-500 min-h-[28px] max-h-[200px] overflow-y-auto font-medium"
              />
              <button
                onClick={sendQuery}
                disabled={!query.trim() || loading}
                className="ml-4 p-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-blue-500/25 transform hover:scale-105 active:scale-95"
              >
                <ArrowUp className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-center mt-4 space-x-4 text-xs text-gray-500">
            <span>Press Enter to send • Shift + Enter for new line</span>
          </div>
        </div>
      </main>
    </div>
  );
}