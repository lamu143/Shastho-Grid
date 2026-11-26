import type { Locale } from "@/lib/i18n";

export const ASSISTANT_QUICK_ASKS: Record<Locale, string[]> = {
  en: [
    "How does CareMatch choose a hospital?",
    "What does NEWS2 tell me?",
    "Can I use this without internet?",
  ],
  bn: [
    "CareMatch কীভাবে হাসপাতাল বেছে নেয়?",
    "NEWS2 কী জানায়?",
    "ইন্টারনেট ছাড়া কি ব্যবহার করা যায়?",
  ],
};

export function answerAssistantGuide(question: string, locale: Locale) {
  const q = question.toLowerCase();
  if (q.includes("news2") || q.includes("score") || q.includes("স্কোর")) {
    return locale === "bn"
      ? "PulseScore দেওয়া ভাইটাল থেকে NEWS2 হিসাব করে তীব্রতা ও সতর্ক সংকেত দেখায়। পর্যবেক্ষণগুলো যাচাই করুন এবং ক্লিনিক্যাল সিদ্ধান্ত নিন।"
      : "PulseScore calculates NEWS2 from the vital signs you enter and highlights acuity and red flags. Confirm the observations and use your clinical judgement.";
  }
  if (q.includes("offline") || q.includes("internet") || q.includes("ইন্টারনেট") || q.includes("অফলাইন")) {
    return locale === "bn"
      ? "ShasthoGrid নির্বাচিত কাজ অফলাইনে সংরক্ষণ করে। Copilot-এর সলভার ও লাইভ হাসপাতালের তথ্যের জন্য সংযোগ দরকার; সংযোগ ফিরলে অপেক্ষমাণ পরিবর্তন সিঙ্ক হয়।"
      : "ShasthoGrid caches selected workflows for offline use. Solver-backed Copilot and live facility availability need a connection; queued changes sync when service returns.";
  }
  if (q.includes("carematch") || q.includes("hospital") || q.includes("হাসপাতাল")) {
    return locale === "bn"
      ? "CareMatch চাহিদার আইসিইউ, ভেন্টিলেটর, বিশেষজ্ঞ সেবা, সামঞ্জস্যপূর্ণ রক্ত ও যাত্রাসময় বর্তমান হাসপাতাল-সম্পদের সাথে মেলায়। সম্ভব না হলে ConflictProof কারণ ও যাচাইকৃত বিকল্প দেখায়।"
      : "CareMatch checks the requested ICU, ventilator, specialty, compatible blood and travel time against current facility resources. If no match is feasible, ConflictProof explains the constraints and lists verified options.";
  }
  return locale === "bn"
    ? "আমি CareMatch, PulseScore ও অফলাইন ব্যবহার ব্যাখ্যা করতে পারি। কেস মূল্যায়নে Case agent বেছে নিন। আমি রোগ নির্ণয় বা চিকিৎসকের বিকল্প নই।"
    : "I can explain CareMatch, PulseScore and offline behavior. For a case assessment, switch to Case agent. I can’t diagnose or replace a clinician.";
}
