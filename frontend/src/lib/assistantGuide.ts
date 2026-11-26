import type { Locale } from "@/lib/i18n";

/*
 * Shastho Sathi knowledge base.
 *
 * Answers are written to be read on screen AND spoken by text-to-speech: plain sentences,
 * no markdown or symbols, 2–4 sentences each. Facts come from the code and must stay in sync:
 * hold TTL (core/config.py HOLD_TTL_SECONDS=600), staleness (CAPACITY_STALE_MINUTES=360),
 * NEWS2 bands (services/news2.py), RBC donors (services/blood_compat.py). Sathi describes the
 * tools; it never gives clinical advice and never handles patient-identifying data.
 */

type Bi = Record<Locale, string>;

interface Intent {
  id: string;
  title: Bi;
  /** Lower-case match terms: English, Bangla and romanized Banglish. Multi-word terms weigh more. */
  keywords: string[];
  answer: Bi;
  href?: string;
  linkLabel?: Bi;
  followUps: Record<Locale, string[]>;
}

export interface SathiAnswer {
  id: string;
  text: string;
  href?: string;
  linkLabel?: string;
  followUps: string[];
}

const b = (en: string, bn: string): Bi => ({ en, bn });

const INTENTS: Intent[] = [
  {
    id: "greeting",
    title: b("Hello", "শুভেচ্ছা"),
    keywords: ["hello", "hi", "hey", "salam", "assalamu", "assalamualaikum", "good morning", "হ্যালো", "হাই", "সালাম", "আসসালামু", "নমস্কার", "kemon acho", "কেমন আছেন", "কেমন আছো"],
    answer: b(
      "Hello, I am Shastho Sathi, your guide to ShasthoGrid. I can explain antibiotic choice with RxSolve, hospital matching with CareMatch, bed holds, blood stock and offline use. For a real patient assessment, switch to the Case agent.",
      "আসসালামু আলাইকুম, আমি স্বাস্থ্য সাথী, ShasthoGrid-এর গাইড। RxSolve দিয়ে অ্যান্টিবায়োটিক বাছাই, CareMatch দিয়ে হাসপাতাল খোঁজা, বেড হোল্ড, রক্তের মজুত আর অফলাইন ব্যবহার বুঝিয়ে বলতে পারি। রোগীর মূল্যায়নের জন্য Case agent বেছে নিন।"
    ),
    followUps: {
      en: ["What is ShasthoGrid?", "How does CareMatch choose a hospital?"],
      bn: ["ShasthoGrid কী?", "CareMatch কীভাবে হাসপাতাল বেছে নেয়?"],
    },
  },
  {
    id: "about",
    title: b("What is ShasthoGrid", "ShasthoGrid কী"),
    keywords: ["what is shasthogrid", "shasthogrid", "about", "what can you do", "what does this app", "overview", "স্বাস্থ্যগ্রিড", "এটা কী", "এই অ্যাপ", "কী কাজ", "কী কী পারো", "ki kaj", "app ta ki", "shasthogrid ki"],
    answer: b(
      "ShasthoGrid is a decision support platform for Bangladesh's frontline care. At clinics it picks the safest WHO AWaRe antibiotic from stock on the shelf, even offline. In emergencies it matches a critical patient to a staffed ICU bed and compatible blood, then books them together so the last bed is never given twice. Clinicians always make the final decision.",
      "ShasthoGrid বাংলাদেশের মাঠপর্যায়ের চিকিৎসার জন্য একটি সিদ্ধান্ত-সহায়ক প্ল্যাটফর্ম। ক্লিনিকে এটি মজুতে থাকা ওষুধ থেকে সবচেয়ে নিরাপদ WHO AWaRe অ্যান্টিবায়োটিক বাছাই করে, অফলাইনেও। জরুরি অবস্থায় গুরুতর রোগীকে স্টাফসহ আইসিইউ বেড আর মানানসই রক্তের সাথে মেলায় এবং একসাথে বুক করে, তাই শেষ বেড কখনো দুবার দেওয়া হয় না। চূড়ান্ত সিদ্ধান্ত সবসময় চিকিৎসকের।"
    ),
    followUps: {
      en: ["How does RxSolve pick an antibiotic?", "What is LockStep?"],
      bn: ["RxSolve কীভাবে অ্যান্টিবায়োটিক বাছে?", "LockStep কী?"],
    },
  },
  {
    id: "rxsolve",
    title: b("RxSolve antibiotics", "RxSolve অ্যান্টিবায়োটিক"),
    keywords: ["rxsolve", "antibiotic", "prescribe", "prescription", "regimen", "drug", "allergy", "pregnancy", "renal", "kidney", "অ্যান্টিবায়োটিক", "এন্টিবায়োটিক", "ওষুধ", "প্রেসক্রিপশন", "অ্যালার্জি", "গর্ভাবস্থা", "কিডনি", "oshudh", "osudh", "antibiotic"],
    answer: b(
      "RxSolve uses an OR-Tools constraint solver to recommend an antibiotic regimen. It prefers WHO Access drugs, and checks allergy, pregnancy, kidney function and age together with the batches actually in stock, using the earliest-expiring batch first. If nothing fits, it shows exactly which rules conflict and safe alternatives such as symptomatic care or pharmacist review.",
      "RxSolve একটি কনস্ট্রেইন্ট সলভার দিয়ে অ্যান্টিবায়োটিক রেজিমেন সুপারিশ করে। এটি WHO Access গ্রুপের ওষুধকে অগ্রাধিকার দেয় এবং অ্যালার্জি, গর্ভাবস্থা, কিডনির কার্যক্ষমতা ও বয়সের সাথে মজুতে থাকা ব্যাচ একসাথে যাচাই করে, যার মেয়াদ আগে শেষ সেটি আগে দেয়। কিছু না মিললে কোন নিয়ম পরস্পর সাংঘর্ষিক আর কী নিরাপদ বিকল্প আছে, তা দেখায়।"
    ),
    href: "/dashboard/triage",
    linkLabel: b("Open RxSolve triage", "RxSolve ট্রায়াজ খুলুন"),
    followUps: {
      en: ["What are AWaRe categories?", "What is the 60 percent Access target?"],
      bn: ["AWaRe ক্যাটাগরি কী?", "৬০ শতাংশ Access লক্ষ্য কী?"],
    },
  },
  {
    id: "aware",
    title: b("WHO AWaRe groups", "WHO AWaRe গ্রুপ"),
    keywords: ["aware", "access watch reserve", "watch", "reserve", "access group", "category", "categories", "who aware", "ক্যাটাগরি", "গ্রুপ", "অ্যাক্সেস", "ওয়াচ", "রিজার্ভ", "aware ki"],
    answer: b(
      "WHO AWaRe sorts antibiotics into three groups. Access drugs are first choice for common infections with lower resistance risk. Watch drugs have higher resistance potential and should be used more carefully. Reserve drugs are a last resort for resistant infections. RxSolve always tries Access first and needs pharmacist approval before escalating.",
      "WHO AWaRe অ্যান্টিবায়োটিককে তিন ভাগে ভাগ করে। Access ওষুধ সাধারণ সংক্রমণে প্রথম পছন্দ, এতে রেজিস্ট্যান্সের ঝুঁকি কম। Watch ওষুধে রেজিস্ট্যান্সের ঝুঁকি বেশি, তাই সাবধানে ব্যবহার করতে হয়। Reserve হলো রেজিস্ট্যান্ট সংক্রমণের শেষ ভরসা। RxSolve সবসময় আগে Access চেষ্টা করে, উপরে যেতে ফার্মাসিস্টের অনুমোদন লাগে।"
    ),
    followUps: {
      en: ["What is the 60 percent Access target?", "How does RxSolve pick an antibiotic?"],
      bn: ["৬০ শতাংশ Access লক্ষ্য কী?", "RxSolve কীভাবে অ্যান্টিবায়োটিক বাছে?"],
    },
  },
  {
    id: "access-target",
    title: b("WHO 60% Access target", "WHO ৬০% Access লক্ষ্য"),
    keywords: ["60 percent", "sixty", "target", "access ratio", "kpi", "stewardship", "stewardlens", "৬০", "লক্ষ্য", "শতাংশ", "স্টুয়ার্ডশিপ", "লক্ষ্যমাত্রা", "percent"],
    answer: b(
      "WHO recommends that at least 60 percent of antibiotics used come from the Access group. StewardLens shows each clinic's live Access ratio against that target, along with the AWaRe mix and stock at risk of expiring. It helps a clinic see whether prescribing is moving in the right direction.",
      "WHO বলে, ব্যবহৃত অ্যান্টিবায়োটিকের অন্তত ৬০ শতাংশ Access গ্রুপ থেকে হওয়া উচিত। StewardLens প্রতিটি ক্লিনিকের লাইভ Access অনুপাত এই লক্ষ্যের সাথে দেখায়, সাথে AWaRe মিশ্রণ আর মেয়াদ শেষ হওয়ার ঝুঁকিতে থাকা মজুত। এতে বোঝা যায় প্রেসক্রিপশন সঠিক দিকে যাচ্ছে কি না।"
    ),
    href: "/dashboard/analytics",
    linkLabel: b("Open StewardLens", "StewardLens খুলুন"),
    followUps: {
      en: ["What are AWaRe categories?", "What does the critical-care insights page show?"],
      bn: ["AWaRe ক্যাটাগরি কী?", "ক্রিটিক্যাল কেয়ার বিশ্লেষণে কী দেখায়?"],
    },
  },
  {
    id: "carematch",
    title: b("CareMatch hospital matching", "CareMatch হাসপাতাল মেলানো"),
    keywords: ["carematch", "care match", "choose a hospital", "which hospital", "hospital", "match", "dispatch", "icu bed", "ventilator", "ambulance", "eta", "হাসপাতাল", "আইসিইউ", "ভেন্টিলেটর", "অ্যাম্বুলেন্স", "ডিসপ্যাচ", "haspatal", "kon hospital", "icu"],
    answer: b(
      "CareMatch finds the best hospital for a critical patient. It checks the ICU bed, ventilator, specialty, ABO and Rh compatible blood, public hospital only if requested, and the travel time limit against each hospital's current staffed capacity. It ranks the options by travel time and load, and lowers hospitals whose counts are out of date.",
      "CareMatch গুরুতর রোগীর জন্য সবচেয়ে উপযুক্ত হাসপাতাল খোঁজে। প্রতিটি হাসপাতালের বর্তমান স্টাফসহ সক্ষমতার সাথে আইসিইউ বেড, ভেন্টিলেটর, বিশেষজ্ঞ সেবা, ABO ও Rh মানানসই রক্ত, চাইলে শুধু সরকারি হাসপাতাল এবং যাত্রাসময়ের সীমা যাচাই করে। যাত্রাসময় ও চাপ অনুযায়ী সাজায়, আর যাদের তথ্য পুরোনো তাদের নিচে রাখে।"
    ),
    href: "/dispatch",
    linkLabel: b("Open CareMatch dispatch", "CareMatch ডিসপ্যাচ খুলুন"),
    followUps: {
      en: ["What if no hospital fits?", "How are bed holds kept safe?"],
      bn: ["কোনো হাসপাতাল না মিললে কী হয়?", "বেড হোল্ড কীভাবে নিরাপদ থাকে?"],
    },
  },
  {
    id: "conflictproof",
    title: b("ConflictProof", "ConflictProof"),
    keywords: ["conflictproof", "infeasible", "no hospital", "no hospital fits", "not possible", "why not", "split dispatch", "split", "repair", "না মিললে", "মেলে না", "সম্ভব না", "কেন না", "বিকল্প", "স্প্লিট", "mile na", "na mille"],
    answer: b(
      "When no single hospital fits, ConflictProof shows the smallest set of requirements that cannot all be met together, so you see exactly why. It then suggests safe repairs, such as a split dispatch where the bed is at one hospital and blood is couriered from another, or relaxing only the public-only or travel time limit. ICU, ventilator, specialty and blood safety are never relaxed.",
      "কোনো একক হাসপাতাল না মিললে ConflictProof দেখায় কোন ন্যূনতম শর্তগুলো একসাথে পূরণ করা যাচ্ছে না, তাই কারণটা স্পষ্ট বোঝা যায়। এরপর নিরাপদ বিকল্প দেয়, যেমন স্প্লিট ডিসপ্যাচ, যেখানে বেড এক হাসপাতালে আর রক্ত অন্য জায়গা থেকে কুরিয়ারে আসে, অথবা শুধু সরকারি হাসপাতাল বা যাত্রাসময়ের শর্ত শিথিল করা। আইসিইউ, ভেন্টিলেটর, বিশেষজ্ঞ সেবা ও রক্তের নিরাপত্তা কখনো শিথিল হয় না।"
    ),
    href: "/dispatch",
    linkLabel: b("Try the Farmgate case", "ফার্মগেট কেস চালিয়ে দেখুন"),
    followUps: {
      en: ["How are bed holds kept safe?", "Which blood can a patient receive?"],
      bn: ["বেড হোল্ড কীভাবে নিরাপদ থাকে?", "রোগী কোন রক্ত নিতে পারে?"],
    },
  },
  {
    id: "lockstep",
    title: b("LockStep bed holds", "LockStep বেড হোল্ড"),
    keywords: ["lockstep", "hold", "holds", "bed hold", "lock", "book", "booking", "reserve bed", "double booking", "twice", "last bed", "idempotency", "হোল্ড", "বুক", "বুকিং", "দুবার", "শেষ বেড", "লক", "book kora"],
    answer: b(
      "LockStep books the bed, ventilator and blood together in one database transaction, so either everything is held or nothing is. A hold lasts 10 minutes and is released automatically if the hospital does not confirm. Retrying the same request returns the same hold instead of taking a second bed, and when many people try for the last bed exactly one succeeds.",
      "LockStep বেড, ভেন্টিলেটর আর রক্ত একটি ডেটাবেস ট্রানজ্যাকশনে একসাথে বুক করে, তাই হয় সব হোল্ড হয়, নয়তো কিছুই না। একটি হোল্ড ১০ মিনিট থাকে, হাসপাতাল নিশ্চিত না করলে নিজে থেকেই ছেড়ে যায়। একই অনুরোধ আবার পাঠালে আরেকটি বেড নেয় না, আগের হোল্ডই ফেরত দেয়, আর শেষ বেডের জন্য অনেকে চেষ্টা করলে ঠিক একজনই পায়।"
    ),
    followUps: {
      en: ["What is RaceLab?", "How does a hospital confirm a hold?"],
      bn: ["RaceLab কী?", "হাসপাতাল কীভাবে হোল্ড নিশ্চিত করে?"],
    },
  },
  {
    id: "racelab",
    title: b("RaceLab", "RaceLab"),
    keywords: ["racelab", "race lab", "race", "concurrency", "concurrent", "simultaneous", "রেস", "একসাথে অনেক", "একই সময়ে"],
    answer: b(
      "RaceLab is a live proof of LockStep. It resets a hidden sandbox ICU to exactly one free bed and fires up to 25 bookings at the same moment, from your browser or the server. Exactly one wins, the rest are rejected, and the double booking counter stays at zero. Real hospitals are never touched.",
      "RaceLab হলো LockStep-এর লাইভ প্রমাণ। এটি একটি লুকানো স্যান্ডবক্স আইসিইউতে ঠিক একটি খালি বেড রাখে এবং ব্রাউজার বা সার্ভার থেকে একই মুহূর্তে সর্বোচ্চ ২৫টি বুকিং পাঠায়। ঠিক একজন জেতে, বাকিরা প্রত্যাখ্যাত হয়, আর দুবার বুকিংয়ের সংখ্যা শূন্য থাকে। আসল হাসপাতালে কোনো প্রভাব পড়ে না।"
    ),
    href: "/race-lab",
    linkLabel: b("Open RaceLab", "RaceLab খুলুন"),
    followUps: {
      en: ["How are bed holds kept safe?", "What is ShasthoGrid?"],
      bn: ["বেড হোল্ড কীভাবে নিরাপদ থাকে?", "ShasthoGrid কী?"],
    },
  },
  {
    id: "facilitydesk",
    title: b("FacilityDesk for hospitals", "হাসপাতালের FacilityDesk"),
    keywords: ["facilitydesk", "facility desk", "facility", "hospital staff", "update beds", "update count", "confirm a hold", "confirm", "incoming", "patient arrived", "release", "ফ্যাসিলিটি", "হাসপাতাল কর্মী", "নিশ্চিত করে", "নিশ্চিত", "আসন্ন", "রোগী এসেছে", "সংখ্যা হালনাগাদ", "update kori"],
    answer: b(
      "FacilityDesk is where hospital and blood bank staff keep their own numbers live. Hospital admins update free, staffed and total ICU beds and ventilators, and blood officers update blood units and expiry. Incoming holds appear with a countdown, and staff tap confirm bed, patient arrived or release. Each facility can only change its own data.",
      "FacilityDesk-এ হাসপাতাল ও ব্লাড ব্যাংকের কর্মীরা নিজেদের সংখ্যা হালনাগাদ রাখেন। হাসপাতাল অ্যাডমিন খালি, স্টাফসহ ও মোট আইসিইউ বেড আর ভেন্টিলেটর আপডেট করেন, ব্লাড অফিসার রক্তের ইউনিট ও মেয়াদ। আসন্ন হোল্ড কাউন্টডাউনসহ দেখায়, কর্মীরা বেড নিশ্চিত, রোগী এসেছে বা ছেড়ে দিন চাপেন। প্রতিটি প্রতিষ্ঠান শুধু নিজের তথ্যই বদলাতে পারে।"
    ),
    href: "/facility",
    linkLabel: b("Open FacilityDesk", "FacilityDesk খুলুন"),
    followUps: {
      en: ["Where do bed counts come from?", "How can a hospital system send data?"],
      bn: ["বেডের সংখ্যা কোথা থেকে আসে?", "হাসপাতালের সিস্টেম কীভাবে তথ্য পাঠাবে?"],
    },
  },
  {
    id: "freshness",
    title: b("Live, stale and demo data", "লাইভ, পুরোনো ও ডেমো তথ্য"),
    keywords: ["live", "stale", "demo", "simulated", "real data", "come from", "where do", "dghs", "fresh", "freshness", "লাইভ", "পুরোনো", "ডেমো", "আসল তথ্য", "কোথা থেকে", "সিমুলেটেড", "kotha theke", "real naki"],
    answer: b(
      "There is no public live feed of ICU beds or blood from DGHS, so ShasthoGrid takes counts directly from each facility, either typed by staff or pushed by the hospital's own system. Every number shows its source and age. Live means recently reported, Stale means not refreshed for six hours and is ranked lower, and Demo means simulated sample data.",
      "DGHS-এর আইসিইউ বেড বা রক্তের কোনো পাবলিক লাইভ ফিড নেই, তাই ShasthoGrid প্রতিটি প্রতিষ্ঠান থেকে সরাসরি সংখ্যা নেয়, কর্মীরা লিখে দেন বা হাসপাতালের নিজস্ব সিস্টেম পাঠায়। প্রতিটি সংখ্যার উৎস ও সময় দেখা যায়। Live মানে সম্প্রতি জানানো, Stale মানে ছয় ঘণ্টা হালনাগাদ হয়নি তাই নিচে রাখা হয়, আর Demo মানে সিমুলেটেড নমুনা তথ্য।"
    ),
    href: "/dispatch",
    linkLabel: b("See data freshness", "তথ্যের সতেজতা দেখুন"),
    followUps: {
      en: ["How can a hospital system send data?", "What is FacilityDesk?"],
      bn: ["হাসপাতালের সিস্টেম কীভাবে তথ্য পাঠাবে?", "FacilityDesk কী?"],
    },
  },
  {
    id: "feed",
    title: b("Hospital data feed", "হাসপাতালের ডেটা ফিড"),
    keywords: ["feed", "api", "api key", "integration", "his", "hospital system", "send data", "push", "it team", "ফিড", "এপিআই", "ইন্টিগ্রেশন", "সিস্টেম", "তথ্য পাঠাবে", "কী তৈরি", "api diye"],
    answer: b(
      "A hospital's IT team can push counts automatically. An admin or the facility's own officer creates an API key in FacilityDesk, scoped to beds or to blood, and it is shown only once. The system then sends its census every five to fifteen minutes. ShasthoGrid subtracts the beds and blood it is already holding, ignores older reports, and audits every push.",
      "হাসপাতালের আইটি টিম স্বয়ংক্রিয়ভাবে সংখ্যা পাঠাতে পারে। অ্যাডমিন বা প্রতিষ্ঠানের নিজের কর্মকর্তা FacilityDesk-এ একটি API কী তৈরি করেন, যা শুধু বেড বা শুধু রক্তের জন্য সীমিত, আর একবারই দেখানো হয়। এরপর সিস্টেম প্রতি পাঁচ থেকে পনেরো মিনিটে তথ্য পাঠায়। ShasthoGrid নিজের চলমান হোল্ড বাদ দেয়, পুরোনো রিপোর্ট উপেক্ষা করে এবং প্রতিটি পাঠানো অডিট করে।"
    ),
    href: "/facility",
    linkLabel: b("Manage feed keys", "ফিড কী পরিচালনা করুন"),
    followUps: {
      en: ["Where do bed counts come from?", "Is patient data safe?"],
      bn: ["বেডের সংখ্যা কোথা থেকে আসে?", "রোগীর তথ্য কি নিরাপদ?"],
    },
  },
  {
    id: "news2",
    title: b("PulseScore NEWS2", "PulseScore NEWS2"),
    keywords: ["news2", "news 2", "pulsescore", "pulse score", "score", "acuity", "vitals", "vital signs", "early warning", "স্কোর", "ভাইটাল", "তীব্রতা", "পালস স্কোর"],
    answer: b(
      "PulseScore calculates the Royal College of Physicians NEWS2 early warning score from respiration rate, oxygen saturation, oxygen use, blood pressure, pulse, consciousness and temperature. A total of 7 or more is red for emergency response, 5 or 6 is orange for urgent review, and any single sign scoring 3 is a warning even if the total is low. Always confirm the observations yourself.",
      "PulseScore শ্বাসের হার, অক্সিজেন স্যাচুরেশন, অক্সিজেন ব্যবহার, রক্তচাপ, পালস, চেতনা ও তাপমাত্রা থেকে রয়েল কলেজ অব ফিজিশিয়ানসের NEWS2 সতর্কতা স্কোর হিসাব করে। মোট ৭ বা বেশি হলে লাল, জরুরি সাড়া দরকার, ৫ বা ৬ হলে কমলা, দ্রুত পর্যালোচনা দরকার, আর যেকোনো একটি লক্ষণে ৩ এলেও সতর্ক সংকেত। পর্যবেক্ষণগুলো নিজে যাচাই করে নিন।"
    ),
    href: "/dispatch",
    linkLabel: b("Enter vitals", "ভাইটাল লিখুন"),
    followUps: {
      en: ["How does CareMatch choose a hospital?", "What does the Copilot do?"],
      bn: ["CareMatch কীভাবে হাসপাতাল বেছে নেয়?", "Copilot কী করে?"],
    },
  },
  {
    id: "blood",
    title: b("Blood compatibility", "রক্তের মিল"),
    keywords: ["blood", "blood group", "blood type", "o negative", "donor", "compatible", "abo", "transfusion", "রক্ত", "রক্তের গ্রুপ", "নেগেটিভ", "দাতা", "মানানসই", "rokto", "rokter"],
    answer: b(
      "ShasthoGrid matches red cells by ABO and Rh group. O negative can be given to any patient, which is why it is scarce, so CareMatch prefers an exact group match and avoids spending O negative on patients who do not need it. For example, an A positive patient can receive A or O blood of either Rh type, while an O negative patient can only receive O negative.",
      "ShasthoGrid লোহিত রক্তকণিকা ABO ও Rh গ্রুপ অনুযায়ী মেলায়। O নেগেটিভ রক্ত যেকোনো রোগীকে দেওয়া যায়, তাই এটি দুষ্প্রাপ্য; CareMatch আগে হুবহু গ্রুপ মেলাতে চায় এবং দরকার না হলে O নেগেটিভ খরচ করে না। যেমন, A পজিটিভ রোগী A বা O গ্রুপের পজিটিভ এবং নেগেটিভ দুটোই নিতে পারেন, কিন্তু O নেগেটিভ রোগী শুধু O নেগেটিভ রক্তই নিতে পারেন।"
    ),
    href: "/insights",
    linkLabel: b("See blood stock", "রক্তের মজুত দেখুন"),
    followUps: {
      en: ["What if no hospital fits?", "What does the critical-care insights page show?"],
      bn: ["কোনো হাসপাতাল না মিললে কী হয়?", "ক্রিটিক্যাল কেয়ার বিশ্লেষণে কী দেখায়?"],
    },
  },
  {
    id: "copilot",
    title: b("Shastho Copilot", "Shastho Copilot"),
    keywords: ["copilot", "co pilot", "paramedic", "note", "case agent", "agent", "banglish", "কোপাইলট", "প্যারামেডিক", "নোট", "এজেন্ট", "কেস"],
    answer: b(
      "Shastho Copilot reads a paramedic note in English, Bangla or Banglish, pulls out the vital signs and needs, then runs PulseScore and CareMatch for you. Names and phone numbers are removed before any AI sees the note. The AI cannot invent numbers that are not in the note or relax a safety requirement, and a person approves before anything is booked.",
      "Shastho Copilot ইংরেজি, বাংলা বা বাংলিশে লেখা প্যারামেডিকের নোট পড়ে, ভাইটাল আর প্রয়োজনগুলো বের করে, তারপর PulseScore ও CareMatch চালায়। কোনো AI নোট দেখার আগে নাম ও ফোন নম্বর মুছে ফেলা হয়। নোটে নেই এমন সংখ্যা AI বানাতে পারে না, নিরাপত্তার শর্তও শিথিল করতে পারে না, আর কিছু বুক করার আগে একজন মানুষ অনুমোদন দেন।"
    ),
    href: "/copilot?mode=agent",
    linkLabel: b("Open the Case agent", "কেস এজেন্ট খুলুন"),
    followUps: {
      en: ["Is patient data safe?", "What does NEWS2 tell me?"],
      bn: ["রোগীর তথ্য কি নিরাপদ?", "NEWS2 কী জানায়?"],
    },
  },
  {
    id: "freshstock",
    title: b("FreshStock inventory", "FreshStock মজুত"),
    keywords: ["freshstock", "fresh stock", "inventory", "stock", "batch", "expiry", "expire", "fefo", "first expired", "মজুত", "স্টক", "ব্যাচ", "মেয়াদ", "ইনভেন্টরি"],
    answer: b(
      "FreshStock is the clinic's medicine inventory. Batches are sorted by expiry date and dispensed first expired, first out, so stock is used before it goes to waste. It flags batches that are expiring soon or running out, and pharmacists and admins can add or adjust batches.",
      "FreshStock হলো ক্লিনিকের ওষুধের মজুত। ব্যাচগুলো মেয়াদ অনুযায়ী সাজানো থাকে এবং যার মেয়াদ আগে শেষ সেটি আগে দেওয়া হয়, তাই ওষুধ নষ্ট হওয়ার আগেই ব্যবহার হয়। মেয়াদ শেষের কাছাকাছি বা ফুরিয়ে আসা ব্যাচ চিহ্নিত করে, আর ফার্মাসিস্ট ও অ্যাডমিন ব্যাচ যোগ বা সংশোধন করতে পারেন।"
    ),
    href: "/dashboard/inventory",
    linkLabel: b("Open FreshStock", "FreshStock খুলুন"),
    followUps: {
      en: ["Can I use this without internet?", "How does RxSolve pick an antibiotic?"],
      bn: ["ইন্টারনেট ছাড়া কি ব্যবহার করা যায়?", "RxSolve কীভাবে অ্যান্টিবায়োটিক বাছে?"],
    },
  },
  {
    id: "offline",
    title: b("Offline and SyncSafe", "অফলাইন ও SyncSafe"),
    keywords: ["offline", "internet", "no internet", "without internet", "network", "sync", "syncsafe", "409", "connection", "অফলাইন", "ইন্টারনেট", "নেটওয়ার্ক", "সংযোগ", "সিঙ্ক", "net chara", "internet chara", "internet"],
    answer: b(
      "Clinic work keeps going offline. Patients, stock and dispenses are saved on the device and queued, then synced by SyncSafe when the connection returns. If someone else changed the same record meanwhile, the server does not silently overwrite it; you see both versions side by side and choose. Live hospital matching and the Copilot need a connection.",
      "ক্লিনিকের কাজ অফলাইনেও চলে। রোগী, মজুত ও ওষুধ বিতরণের তথ্য ডিভাইসে জমা থাকে, সংযোগ ফিরলে SyncSafe সিঙ্ক করে। এর মধ্যে অন্য কেউ একই রেকর্ড বদলালে সার্ভার চুপচাপ মুছে দেয় না, দুটি সংস্করণ পাশাপাশি দেখিয়ে আপনাকে বেছে নিতে দেয়। লাইভ হাসপাতাল খোঁজা আর Copilot-এর জন্য সংযোগ লাগে।"
    ),
    href: "/dashboard/sync",
    linkLabel: b("Open SyncSafe", "SyncSafe খুলুন"),
    followUps: {
      en: ["What is FreshStock?", "Is patient data safe?"],
      bn: ["FreshStock কী?", "রোগীর তথ্য কি নিরাপদ?"],
    },
  },
  {
    id: "insights",
    title: b("Critical-care insights", "ক্রিটিক্যাল কেয়ার বিশ্লেষণ"),
    keywords: ["insights", "insight", "analytics", "report", "occupancy", "critical care insights", "critical-care insights", "chart", "বিশ্লেষণ", "রিপোর্ট", "চার্ট", "ক্রিটিক্যাল কেয়ার"],
    answer: b(
      "The StewardLens critical-care page shows the city picture: how full the staffed ICU beds are, how many physical beds have no nurses, ventilators free, blood stock by group with units nearing expiry, how holds ended, and which hospitals report live data. You can switch between 7, 30 and 90 days, and every chart has a table view.",
      "StewardLens-এর ক্রিটিক্যাল কেয়ার পাতায় পুরো শহরের চিত্র দেখা যায়: স্টাফসহ আইসিইউ বেড কতটা ভর্তি, কতগুলো বেডে নার্স নেই, কতটি ভেন্টিলেটর খালি, গ্রুপভিত্তিক রক্তের মজুত ও মেয়াদ শেষের কাছাকাছি ইউনিট, হোল্ডগুলোর ফলাফল, আর কোন হাসপাতাল লাইভ তথ্য দিচ্ছে। ৭, ৩০ ও ৯০ দিনের মধ্যে বদলানো যায়, প্রতিটি চার্টের টেবিল ভিউ আছে।"
    ),
    href: "/insights",
    linkLabel: b("Open insights", "বিশ্লেষণ খুলুন"),
    followUps: {
      en: ["Where do bed counts come from?", "Which blood can a patient receive?"],
      bn: ["বেডের সংখ্যা কোথা থেকে আসে?", "রোগী কোন রক্ত নিতে পারে?"],
    },
  },
  {
    id: "roles",
    title: b("Roles and sign-in", "রোল ও সাইন-ইন"),
    keywords: ["role", "roles", "login", "log in", "sign in", "signin", "account", "demo account", "who can", "permission", "dispatcher", "pharmacist", "dispenser", "auditor", "রোল", "লগইন", "সাইন ইন", "অ্যাকাউন্ট", "অনুমতি", "ফার্মাসিস্ট", "ডিসপ্যাচার", "login kivabe"],
    answer: b(
      "Each role sees its own work. Dispensers, pharmacists and auditors use the clinic stewardship screens, dispatchers use CareMatch, the Copilot and RaceLab, hospital admins and blood bank officers use FacilityDesk for their own facility only, and admins can see everything. The sign-in page has one-tap demo role cards so you can try each view.",
      "প্রতিটি রোল নিজের কাজ দেখে। ডিসপেন্সার, ফার্মাসিস্ট ও অডিটর ক্লিনিকের স্টুয়ার্ডশিপ স্ক্রিন ব্যবহার করেন, ডিসপ্যাচার CareMatch, Copilot ও RaceLab, হাসপাতাল অ্যাডমিন ও ব্লাড ব্যাংক অফিসার শুধু নিজের প্রতিষ্ঠানের FacilityDesk, আর অ্যাডমিন সব দেখতে পারেন। সাইন-ইন পাতায় এক ট্যাপে ডেমো রোল কার্ড আছে, প্রতিটি ভিউ চালিয়ে দেখতে পারবেন।"
    ),
    href: "/login",
    linkLabel: b("Go to sign-in", "সাইন-ইনে যান"),
    followUps: {
      en: ["Is patient data safe?", "What is FacilityDesk?"],
      bn: ["রোগীর তথ্য কি নিরাপদ?", "FacilityDesk কী?"],
    },
  },
  {
    id: "language",
    title: b("Bangla and English", "বাংলা ও ইংরেজি"),
    keywords: ["language", "bangla", "bengali", "english", "translate", "switch language", "ভাষা", "ইংরেজি", "ইংলিশ", "bhasha"],
    answer: b(
      "Every screen works in Bangla and English. Use the EN and Bangla switch in the top bar, and your choice is remembered. The Copilot also understands notes written in Bangla, English or Banglish, and I can answer you in either language.",
      "প্রতিটি পাতা বাংলা ও ইংরেজি দুই ভাষাতেই চলে। ওপরের বারে EN আর বাংলা সুইচ ব্যবহার করুন, আপনার পছন্দ মনে রাখা হয়। Copilot বাংলা, ইংরেজি বা বাংলিশে লেখা নোটও বোঝে, আর আমি দুই ভাষাতেই উত্তর দিতে পারি।"
    ),
    followUps: {
      en: ["How do I use voice mode?", "How do I change the theme?"],
      bn: ["ভয়েস মোড কীভাবে ব্যবহার করব?", "থিম কীভাবে বদলাব?"],
    },
  },
  {
    id: "theme",
    title: b("Themes and colours", "থিম ও রং"),
    keywords: ["theme", "dark", "dark mode", "light mode", "colour", "color", "aurora", "ocean", "night shift", "appearance", "থিম", "ডার্ক", "রং", "রঙ", "লাইট", "অন্ধকার"],
    answer: b(
      "Tap the palette button in the top bar to choose a theme. Clinic light is calm and bright, Aurora mixes teal, sky and violet, Ocean night is a deep blue teal, Night shift is low glare for ICU nights, and Match system follows your device. Your choice is remembered on this device.",
      "ওপরের বারে প্যালেট বোতাম চেপে থিম বেছে নিন। Clinic light শান্ত ও উজ্জ্বল, Aurora টিল, আকাশি ও বেগুনির মিশ্রণ, Ocean night গভীর নীল-টিল, Night shift রাতের আইসিইউতে চোখের আরামের জন্য, আর Match system আপনার ডিভাইস অনুসরণ করে। পছন্দটি এই ডিভাইসে মনে রাখা হয়।"
    ),
    followUps: {
      en: ["How do I switch language?", "How do I use voice mode?"],
      bn: ["ভাষা কীভাবে বদলাব?", "ভয়েস মোড কীভাবে ব্যবহার করব?"],
    },
  },
  {
    id: "voice",
    title: b("Voice mode", "ভয়েস মোড"),
    keywords: ["voice", "voice mode", "speak", "talk", "microphone", "mic", "listen", "read aloud", "ভয়েস", "কথা বল", "মাইক", "শুনতে", "কণ্ঠ", "kotha bol"],
    answer: b(
      "Tap the glowing orb to talk to me. Speak in Bangla or English, and I will answer on screen and read the answer aloud. Your browser may ask for microphone permission the first time. Please do not say patient names or phone numbers; describe the question instead.",
      "আমার সাথে কথা বলতে উজ্জ্বল গোলকটিতে ট্যাপ করুন। বাংলা বা ইংরেজিতে বলুন, আমি স্ক্রিনে উত্তর দেব আর জোরে পড়ে শোনাব। প্রথমবার ব্রাউজার মাইক্রোফোনের অনুমতি চাইতে পারে। রোগীর নাম বা ফোন নম্বর বলবেন না, শুধু প্রশ্নটি বলুন।"
    ),
    followUps: {
      en: ["What is ShasthoGrid?", "Is patient data safe?"],
      bn: ["ShasthoGrid কী?", "রোগীর তথ্য কি নিরাপদ?"],
    },
  },
  {
    id: "safety",
    title: b("Privacy and safety", "গোপনীয়তা ও নিরাপত্তা"),
    keywords: ["safe", "safety", "privacy", "private", "secure", "security", "patient data", "audit", "pii", "নিরাপদ", "নিরাপত্তা", "গোপনীয়তা", "রোগীর তথ্য", "অডিট", "nirapod", "safe naki"],
    answer: b(
      "ShasthoGrid is decision support, not a replacement for clinicians, who make every final decision. Names and phone numbers are removed before any AI sees a note, each user only sees data for their own clinic or facility, and every change and every denied attempt is written to an audit log. Bed and blood counts marked Demo are simulated.",
      "ShasthoGrid সিদ্ধান্ত-সহায়ক, চিকিৎসকের বিকল্প নয়, প্রতিটি চূড়ান্ত সিদ্ধান্ত চিকিৎসকই নেন। কোনো AI নোট দেখার আগে নাম ও ফোন নম্বর মুছে ফেলা হয়, প্রত্যেক ব্যবহারকারী শুধু নিজের ক্লিনিক বা প্রতিষ্ঠানের তথ্য দেখেন, আর প্রতিটি পরিবর্তন ও প্রত্যাখ্যাত চেষ্টা অডিট লগে লেখা থাকে। Demo চিহ্নিত বেড ও রক্তের সংখ্যা সিমুলেটেড।"
    ),
    followUps: {
      en: ["Where do bed counts come from?", "What does the Copilot do?"],
      bn: ["বেডের সংখ্যা কোথা থেকে আসে?", "Copilot কী করে?"],
    },
  },
  {
    id: "emergency",
    title: b("Real emergency", "সত্যিকারের জরুরি অবস্থা"),
    keywords: ["emergency", "urgent help", "dying", "help now", "999", "ambulance number", "জরুরি", "বাঁচান", "সাহায্য", "৯৯৯", "মারা যাচ্ছে", "emergency number"],
    answer: b(
      "If someone's life is in danger right now, call 999, Bangladesh's national emergency number, and follow the advice of the emergency team. I am a guide to this software and cannot give medical care. Clinicians can use CareMatch to find a staffed ICU bed and blood quickly.",
      "কারো জীবন এই মুহূর্তে ঝুঁকিতে থাকলে এখনই ৯৯৯-এ ফোন করুন, এটি বাংলাদেশের জাতীয় জরুরি সেবা নম্বর, আর জরুরি দলের পরামর্শ মেনে চলুন। আমি এই সফটওয়্যারের গাইড, চিকিৎসা দিতে পারি না। চিকিৎসকেরা CareMatch দিয়ে দ্রুত স্টাফসহ আইসিইউ বেড ও রক্ত খুঁজতে পারেন।"
    ),
    href: "/dispatch",
    linkLabel: b("Open CareMatch", "CareMatch খুলুন"),
    followUps: {
      en: ["How does CareMatch choose a hospital?", "Which blood can a patient receive?"],
      bn: ["CareMatch কীভাবে হাসপাতাল বেছে নেয়?", "রোগী কোন রক্ত নিতে পারে?"],
    },
  },
  {
    id: "hackathon",
    title: b("About the project", "প্রকল্প সম্পর্কে"),
    keywords: ["hackathon", "who made", "who built", "team", "challenge", "a02", "a05", "code arenax", "tech stack", "হ্যাকাথন", "কে বানিয়েছে", "কারা বানিয়েছে", "চ্যালেঞ্জ", "ke baniyeche"],
    answer: b(
      "ShasthoGrid was built for the Code ArenaX Hack the Vibe 2026 World Problem Solver track, covering challenge A02 on constraint-based decisions and A05 on safe concurrent transactions. It uses a FastAPI backend with PostgreSQL and OR-Tools, and an offline-first Next.js web app.",
      "ShasthoGrid তৈরি হয়েছে Code ArenaX Hack the Vibe 2026-এর World Problem Solver ট্র্যাকের জন্য, যেখানে A02 চ্যালেঞ্জ কনস্ট্রেইন্টভিত্তিক সিদ্ধান্ত আর A05 নিরাপদ একসাথে চলা ট্রানজ্যাকশন নিয়ে। এতে FastAPI ব্যাকএন্ড, PostgreSQL ও OR-Tools, আর অফলাইন-প্রথম Next.js ওয়েব অ্যাপ ব্যবহার হয়েছে।"
    ),
    followUps: {
      en: ["What is LockStep?", "What if no hospital fits?"],
      bn: ["LockStep কী?", "কোনো হাসপাতাল না মিললে কী হয়?"],
    },
  },
];

