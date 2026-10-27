import { dayKey, addDays, parseBackup } from "./core.js";
import { allPhrases } from "./data.js";

export const AI_KEY = "omicron.learning.v2";
export const TYPES = [
  "translate",
  "cloze",
  "choice",
  "order",
  "match",
  "reading",
  "dialogue",
  "correct",
  "write",
  "teach",
];
export const LEVELS = ["New", "A1", "A2", "B1", "B2", "C1", "C2"];
export const freshLearning = () => ({
  version: 2,
  theme: "light",
  profiles: {},
  legacyKnowledge: [],
});
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
function text(v, max = 2000, blank = true) {
  if (typeof v !== "string" || v.length > max || (!blank && !v.trim()))
    throw Error("Invalid learning text.");
  return v.trim();
}
function strings(v, max = 30, length = 500) {
  if (!Array.isArray(v) || v.length > max)
    throw Error("Invalid learning list.");
  return v.map((x) => text(x, length, false));
}
export function knowledge(v) {
  if (!Array.isArray(v) || v.length > 2000) throw Error("Invalid vocabulary.");
  return v.map((x) => {
    if (
      !object(x) ||
      !Number.isInteger(x.strength) ||
      x.strength < 0 ||
      x.strength > 6 ||
      !Number.isInteger(x.mistakes) ||
      x.mistakes < 0
    )
      throw Error("Invalid vocabulary.");
    return {
      greek: text(x.greek, 500, false),
      english: text(x.english, 500, false),
      strength: x.strength,
      mistakes: x.mistakes,
    };
  });
}
export function survey(v) {
  if (
    !object(v) ||
    !LEVELS.includes(v.level) ||
    !Number.isInteger(v.minutes) ||
    v.minutes < 3 ||
    v.minutes > 30
  )
    throw Error("Choose a level and lesson length.");
  return {
    name: text(v.name, 40),
    level: v.level,
    minutes: v.minutes,
    goals: text(v.goals, 1500),
    experience: text(v.experience, 1500),
    interests: text(v.interests, 1000),
    challenges: text(v.challenges, 1000),
    preferences: text(v.preferences, 1000),
    accessibility: text(v.accessibility, 1000),
    alphabet: text(v.alphabet, 100),
    schedule: text(v.schedule, 500),
  };
}
export function memory(v) {
  if (!object(v) || !LEVELS.includes(v.level))
    throw Error("Invalid learner memory.");
  return {
    level: v.level,
    summary: text(v.summary, 3000),
    strengths: strings(v.strengths),
    needs: strings(v.needs),
    nextGoals: strings(v.nextGoals),
  };
}
export function exercise(v) {
  if (!object(v) || !TYPES.includes(v.type))
    throw Error("Unsupported exercise.");
  const e = {
    id: text(v.id, 80, false),
    type: v.type,
    prompt: text(v.prompt, 2000, false),
    context: text(v.context, 3000),
    answer: text(v.answer, 1000, false),
    hint: text(v.hint, 500),
    choices: strings(v.choices, 12, 500),
    pairs: [],
  };
  if (
    v.type === "choice" &&
    (e.choices.length < 2 ||
      !e.choices.includes(e.answer) ||
      new Set(e.choices).size !== e.choices.length)
  )
    throw Error("Invalid answer choices.");
  if (
    v.type === "order" &&
    (e.choices.length < 2 || e.choices.join(" ").length > 1000)
  )
    throw Error("Invalid word tiles.");
  if (v.type === "match") {
    if (!Array.isArray(v.pairs) || v.pairs.length < 2 || v.pairs.length > 6)
      throw Error("Invalid matching exercise.");
    e.pairs = v.pairs.map((p) => ({
      left: text(p.left, 200, false),
      right: text(p.right, 200, false),
    }));
    if (
      new Set(e.pairs.map((p) => p.left)).size !== e.pairs.length ||
      new Set(e.pairs.map((p) => p.right)).size !== e.pairs.length
    )
      throw Error("Duplicate matching pairs.");
  }
  return e;
}
export function assessment(v) {
  if (!object(v) || typeof v.correct !== "boolean")
    throw Error("Invalid tutor response.");
  return {
    correct: v.correct,
    explanation: text(v.explanation, 2000, false),
    correction: text(v.correction, 1000),
    knowledge: knowledge(v.knowledge),
  };
}
export function block(v, complete = false) {
  if (
    !object(v) ||
    v.complete !== complete ||
    !Array.isArray(v.exercises) ||
    v.exercises.length !== (complete ? 0 : 3)
  )
    throw Error("The tutor sent an incomplete lesson.");
  const exercises = v.exercises.map(exercise);
  if (new Set(exercises.map((e) => e.id)).size !== exercises.length)
    throw Error("Duplicate exercise IDs.");
  return {
    title: text(v.title, 100, false),
    complete,
    exercises,
    memory: memory(v.memory),
  };
}
export function newProfile(legacy = []) {
  return {
    survey: null,
    memory: {
      level: "New",
      summary: "",
      strengths: [],
      needs: [],
      nextGoals: [],
    },
    knowledge: structuredClone(legacy),
    history: [],
    session: null,
    welcomed: false,
  };
}
export function newSession(profile, options = {}) {
  const minutes = options.minutes || profile.survey.minutes;
  return {
    id: crypto.randomUUID(),
    title: "Your Greek lesson",
    minutes,
    focus: options.focus || "",
    target: Math.ceil((minutes * 1.2) / 3) * 3,
    started: Date.now(),
    exercises: [],
    index: 0,
    results: [],
    comments: [],
    draft: "",
    tiles: [],
    pending: null,
    phase: "planning",
    error: null,
  };
}
export function mergeKnowledge(previous, incoming) {
  const merged = new Map(previous.map((k) => [k.greek.normalize("NFC"), k]));
  for (const item of incoming) merged.set(item.greek.normalize("NFC"), item);
  return [...merged.values()].slice(-2000);
}
export function completeSession(profile, today = dayKey()) {
  const s = profile.session;
  if (!s || s.phase === "done") return profile;
  return {
    ...profile,
    history: [
      ...profile.history,
      {
        id: s.id,
        date: today,
        title: s.title,
        total: s.results.length,
        correct: s.results.filter((r) => r.assessment.correct).length,
        minutes: s.minutes,
      },
    ].slice(-10000),
    session: { ...s, phase: "done" },
  };
}
const isDay = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  dayKey(new Date(v + "T12:00:00")) === v;
// One freeze for the entire active run. Today remains open until local midnight.
export function streakInfo(history, today = dayKey()) {
  const days = [
    ...new Set(history.map((h) => h.date).filter((d) => d <= today)),
  ].sort();
  let count = 0,
    frozen = [];
  let last;
  for (const day of days) {
    if (!last) {
      count = 1;
    } else if (day === addDays(last, 1)) {
      count++;
    } else if (day === addDays(last, 2) && frozen.length === 0) {
      frozen.push(addDays(last, 1));
      count++;
    } else {
      count = 1;
      frozen = [];
    }
    last = day;
  }
  if (!last) return { count: 0, frozen: [] };
  if (last < addDays(today, -1)) {
    if (last === addDays(today, -2) && frozen.length === 0)
      frozen.push(addDays(last, 1));
    else return { count: 0, frozen: [] };
  }
  return { count, frozen };
}

