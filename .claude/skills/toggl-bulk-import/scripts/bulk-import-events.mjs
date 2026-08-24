#!/usr/bin/env node
/**
 * Bulk-imports timeline events (routine | food | training | sleep) into Firestore.
 *
 * Usage:
 *   node bulk-import-events.mjs --input <events.json> [--user-email you@x.com | --user-id UID] [--dry-run]
 *
 * The input JSON must look like:
 *   {
 *     "events": [
 *       { "name": "café da manhã", "type": "food", "startedAt": "2026-08-20T08:00",
 *         "finishedAt": "2026-08-20T08:09", "tags": [] }
 *     ]
 *   }
 *
 * startedAt/finishedAt are NAIVE local wall-clock strings ("YYYY-MM-DDTHH:mm[:ss]")
 * with no timezone offset — they are interpreted in America/Sao_Paulo, matching how
 * the app itself renders/derives event times (see src/lib/timeline/format-date.ts).
 * Do not pre-convert them to UTC; this script does that math the same way the app does.
 *
 * --dry-run performs zero network calls: it only parses, validates, and prints a
 * summary. Always run with --dry-run first and show the user the summary before
 * writing to the live database — this is bulk-inserting into a shared, real dataset.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { ulid } from "ulid";

const TIME_ZONE = "America/Sao_Paulo";
const VALID_TYPES = ["routine", "food", "training", "sleep"];

// ---------- env loading (no dotenv dependency) ----------

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function findProjectRoot(startDir) {
  let dir = startDir;
  while (true) {
    if (existsSync(resolve(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return startDir;
    dir = parent;
  }
}

// ---------- CLI args ----------

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") args.input = argv[++i];
    else if (a === "--user-email") args.userEmail = argv[++i];
    else if (a === "--user-id") args.userId = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`
Bulk-import timeline events into Firestore.

  node bulk-import-events.mjs --input <events.json> [options]

Options:
  --input <path>        Required. JSON file with { "events": [...] } (see SKILL.md).
  --user-email <email>  Firebase Auth email to resolve the owning userId. Required
                         for a real write unless --user-id is given.
  --user-id <uid>       Firebase Auth UID directly (skips the Auth lookup).
  --dry-run             Validate and print a summary only. No network calls, no writes.
  -h, --help             Show this help.
`);
}

// ---------- timezone math (mirrors src/lib/timeline/format-date.ts) ----------

function timeZoneOffsetMs(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const val = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(
    val("year"),
    val("month") - 1,
    val("day"),
    val("hour") % 24,
    val("minute"),
    val("second"),
  );
  return asUtc - instant.getTime();
}

/** Converts a naive "YYYY-MM-DDTHH:mm[:ss]" local wall-clock string (interpreted in
 * `timeZone`) into the correct UTC instant, using the same two-pass technique the
 * app uses for day boundaries. */
function zonedLocalToInstant(localString, timeZone = TIME_ZONE) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localString);
  if (!match) throw new Error(`Invalid local datetime "${localString}" (expected YYYY-MM-DDTHH:mm[:ss])`);
  const [, y, mo, d, h, mi, s] = match;
  const naiveUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0));
  const firstGuess = new Date(naiveUtc - timeZoneOffsetMs(new Date(naiveUtc), timeZone));
  return new Date(naiveUtc - timeZoneOffsetMs(firstGuess, timeZone));
}

// ---------- per-type "data" payload defaults ----------
// Every EventType must be constructible through this one path, even when the
// source PDF only gives us name/type/startedAt/finishedAt/tags. These defaults
// are what a type-specific entity (see src/models/events/domain/entities/*) would
// fall back to on its own — keep them in sync if those entities change.

function buildDefaultData(type, { startedAt, finishedAt, name }) {
  switch (type) {
    case "routine":
      return {};
    case "sleep": {
      const minutes = finishedAt
        ? Math.round((finishedAt.getTime() - startedAt.getTime()) / 60000)
        : 0;
      return { trackedSleepTime: minutes, score: 0 };
    }
    case "training":
      return { workouts: [], caloriesBurned: 0 };
    case "food":
      return {
        inputText: name,
        items: [],
        totals: {
          totalCaloriesKcal: 0,
          totalProteinGrams: 0,
          totalCarbohydrateGrams: 0,
          totalFatGrams: 0,
          totalFiberGrams: 0,
          totalMicronutrients: {},
        },
        modelProvider: "bulk-import",
        modelName: "toggl-report",
        parsedAt: new Date().toISOString(),
      };
    default:
      throw new Error(`Unknown event type "${type}"`);
  }
}