const FALLBACK: Intent = {
  id: "fallback",
  title: b("What I can help with", "আমি যা পারি"),
  keywords: [],
  answer: b(
    "I can explain RxSolve antibiotics, CareMatch hospital matching, LockStep bed holds, blood compatibility, NEWS2, FacilityDesk, offline use, themes and voice mode. For a real patient assessment, use the Case agent. I cannot diagnose or replace a clinician.",
    "আমি RxSolve অ্যান্টিবায়োটিক, CareMatch হাসপাতাল খোঁজা, LockStep বেড হোল্ড, রক্তের মিল, NEWS2, FacilityDesk, অফলাইন ব্যবহার, থিম ও ভয়েস মোড বুঝিয়ে বলতে পারি। রোগীর আসল মূল্যায়নের জন্য Case agent ব্যবহার করুন। আমি রোগ নির্ণয় করতে বা চিকিৎসকের জায়গা নিতে পারি না।"
  ),
  followUps: {
    en: ["How does CareMatch choose a hospital?", "Can I use this without internet?"],
    bn: ["CareMatch কীভাবে হাসপাতাল বেছে নেয়?", "ইন্টারনেট ছাড়া কি ব্যবহার করা যায়?"],
  },
};

export const SATHI_TOPICS: { id: string; title: Bi }[] = INTENTS.filter((i) => i.id !== "greeting").map(
  ({ id, title }) => ({ id, title })
);

