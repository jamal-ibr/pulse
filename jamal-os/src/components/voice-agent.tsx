"use client";

import { useEffect, useRef, useState } from "react";
import { askAssistant } from "@/app/assistant/actions";

// Minimal typings for the Web Speech API, which TypeScript's DOM lib
// does not ship. Chrome exposes webkitSpeechRecognition; Safari 14.1+
// exposes it too.
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}
interface SpeechResultEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface Message {
  role: "user" | "agent";
  text: string;
}

type AgentState = "idle" | "listening" | "thinking";

// Trailing "(Mock provider ...)" style notes are useful on screen but
// tedious to hear out loud.
function speakable(text: string): string {
  return text.replace(/\(Mock [^)]*\)\s*$/i, "").trim();
}

export function VoiceAgent() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AgentState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [speakReplies, setSpeakReplies] = useState(true);
  const [micSupported, setMicSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMicSupported(getRecognitionCtor() !== null);
    return () => {
      recognitionRef.current?.abort();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, open]);

  function speak(text: string) {
    if (!speakReplies || typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(speakable(text));
    utterance.lang = "en-GB";
    const voice = synth
      .getVoices()
      .find((v) => v.lang === "en-GB" || v.lang.startsWith("en-GB"));
    if (voice) utterance.voice = voice;
    synth.speak(utterance);
  }

  async function submit(question: string) {
    const trimmed = question.trim();
    if (!trimmed || state === "thinking") return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setState("thinking");
    try {
      const { reply } = await askAssistant(trimmed);
      setMessages((prev) => [...prev, { role: "agent", text: reply }]);
      speak(reply);
    } catch {
      const failure =
        "Something went wrong handling that. Try again, or check the server logs.";
      setMessages((prev) => [...prev, { role: "agent", text: failure }]);
    } finally {
      setState("idle");
    }
  }

  function startListening() {
    const Ctor = getRecognitionCtor();
    if (!Ctor || state !== "idle") return;
    window.speechSynthesis?.cancel();
    const recognition = new Ctor();
    recognitionRef.current = recognition;
    recognition.lang = "en-GB";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (transcript) void submit(transcript);
    };
    recognition.onerror = (event) => {
      setState("idle");
      if (event.error === "not-allowed") {
        setMessages((prev) => [
          ...prev,
          {
            role: "agent",
            text: "Microphone access is blocked. Allow it in the browser, or type instead.",
          },
        ]);
      }
    };
    recognition.onend = () => {
      setState((current) => (current === "listening" ? "idle" : current));
    };
    setState("listening");
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setState("idle");
  }

  const orbState =
    state === "listening"
      ? "border-accent text-accent shadow-[0_0_18px_2px_rgba(63,222,246,0.45)]"
      : state === "thinking"
        ? "border-accent/60 text-accent/60"
        : "border-edge text-accent hover:border-accent";

  return (
    <>
      {open && (
        <div className="fixed bottom-36 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-edge bg-panel/95 backdrop-blur md:bottom-24 md:right-6">
          <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-dim">
              Voice agent
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setSpeakReplies((v) => !v);
                  if (speakReplies) window.speechSynthesis?.cancel();
                }}
                className={`rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition ${
                  speakReplies
                    ? "text-accent"
                    : "text-ink-faint hover:text-ink-dim"
                }`}
                aria-pressed={speakReplies}
              >
                {speakReplies ? "Voice on" : "Voice off"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-ink-dim transition hover:text-ink"
                aria-label="Close voice agent"
              >
                ✕
              </button>
            </div>
          </div>

          <div
            ref={logRef}
            className="flex max-h-80 min-h-32 flex-col gap-2 overflow-y-auto px-4 py-3"
          >
            {messages.length === 0 && (
              <p className="text-xs leading-relaxed text-ink-faint">
                Ask about your day, the pipeline, habits, or what you are
                avoiding. Say &quot;add a task to ...&quot; to capture
                something.{" "}
                {micSupported
                  ? "Tap the mic and speak, or type below."
                  : "This browser has no speech recognition; type below."}
              </p>
            )}
            {messages.map((message, index) => (
              <div
                key={index}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                  message.role === "user"
                    ? "self-end bg-accent/15 text-ink"
                    : "self-start bg-bg/70 text-ink"
                }`}
              >
                {message.text}
              </div>
            ))}
            {state === "thinking" && (
              <div className="self-start rounded-lg bg-bg/70 px-3 py-2 font-mono text-xs text-ink-dim">
                Processing&hellip;
              </div>
            )}
            {state === "listening" && (
              <div className="self-start rounded-lg bg-bg/70 px-3 py-2 font-mono text-xs text-accent">
                Listening&hellip;
              </div>
            )}
          </div>

          <form
            className="flex items-center gap-2 border-t border-edge px-3 py-2.5"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(input);
            }}
          >
            {micSupported && (
              <button
                type="button"
                onClick={state === "listening" ? stopListening : startListening}
                disabled={state === "thinking"}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-50 ${
                  state === "listening"
                    ? "border-accent text-accent"
                    : "border-edge text-ink-dim hover:border-accent hover:text-accent"
                }`}
                aria-label={
                  state === "listening" ? "Stop listening" : "Start listening"
                }
              >
                {state === "listening" ? "■" : "🎙"}
              </button>
            )}
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask Jamal OS"
              className="min-w-0 flex-1 rounded-lg border border-edge bg-bg/70 px-3 py-2 text-sm text-ink placeholder:text-ink-dim focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={state === "thinking" || input.trim() === ""}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-bg transition hover:bg-accent-dim disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full border-2 bg-panel/90 backdrop-blur transition md:bottom-6 md:right-6 ${orbState}`}
        aria-label={open ? "Close voice agent" : "Open voice agent"}
      >
        <span className="relative flex h-6 w-6 items-center justify-center">
          <span
            className={`absolute inset-0 rounded-full border border-current opacity-50 ${
              state === "listening" ? "hud-dot" : ""
            }`}
          />
          <span className="h-2.5 w-2.5 rounded-full bg-current" />
        </span>
      </button>
    </>
  );
}
