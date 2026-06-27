import React, { useState, useEffect, useRef } from "react";
import { db, auth } from "../firebase";
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit 
} from "firebase/firestore";
import { ChatMessage } from "../types";
import { Send, MessageSquare } from "lucide-react";
import { handleFirestoreError, OperationType } from "../utils/firestoreError";

interface LobbyChatProps {
  gameId: string;
}

export default function LobbyChat({ gameId }: LobbyChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentUser = auth.currentUser;

  useEffect(() => {
    // Keep only the last 50 messages to stay lightweight and fast
    const chatRef = collection(db, "games", gameId, "chat");
    const q = query(chatRef, orderBy("createdAt", "asc"), limit(50));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: ChatMessage[] = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() } as ChatMessage);
      });
      setMessages(msgs);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `games/${gameId}/chat`);
    });

    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    // Scroll to bottom whenever messages update
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !currentUser) return;

    try {
      const chatRef = collection(db, "games", gameId, "chat");
      await addDoc(chatRef, {
        senderId: currentUser.uid,
        senderName: currentUser.displayName || "Anonymous",
        text: inputText.trim(),
        createdAt: Date.now()
      });
      setInputText("");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `games/${gameId}/chat`);
    }
  };

  return (
    <div className="flex flex-col h-full border-2 border-slate-800 bg-slate-900/40 rounded-2xl overflow-hidden shadow-xl" id="chat-widget">
      {/* Chat Header */}
      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900 px-4 py-3.5 text-slate-100 shrink-0" id="chat-header">
        <MessageSquare className="h-4.5 w-4.5 text-indigo-400" />
        <span className="text-sm font-bold tracking-wider uppercase text-slate-300">Secure Game Chat</span>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-800" id="chat-messages-container">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center p-4">
            <p className="text-xs text-slate-500 font-medium italic">
              No chat messages yet. Say hello to the table!
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === currentUser?.uid;
            return (
              <div 
                key={msg.id} 
                className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                id={`chat-msg-${msg.id}`}
              >
                <span className="text-xs font-mono text-slate-500 mb-0.5 px-1">
                  {msg.senderName}
                </span>
                <div 
                  className={`rounded-xl px-4 py-2.5 max-w-[85%] text-sm shadow-sm border ${
                    isMe 
                      ? "bg-indigo-600 text-white rounded-tr-none border-indigo-500" 
                      : "bg-slate-800 text-slate-100 rounded-tl-none border-slate-700"
                  }`}
                >
                  <p className="break-words leading-relaxed">{msg.text}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Box */}
      <form onSubmit={handleSendMessage} className="border-t border-slate-800 bg-slate-900 p-3 flex gap-2 shrink-0" id="chat-input-form">
        <input
          type="text"
          placeholder="Type a message..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
          id="chat-text-input"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
          id="chat-send-btn"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
