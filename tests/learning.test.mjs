import test from "node:test";
import assert from "node:assert/strict";
import { fresh, KEY } from "../src/core.js";
import {
  AI_KEY,
  freshLearning,
  newProfile,
  newSession,
  parseLearning,
  loadLearning,
  streakInfo,
  weekDays,
  exercise,
  block,
  assessment,
  mergeKnowledge,
  completeSession,
  tutorContext,
} from "../src/learning.js";
const id = "a".repeat(64);
export const student = {
  name: "Sam",
  level: "A1",
  minutes: 5,
  goals: "Visit Greece",
  experience: "Some phrases",
  interests: "Food",
  challenges: "Accents",
  preferences: "Examples",
  accessibility: "",
  alphabet: "I can read slowly",
  schedule: "",
};
export const note = {
  level: "A1",
  summary: "Practising greetings.",
  strengths: ["Basic greetings"],
  needs: ["Accents"],
  nextGoals: ["Polite requests"],
};
export const task = {
  id: "a",
  type: "translate",
  prompt: "Say good morning.",
  context: "",
  answer: "Καλημέρα",
  hint: "A greeting",
  choices: [],
  pairs: [],
};
const history = (days) => days.map((date) => ({ date }));
test("AI migration carries demonstrated vocabulary, starts streak fresh, never mutates the v1 source", () => {
  const v1 = fresh();
  v1.vocabulary.hello = { level: 2, due: "2026-10-28", mistakes: 1 };
  v1.history = [{ date: "2026-10-27", lesson: "hellos", correct: 2, total: 4 }];
  const raw = JSON.stringify(v1),
    store = new Map([[KEY, raw]]),
    state = loadLearning({ getItem: (k) => store.get(k) }).state;
  assert.equal(state.legacyKnowledge.length, 1);
  assert.equal(state.legacyKnowledge[0].greek, "Γεια σου");
  const p = newProfile(state.legacyKnowledge);
  assert.deepEqual(p.history, []);
  assert.equal(store.get(KEY), raw);
  assert.ok(!store.has(AI_KEY));
});
test("v2 round trip preserves assessed feedback and unfinished exercise without double completion", () => {
  const state = freshLearning(),
    p = newProfile();
  state.profiles[id] = p;
  p.survey = student;
  p.memory = note;
  p.session = newSession(p);
  p.session.phase = "feedback";
  p.session.exercises = [task];
  p.session.pending = {
    correct: false,
    explanation: "Remember the accent.",
    correction: "Καλημέρα",
    knowledge: [],
  };
  p.session.results = [
    { exercise: task, answer: "καλημερα", assessment: p.session.pending },
  ];
  const read = parseLearning(JSON.stringify(state));
  assert.equal(read.profiles[id].session.pending.correct, false);
  const done = completeSession(read.profiles[id], "2026-10-27");
  assert.equal(done.history.length, 1);
  assert.equal(completeSession(done, "2026-10-27").history.length, 1);
});
test("corrupt new saves do not fall back silently to a readable old backup", () => {
  const store = new Map([
    [AI_KEY, "{bad"],
    [KEY, JSON.stringify(fresh())],
  ]);
  const result = loadLearning({ getItem: (k) => store.get(k) });
  assert.ok(result.error);
  assert.equal(store.get(AI_KEY), "{bad");
  assert.throws(() =>
    parseLearning(
      JSON.stringify({
        ...freshLearning(),
        profiles: { [id]: { ...newProfile(), session: { phase: "exercise" } } },
      }),
    ),
  );
});
test("a freeze is spent once per active run and does not count as a study day", () => {
  assert.deepEqual(
    streakInfo(history(["2026-10-25", "2026-10-27"]), "2026-10-27"),
    { count: 2, frozen: ["2026-10-26"] },
  );
  assert.deepEqual(
    streakInfo(
      history(["2026-10-23", "2026-10-25", "2026-10-27"]),
      "2026-10-27",
    ),
    { count: 1, frozen: [] },
  );
  assert.equal(streakInfo(history(["2026-10-25"]), "2026-10-27").count, 1);
  assert.equal(streakInfo(history(["2026-10-24"]), "2026-10-27").count, 0);
  assert.equal(
    streakInfo(
      history(["2026-10-25", "2026-10-27", "2026-10-27"]),
      "2026-10-29",
    ).count,
    0,
  );
  assert.equal(
    weekDays(history(["2026-10-25", "2026-10-27"]), "2026-10-27")[0].state,
    "frozen",
  );
});
test("exercise contracts reject unusable AI output and require exactly three tasks", () => {
  assert.equal(exercise(task).type, "translate");
  assert.throws(() => exercise({ ...task, type: "audio" }));
  assert.throws(() =>
    exercise({ ...task, type: "choice", choices: ["A", "B"] }),
  );
  assert.throws(() =>
    exercise({
      ...task,
      type: "match",
      pairs: [
        { left: "a", right: "x" },
        { left: "a", right: "y" },
      ],
    }),
  );
  assert.throws(() =>
    block({ title: "Hi", memory: note, complete: false, exercises: [task] }),
  );
  assert.equal(
    block({ title: "Done", complete: true, memory: note, exercises: [] }, true)
      .complete,
    true,
  );
  assert.throws(() => assessment({ correct: "yes" }));
});
test("teacher context contains survey, specific evidence and current lesson feedback", () => {
  const p = newProfile([
    { greek: "Γεια σου", english: "Hello", strength: 1, mistakes: 2 },
  ]);
  p.survey = student;
  p.memory = note;
  p.session = newSession(p);
  p.session.comments = [{ at: 0, text: "Slower please" }];
  const ctx = tutorContext(p);
  assert.equal(ctx.student.goals, "Visit Greece");
  assert.equal(ctx.knowledge[0].mistakes, 2);
  assert.equal(ctx.session.comments[0].text, "Slower please");
  assert.equal(
    mergeKnowledge(p.knowledge, [{ ...p.knowledge[0], strength: 2 }]).length,
    1,
  );
});
test("survey progress survives a backup and invalid steps are rejected", () => {
  const state = freshLearning();
  state.profiles[id] = newProfile();
  state.profiles[id].onboarding = { step: 3, values: student };
  assert.equal(
    parseLearning(JSON.stringify(state)).profiles[id].onboarding.step,
    3,
  );
  state.profiles[id].onboarding.step = 10;
  assert.throws(() => parseLearning(JSON.stringify(state)));
});
