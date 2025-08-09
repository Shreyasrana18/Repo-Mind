export default function LandingUI({ onStartChat }) {
  const [query, setQuery] = useState("");

  const handleSend = () => {
    onStartChat(query);
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center text-white bg-gradient-to-br from-gray-900 via-gray-800 to-black relative">
      {/* Glow Background */}
      <div className="absolute inset-0 bg-gradient-radial from-purple-800/40 via-transparent to-transparent blur-3xl pointer-events-none" />

      {/* Centered Content */}
      <div className="relative z-10 text-center space-y-6">
        <h1 className="text-4xl font-bold">Introducing Repo Mind</h1>
        <p className="text-gray-400 max-w-lg mx-auto">
          Your personal code knowledge assistant — search, understand, and explore repositories instantly.
        </p>

        {/* Search Bar */}
        <div className="flex items-center w-full max-w-xl bg-gray-800/70 rounded-full border border-gray-700 px-4 py-3 mt-4 backdrop-blur-md shadow-lg">
          <input
            type="text"
            placeholder="Ask anything..."
            className="flex-1 bg-transparent outline-none text-white placeholder-gray-400"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <button
            onClick={handleSend}
            className="ml-2 bg-blue-600 hover:bg-blue-500 px-4 py-1 rounded-full transition"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
