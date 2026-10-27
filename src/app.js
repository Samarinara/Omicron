import {
  AI_KEY,
  LEVELS,
  loadLearning,
  parseLearning,
  newProfile,
  survey,
  newSession,
  mergeKnowledge,
  completeSession,
  streakInfo,
  weekDays,
  tutorContext,
  assessment,
  block,
} from "./learning.js";

const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  sun: "M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  moon: "M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10",
  settings: "M4 7h16M4 17h16M9 4v6m6 4v6",
  arrow: "m9 5 7 7-7 7M4 12h12",
  close: "m6 6 12 12M6 18 18 6",
  check: "m5 12 4 4L19 6",
  comment: "M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0ZM7 9h10M7 13h6",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z",
  back: "m15 5-7 7 7 7M8 12h12",
  help: "M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  download: "M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5",
  lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5Z",
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.spark}"/></svg>`;
const boot = (() => {
  try {
    return loadLearning(localStorage);
  } catch {
    return {
      state: { version: 2, theme: "light", profiles: {}, legacyKnowledge: [] },
      error: "Storage is unavailable. Export a backup before closing this tab.",
    };
  }
})();
let state = boot.state,
  storageError = boot.error || "",
  connection = { local: false, account: null, accounts: [] },
  loading = true,
  busy = false,
  models = [],
  selectedModel = "",
  route = location.hash.slice(1) || "home",
  requestController = null,
  toastTimer;
const profile = () =>
  connection.account ? state.profiles[connection.account.id] : null;