function normalizeTags(tags) {
  const seen = new Set();
  const result = [];
  for (const raw of tags ?? []) {
    const t = String(raw).trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    result.push(t);
  }
  return result;
}

/** Deterministic id so re-running the same payload after fixing a rejected event
 * overwrites that document instead of creating a duplicate. */
function stableEventId(userId, raw) {
  const hash = createHash("sha256")
    .update(`${userId}|${raw.type}|${raw.startedAt}|${raw.name}`)
    .digest("hex");
  return hash.slice(0, 26);
}

function buildEventDocument(raw, userId, importedAt) {
  if (!raw.name || typeof raw.name !== "string") throw new Error("missing/invalid name");
  if (!VALID_TYPES.includes(raw.type)) {
    throw new Error(`invalid type "${raw.type}" (expected one of ${VALID_TYPES.join(", ")})`);
  }
  if (!raw.startedAt) throw new Error("missing startedAt");
  if (!raw.finishedAt) throw new Error("missing finishedAt (historical imports must be closed intervals)");

  const startedAt = zonedLocalToInstant(raw.startedAt);
  const finishedAt = zonedLocalToInstant(raw.finishedAt);
  if (finishedAt < startedAt) throw new Error("finishedAt is before startedAt");

  const tags = normalizeTags(raw.tags);

  return {
    id: stableEventId(userId, raw),
    type: raw.type,
    userId,
    name: raw.name,
    description: raw.description ?? "",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    tags,
    interruptions: [],
    data: buildDefaultData(raw.type, { startedAt, finishedAt, name: raw.name }),
    createdAt: importedAt,
    updatedAt: importedAt,
  };
}

// ---------- summary / reporting ----------

