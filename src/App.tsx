import { ChatShell } from "./components/ChatShell";
import { useChat } from "./features/chat/useChat";

export default function App() {
  const chat = useChat();
  return (
    <ChatShell
      state={chat.state}
      activeConversation={chat.activeConversation}
      isReady={chat.isReady}
      onSend={chat.sendMessage}
      onSelectConversation={chat.selectConversation}
      onCreateConversation={chat.createConversation}
      onDeleteConversation={chat.deleteConversation}
      onStop={chat.stopGeneration}
      onRetry={chat.retryLastMessage}
    />
  );
}
