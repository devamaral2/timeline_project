# Remove Current Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the current user-facing frontend and leave the Next.js app serving only a minimal `Hello World` page.

**Architecture:** Keep the App Router shell intact with the existing root layout and a single static home page. Remove current frontend pages, components, hooks, and client-only helpers that are no longer referenced, while preserving the backend API and domain layers.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Testing Library

## Global Constraints

- Keep the project as a valid Next.js App Router application with a root `layout.tsx` and a public `page.tsx`.
- Do not modify unrelated dirty-worktree files outside the current frontend cleanup scope.
- Preserve `src/app/api` and `src/models` backend/domain code.
- Use test-first for the home page behavior change.

---

### Task 1: Replace the Home Route With a Placeholder

**Files:**
- Modify: `src/app/page.test.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: existing root route component export from `src/app/page.tsx`
- Produces: a synchronous default-exported page component that renders a `Hello World` heading

- [ ] **Step 1: Write the failing test**

```tsx
test("renders the hello world placeholder", () => {
  render(<TimelinePage />);

  expect(
    screen.getByRole("heading", { level: 1, name: /hello world/i }),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/app/page.test.tsx`
Expected: FAIL because the current page still renders the timeline UI instead of `Hello World`

- [ ] **Step 3: Write minimal implementation**

```tsx
export default function TimelinePage() {
  return (
    <main>
      <h1>Hello World</h1>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/app/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/page.test.tsx
git commit -m "refactor: replace frontend shell with hello world"
```

### Task 2: Remove Unused Frontend Files and References

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `README.md`
- Delete: `src/app/daily/page.tsx`
- Delete: `src/components/auth/google-sign-in-button.tsx`
- Delete: `src/components/events/event-card.test.tsx`
- Delete: `src/components/events/event-card.tsx`
- Delete: `src/components/events/event-form.test.tsx`
- Delete: `src/components/events/event-form.tsx`
- Delete: `src/components/events/event-type-select.tsx`
- Delete: `src/components/events/food-fields.tsx`
- Delete: `src/components/events/interruption-list.tsx`
- Delete: `src/components/events/sleep-fields.tsx`
- Delete: `src/components/events/tag-combobox.tsx`
- Delete: `src/components/events/training-fields.tsx`
- Delete: `src/components/providers/app-providers.tsx`
- Delete: `src/hooks/use-auth-session.ts`
- Delete: `src/hooks/use-tag-suggestions.ts`
- Delete: `src/hooks/use-timeline-events.ts`
- Delete: `src/lib/firebase/client-app.test.ts`
- Delete: `src/lib/firebase/client-app.ts`
- Delete: `src/lib/firebase/client-auth.ts`

**Interfaces:**
- Consumes: current layout wrapper, README route docs, and frontend-only modules
- Produces: a minimal app shell with no references to the removed frontend implementation

- [ ] **Step 1: Write the failing verification**

```bash
npm run build
```

Expected: currently PASS before cleanup; after file deletion any missed import will break the build

- [ ] **Step 2: Remove frontend references and files**

```tsx
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

```md
Open `http://localhost:3000/` to see the temporary `Hello World` page.
```

- [ ] **Step 3: Run focused tests and build**

Run: `npm run test -- src/app/page.test.tsx`
Expected: PASS

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add README.md src/app src/components src/hooks src/lib/firebase
git commit -m "refactor: remove current frontend implementation"
```