export function weekDays(history, today = dayKey()) {
  const date = new Date(today + "T12:00:00"),
    start = addDays(today, -((date.getDay() + 6) % 7)),
    days = new Set(history.map((h) => h.date)),
    info = streakInfo(history, today);
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(start, i);
    return {
      day,
      label: ["M", "T", "W", "T", "F", "S", "S"][i],
      state: days.has(day)
        ? "complete"
        : info.frozen.includes(day)
          ? "frozen"
          : day === today
            ? "today"
            : "empty",
    };
  });
}
function validateSession(v) {
  if (v === null) return null;
  if (
    !object(v) ||
    ![
      "planning",
      "exercise",
      "grading",
      "feedback",
      "adjusting",
      "error",
      "done",
    ].includes(v.phase) ||
    !Number.isInteger(v.index) ||
    v.index < 0 ||
    !Number.isInteger(v.minutes) ||
    v.minutes < 3 ||
    v.minutes > 30 ||
    !Number.isInteger(v.target) ||
    v.target < 3 ||
    v.target > 60 ||
    !Number.isFinite(v.started)
  )
    throw Error("Invalid saved lesson.");
  text(v.id, 100, false);
  text(v.title, 100, false);
  text(v.focus, 1000);
  if (
    !Array.isArray(v.exercises) ||
    v.exercises.length > 60 ||
    !Array.isArray(v.results) ||
    v.results.length > 60 ||
    !Array.isArray(v.comments) ||
    v.comments.length > 200
  )
    throw Error("Invalid saved lesson.");
  v.exercises = v.exercises.map(exercise);
  if (v.index > v.exercises.length) throw Error("Invalid exercise position.");
  for (const r of v.results) {
    text(r.answer, 4000);
    exercise(r.exercise);
    assessment(r.assessment);
  }
  for (const c of v.comments) {
    text(c.text, 2000, false);
    if (!Number.isInteger(c.at) || c.at < 0)
      throw Error("Invalid lesson comment.");
  }
  text(v.draft, 4000);
  if (
    !Array.isArray(v.tiles) ||
    v.tiles.length > 12 ||
    v.tiles.some((i) => !Number.isInteger(i) || i < 0 || i > 11)
  )
    throw Error("Invalid word tiles.");
  if (v.pending !== null) assessment(v.pending);
  if (v.error !== null) {
    text(v.error.message, 2000);
    text(v.error.operation, 20, false);
  }
  if (
    ["exercise", "grading", "feedback"].includes(v.phase) &&
    !v.exercises[v.index]
  )
    throw Error("Missing exercise.");
  if (v.phase === "feedback" && !v.pending) throw Error("Missing assessment.");
  return v;
}
export function parseLearning(raw) {
  const v = JSON.parse(raw);
  if (v.version === 1) {
    const old = parseBackup(raw);
    const result = freshLearning();
    result.theme = old.settings.theme;
    result.legacyKnowledge = [
      ...allPhrases,
      ...old.customLessons.flatMap((l) => l.phrases),
    ]
      .filter((p) => old.vocabulary[p.id])
      .map((p) => ({
        greek: p.greek,
        english: p.english,
        strength: old.vocabulary[p.id].level,
        mistakes: old.vocabulary[p.id].mistakes,
      }));
    return result;
  }
  if (
    v.version !== 2 ||
    !["light", "dark"].includes(v.theme) ||
    !object(v.profiles) ||
    Object.keys(v.profiles).length > 100
  )
    throw Error("This is not an Omicron backup.");
  v.legacyKnowledge = knowledge(v.legacyKnowledge);
  for (const [id, p] of Object.entries(v.profiles)) {
    if (
      !/^[a-f0-9]{64}$/.test(id) ||
      !object(p) ||
      typeof p.welcomed !== "boolean"
    )
      throw Error("Invalid learner profile.");
    if (p.survey !== null) p.survey = survey(p.survey);
    if (p.onboarding !== undefined) {
      if (
        !object(p.onboarding) ||
        !Number.isInteger(p.onboarding.step) ||
        p.onboarding.step < 0 ||
        p.onboarding.step > 4
      )
        throw Error("Invalid saved survey.");
      p.onboarding.values = survey(p.onboarding.values);
    }
    p.memory = memory(p.memory);
    p.knowledge = knowledge(p.knowledge);
    if (!Array.isArray(p.history) || p.history.length > 10000)
      throw Error("Invalid learning history.");
    for (const h of p.history) {
      text(h.id, 100, false);
      text(h.title, 100, false);
      if (
        !isDay(h.date) ||
        !Number.isInteger(h.total) ||
        h.total < 1 ||
        h.total > 60 ||
        !Number.isInteger(h.correct) ||
        h.correct < 0 ||
        h.correct > h.total ||
        !Number.isFinite(h.minutes)
      )
        throw Error("Invalid learning history.");
    }
    p.session = validateSession(p.session);
  }
  return v;
}
export function loadLearning(storage) {
  try {
    const raw = storage.getItem(AI_KEY);
    if (raw) return { state: parseLearning(raw) };
    const legacy = storage.getItem("omicron.progress.v1");
    return { state: legacy ? parseLearning(legacy) : freshLearning() };
  } catch {
    return {
      state: freshLearning(),
      error:
        "Saved data could not be read. Export the original in Settings before replacing it.",
    };
  }
}
export function tutorContext(profile) {
  return {
    language: { from: "English", to: "Modern Greek" },
    student: profile.survey,
    teacherNotes: profile.memory,
    knowledge: profile.knowledge,
    session: profile.session,
  };
}
