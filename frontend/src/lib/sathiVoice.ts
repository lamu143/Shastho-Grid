"use client";

/**
 * Shastho Sathi voice engine.
 *
 * Listen: the browser SpeechRecognition (Chrome/Edge: bn-BD / en-US) when present, otherwise
 *   record a short clip and send it to /api/v1/sathi/transcribe (Gemini).
 * Speak: natural Bangla/English from /api/v1/sathi/speak (Gemini TTS, cached server- and
 *   client-side), played slightly faster with pitch preserved. If the server voice is
 *   unavailable (no key, quota, offline) it falls back to a device voice in the SAME language,
 *   and never reads Bangla with an English voice.
 * Level: a live 0–1 loudness value from the mic or the speaking audio drives the orb glow via
 *   a CSS custom property, written straight to the element (no React re-render per frame).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";
import type { Locale } from "@/lib/i18n";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function recognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const PLAYBACK_RATE = 1.12;
const MAX_RECORD_MS = 9000;
const audioCache = new Map<string, string>(); // `${locale}|${sentence}` -> blob URL
const clipRequests = new Map<string, Promise<string>>(); // de-duplicate in-flight sentences

/** Language of a piece of text, from its script: any meaningful Bengali content means Bangla. */
export function textLanguage(text: string): Locale {
  const bengali = (text.match(/[\u0980-\u09FF]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return bengali > 0 && bengali >= latin * 0.25 ? "bn" : "en";
}

/** Split an answer into speakable sentences (EN . ? ! and Bangla danda ।), merging tiny ones. */
export function splitSentences(text: string): string[] {
  const parts = text.replace(/\s+/g, " ").trim().match(/[^.!?।]+[.!?।]+["')\]]*\s*|[^.!?।]+$/g) ?? [text];
  const out: string[] = [];
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    if (out.length && (out[out.length - 1].length < 40 || p.length < 18)) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out.length ? out : [text];
}

function pickDeviceVoice(locale: Locale): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const want = locale === "bn" ? ["bn-BD", "bn-IN", "bn"] : ["en-GB", "en-US", "en-IN", "en"];
  for (const tag of want) {
    const v = voices.find((x) => x.lang.toLowerCase().startsWith(tag.toLowerCase()));
    if (v) return v;
  }
  return null;
}

export function useSathiVoice(locale: Locale, levelTarget: React.RefObject<HTMLElement | null>) {
  const [state, setState] = useState<VoiceState>("idle");
  const [interim, setInterim] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const recRef = useRef<RecognitionLike | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const stopTimer = useRef<number | null>(null);
  const genRef = useRef(0); // bumps on stop/new speech so stale sentence clips never play

  const t = useCallback((en: string, bn: string) => (locale === "bn" ? bn : en), [locale]);

  /* ----------------------------------------------------------- level meter ---- */
  const levelTargetRef = useRef(levelTarget);
  useEffect(() => {
    levelTargetRef.current = levelTarget;
  }, [levelTarget]);

  const stopMeter = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    levelTargetRef.current.current?.style.setProperty("--sathi-level", "0");
  }, []);

  const meter = useCallback(
    (source: (ctx: AudioContext) => AudioNode) => {
      try {
        const ctx = ctxRef.current ?? new AudioContext();
        ctxRef.current = ctx;
        void ctx.resume();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source(ctx).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        let smooth = 0;
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += ((v - 128) / 128) ** 2;
          const rms = Math.min(1, Math.sqrt(sum / buf.length) * 4);
          smooth = smooth * 0.8 + rms * 0.2;
          levelTarget.current?.style.setProperty("--sathi-level", smooth.toFixed(3));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
        return analyser;
      } catch {
        return null; // metering is decorative; never block voice on it
      }
    },
    [levelTarget]
  );

  /* ------------------------------------------------------------------ stop ---- */
  const stopAll = useCallback(() => {
    genRef.current++;
    if (stopTimer.current) window.clearTimeout(stopTimer.current);
    recRef.current?.abort();
    recRef.current = null;
    if (mediaRef.current && mediaRef.current.state !== "inactive") mediaRef.current.stop();
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    audioRef.current?.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    stopMeter();
    setInterim("");
    setState("idle");
  }, [stopMeter]);

  useEffect(() => () => stopAll(), [stopAll]);

  /* ----------------------------------------------------------------- speak ---- */
  // Sentence streaming: speech for sentence 1 starts after ~2-3 s while the rest is
  // generated in the background, instead of waiting for the whole answer.
  const fetchClip = useCallback(
    (sentence: string, lang: Locale): Promise<string> => {
      const key = `${lang}|${sentence}`;
      const hit = audioCache.get(key);
      if (hit) return Promise.resolve(hit);
      const pending = clipRequests.get(key);
      if (pending) return pending;
      const req = fetch(`${getApiBaseUrl()}/api/v1/sathi/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sentence.slice(0, 700), locale: lang }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`speak ${res.status}`);
          const url = URL.createObjectURL(await res.blob());
          audioCache.set(key, url);
          return url;
        })
        .finally(() => clipRequests.delete(key));
      clipRequests.set(key, req);
      return req;
    },
    []
  );

  const playClip = useCallback(
    (url: string, gen: number) =>
      new Promise<void>((resolve, reject) => {
        if (gen !== genRef.current) return resolve();
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.playbackRate = PLAYBACK_RATE;
        (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
        stopMeter();
        meter((ctx) => {
          const node = ctx.createMediaElementSource(audio);
          node.connect(ctx.destination);
          return node;
        });
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("playback failed"));
        audio.onpause = () => audio.ended || resolve();
        audio.play().catch(reject);
      }),
    [meter, stopMeter]
  );

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      const gen = ++genRef.current;
      audioRef.current?.pause();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      setNotice(null);
      setState("thinking");
      // The voice follows the language of the words themselves, so Bangla text is always
      // spoken by the Bangla voice and English text by the English one.
      const lang = textLanguage(text);
      const sentences = splitSentences(text);
      try {
        let next = fetchClip(sentences[0], lang);
        for (let i = 0; i < sentences.length; i++) {
          const url = await next;
          if (gen !== genRef.current) return; // stopped or superseded
          if (i + 1 < sentences.length) next = fetchClip(sentences[i + 1], lang); // prefetch while speaking
          setState("speaking");
          await playClip(url, gen);
          if (gen !== genRef.current) return;
        }
        stopMeter();
        setState("idle");
        return;
      } catch {
        if (gen !== genRef.current) return;
        // fall through to the device voice
      }
      const voice = pickDeviceVoice(lang);
      if (!voice) {
        stopMeter();
        setState("idle");
        setNotice(
          t(
            "Spoken answers are unavailable right now; the answer is shown as text.",
            "এই মুহূর্তে কণ্ঠে উত্তর দেওয়া যাচ্ছে না; উত্তর লেখায় দেখানো হলো।"
          )
        );
        return;
      }
      const utter = new SpeechSynthesisUtterance(text);
      utter.voice = voice;
      utter.lang = voice.lang;
      utter.rate = 1;
      utter.onend = () => setState("idle");
      utter.onerror = () => setState("idle");
      setState("speaking");
      window.speechSynthesis.speak(utter);
    },
    [fetchClip, playClip, stopMeter, t]
  );

  /* ---------------------------------------------------------------- listen ---- */
  const listen = useCallback(
    async (onFinal: (text: string) => void) => {
      stopAll();
      setNotice(null);
      const Ctor = recognitionCtor();
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        meter((ctx) => ctx.createMediaStreamSource(stream as MediaStream));
      } catch {
        setNotice(t("Microphone permission is needed for voice mode.", "ভয়েস মোডের জন্য মাইক্রোফোনের অনুমতি দিন।"));
        return;
      }

      if (Ctor) {
        const rec = new Ctor();
        rec.lang = locale === "bn" ? "bn-BD" : "en-US";
        rec.interimResults = true;
        rec.continuous = false;
        rec.maxAlternatives = 1;
        let finalText = "";
        rec.onresult = (e) => {
          let live = "";
          for (let i = 0; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) finalText += r[0].transcript;
            else live += r[0].transcript;
          }
          setInterim(finalText + live);
        };
        rec.onerror = (e) => {
          if (e.error === "not-allowed") setNotice(t("Microphone permission was denied.", "মাইক্রোফোনের অনুমতি দেওয়া হয়নি।"));
          else if (e.error !== "aborted" && e.error !== "no-speech") setNotice(t("Couldn't hear that. Try again.", "শোনা যায়নি, আবার চেষ্টা করুন।"));
        };
        rec.onend = () => {
          if (stopTimer.current) window.clearTimeout(stopTimer.current);
          streamRef.current?.getTracks().forEach((tr) => tr.stop());
          streamRef.current = null;
          stopMeter();
          recRef.current = null;
          const text = finalText.trim();
          setInterim("");
          setState("idle");
          if (text) onFinal(text);
          else
            setNotice(
              (prev) =>
                prev ??
                t("I couldn't hear a question. Tap the orb and try again.", "কোনো প্রশ্ন শোনা যায়নি। অর্বে চেপে আবার চেষ্টা করুন।")
            );
        };
        recRef.current = rec;
        setState("listening");
        rec.start();
        // Safety stop: if the speech service goes quiet (network, service hiccup), finish
        // after MAX_RECORD_MS with whatever was heard instead of listening forever.
        stopTimer.current = window.setTimeout(() => {
          if (recRef.current === rec) {
            if (!finalText.trim()) {
              setNotice(t("I couldn't hear a question. Tap the orb and try again.", "কোনো প্রশ্ন শোনা যায়নি। অর্বে চেপে আবার চেষ্টা করুন।"));
            }
            rec.stop();
          }
        }, MAX_RECORD_MS);
        return;
      }

      // No browser recogniser (e.g. Firefox): record a short clip and transcribe on the server.
      const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream?.getTracks().forEach((tr) => tr.stop());
        stopMeter();
        setState("thinking");
        try {
          const blob = new Blob(chunks, { type: (rec.mimeType || "audio/webm").split(";")[0] });
          const form = new FormData();
          form.append("audio", blob, "question.webm");
          const res = await fetch(`${getApiBaseUrl()}/api/v1/sathi/transcribe?locale=${locale}`, { method: "POST", body: form });
          if (!res.ok) throw new Error(String(res.status));
          const { text } = (await res.json()) as { text: string };
          setState("idle");
          if (text) onFinal(text);
        } catch {
          setState("idle");
          setNotice(t("Voice recognition is unavailable; please type your question.", "কণ্ঠ চেনা যাচ্ছে না; প্রশ্নটি লিখে পাঠান।"));
        }
      };
      mediaRef.current = rec;
      setState("listening");
      rec.start();
      stopTimer.current = window.setTimeout(() => rec.state !== "inactive" && rec.stop(), MAX_RECORD_MS);
    },
    [locale, meter, stopAll, stopMeter, t]
  );

  /** End listening early (second tap) and use what was heard. */
  const finishListening = useCallback(() => {
    if (recRef.current) recRef.current.stop();
    else if (mediaRef.current && mediaRef.current.state !== "inactive") mediaRef.current.stop();
  }, []);

  return { state, interim, notice, listen, finishListening, speak, stop: stopAll };
}