export const ASSISTANT_QUICK_ASKS: Record<Locale, string[]> = {
  en: [
    "How does CareMatch choose a hospital?",
    "What if no hospital fits?",
    "How are bed holds kept safe?",
    "Can I use this without internet?",
  ],
  bn: [
    "CareMatch কীভাবে হাসপাতাল বেছে নেয়?",
    "কোনো হাসপাতাল না মিললে কী হয়?",
    "বেড হোল্ড কীভাবে নিরাপদ থাকে?",
    "ইন্টারনেট ছাড়া কি ব্যবহার করা যায়?",
  ],
};

/** Lower-case, drop punctuation (incl. the Bangla danda), collapse spaces. Padded so whole-word checks work. */
function normalize(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[।॥?!.,;:'"“”‘’()[\]{}<>/\\|*_~`@#$%^&=+]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

const ASCII = /^[\x20-\x7E]+$/;

function score(intent: Intent, q: string): number {
  let total = 0;
  for (const raw of intent.keywords) {
    const k = raw.toLowerCase();
    // Latin terms match whole words (so "hi" never hits "his"), long ones also as prefixes
    // ("hospitals"). Bangla terms match as substrings because suffixes attach (হাসপাতালে).
    const hit = ASCII.test(k) ? q.includes(` ${k} `) || (k.length >= 5 && q.includes(` ${k}`)) : q.includes(k);
    if (hit) total += 1 + k.split(" ").length + Math.min(k.length, 20) / 10;
  }
  return total;
}

function toAnswer(intent: Intent, locale: Locale): SathiAnswer {
  return {
    id: intent.id,
    text: intent.answer[locale],
    href: intent.href,
    linkLabel: intent.linkLabel?.[locale],
    followUps: intent.followUps[locale],
  };
}

export function answerSathi(question: string, locale: Locale): SathiAnswer {
  const q = normalize(question);
  let best: Intent | null = null;
  let bestScore = 0;
  for (const intent of INTENTS) {
    const s = score(intent, q);
    if (s > bestScore) {
      best = intent;
      bestScore = s;
    }
  }
  return toAnswer(best ?? FALLBACK, locale);
}

export function answerAssistantGuide(question: string, locale: Locale): string {
  return answerSathi(question, locale).text;
}
