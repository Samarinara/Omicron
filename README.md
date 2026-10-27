# Omicron

Modern Greek lessons that learn how you learn. Omicron uses your ChatGPT plan through OpenAI’s supported open-source Sign in with ChatGPT flow. Learning progress stays in your browser; OAuth credentials stay in protected files on your computer.

## Run

Requires Node.js 22 or later and an eligible ChatGPT account with plan usage enabled.

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:3000** and choose **Continue with ChatGPT**. No API key, client secret, borrowed client ID, database, or paid Omicron service is required. OpenAI’s account eligibility and plan limits apply. `localhost` redirects to the loopback address required by OpenAI.

Use `npm run dev -- --port 3741` for another port. Browser progress is separate for each origin, including port; export a backup before changing origins. The OAuth callback path stays `/auth/callback`.

## Learning

- A five-step first-use survey records goals, level, alphabet familiarity, experience, interests, challenges, preferences, accommodations, deadlines, and target duration.
- The home screen contains a streak, Monday–Sunday day circles, and a compound start/customize button. The duration slider spans 3–30 minutes; durations are targets, translated into an estimated exercise count, not timers.
- The tutor generates three exercises at a time, evaluates each answer, and uses the results to plan the next three. It accepts valid alternative answers and applies progressively stricter spelling, accent, grammar, and register expectations at higher levels.
- Ten text exercise formats: translation, cloze, multiple choice, word order, matching, reading, dialogue, error correction, writing, and short teaching notes. No listening or speaking yet.
- Comments and quick feedback replace unanswered exercises immediately. Assessed work is preserved. Feedback at the end updates the final teacher handover.
- Settings contains the account, current account-specific model catalog, usage link, survey, editable teacher notes, vocabulary evidence, and backups.
- Teacher context includes the survey, demonstrated vocabulary, strengths, needs, next goals, previous teacher handover, current answers, and comments. This is sent to OpenAI for lesson requests. ChatGPT conversation history and memory are not imported.
- Lesson failures preserve the session and offer retry, save for next time, or quit. Usage-limit errors link to ChatGPT’s usage settings. No automatic billing fallback or background lesson generation.
- A completed lesson adds one study day; repeated lessons on the same date do not increase the streak. One missed day per active streak is frozen and dotted, without adding a day. A second missed day breaks that run. Today remains open until local midnight.

AI-generated Greek and grading can contain errors. Use the comment control to ask for a correction or explanation.

## Authentication and hosting

This implementation follows the **local open-source** flow, not the separately approved hosted website flow:

1. Persist an opaque host ID on the user’s computer.
2. Begin dynamic registration with `dynamic_agent_client`, Omicron’s own name, fresh state, nonce, and PKCE, and an HTTP `127.0.0.1` callback.
3. Exchange the code using the newly issued client ID. Validate the ID token’s signature, issuer, audience, expiry, and nonce. Returning sign-ins reuse the saved registration and verify the account identity.
4. Check granted ChatGPT plan scopes separately from identity.
5. Store credentials atomically with owner-only permissions under `~/.config/omicron/chatgpt.json` (directory `0700`, file `0600`). `OMICRON_CONFIG_DIR` can select another user-controlled local directory. Never commit that directory or put it on shared storage.
6. Fetch the account’s eligible models; call `https://api.openai.com/v1/responses` with `store: false`, `stream: true`, and complete context. Treat only `response.completed` as success.
7. Serialize rotating-token refresh. A runtime lock prevents two processes from using the same credential directory. On sign-out, attempt renewable-session revocation, clear local tokens, and retain only the account/client mapping and host ID. If remote revocation cannot be confirmed, the UI explains how to disconnect in ChatGPT Settings.

Browser cookies hold only a local application session identifier. OAuth tokens never reach browser storage, frontend code, backups, or logs. Sessions are in memory; restarting the local runtime requires continuing with a saved ChatGPT account. The runtime binds only to `127.0.0.1`, validates the Host and mutation Origin, requires a CSRF token, and does not serve source outside frontend assets.

**Vercel:** `npm run build` still produces a static `dist/`. A hosted build shows the redesigned welcome screen and local-run instructions. It does not pretend to authenticate or proxy subscription requests through shared hosting. Hosted identity sign-in needs a registered OAuth client, and remotely hosted plan usage requires the arrangement described by OpenAI. This local implementation must not be deployed as a public credential proxy.

Official references, checked October 27, 2026:

- [Sign in with ChatGPT](https://developers.openai.com/siwc)
- [Local plan usage overview](https://developers.openai.com/siwc/token-sharing-open-source)
- [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [UI/UX guidelines](https://developers.openai.com/siwc/ui-ux-guidelines)
- [Hosted website integration](https://developers.openai.com/siwc/website)

ChatGPT sign-in marks in `public/chatgpt-*.svg` come from OpenAI’s official sign-in button assets.

## Local data and backups

New data uses `omicron.learning.v2` in browser `localStorage`. Learning profiles are separated by verified issuer, subject, and client registration. Browser data is not synced to another browser or device.

Existing v1 saves and backups remain readable. Demonstrated vocabulary, strength, and mistakes carry forward to the first new learner profile; old streaks do not. The original v1 storage remains untouched. Preset lessons are no longer shown. Original v1 backups can still be used with the old app, while the redesigned app exports v2 backups.

V2 backups preserve surveys, teacher notes, vocabulary, history, and unfinished sessions across accounts. Account IDs are opaque hashes; backups contain no OAuth credentials. Signing in with the corresponding account restores access to its imported profile.

Unreadable data is never overwritten automatically. Settings can export the original bytes before explicitly replacing it. If storage is full or unavailable, the app stays usable in memory and offers export. A saved lesson can be resumed after retrying a failed request; quitting keeps already recorded vocabulary evidence without awarding a streak day.

## Checks

```sh
npm test
npm run check
npm run build
```

Tests cover legacy backups, v2 migration and resume, one-day freezes, exercise contracts, adaptive request construction, OAuth state/nonce/client validation, protected credential files, refresh serialization, revocation, and streamed Responses success/failure handling. Authentication tests use locally signed fixture tokens and mocked provider responses; they do not use real credentials or spend ChatGPT usage.

Responsive layouts, keyboard controls, light/dark mode, browser back/forward navigation, smooth transitions, and reduced-motion support are preserved. There is no autoplay, analytics, cloud progress store, or required paid infrastructure.