function printSummary(docs, errors) {
  const byType = {};
  for (const doc of docs) byType[doc.type] = (byType[doc.type] ?? 0) + 1;

  const ids = new Set();
  const duplicates = [];
  for (const doc of docs) {
    if (ids.has(doc.id)) duplicates.push(doc.name);
    ids.add(doc.id);
  }

  const dates = docs.map((d) => d.startedAt).sort();

  console.log("\n=== Summary ===");
  console.log(`Total valid events: ${docs.length}`);
  for (const [type, count] of Object.entries(byType)) console.log(`  ${type}: ${count}`);
  if (dates.length > 0) console.log(`Date range: ${dates[0]} .. ${dates[dates.length - 1]}`);
  const uniqueTags = new Set(docs.flatMap((d) => d.tags));
  console.log(`Unique tags: ${[...uniqueTags].join(", ") || "(none)"}`);
  if (duplicates.length > 0) {
    console.log(`⚠ Duplicate events (same user+type+startedAt+name) will overwrite each other: ${duplicates.join(", ")}`);
  }
  if (errors.length > 0) {
    console.log(`\n⚠ ${errors.length} event(s) failed validation and will be SKIPPED:`);
    for (const e of errors) console.log(`  - "${e.name}": ${e.reason}`);
  }
  console.log("\nSample (first 5):");
  for (const doc of docs.slice(0, 5)) {
    console.log(`  [${doc.type}] "${doc.name}" ${doc.startedAt} -> ${doc.finishedAt} tags=[${doc.tags.join(",")}]`);
  }
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------- Firestore I/O ----------

async function initFirestore() {
  const { cert, getApps, initializeApp, applicationDefault } = await import("firebase-admin/app");
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const app =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({
          credential:
            projectId && clientEmail && privateKey
              ? cert({ projectId, clientEmail, privateKey })
              : applicationDefault(),
        });
  const { getFirestore } = await import("firebase-admin/firestore");
  return getFirestore(app);
}

async function resolveUserId(args) {
  if (args.userId) return args.userId;
  const email = args.userEmail;
  if (!email) {
    throw new Error(
      "Provide --user-id <uid> or --user-email <email> to identify the Firebase Auth user who owns these events.",
    );
  }
  const { getAuth } = await import("firebase-admin/auth");
  const user = await getAuth().getUserByEmail(email);
  return user.uid;
}

async function upsertTags(db, tagNames, userId, importedAt) {
  const unique = [...new Set(tagNames)].filter(Boolean);
  for (const chunk of chunkArray(unique, 400)) {
    const batch = db.batch();
    for (const name of chunk) {
      const ref = db.collection("tags").doc(name);
      const snap = await ref.get();
      const payload = snap.exists
        ? { updatedAt: importedAt }
        : { id: name, name, createdBy: userId, createdAt: importedAt, updatedAt: importedAt };
      batch.set(ref, payload, { merge: true });
    }
    await batch.commit();
  }
}

async function writeEvents(db, docs) {
  const results = [];
  for (const chunk of chunkArray(docs, 400)) {
    const batch = db.batch();
    for (const doc of chunk) batch.set(db.collection("events").doc(doc.id), doc);
    try {
      await batch.commit();
      for (const doc of chunk) results.push({ id: doc.id, name: doc.name, status: "ok" });
    } catch {
      // Fall back to per-document writes so we can report exactly which event
      // Firestore rejected and why, instead of losing that detail to a batch failure.
      for (const doc of chunk) {
        try {
          await db.collection("events").doc(doc.id).set(doc);
          results.push({ id: doc.id, name: doc.name, status: "ok" });
        } catch (docErr) {
          results.push({ id: doc.id, name: doc.name, status: "error", error: String(docErr?.message ?? docErr) });
        }
      }
    }
  }
  return results;
}

// ---------- main ----------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const projectRoot = findProjectRoot(process.cwd());
  loadEnvFile(resolve(projectRoot, ".env.local"));
  loadEnvFile(resolve(projectRoot, ".env"));

  const inputPath = resolve(args.input);
  if (!existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }
  const payload = JSON.parse(readFileSync(inputPath, "utf8"));
  const rawEvents = payload.events;
  if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
    console.error('Input JSON must have a non-empty "events" array.');
    process.exit(1);
  }

  const importedAt = new Date().toISOString();

  // userId is only needed to build correct document ids/ownership; in dry-run we
  // don't want to require Firebase Auth network access, so use a placeholder.
  let userId = "DRY_RUN_PLACEHOLDER_USER_ID";
  let db;
  if (!args.dryRun) {
    db = await initFirestore(); // must run before resolveUserId(): getAuth() needs the app initialized
    userId = await resolveUserId(args);
  }

  const docs = [];
  const errors = [];
  for (const raw of rawEvents) {
    try {
      docs.push(buildEventDocument(raw, userId, importedAt));
    } catch (err) {
      errors.push({ name: raw?.name ?? "(unnamed)", reason: String(err?.message ?? err) });
    }
  }

  printSummary(docs, errors);

  if (args.dryRun) {
    console.log("\nDry run only — nothing was written. Re-run without --dry-run to write to Firestore.");
    return;
  }

  if (docs.length === 0) {
    console.log("\nNo valid events to write.");
    return;
  }

  console.log(`\nWriting ${docs.length} event(s) as user ${userId} ...`);
  const allTags = docs.flatMap((d) => d.tags);
  await upsertTags(db, allTags, userId, importedAt);
  const results = await writeEvents(db, docs);

  const ok = results.filter((r) => r.status === "ok");
  const failed = results.filter((r) => r.status === "error");
  console.log(`\n=== Write results ===`);
  console.log(`OK: ${ok.length}  Failed: ${failed.length}`);
  for (const f of failed) console.log(`  ✗ "${f.name}" (${f.id}): ${f.error}`);
  if (failed.length > 0) {
    console.log(
      "\nSome events were rejected by Firestore. Fix the underlying cause in buildDefaultData()/buildEventDocument() " +
        "in this script (generically, for the affected type — not a one-off patch), then re-run the same input file: " +
        "ids are deterministic, so already-written events will just be overwritten with identical data.",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\nFatal error: ${err?.message ?? err}`);
  process.exit(1);
});
