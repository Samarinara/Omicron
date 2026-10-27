# Omicron

A quiet place to learn a little Modern Greek each day. Rounded purple UI, compact navigation, and focused study screens, based on Sam’s Editorial Studio and Beagle.

## Run locally

Requires Node.js 22 or later. No packages, API keys, or database are required.

```sh
npm run dev
```

Open http://localhost:3000. Run `npm test` for the learning and storage tests, `npm run check` for JavaScript syntax checks, and `npm run build` to create `dist/`.

## Deploy on Vercel

1. Import `Samarinara/Omicron` into Vercel.
2. Use the repository root. Framework preset: Other.
3. Build command: `npm run build`. Output directory: `dist`.
4. Deploy. No environment variables are needed.

`vercel.json` contains the build configuration and security headers. The application uses hash routes, so refreshing any lesson or section works without rewrites. There is no server dependency, tracking, external font request, or paid API call. Vercel hosting remains subject to your plan’s limits.

## Learning

- 12 starter lessons, 48 phrase entries, and the 24-letter Greek alphabet.
- Introductions, polite and informal greetings, cafés, conversation, directions, food, numbers, and time.
- Guided phrase introductions, meaning questions, and written Greek recall.
- On-screen Greek letter keys and optional pronunciation approximations.
- Device speech synthesis uses an installed Greek voice. If none exists, Omicron explains this rather than playing another language’s voice.
- Review intervals of 1, 3, 7, 14, 30, and 60 days. A mistake returns the phrase to the next day’s review.
- Lessons can include due review phrases. The 5, 7, and 10 minute settings vary the review count; these are estimates, not timed requirements.
- A streak counts distinct local calendar days with a completed lesson. More lessons on the same day do not inflate it. Yesterday’s streak remains active until the end of today.
- No lesson locks. Repeat a lesson or choose another at any time.
- Phrasebook search, learned and due filters, activity history, accuracy, light and dark themes.

## ChatGPT subscription access

**Direct ChatGPT sign-in and in-app subscription inference are not enabled.** A public source repository alone does not qualify its remotely hosted Vercel deployment for the local-app authorization flow.

As checked on October 27, 2026, OpenAI’s website sign-in flow requires a registered OAuth client, and remotely hosted subscription access requires OpenAI approval. The open-source plan-usage flow documented for local apps is a different integration. Do not reuse Codex credentials, embed tokens in frontend code, or represent a normal ChatGPT link as authentication.

Current working flow:

1. Open **ChatGPT** inside Omicron and select a lesson focus.
2. Copy the lesson brief. It contains practiced and weak phrases and the chosen lesson length. Nothing is sent automatically.
3. Open ChatGPT and paste it using your existing ChatGPT account.
4. Copy the returned JSON into Omicron, or choose the JSON file.
5. Import the lesson. It appears under **Lessons → Your lessons** and uses the same exercises, review schedule, local storage, and streak logic as starter lessons.

Imports validate the structure, lengths, phrase count, and duplicate Greek phrases. Generated language can still contain mistakes. Review the lesson before studying it. The app renders imported strings as text.

Official references:

- https://developers.openai.com/siwc/quickstart
- https://developers.openai.com/siwc/website
- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/siwc/request-client-id

A future approved hosted integration needs server-side OAuth code exchange, PKCE, nonce and issuer validation, one-time transaction storage, secure sessions, and separately authorized plan usage. Keep tokens out of `localStorage`. This repository deliberately does not ship a pretend sign-in flow or an unapproved inference proxy.

## Local data

All learning data stays in this browser’s `localStorage`, under `omicron.progress.v1`. Lessons, answer feedback, typed answer drafts, unfinished sessions, preferences, review dates, and history persist on the same origin. Different browsers, devices, Vercel previews, and domains have separate data. The app has no cloud sync.

Use **Settings → Export backup** before clearing browser data or changing domains. **Restore backup** validates a v1 backup and asks before replacing existing progress. Restoration preserves finished progress and starts with no unfinished session. Unreadable original storage remains untouched until you explicitly choose to replace it. Export it first for recovery. If storage is unavailable or full, the app explains that progress is not saved.

The current device timezone determines each study date. Existing history retains its recorded calendar dates when travelling. Clearing or editing browser storage can change a local streak.

## Accessibility and motion

Semantic controls, native modal dialogs, keyboard focus styles, reduced-motion support, responsive layouts, and no autoplay. Number keys 1 through 4 answer a meaning question. Enter continues after feedback, and `/` focuses phrasebook search. View transitions use short fades with no bounce. Browsers without the View Transitions API use immediate updates.

## Source layout

- `src/data.js`: starter content and alphabet.
- `src/core.js`: dates, streaks, spacing, storage validation, and lesson import contract.
- `src/app.js`: navigation and learning interface.
- `src/style.css`: shared design tokens and responsive styles.
- `scripts/`: dependency-free development server and static build.
- `tests/core.test.mjs`: date, learning, backup, and import checks.

No secrets or user progress belong in Git.
