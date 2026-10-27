import test from "node:test";
import assert from "node:assert/strict";
import { readResponse, buildRequest, runTutor } from "../server/ai.mjs";
import { newProfile, newSession, tutorContext } from "../src/learning.js";
const student = {
  name: "",
  level: "A1",
  minutes: 5,
  goals: "Travel",
  experience: "",
  interests: "Food",
  challenges: "",
  preferences: "",
  accessibility: "",
  alphabet: "Some",
  schedule: "",
};
const note = {
  level: "A1",
  summary: "Greetings",
  strengths: [],
  needs: [],
  nextGoals: [],
};
const task = {
  id: "a",
  type: "translate",
  prompt: "Say hello.",
  context: "",
  answer: "Γεια σου",
  hint: "",
  choices: [],
  pairs: [],
};
const event = (v) => `data: ${JSON.stringify(v)}\n\n`;
const response = (text) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (let i = 0; i < text.length; i += 7)
          c.enqueue(new TextEncoder().encode(text.slice(i, i + 7)));
        c.close();
      },
    }),
  );
const context = () => {
  const p = newProfile();
  p.survey = student;
  p.memory = note;
  p.session = newSession(p);
  return tutorContext(p);
};
test("SSE reader requires response.completed and rejects late usage failures", async () => {
  const data = { correct: true };
  const stream =
    event({ type: "response.output_text.delta", delta: JSON.stringify(data) }) +
    event({ type: "response.completed" });
  assert.deepEqual(await readResponse(response(stream)), data);
  await assert.rejects(
    readResponse(
      response(event({ type: "response.output_text.delta", delta: "{}" })),
    ),
    /connection ended/,
  );
  await assert.rejects(
    readResponse(
      response(
        event({
          type: "response.failed",
          response: {
            error: { code: "subscription_sharing_usage_limit_exceeded" },
          },
        }),
      ),
    ),
    (e) => e.code === "subscription_sharing_usage_limit_exceeded",
  );
  await assert.rejects(
    readResponse(response(event({ type: "response.incomplete" }))),
  );
});
test("admission errors retain HTTP status, provider code, diagnostic and request ID", async () => {
  await assert.rejects(
    readResponse(
      new Response(JSON.stringify({ detail: "Unavailable" }), {
        status: 503,
        headers: { "x-request-id": "req-test" },
      }),
    ),
    (e) =>
      e.status === 503 &&
      e.detail === "Unavailable" &&
      e.requestId === "req-test",
  );
});
test("adaptive planning uses blocks of three and completion only after the target", () => {
  const ctx = context(),
    request = buildRequest("plan", { context: ctx });
  assert.match(request.instructions, /EXACTLY THREE/);
  assert.match(request.instructions, /untrusted learning data/);
  ctx.session.results = Array(ctx.session.target).fill({});
  assert.equal(buildRequest("plan", { context: ctx }).complete, true);
  assert.match(
    buildRequest("adjust", { context: ctx }).instructions,
    /immediate adjustment/,
  );
  assert.throws(() => buildRequest("shell", { context: ctx }));
});
test("Responses request uses approved public endpoint and supported store/stream contract", async () => {
  let request;
  const result = {
    correct: true,
    explanation: "Correct.",
    correction: "",
    knowledge: [],
  };
  await runTutor({
    operation: "grade",
    payload: { context: context(), exercise: task, answer: "Γεια σου" },
    model: "eligible-model",
    token: "test-only",
    fetcher: async (url, init) => {
      request = { url, init };
      return response(
        event({
          type: "response.output_text.delta",
          delta: JSON.stringify(result),
        }) + event({ type: "response.completed" }),
      );
    },
  });
  assert.equal(request.url, "https://api.openai.com/v1/responses");
  const body = JSON.parse(request.init.body);
  assert.equal(body.store, false);
  assert.equal(body.stream, true);
  assert.ok(Array.isArray(body.input));
  assert.equal(body.model, "eligible-model");
  for (const field of [
    "temperature",
    "max_output_tokens",
    "previous_response_id",
    "conversation",
  ])
    assert.ok(!(field in body));
});
