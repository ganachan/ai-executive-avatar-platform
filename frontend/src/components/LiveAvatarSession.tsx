"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { ChatMessage } from "@/lib/types";
import { fetchSpeechToken, fetchIceToken, sendChatMessage } from "@/lib/api";
import { Mic, MicOff, Send, PhoneOff, Loader, AlertCircle, Camera } from "lucide-react";

interface Props {
  avatarId: string;
  avatarName: string;
  voiceName: string;
  avatarCharacter: string;
  avatarStyle: string;
  avatarType?: "stock" | "photo" | "custom";
  photoUrl?: string | null;
  customized?: boolean;
  useBuiltInVoice?: boolean;
}

export default function LiveAvatarSession({ avatarId, avatarName, voiceName, avatarCharacter, avatarStyle, avatarType = "stock", photoUrl, customized = false, useBuiltInVoice = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const synthesizerRef = useRef<unknown>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const [sessionState, setSessionState] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isPhoto = avatarType === "photo";

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  const startSession = async () => {
    setSessionState("connecting");
    setError(null);
    try {
      const [{ token, region }, iceToken] = await Promise.all([fetchSpeechToken(), fetchIceToken()]);

      // Dynamic import to avoid SSR issues
      const SpeechSDK = await import("microsoft-cognitiveservices-speech-sdk");

      // "aad#resourceId#jwtToken" format is required when the Azure resource
      // has local (key) auth disabled and Entra ID auth is used.
      // fromAuthorizationToken() also accepts this format directly.
      let speechConfig: InstanceType<typeof SpeechSDK.SpeechConfig>;
      if (token.startsWith("aad#")) {
        // Entra ID path: create config from the westus2 TTS endpoint and
        // inject the full aad#...#... token as the authorization token.
        speechConfig = SpeechSDK.SpeechConfig.fromEndpoint(
          new URL(`wss://${region}.tts.speech.microsoft.com/cognitiveservices/websocket/v1`)
        );
        speechConfig.authorizationToken = token;
      } else {
        // API-key STS path: short-lived JWT returned from the STS endpoint.
        speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
      }
      speechConfig.speechSynthesisVoiceName = voiceName;

      const avatarConfig = new SpeechSDK.AvatarConfig(avatarCharacter, avatarStyle);
      // Custom trained avatars (e.g. Binaka) must set `customized: true` or the
      // Azure avatar service won't recognize the character and no video frames
      // will be rendered (WebRTC session connects but stays blank/black).
      avatarConfig.customized = customized;
      if (useBuiltInVoice) {
        avatarConfig.useBuiltInVoice = true;
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: iceToken.Urls, username: iceToken.Username, credential: iceToken.Password }],
      });

      pc.ontrack = (e) => {
        if (e.track.kind === "video" && videoRef.current) {
          videoRef.current.srcObject = e.streams[0];
        }
        if (e.track.kind === "audio" && audioRef.current) {
          audioRef.current.srcObject = e.streams[0];
        }
      };

      pc.addTransceiver("video", { direction: "sendrecv" });
      pc.addTransceiver("audio", { direction: "sendrecv" });

      const synthesizer = new SpeechSDK.AvatarSynthesizer(speechConfig, avatarConfig);
      synthesizerRef.current = synthesizer;

      await synthesizer.startAvatarAsync(pc);
      setSessionState("connected");

      // Opening greeting — also add it to conversation so it appears on the right
      const greeting = `Hello, I'm ${avatarName}. How can I help you today?`;
      setConversation([{ role: "assistant", content: greeting }]);
      await speak(synthesizer, greeting);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to start session";
      setError(msg);
      setSessionState("error");
    }
  };

  const speak = async (synthesizer: unknown, text: string) => {
    if (!synthesizer) return;
    setIsSpeaking(true);
    await new Promise<void>((resolve, reject) => {
      (synthesizer as { speakTextAsync: (t: string, ok: () => void, err: (e: unknown) => void) => void }).speakTextAsync(
        text,
        () => resolve(),
        (e: unknown) => reject(e)
      );
    });
    setIsSpeaking(false);
  };

  const handleSend = async (message: string) => {
    if (!message.trim() || !synthesizerRef.current) return;
    setTextInput("");
    setError(null);
    // Optimistically add user message immediately so it appears in the transcript
    setConversation((prev) => [...prev, { role: "user", content: message }]);
    try {
      const data = await sendChatMessage(avatarId, message, conversation);
      setConversation(data.conversation_history as ChatMessage[]);
      await speak(synthesizerRef.current, data.response);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Message failed");
      // Remove optimistic user message on failure so the user can retry
      setConversation((prev) => prev.filter((m) => !(m.role === "user" && m.content === message)));
    }
  };

  const toggleListening = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setError("Speech recognition not supported in this browser. Use Chrome or Edge.");
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      handleSend(transcript);
    };
    recognition.lang = "en-US";
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (e) => {
      setIsListening(false);
      if (e.error !== "no-speech") {
        setError(`Microphone error: ${e.error}`);
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const stopSession = async () => {
    recognitionRef.current?.stop();
    if (synthesizerRef.current) {
      await (synthesizerRef.current as { stopAvatarAsync: () => Promise<void> }).stopAvatarAsync();
      synthesizerRef.current = null;
    }
    setSessionState("idle");
    setConversation([]);
    setIsListening(false);
    setIsSpeaking(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 h-[calc(100vh-200px)] min-h-[600px]">
      {/* Avatar Video — 3 cols */}
      <div className="lg:col-span-3 bg-surface-card border border-surface-border rounded-2xl overflow-hidden relative flex flex-col">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
        <audio ref={audioRef} autoPlay hidden />

        {/* Overlay states */}
        {sessionState === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-card">
            {/* Avatar visual */}
            <div className="w-24 h-24 rounded-full overflow-hidden bg-msblue/10 border border-msblue/30 flex items-center justify-center mb-6">
              {isPhoto && photoUrl ? (
                <Image
                  src={photoUrl}
                  alt={avatarName}
                  width={96}
                  height={96}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              ) : (
                <span className="text-4xl">👤</span>
              )}
            </div>
            <h3 className="text-white font-semibold text-lg mb-1">{avatarName}</h3>
            {isPhoto && (
              <span className="flex items-center gap-1 text-amber-300 text-xs font-medium mb-2">
                <Camera size={11} /> VASA-1 Photo Avatar
              </span>
            )}
            <p className="text-gray-400 text-sm mb-8">Ready to start a live session</p>
            <button
              onClick={startSession}
              className="bg-msblue hover:bg-msblue-dark text-white px-8 py-3 rounded-xl font-semibold transition-colors"
            >
              Start Session
            </button>
          </div>
        )}

        {sessionState === "connecting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-card/90">
            <Loader size={36} className="text-msblue animate-spin mb-4" />
            <p className="text-gray-300">Connecting to Azure Avatar...</p>
          </div>
        )}

        {sessionState === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-card">
            <AlertCircle size={40} className="text-red-400 mb-4" />
            <p className="text-red-300 font-medium mb-2">Connection failed</p>
            <p className="text-gray-400 text-sm text-center max-w-xs mb-6">{error}</p>
            <button onClick={startSession} className="bg-msblue text-white px-6 py-2.5 rounded-lg">Retry</button>
          </div>
        )}

        {/* Status bar */}
        {sessionState === "connected" && (
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
            <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5">
              <span className={`w-2 h-2 rounded-full ${isSpeaking ? "bg-msblue animate-pulse" : "bg-green-400"}`} />
              <span className="text-white text-xs">{isSpeaking ? "Speaking..." : "Listening"}</span>
            </div>
            <button
              onClick={stopSession}
              className="flex items-center gap-1.5 bg-red-600/80 hover:bg-red-600 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full transition-colors"
            >
              <PhoneOff size={12} />
              End
            </button>
          </div>
        )}
      </div>

      {/* Conversation Panel — 2 cols */}
      <div className="lg:col-span-2 flex flex-col bg-surface-card border border-surface-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-border">
          <h3 className="text-white font-semibold">Conversation</h3>
          <p className="text-gray-500 text-xs mt-0.5">{avatarName}</p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {conversation.length === 0 && (
            <p className="text-gray-600 text-sm text-center mt-8">
              {sessionState === "connected" ? "Say something to start the conversation." : "Start a session to begin."}
            </p>
          )}
          {conversation.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm ${
                  msg.role === "user"
                    ? "bg-msblue text-white rounded-br-sm"
                    : "bg-surface border border-surface-border text-gray-200 rounded-bl-sm"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-4 border-t border-surface-border">
          {error && sessionState === "connected" && (
            <p className="text-red-400 text-xs mb-2">{error}</p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend(textInput)}
              disabled={sessionState !== "connected"}
              placeholder={sessionState !== "connected" ? "Start a session first..." : "Type a message..."}
              className="flex-1 bg-surface border border-surface-border text-white text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-msblue disabled:opacity-50 placeholder-gray-600"
            />
            <button
              onClick={toggleListening}
              disabled={sessionState !== "connected"}
              className={`p-2.5 rounded-lg border transition-colors disabled:opacity-50 ${
                isListening
                  ? "bg-red-600 border-red-600 text-white"
                  : "border-surface-border text-gray-400 hover:border-msblue hover:text-msblue"
              }`}
              title={isListening ? "Stop listening" : isSpeaking ? "Speak (interrupts avatar)" : "Speak"}
            >
              {isListening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button
              onClick={() => handleSend(textInput)}
              disabled={sessionState !== "connected" || !textInput.trim()}
              className="p-2.5 bg-msblue hover:bg-msblue-dark disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
