# All Tracker

## Local development

Install dependencies and start the Next.js development server:

```bash
npm install
npm run dev
```

The public timeline is available at `http://localhost:3000/`, and the daily overview is at `http://localhost:3000/daily`.

Run the focused smoke test with `npm run test -- src/app/page.test.tsx`. Run the full test suite with `npm test`, and create a production build with `npm run build`.

Copy `.env.example` to `.env.local` and fill in the Firebase values before adding Firebase-backed functionality. OpenRouter variables are optional for local development.
