# Omicron contributor notes

Omicron is a static Modern Greek learning app built for Vercel. Keep the build free of required paid services and preserve local-only progress.

Use the purple design tokens in src/style.css. Keep the interface compact, round, and focused. Preserve reduced-motion support and browser back/forward navigation. Avoid autoplay and unnecessary interface text.

Run npm test, npm run check, and npm run build for changes to learning behavior or storage. Keep backup version compatibility. Do not discard unreadable saved data silently. Escape all imported strings before rendering HTML.

Direct ChatGPT sign-in and hosted plan usage require approved OpenAI access. Read the current official documentation before implementing them. Never borrow the Codex client ID or credentials, store OAuth tokens in browser localStorage, or label a handoff link as an authenticated connection.

Check Greek accents, polite forms, and context. Pronunciation approximations are not exact phonetics. Do not fabricate audio playback or AI feedback.
