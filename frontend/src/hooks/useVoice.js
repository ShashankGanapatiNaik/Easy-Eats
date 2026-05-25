// src/hooks/useVoice.js
// Web Speech API wrapper — speech recognition + speech synthesis

import { useState, useRef, useCallback } from "react";

const synth = window.speechSynthesis;

// ── Speech-to-Text ────────────────────────────────────────────────────────────
export function useSpeechToText({ onResult, onEnd }) {
  const [listening, setListening] = useState(false);
  const [error,     setError]     = useState(null);
  const recogRef = useRef(null);

  const start = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("Voice not supported in this browser. Use Chrome.");
      return;
    }

    const recog = new SpeechRecognition();
    recog.lang           = "en-IN";   // Indian English
    recog.continuous     = false;
    recog.interimResults = false;
    recog.maxAlternatives= 1;

    recog.onstart  = () => { setListening(true); setError(null); };
    recog.onend    = () => { setListening(false); onEnd?.(); };
    recog.onerror  = (e) => {
      setListening(false);
      if (e.error !== "no-speech") setError(`Mic error: ${e.error}`);
    };
    recog.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      onResult?.(transcript);
    };

    recogRef.current = recog;
    recog.start();
  }, [onResult, onEnd]);

  const stop = useCallback(() => {
    recogRef.current?.stop();
    setListening(false);
  }, []);

  return { listening, error, start, stop };
}

// ── Text-to-Speech ────────────────────────────────────────────────────────────
export function useTextToSpeech() {
  const [speaking, setSpeaking] = useState(false);

  const speak = useCallback((text) => {
    if (!synth) return;
    synth.cancel(); // stop any current speech

    const utterance       = new SpeechSynthesisUtterance(text);
    utterance.lang        = "en-IN";
    utterance.rate        = 1.05;
    utterance.pitch       = 1.0;
    utterance.volume      = 1.0;

    // Prefer a female Indian English voice if available
    const voices = synth.getVoices();
    const preferred = voices.find(
      (v) => v.lang === "en-IN" || v.name.toLowerCase().includes("india")
    );
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setSpeaking(true);
    utterance.onend   = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    synth.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    synth?.cancel();
    setSpeaking(false);
  }, []);

  return { speaking, speak, stopSpeaking };
}