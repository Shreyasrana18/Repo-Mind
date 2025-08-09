import { useState } from "react";
import LandingUI from "./components/LandingUI";
import ChatUI from "./components/ChatUI";

export default function App() {
  const [hasStarted, setHasStarted] = useState(false);
  const [initialQuery, setInitialQuery] = useState("");

  const handleStartChat = (query) => {
    if (!query.trim()) return;
    setInitialQuery(query);
    setHasStarted(true);
  };

  return hasStarted ? (
    <ChatUI initialQuery={initialQuery} />
  ) : (
    <LandingUI onStartChat={handleStartChat} />
  );
}