function save() {
  if (storageError) return;
  try {
    localStorage.setItem(AI_KEY, JSON.stringify(state));
  } catch {
    storageError =
      "Storage is full or unavailable. Export a backup in Settings.";
    toast(storageError);
  }
}
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 4500);
}
function go(next) {
  if (location.hash !== `#${next}`) location.hash = next;
  else render();
}
window.addEventListener("hashchange", () => {
  route = location.hash.slice(1) || "home";
  render();
});
async function api(path, body, signal) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body
      ? {
          "Content-Type": "application/json",
          "X-Omicron-CSRF": connection.csrf || "",
        }
      : {},
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error("Omicron’s local runtime is unavailable.");
  }
  if (!response.ok) {
    const e = Error(data.error || "The request could not finish.");
    Object.assign(e, {
      code: data.code,
      requestId: data.requestId,
      detail: data.detail,
      status: response.status,
    });
    throw e;
  }
  return data;
}
function modal(title, body) {
  const d = $("#modal");
  d.innerHTML = `<div class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button class="icon-btn" data-action="close-modal" aria-label="Close">${icon("close")}</button></div>${body}`;
  if (!d.open) d.showModal();
}
function closeModal() {
  $("#modal").close();
}
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) {
    const r = $("#modal").getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeModal();
  }
});
function header() {
  return `<header class="topbar"><a class="brand" href="#home" aria-label="Omicron home"><span class="brandmark" aria-hidden="true">ο</span>omicron<span class="brand-dot" aria-hidden="true">.</span></a><nav class="top-actions" aria-label="Main navigation"><button class="icon-btn" data-action="theme" aria-label="Switch to ${state.theme === "dark" ? "light" : "dark"} mode">${icon(state.theme === "dark" ? "sun" : "moon")}</button><span class="nav-divider"></span><button class="icon-btn" data-action="settings" aria-label="Settings">${icon("settings")}</button></nav></header>`;
}
function loginView() {
  return `<section class="landing"><div class="greek-orbit" aria-hidden="true"><span class="orbit-letter">α</span><span class="orbit-letter">β</span><span class="orbit-letter">γ</span><span class="orbit-core">ο</span><i></i><i></i><i></i></div><p class="eyebrow">YOUR GREEK. YOUR PACE.</p><h1>A little Greek.<br><span>A little more you.</span></h1><p class="intro">Lessons that learn how you learn.</p><button class="chatgpt-button" data-action="signin" ${busy ? "disabled" : ""}><img class="chatgpt-logo white-logo" src="/chatgpt-white.svg" alt=""><img class="chatgpt-logo black-logo" src="/chatgpt-black.svg" alt=""><span>${busy ? "Opening ChatGPT…" : "Continue with ChatGPT"}</span>${icon("arrow")}</button><p class="disclaimer">By signing in with ChatGPT you agree that all data shared with Omicron may also be shared with OpenAI</p><span class="language-label"><span lang="el">Ελληνικά</span><i></i>Modern Greek</span></section>`;
}
function homeView() {
  const p = profile(),
    info = streakInfo(p.history),
    days = weekDays(p.history);
  return `<section class="home"><p class="eyebrow">A LITTLE MORE, EVERY DAY</p><div class="streak-number" aria-label="${info.count} day streak">${info.count}<span>day${info.count === 1 ? "" : "s"} in a row</span></div><div class="week" aria-label="This week">${days.map((d) => `<div class="week-day"><span>${d.label}</span><div class="day-circle ${d.state}" aria-label="${d.day}: ${d.state === "complete" ? "lesson complete" : d.state === "frozen" ? "streak frozen" : d.state}">${d.state === "complete" ? icon("check") : d.state === "frozen" ? "·" : d.state === "today" ? "<i></i>" : ""}</div></div>`).join("")}</div><p class="streak-note">${info.frozen.length ? "One pause. Still going." : info.count ? "Keep your Greek close." : "Your next chapter starts here."}</p><div class="start-compound"><button class="primary" data-action="start" ${busy ? "disabled" : ""}>${p.session && p.session.phase !== "done" ? "Continue lesson" : "Start lesson"}${icon("arrow")}</button><button class="primary start-options" data-action="lesson-options" aria-label="Customize lesson">${icon("settings")}</button></div><p class="lesson-detail">${p.survey.minutes} min <span>·</span> Modern Greek</p></section>`;
}
const surveySteps = [
  {
    title: "Let’s start with you.",
    subtitle: "A few details. A better teacher.",
    fields: () =>
      `<label for="s-name">What should we call you?</label><input id="s-name" name="name" maxlength="40" placeholder="Your name" autocomplete="given-name"><label for="s-goals">What would you like to do in Greek?</label><textarea id="s-goals" name="goals" rows="3" maxlength="1500" placeholder="Talk with family, travel, move to Greece…" required></textarea>`,
  },
  {
    title: "Where are you starting?",
    subtitle: "An estimate is enough.",
    fields: () =>
      `<label for="s-level">Your current level</label><select id="s-level" name="level">${LEVELS.map((v, i) => `<option value="${v}">${["Brand new", "A1 · A few basics", "A2 · Everyday exchanges", "B1 · Independent conversation", "B2 · Confident conversation", "C1 · Advanced", "C2 · Proficient"][i]}</option>`).join("")}</select><label for="s-alphabet">How familiar is the Greek alphabet?</label><select id="s-alphabet" name="alphabet"><option>Completely new</option><option>I recognize some letters</option><option>I can read slowly</option><option>I read comfortably</option></select><label for="s-experience">What have you learned already?</label><textarea id="s-experience" name="experience" rows="3" maxlength="1500" placeholder="Classes, apps, family exposure, other languages…"></textarea>`,
  },
  {
    title: "Make it your Greek.",
    subtitle: "Real life makes things stick.",
    fields: () =>
      `<label for="s-interests">What do you enjoy talking about?</label><textarea id="s-interests" name="interests" rows="3" maxlength="1000" placeholder="Food, music, work, books, sport…" required></textarea><label for="s-challenges">What feels difficult?</label><textarea id="s-challenges" name="challenges" rows="3" maxlength="1000" placeholder="Remembering words, grammar, confidence—or not sure yet."></textarea>`,
  },
  {
    title: "How do you learn best?",
    subtitle: "Your tutor can work with that.",
    fields: () =>
      `<label for="s-preferences">What helps you learn?</label><textarea id="s-preferences" name="preferences" rows="3" maxlength="1000" placeholder="Examples first, grammar explanations, repetition, a challenge…"></textarea><label for="s-accessibility">Anything we should adapt for you? <span class="optional">Optional</span></label><textarea id="s-accessibility" name="accessibility" rows="2" maxlength="1000" placeholder="Reading needs, keyboard support, smaller steps…"></textarea><label for="s-schedule">Any goal or date to work toward? <span class="optional">Optional</span></label><input id="s-schedule" name="schedule" maxlength="500" placeholder="A trip in June, a daily habit…">`,
  },
  {
    title: "A little time for Greek.",
    subtitle: "Set a target. Change it anytime.",
    fields: () =>
      durationField("minutes", profile()?.onboarding?.values.minutes || 7) +
      `<div class="survey-ready">${icon("spark")}<p>Your tutor will start here and adapt as you go.</p></div>`,
  },
];
function defaultSurvey() {
  return {
    name: connection.account?.name || "",
    level: "New",
    minutes: 7,
    goals: "",
    experience: "",
    interests: "",
    challenges: "",
    preferences: "",
    accessibility: "",
    alphabet: "Completely new",
    schedule: "",
  };
}
function surveyView() {
  const p = profile();
  p.onboarding ??= { step: 0, values: defaultSurvey() };
  const step = p.onboarding.step,
    s = surveySteps[step];
  return `<section class="survey"><div class="survey-progress" aria-label="Step ${step + 1} of 5">${surveySteps.map((_, i) => `<i class="${i <= step ? "active" : ""}"></i>`).join("")}</div><p class="eyebrow">GETTING TO KNOW YOU · ${step + 1} / 5</p><h1>${s.title}</h1><p class="survey-subtitle">${s.subtitle}</p><form id="survey-form">${s.fields()}<div class="survey-actions">${step ? `<button type="button" class="quiet" data-action="survey-back">${icon("back")}Back</button>` : "<span></span>"}<button class="primary" type="submit">${step === 4 ? "Let’s begin" : "Continue"}${icon("arrow")}</button></div></form></section>`;
}
function durationField(name, value) {
  return `<div class="duration"><output for="${name}" id="duration-output">${value}<small>minutes</small></output><input id="${name}" name="${name}" type="range" min="3" max="30" step="1" value="${value}" aria-label="Target lesson duration"><div class="range-labels"><span>3 min</span><span>30 min</span></div></div>`;
}
function taskInput(e, s) {
  if (e.type === "teach")
    return `<p class="teach-note">Take a moment. Say it to yourself.</p>`;
  if (e.type === "choice")
    return `<div class="answers">${e.choices.map((c, i) => `<button type="button" class="answer ${s.draft === c ? "selected" : ""}" data-choice="${i}" aria-pressed="${s.draft === c}" ${s.pending ? "disabled" : ""}><kbd>${i + 1}</kbd><span>${esc(c)}</span>${s.draft === c ? icon("check") : ""}</button>`).join("")}</div>`;
  if (e.type === "order")
    return `<div class="tile-answer" aria-label="Your sentence">${s.tiles.length ? s.tiles.map((i, pos) => `<button type="button" data-remove-tile="${pos}" ${s.pending ? "disabled" : ""}>${esc(e.choices[i])}</button>`).join("") : "<span>Build your sentence</span>"}</div><div class="word-tiles">${e.choices.map((w, i) => `<button type="button" data-tile="${i}" ${s.tiles.includes(i) || s.pending ? "disabled" : ""}>${esc(w)}</button>`).join("")}</div>`;
  if (e.type === "match") {
    let selected = {};
    try {
      selected = JSON.parse(s.draft || "{}");
    } catch {}
    return `<div class="match-pairs">${e.pairs
      .map(
        (pair, i) =>
          `<label><span lang="el">${esc(pair.left)}</span><select data-pair="${i}" aria-label="Meaning of ${esc(pair.left)}" ${s.pending ? "disabled" : ""}><option value="">Choose a meaning</option>${[
            ...e.pairs,
          ]
            .reverse()
            .map(
              (p) =>
                `<option ${selected[i] === p.right ? "selected" : ""}>${esc(p.right)}</option>`,
            )
            .join("")}</select></label>`,
      )
      .join("")}</div>`;
  }
  return `<label class="sr-only" for="written-answer">Your answer</label><textarea id="written-answer" name="answer" rows="3" maxlength="4000" placeholder="Your answer…" autocomplete="off" spellcheck="false" ${s.pending ? "disabled" : ""}>${esc(s.draft)}</textarea>${
    ["translate", "cloze", "dialogue", "correct", "write"].includes(e.type)
      ? `<details class="keyboard"><summary>Greek keyboard</summary><div>${"αβγδεζηθικλμνξοπρσςτυφχψωάέήίόύώΐΰ"
          .split("")
          .map(
            (l) =>
              `<button type="button" data-letter="${l}" ${s.pending ? "disabled" : ""}>${l}</button>`,
          )
          .join("")}</div></details>`
      : ""
  }`;
}
const typeLabels = {
  translate: "Make it Greek",
  cloze: "Fill the gap",
  choice: "Choose an answer",
  order: "Build a sentence",
  match: "Find the pairs",
  reading: "Read & understand",
  dialogue: "Your turn to speak",
  correct: "Spot the mistake",
  write: "Put it into words",
  teach: "A little discovery",
};
function lessonView() {
  const p = profile(),
    s = p.session;
  if (!s) return homeView();
  if (s.phase === "done")
    return `<section class="completion"><div class="completion-mark">${icon("check")}</div><p class="eyebrow">A LITTLE MORE GREEK, YOURS.</p><h1>Look at you go.</h1><p>${esc(p.memory.summary || "One more step toward your goals.")}</p><div class="completion-stats"><div><strong>${s.results.filter((r) => r.assessment.correct && r.exercise.type !== "teach").length}<small>correct answers</small></strong></div><div><strong>${streakInfo(p.history).count}<small>day streak</small></strong></div></div><button class="primary" data-action="home">Lovely. See you soon.${icon("arrow")}</button></section>`;
  if (s.phase === "error") return errorView(s);
  if (["planning", "grading", "adjusting"].includes(s.phase))
    return `<section class="thinking" aria-live="polite"><div class="thinking-mark" aria-hidden="true">ο<span></span></div><h1>${s.phase === "grading" ? "A moment to think." : s.phase === "adjusting" ? "A little course correction." : "A lesson, just for you."}</h1><p>${s.phase === "grading" ? "Your tutor is reading your answer." : "Putting your next steps together."}</p><button class="text-btn" data-action="save-exit">Save & leave</button></section>`;
  const e = s.exercises[s.index];
  if (!e)
    return `<section class="thinking"><h1>Ready for your next step?</h1><button class="primary" data-action="resume">Continue${icon("arrow")}</button></section>`;
  return `<section class="lesson"><div class="lesson-top"><button class="icon-btn" data-action="leave" aria-label="Leave lesson">${icon("close")}</button><span>${esc(s.title)}</span><small>${Math.min(s.results.length, s.target)} / ${s.target}</small></div><progress class="lesson-progress" max="${s.target}" value="${s.results.length}" aria-label="Lesson progress"></progress><div class="exercise" data-exercise-id="${esc(e.id)}"><p class="eyebrow">${typeLabels[e.type]}</p><h1>${esc(e.prompt)}</h1>${e.context ? `<div class="exercise-context" ${/[α-ωΑ-Ω]/.test(e.context) ? 'lang="el"' : ""}>${esc(e.context)}</div>` : ""}<form id="answer-form">${taskInput(e, s)}${s.pending ? `<div class="feedback ${s.pending.correct ? "positive" : "negative"}" role="status"><span class="feedback-symbol">${icon(s.pending.correct ? "check" : "spark")}</span><div><strong>${e.type === "teach" ? "A new little building block." : s.pending.correct ? "Nicely done." : "Nearly. Let’s take a look."}</strong><p>${esc(s.pending.explanation)}</p>${s.pending.correction ? `<p class="correction" lang="el">${esc(s.pending.correction)}</p>` : ""}</div></div>` : ""}<div class="answer-actions">${e.hint && !s.pending ? `<button class="text-btn" type="button" data-action="hint">${icon("help")}A hint</button>` : "<span></span>"}<div class="submit-group"><button type="button" class="comment-button" data-action="comment" aria-label="Give your tutor feedback">${icon("comment")}</button>${s.pending ? `<button type="button" class="primary" data-action="next">Continue${icon("arrow")}</button>` : `<button type="submit" class="primary">${e.type === "teach" ? "Got it" : "Submit"}${icon(e.type === "teach" ? "arrow" : "check")}</button>`}</div></div></form><p class="plan-label">Using ChatGPT plan <span>·</span> <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">Manage usage</a></p></div></section>`;
}
function errorView(s) {
  const limit = s.error?.code === "subscription_sharing_usage_limit_exceeded";
  return `<section class="error-screen"><div class="tangled" aria-hidden="true">${icon("spark")}<span>;</span></div><p class="eyebrow">${limit ? "TIME FOR A BREATHER" : "A SMALL GREEK TRAGEDY"}</p><h1>${limit ? "Your tutor needs a pause." : "We lost our train of thought."}</h1><p>${esc(errorMessage(s.error))}</p>${limit ? '<a class="primary" href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">Manage usage</a>' : '<button class="primary" data-action="resume">Let’s try again' + icon("arrow") + "</button>"}<div class="error-actions"><button class="quiet" data-action="save-exit">Save for next time</button><button class="text-btn" data-action="quit">Quit lesson</button></div>${s.error?.requestId ? `<small class="request-id">Request ${esc(s.error.requestId)}</small>` : ""}</section>`;
}
function errorMessage(e) {
  const messages = {
    subscription_sharing_usage_limit_exceeded:
      "A ChatGPT plan or app usage limit was reached. Your lesson can wait.",
    subscription_sharing_user_not_eligible:
      "This account or workspace is not eligible for ChatGPT plan usage.",
    plan_permission_required:
      "Enable ChatGPT plan usage in Settings to continue.",
    subscription_sharing_usage_unavailable:
      "ChatGPT usage could not be checked. Save your place and try later.",
    subscription_sharing_unsupported_capability:
      "ChatGPT cannot run this request. Your place is safe.",
    subscription_sharing_route_not_supported:
      "ChatGPT could not accept this integration’s request.",
    subscription_sharing_invalid_user:
      "Your ChatGPT connection needs attention. Sign in again in Settings.",
  };
  return (
    messages[e?.code] ||
    e?.message ||
    "Your place is safe. We can pick this up later."
  );
}
function render() {
  document.documentElement.dataset.theme = state.theme;
  let view;
  if (loading)
    view =
      '<section class="thinking"><div class="thinking-mark" aria-label="Loading Omicron">ο</div></section>';
  else if (!connection.account) view = loginView();
  else if (!profile()?.survey) view = surveyView();
  else
    view = route === "lesson" && profile().session ? lessonView() : homeView();
  const draw = () => {
    $("#app").innerHTML =
      header() +
      `<main id="main" tabindex="-1">${storageError ? `<div class="storage-alert" role="alert">${esc(storageError)} <button data-action="settings">Settings</button></div>` : ""}${view}</main>`;
    if (profile()?.onboarding && !profile()?.survey) fillSurvey();
  };
  if (
    document.startViewTransition &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches &&
    !loading
  ) {
    const transition = document.startViewTransition(draw);
    // Rapid state updates can skip a visual transition while still updating the DOM.
    transition.ready.catch(() => {});
  } else draw();
}
function fillSurvey() {
  const values = profile().onboarding.values;
  for (const el of $("#survey-form")?.elements || [])
    if (el.name && values[el.name] !== undefined) el.value = values[el.name];
}
function captureSurvey() {
  const p = profile();
  for (const el of $("#survey-form")?.elements || [])
    if (el.name)
      p.onboarding.values[el.name] =
        el.type === "range" ? Number(el.value) : el.value;
  save();
}
async function init() {
  try {
    const response = await fetch("/api/session");
    if (response.status === 404) {
      connection = { local: false, account: null, accounts: [] };
    } else if (!response.ok) throw Error("The local runtime could not start.");
    else connection = await response.json();
  } catch {
    connection = { local: false, account: null, accounts: [] };
  }
  if (connection.account) {
    const id = connection.account.id;
    if (!state.profiles[id]) {
      state.profiles[id] = newProfile(state.legacyKnowledge);
      state.legacyKnowledge = [];
      save();
    }
    const s = profile().session;
    if (s && ["planning", "grading", "adjusting"].includes(s.phase)) {
      s.error = {
        operation:
          s.phase === "grading"
            ? "grade"
            : s.phase === "adjusting"
              ? "adjust"
              : "plan",
        message: "Your lesson is ready to pick up again.",
        code: "",
      };
      s.phase = "error";
      save();
    }
  }
  loading = false;
  render();
  if (connection.notice) toast(connection.notice);
  if (connection.account?.sharing && !profile().welcomed) welcome();
}
function welcome() {
  modal(
    "You’re using your ChatGPT plan.",
    `<p>Eligible lessons use your ChatGPT plan. You control the limits.</p><a class="inline-link" href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">Manage usage ${icon("arrow")}</a><button class="primary full" data-action="welcome">Got it ${icon("check")}</button>`,
  );
}
async function signIn(accountId, consent = false) {
  if (accountId === undefined && connection.accounts?.length) {
    modal(
      "Your ChatGPT account",
      `<p>Pick up where you left off.</p>${connection.accounts.map((a) => `<button class="quiet full" data-action="reconnect" data-account="${esc(a.id)}">${esc(a.email || a.label)} · ${esc(a.label)}</button>`).join("")}<button class="text-btn full" data-action="new-signin">Use another account or workspace</button>`,
    );
    return;
  }
  if (!connection.local) {
    modal(
      "Greek starts on your computer.",
      `<p>ChatGPT plan usage runs through Omicron’s local open-source app.</p><div class="local-command"><code>npm install<br>npm run dev</code></div><p>Open <strong>http://127.0.0.1:3000</strong>, then continue with ChatGPT.</p><a class="inline-link" href="https://developers.openai.com/siwc/token-sharing-open-source" target="_blank" rel="noopener noreferrer">About ChatGPT plan usage ${icon("arrow")}</a>`,
    );
    return;
  }
  if (busy) return;
  busy = true;
  try {
    const data = await api("/api/auth/start", { accountId, consent });
    location.assign(data.url);
  } catch (e) {
    toast(e.message);
    busy = false;
    render();
  }
}
async function loadModels() {
  try {
    models = (await api("/api/models")).models;
    if (!models.some((m) => m.slug === selectedModel))
      selectedModel = models[0]?.slug || "";
    return true;
  } catch (e) {
    toast(e.message);
    return false;
  }
}
function options() {
  const p = profile();
  modal(
    "Your next lesson",
    `<form id="options-form">${durationField("lesson-minutes", p.survey.minutes)}<label for="lesson-focus">A focus? <span class="optional">Optional</span></label><input id="lesson-focus" name="focus" maxlength="1000" placeholder="Let my tutor choose"><button class="primary full" type="submit">Start this lesson ${icon("arrow")}</button>${p.session && p.session.phase !== "done" ? '<p class="footnote">Your saved lesson will be replaced.</p>' : ""}</form>`,
  );
}
function settings() {
  const p = profile();
  modal(
    "A little housekeeping.",
    `${connection.account ? `<div class="account-card"><span class="account-avatar">${icon("spark")}</span><div><strong>${esc(connection.account.name)}</strong><small>${esc(connection.account.email)} · ${esc(connection.account.label)}</small></div></div><p>${connection.account.sharing ? "ChatGPT plan connected." : "ChatGPT plan usage is not enabled."}</p>${!connection.account.sharing ? '<button class="quiet full" data-action="enable-plan">Enable ChatGPT plan usage</button>' : ""}<a class="inline-link" href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">Manage ChatGPT usage ${icon("arrow")}</a><label for="model-picker">Tutor model</label><select id="model-picker"><option value="">${models.length ? "Choose a model" : "Load available models"}</option>${models.map((m) => `<option value="${esc(m.slug)}" ${m.slug === selectedModel ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select><button class="text-btn" data-action="load-models">Refresh available models</button>${p.survey ? `<button class="quiet full" data-action="edit-survey">Learning preferences ${icon("settings")}</button><button class="quiet full" data-action="memory">What your tutor knows ${icon("spark")}</button>` : ""}<button class="text-btn full" data-action="signout">Sign out</button>` : `<p>Your learning stays in this browser.</p>${connection.accounts?.length ? `<label for="saved-account">Saved ChatGPT accounts</label><select id="saved-account">${connection.accounts.map((a) => `<option value="${esc(a.id)}">${esc(a.email || a.label)} · ${esc(a.label)}</option>`).join("")}</select><button class="quiet full" data-action="saved-signin">Continue with saved account</button>` : ""}<button class="quiet full" data-action="signin">Continue with ChatGPT</button>`}<div class="modal-section"><h3>Your data</h3><p>Local to this browser. Export to keep it or move devices.</p><div class="modal-actions"><button class="quiet" data-action="export">${icon("download")}Export backup</button><label class="quiet file-label">Restore backup<input type="file" id="backup-file" accept="application/json,.json"></label></div>${storageError ? `<p class="error-text">${esc(storageError)}</p><button class="quiet" data-action="export-original">Export original data</button><button class="quiet" data-action="recover">Recover saving</button>` : ""}</div>`,
  );
}
function memoryModal() {
  const p = profile();
  modal(
    "Your tutor’s notebook",
    `<p>Background, progress, and what to work on next.</p><form id="memory-form"><label for="memory-summary">Teacher notes</label><textarea id="memory-summary" rows="5" maxlength="3000">${esc(p.memory.summary)}</textarea><label for="memory-strengths">Strengths <span class="optional">One per line</span></label><textarea id="memory-strengths" rows="3" maxlength="15000">${esc(p.memory.strengths.join("\n"))}</textarea><label for="memory-needs">Needs practice</label><textarea id="memory-needs" rows="3" maxlength="15000">${esc(p.memory.needs.join("\n"))}</textarea><label for="memory-goals">Next goals</label><textarea id="memory-goals" rows="3" maxlength="15000">${esc(p.memory.nextGoals.join("\n"))}</textarea><p class="footnote">${p.knowledge.length} vocabulary entries · estimated level ${esc(p.memory.level)}</p><details><summary>Vocabulary & evidence</summary><div class="knowledge-list">${p.knowledge.map((k) => `<p><strong lang="el">${esc(k.greek)}</strong> — ${esc(k.english)}<small>Strength ${k.strength}/6 · ${k.mistakes} mistakes</small></p>`).join("") || "<p>Your tutor will build this as you practise.</p>"}</div></details><button class="primary full" type="submit">Save notes ${icon("check")}</button></form>`,
  );
}
function comment() {
  modal(
    "Tell your tutor.",
    `<form id="comment-form"><div class="comment-chips">${["Too easy", "Too hard", "Explain this", "This seems wrong", "Different topic"].map((v) => `<button class="quiet" type="button" data-comment="${v}">${v}</button>`).join("")}</div><label class="sr-only" for="tutor-comment">Your feedback</label><textarea id="tutor-comment" rows="3" maxlength="2000" placeholder="What would help right now?" required></textarea><button class="primary full" type="submit">Adjust my lesson ${icon("arrow")}</button></form>`,
  );
}
async function tutor(operation) {
  const p = profile(),
    s = p?.session;
  if (!s || busy) return;
  if (!connection.account.sharing) {
    modal(
      "Let your tutor in.",
      `<p>Enable ChatGPT plan usage to build your lesson.</p><button class="primary full" data-action="enable-plan">Continue with ChatGPT</button>`,
    );
    return;
  }
  busy = true;
  s.phase =
    operation === "grade"
      ? "grading"
      : operation === "adjust"
        ? "adjusting"
        : "planning";
  s.error = null;
  save();
  render();
  const accountId = connection.account.id,
    sessionId = s.id;
  const controller = new AbortController();
  requestController = controller;
  try {
    const payload = { context: tutorContext(p) };
    if (operation === "grade") {
      payload.exercise = s.exercises[s.index];
      payload.answer =
        s.exercises[s.index].type === "match"
          ? s.exercises[s.index].pairs
              .map((pair, i) => `${pair.left} = ${JSON.parse(s.draft)[i]}`)
              .join("\n")
          : s.draft;
    }
    const data = await api(
      "/api/tutor",
      { operation, payload, model: selectedModel || undefined },
      controller.signal,
    );
    if (connection.account?.id !== accountId || p.session?.id !== sessionId)
      return;
    if (operation === "grade") {
      const result = assessment(data);
      s.pending = result;
      s.results.push({
        exercise: structuredClone(s.exercises[s.index]),
        answer: payload.answer,
        assessment: result,
      });
      p.knowledge = mergeKnowledge(p.knowledge, result.knowledge);
      s.phase = "feedback";
    } else {
      const complete = operation === "plan" && s.results.length >= s.target,
        result = block(data, complete);
      p.memory = result.memory;
      s.title = result.title;
      if (complete) {
        state.profiles[accountId] = completeSession(p);
      } else {
        const keep =
          operation === "adjust"
            ? s.pending
              ? s.index + 1
              : s.index
            : s.exercises.length;
        s.exercises = [...s.exercises.slice(0, keep), ...result.exercises];
        s.index = keep;
        s.pending = null;
        s.draft = "";
        s.tiles = [];
        s.phase = "exercise";
      }
    }
    save();
    render();
  } catch (e) {
    if (controller.signal.aborted) return;
    s.phase = "error";
    s.error = {
      operation,
      message: e.message,
      code: e.code || "",
      requestId: e.requestId || "",
      detail: e.detail || "",
    };
    save();
    render();
  } finally {
    if (requestController === controller) {
      busy = false;
      requestController = null;
    }
  }
}
function start(options = {}) {
  const p = profile();
  if (p.session && p.session.phase !== "done" && !options.replace) {
    go("lesson");
    if (p.session.phase === "error") return;
    if (["planning", "grading", "adjusting"].includes(p.session.phase))
      resume();
    return;
  }
  p.session = newSession(p, options);
  save();
  closeModal();
  go("lesson");
  tutor("plan");
}
function resume() {
  const s = profile()?.session;
  if (!s) return;
  const operation =
    s.error?.operation ||
    (s.phase === "grading"
      ? "grade"
      : s.phase === "adjusting"
        ? "adjust"
        : "plan");
  go("lesson");
  tutor(operation);
}
function saveExit() {
  const s = profile()?.session;
  if (requestController) {
    requestController.abort();
    requestController = null;
    busy = false;
    if (s) {
      s.error = {
        operation:
          s.phase === "grading"
            ? "grade"
            : s.phase === "adjusting"
              ? "adjust"
              : "plan",
        message: "Ready whenever you are.",
        code: "",
      };
      s.phase = "error";
      save();
    }
  }
  closeModal();
  go("home");
}
function exportData(original = false) {
  let raw = JSON.stringify(state, null, 2);
  if (original) {
    try {
      raw =
        localStorage.getItem(AI_KEY) ||
        localStorage.getItem("omicron.progress.v1") ||
        raw;
    } catch {}
  }
  const url = URL.createObjectURL(
    new Blob([raw], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `omicron-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const actions = {
  "close-modal": closeModal,
  home: () => go("home"),
  theme: () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    save();
    render();
  },
  settings: settings,
  signin: () => signIn(),
  reconnect: (el) => signIn(el.dataset.account),
  "new-signin": () => signIn(null),
  "saved-signin": () => signIn($("#saved-account").value),
  "enable-plan": () => signIn(connection.account.id, true),
  welcome: () => {
    profile().welcomed = true;
    save();
    closeModal();
  },
  start: () => start(),
  "lesson-options": options,
  resume: resume,
  "save-exit": saveExit,
  "survey-back": () => {
    captureSurvey();
    profile().onboarding.step--;
    save();
    render();
  },
  "edit-survey": () => {
    profile().onboarding = {
      step: 0,
      values: structuredClone(profile().survey),
    };
    profile().survey = null;
    save();
    closeModal();
    render();
  },
  "load-models": async () => {
    if (await loadModels()) settings();
  },
  memory: memoryModal,
  hint: () =>
    modal(
      "A little nudge.",
      `<p>${esc(profile().session.exercises[profile().session.index].hint)}</p><button class="primary full" data-action="close-modal">Back to it ${icon("arrow")}</button>`,
    ),
  comment: comment,
  leave: () =>
    modal(
      "Take a breather?",
      `<p>Your place will be here when you’re ready.</p><button class="primary full" data-action="save-exit">Save & leave</button><button class="text-btn full" data-action="close-modal">Keep learning</button>`,
    ),
  next: () => {
    const s = profile().session;
    if (!s.pending) return;
    s.pending = null;
    s.index++;
    s.draft = "";
    s.tiles = [];
    save();
    if (s.index >= s.exercises.length || s.results.length >= s.target)
      tutor("plan");
    else {
      s.phase = "exercise";
      save();
      render();
    }
  },
  quit: () =>
    modal(
      "Leave this lesson behind?",
      `<p>Your completed practice stays in your tutor’s notes. This lesson won’t count toward your streak.</p><button class="primary full" data-action="confirm-quit">Quit lesson</button><button class="text-btn full" data-action="close-modal">Keep my place</button>`,
    ),
  "confirm-quit": () => {
    requestController?.abort();
    requestController = null;
    busy = false;
    profile().session = null;
    save();
    closeModal();
    go("home");
  },
  signout: async () => {
    requestController?.abort();
    requestController = null;
    busy = false;
    try {
      const result = await api("/api/auth/signout", {});
      const refreshed = await api("/api/session");
      connection = refreshed;
      models = [];
      selectedModel = "";
      closeModal();
      go("home");
      render();
      if (!result.revoked)
        toast(
          "Signed out locally. Remote revocation was not confirmed; disconnect Omicron in ChatGPT Settings.",
        );
    } catch (e) {
      toast(e.message);
    }
  },
  export: () => exportData(),
  "export-original": () => exportData(true),
  recover: () => {
    exportData(true);
    modal(
      "Replace saved data?",
      `<p>Keep the original backup before replacing browser data. New progress will then save here.</p><button class="primary full" data-action="confirm-recover">Use current progress</button>`,
    );
  },
  "confirm-recover": () => {
    storageError = "";
    save();
    closeModal();
    render();
  },
};
document.addEventListener("click", (event) => {
  const el = event.target.closest(
    "[data-action],[data-choice],[data-tile],[data-remove-tile],[data-pair],[data-letter],[data-comment]",
  );
  if (!el || el.disabled) return;
  if (el.dataset.action) {
    if (
      busy &&
      ["start", "resume", "lesson-options"].includes(el.dataset.action)
    )
      return;
    Promise.resolve(actions[el.dataset.action]?.(el)).catch((e) =>
      toast(e.message),
    );
    return;
  }
  const s = profile()?.session,
    e = s?.exercises[s.index];
  if (el.dataset.comment) {
    $("#tutor-comment").value = el.dataset.comment;
    $("#tutor-comment").focus();
    return;
  }
  if (!s || s.pending || s.phase !== "exercise") return;
  if (el.dataset.choice !== undefined) {
    s.draft = e.choices[Number(el.dataset.choice)];
    save();
    render();
  } else if (el.dataset.tile !== undefined) {
    const i = Number(el.dataset.tile);
    if (!s.tiles.includes(i)) s.tiles.push(i);
    s.draft = s.tiles.map((i) => e.choices[i]).join(" ");
    save();
    render();
  } else if (el.dataset.removeTile !== undefined) {
    s.tiles.splice(Number(el.dataset.removeTile), 1);
    s.draft = s.tiles.map((i) => e.choices[i]).join(" ");
    save();
    render();
  } else if (el.dataset.letter) {
    const input = $("#written-answer");
    if (input) {
      input.setRangeText(
        el.dataset.letter,
        input.selectionStart,
        input.selectionEnd,
        "end",
      );
      s.draft = input.value;
      save();
      input.focus();
    }
  }
});
document.addEventListener("input", (e) => {
  if (e.target.type === "range") {
    $("#duration-output").innerHTML =
      `${Number(e.target.value)}<small>minutes</small>`;
  }
  if (e.target.id === "written-answer") {
    profile().session.draft = e.target.value;
    save();
  }
  if (e.target.closest("#survey-form")) captureSurvey();
});
document.addEventListener("change", async (e) => {
  if (e.target.dataset.pair !== undefined) {
    const s = profile().session;
    let pairs = {};
    try {
      pairs = JSON.parse(s.draft || "{}");
    } catch {}
    pairs[e.target.dataset.pair] = e.target.value;
    s.draft = JSON.stringify(pairs);
    save();
  }
  if (e.target.id === "model-picker") selectedModel = e.target.value;
  if (e.target.id === "backup-file") {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 10000000) throw Error("Keep backups under 10 MB.");
      const replacement = parseLearning(await file.text());
      modal(
        "Restore this backup?",
        `<p>This replaces current learning data. Download a backup first if you want to keep it.</p><button class="quiet full" data-action="export">Export current data</button><button class="primary full" id="confirm-restore">Restore backup</button>`,
      );
      $("#confirm-restore").onclick = () => {
        requestController?.abort();
        requestController = null;
        busy = false;
        state = replacement;
        if (connection.account && !state.profiles[connection.account.id]) {
          state.profiles[connection.account.id] = newProfile(
            state.legacyKnowledge,
          );
          state.legacyKnowledge = [];
        }
        storageError = "";
        save();
        closeModal();
        go("home");
        render();
      };
    } catch (err) {
      toast(err.message);
    }
  }
});
document.addEventListener("submit", (event) => {
  const form = event.target;
  if (
    ![
      "survey-form",
      "answer-form",
      "comment-form",
      "options-form",
      "memory-form",
    ].includes(form.id)
  )
    return;
  event.preventDefault();
  try {
    if (form.id === "survey-form") {
      captureSurvey();
      const p = profile();
      if (p.onboarding.step < 4) {
        p.onboarding.step++;
        save();
        render();
      } else {
        p.survey = survey(p.onboarding.values);
        p.memory.level = p.survey.level;
        delete p.onboarding;
        save();
        go("home");
        render();
      }
    }
    if (form.id === "options-form") {
      const p = profile(),
        minutes = Number($("#lesson-minutes").value),
        focus = $("#lesson-focus").value;
      p.survey.minutes = minutes;
      start({ minutes, focus, replace: true });
    }
    if (form.id === "answer-form") {
      const s = profile().session,
        e = s.exercises[s.index];
      if (s.pending || busy) return;
      if (e.type === "teach") s.draft = "Understood";
      if (e.type === "match") {
        let pairs = {};
        try {
          pairs = JSON.parse(s.draft);
        } catch {}
        if (e.pairs.some((_, i) => !pairs[i]))
          throw Error("Match each phrase first.");
      }
      if (!s.draft.trim()) throw Error("Give it a try first.");
      tutor("grade");
    }
    if (form.id === "comment-form") {
      const s = profile().session,
        text = $("#tutor-comment").value.trim();
      if (!text) return;
      if (s.comments.length >= 200)
        throw Error(
          "Save this lesson and start a new one to keep adding feedback.",
        );
      s.comments.push({ at: s.results.length, text });
      closeModal();
      save();
      tutor(s.results.length >= s.target ? "plan" : "adjust");
    }
    if (form.id === "memory-form") {
      const p = profile(),
        list = (id) =>
          $(id)
            .value.split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
      const next = {
        ...p.memory,
        summary: $("#memory-summary").value,
        strengths: list("#memory-strengths"),
        needs: list("#memory-needs"),
        nextGoals: list("#memory-goals"),
      };
      if (
        [next.strengths, next.needs, next.nextGoals].some(
          (a) => a.length > 30 || a.some((s) => s.length > 500),
        )
      )
        throw Error("Use up to 30 notes per list, under 500 characters each.");
      p.memory = next;
      save();
      closeModal();
    }
  } catch (e) {
    toast(e.message);
  }
});
document.addEventListener("keydown", (e) => {
  if ($("#modal").open || route !== "lesson" || !profile()?.session) return;
  const s = profile().session;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
  if (e.key === "Enter" && s.pending) {
    e.preventDefault();
    actions.next();
  } else if (
    /^[1-9]$/.test(e.key) &&
    s.exercises[s.index]?.type === "choice" &&
    !s.pending &&
    s.phase === "exercise"
  ) {
    const c = s.exercises[s.index].choices[Number(e.key) - 1];
    if (c) {
      s.draft = c;
      save();
      render();
    }
  }
});
render();
init();
