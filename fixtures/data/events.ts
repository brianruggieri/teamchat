/**
 * Event fixtures for the healthdash-sprint session.
 * Every transcript event (~40+ entries) with timestamp, from, to[], text,
 * summary, and systemEvent type where applicable.
 *
 * These map to RawInboxMessage entries that get written into inbox files.
 * The "inbox" field indicates which inbox file the message appears in.
 * A single event may appear in multiple inboxes (broadcasts).
 */
import type { RawInboxMessage } from "../../src/shared/types.js";

/**
 * A fixture event describes a message as it should appear in one or more
 * inbox files. The generator iterates these and writes each to the
 * appropriate inbox JSON arrays.
 */
export interface FixtureEvent {
	/** Which inbox file(s) this message appears in */
	inboxes: string[];
	/** The raw inbox message */
	message: RawInboxMessage;
	/** Human-readable description for test assertions */
	label: string;
	/** Category for grouping in tests */
	category: "content" | "broadcast" | "dm" | "system" | "plan" | "permission";
}

// Helper to create a content message
function msg(
	from: string,
	color: string,
	text: string,
	timestamp: string,
	summary: string,
): RawInboxMessage {
	return { from, text, summary, timestamp, color, read: false };
}

// Helper to create a system event message (text is JSON)
function sysMsg(
	from: string,
	color: string,
	payload: Record<string, unknown>,
	timestamp: string,
	summary: string,
): RawInboxMessage {
	return { from, text: JSON.stringify(payload), summary, timestamp, color, read: false };
}

export const events: FixtureEvent[] = [
	// =========================================================================
	// 10:00:31 — Lead broadcasts work assignments
	// =========================================================================
	{
		inboxes: ["backend", "frontend", "privacy", "qa"],
		message: msg(
			"team-lead",
			"gold",
			"Alright. Here's the plan:\n\n@backend — you own the schema and API. Start with #1, then #2 unlocks when you're done. Share the schema with @frontend and @privacy as soon as it's drafted.\n\n@frontend — wait for the schema from backend, then take #3 and #7. Use shadcn/ui, keep everything accessible from the start.\n\n@privacy — you own #4 and #5. Field-level encryption on all PHI columns, plus the data masking layer for staging/dev. You'll need the schema too. Coordinate with @backend on which columns are PHI.\n\n@qa — you're blocked until #2, #3, #4 are done. Use the time to research our test stack and write test scaffolding. Then #6 and #8.\n\nEveryone: share findings as you go. Don't wait until done.",
			"2026-03-09T10:00:31.000Z",
			"Work assignments for all teammates",
		),
		label: "Lead assigns work (broadcast)",
		category: "broadcast",
	},

	// =========================================================================
	// 10:00:48 — Backend claims task #1
	// =========================================================================
	{
		inboxes: ["team-lead"],
		message: msg(
			"backend",
			"blue",
			"Claimed #1. Exploring the codebase now to understand existing Prisma schema.",
			"2026-03-09T10:00:48.000Z",
			"Claimed #1, exploring codebase",
		),
		label: "Backend claims #1 (message to lead)",
		category: "content",
	},

	// =========================================================================
	// 10:01:02 — QA gets proactive
	// =========================================================================
	{
		inboxes: ["team-lead"],
		message: msg(
			"qa",
			"yellow",
			"I'm blocked on #6 and #8 but I'll use the time productively. Setting up Vitest + Playwright scaffolding and writing test fixtures with synthetic PHI data.",
			"2026-03-09T10:01:02.000Z",
			"Blocked but setting up test scaffolding",
		),
		label: "QA proactive message to lead",
		category: "content",
	},

	// =========================================================================
	// 10:01:15 — Privacy starts research + claims #4
	// =========================================================================
	{
		inboxes: ["team-lead"],
		message: msg(
			"privacy",
			"purple",
			"Claimed #4. Reading through existing encryption config. Question: are we using pgcrypto or application-level encryption? This affects my approach significantly.",
			"2026-03-09T10:01:15.000Z",
			"Claimed #4, asking about encryption approach",
		),
		label: "Privacy claims #4, asks encryption question",
		category: "content",
	},

	// =========================================================================
	// 10:01:30 — Lead answers privacy's question
	// =========================================================================
	{
		inboxes: ["privacy"],
		message: msg(
			"team-lead",
			"gold",
			"@privacy Application-level. We use AES-256-GCM via the node:crypto module. The encryption keys come from KMS, not hardcoded. Check src/lib/crypto.ts for the existing helpers.",
			"2026-03-09T10:01:30.000Z",
			"Application-level AES-256-GCM encryption",
		),
		label: "Lead answers privacy encryption question",
		category: "content",
	},

	// =========================================================================
	// 10:05:42 — Backend DMs frontend + privacy with schema
	// =========================================================================
	{
		inboxes: ["frontend"],
		message: msg(
			"backend",
			"blue",
			"Schema draft is ready. Key tables:\n\n• patients (id, mrn, name\u21DF, dob\u21DF, ...)\n• encounters (id, patient_id, provider_id)\n• vitals (id, encounter_id, bp, hr, temp)\n• medications (id, patient_id, drug\u21DF, ...)\n\nColumns marked \u21DF are PHI — @privacy those are your encryption targets.\n\n@frontend the API will return decrypted views. You don't touch encryption.",
			"2026-03-09T10:05:42.000Z",
			"Schema draft with PHI columns marked",
		),
		label: "Backend DMs schema to frontend",
		category: "dm",
	},
	{
		inboxes: ["privacy"],
		message: msg(
			"backend",
			"blue",
			"Schema draft is ready. Key tables:\n\n• patients (id, mrn, name\u21DF, dob\u21DF, ...)\n• encounters (id, patient_id, provider_id)\n• vitals (id, encounter_id, bp, hr, temp)\n• medications (id, patient_id, drug\u21DF, ...)\n\nColumns marked \u21DF are PHI — @privacy those are your encryption targets.\n\n@frontend the API will return decrypted views. You don't touch encryption.",
			"2026-03-09T10:05:42.000Z",
			"Schema draft with PHI columns marked",
		),
		label: "Backend DMs schema to privacy",
		category: "dm",
	},

	// =========================================================================
	// 10:05:58 — Frontend acknowledges + claims #3
	// =========================================================================
	{
		inboxes: ["team-lead"],
		message: msg(
			"frontend",
			"green",
			"Got it. Claiming #3. I'll build the patient list + detail views first, then the vitals charts.",
			"2026-03-09T10:05:58.000Z",
			"Claiming #3, building patient views",
		),
		label: "Frontend claims #3",
		category: "content",
	},

	// =========================================================================
	// 10:08:33 — Privacy submits plan for approval
	// =========================================================================
	{
		inboxes: ["team-lead"],
		message: sysMsg(
			"privacy",
			"purple",
			{
				type: "plan_approval_request",
				requestId: "plan-req-001",
				planContent: "## Encryption Strategy for PHI Columns\n\n1. Add `_encrypted` suffix columns alongside plaintext\n2. Migrate data: encrypt existing plaintext \u2192 _encrypted\n3. Drop plaintext columns, rename _encrypted \u2192 original\n4. Add decrypt-on-read middleware in Prisma client extension\n5. Masking layer (#5): replace PHI with faker-generated values keyed by deterministic seed per record\n\nAffected columns: patients.name, patients.dob, medications.drug, encounters.notes",
			},
			"2026-03-09T10:08:33.000Z",
			"Plan: Encryption strategy for PHI columns",
		),
		label: "Privacy submits encryption plan",
		category: "plan",
	},

	// =========================================================================
	// 10:09:01 — Lead approves plan with feedback
	// =========================================================================
	{
		inboxes: ["privacy"],
		message: sysMsg(
			"team-lead",
			"gold",
			{
				type: "plan_approval_response",
				requestId: "plan-req-001",
				approved: true,
				feedback: "Approved. One addition: include encounters.notes in PHI columns. Patient notes contain diagnoses.",
			},
			"2026-03-09T10:09:01.000Z",
			"Plan approved with feedback",
		),
		label: "Lead approves privacy plan",
		category: "plan",
	},
	// Accompanying content message from lead
	{
		inboxes: ["privacy"],
		message: msg(
			"team-lead",
			"gold",
			"Approved. One addition: include encounters.notes in PHI columns. Patient notes contain diagnoses.",
			"2026-03-09T10:09:01.500Z",
			"Include encounters.notes in PHI",
		),
		label: "Lead approval feedback message",
		category: "content",
	},

	// =========================================================================
	// 10:14:22 — QA permission request (Playwright install)
	// =========================================================================
	{
		inboxes: ["team-lead"],
		message: sysMsg(
			"qa",
			"yellow",
			{
				type: "permission_request",
				requestId: "perm-req-001",
				workerId: "agent-005",
				workerName: "qa",
				workerColor: "yellow",
				toolName: "Bash",
				description: "Installing browser for E2E test scaffolding",
				input: { command: "npx playwright install chromium" },
			},
			"2026-03-09T10:14:22.000Z",
			"Permission: npx playwright install chromium",
		),
		label: "QA requests permission for Playwright install",
		category: "permission",
	},

	// =========================================================================
	// 10:21:17 — Frontend DMs privacy about masking
	// =========================================================================
	{
		inboxes: ["privacy"],
		message: msg(
			"frontend",
			"green",
			"Quick question \u2014 should the patient list view show full names or masked? I need to know if I render the decrypted value from the API or if there's a masking flag I should check.",
			"2026-03-09T10:21:17.000Z",
			"Question about name masking in patient list",
		),
		label: "Frontend DMs privacy about masking",
		category: "dm",
	},

	// =========================================================================
	// 10:21:45 — Privacy responds to frontend DM
	// =========================================================================
	{
		inboxes: ["frontend"],
		message: msg(
			"privacy",
			"purple",
			"In prod you'll get decrypted plaintext from the API \u2014 backend handles decrypt. In non-prod the masking layer (#5) will intercept and return fake data. You don't need to handle it \u2014 just render what the API gives you. There'll be a response header `X-Data-Masked: true` you can use to show a subtle indicator if you want.",
			"2026-03-09T10:21:45.000Z",
			"Render API response as-is, masking is server-side",
		),
		label: "Privacy explains masking to frontend",
		category: "dm",
	},

	// =========================================================================
	// 10:22:03 — Frontend confirms in DM thread
	// =========================================================================
	{
		inboxes: ["privacy"],
		message: msg(
			"frontend",
			"green",
			"Perfect. I'll add a small lock/unlock badge in the UI based on that header.",
			"2026-03-09T10:22:03.000Z",
			"Will add lock badge based on header",
		),
		label: "Frontend confirms masking approach",
		category: "dm",
	},

	// =========================================================================
	// 10:28:44 — Backend broadcasts API contract
	// =========================================================================
	{
		inboxes: ["team-lead", "frontend", "privacy", "qa"],
		message: msg(
			"backend",
			"blue",
			"API endpoints ready. Contract:\n\nGET  /api/patients         \u2192 list\nGET  /api/patients/:id     \u2192 detail\nGET  /api/patients/:id/vitals \u2192 vitals\nGET  /api/patients/:id/meds   \u2192 meds\nPOST /api/patients         \u2192 create\nPATCH /api/patients/:id    \u2192 update\n\nAll responses include X-Data-Masked header. Auth via Bearer token, RBAC middleware checks role before decrypt.\n\n@frontend you can start hitting these.\n@qa here's your test surface.",
			"2026-03-09T10:28:44.000Z",
			"API contract with 6 endpoints",
		),
		label: "Backend broadcasts API contract",
		category: "broadcast",
	},

	// =========================================================================
	// 10:35:12 — Privacy completes encryption (#4)
	// =========================================================================
	{
		inboxes: ["team-lead"],
		message: msg(
			"privacy",
			"purple",
			"Encryption implementation done. 4 columns now AES-256-GCM encrypted with KMS keys. Prisma client extension handles encrypt-on-write and decrypt-on-read transparently.\n\nStarting on #5 (data masking) now.",
			"2026-03-09T10:35:12.000Z",
			"Encryption done, starting data masking",
		),
		label: "Privacy completes #4, claims #5",
		category: "content",
	},

	// =========================================================================
	// 10:42:55 — Frontend completes dashboard (#3)
	// =========================================================================
	{
		inboxes: ["team-lead"],
		message: msg(
			"frontend",
			"green",
			"Dashboard components done. Patient list with search/filter, detail view with vitals chart (Recharts), medication table. Responsive down to tablet.\n\nMoving to #7 (accessibility audit).",
			"2026-03-09T10:42:55.000Z",
			"Dashboard done, moving to accessibility",
		),
		label: "Frontend completes #3, claims #7",
		category: "content",
	},

	// =========================================================================
	// 10:43:08 — QA finally has work
	// =========================================================================
	{
		inboxes: ["team-lead"],
		message: msg(
			"qa",
			"yellow",
			"Finally! Claiming #6. I've got Vitest + Playwright ready, and synthetic PHI test fixtures prepped. Running integration suite now.",
			"2026-03-09T10:43:08.000Z",
			"Claiming #6, running integration tests",
		),
		label: "QA claims #6",
		category: "content",
	},

	// =========================================================================
	// 10:49:30 — QA DMs backend about RBAC bug
	// =========================================================================
	{
		inboxes: ["backend"],
		message: msg(
			"qa",
			"yellow",
			"Found an issue. GET /api/patients/:id returns 200 with decrypted PHI even when the Bearer token has role=nurse. Nurses should only see vitals, not full patient records with SSN.\n\nRBAC middleware checks authentication but not authorization granularity. The decrypt-on-read Prisma extension doesn't consult the user's role.",
			"2026-03-09T10:49:30.000Z",
			"RBAC bug: nurses can see full PHI",
		),
		label: "QA reports RBAC bug to backend (DM)",
		category: "dm",
	},

	// =========================================================================
	// 10:50:15 — Backend responds to QA's bug report
	// =========================================================================
	{
		inboxes: ["qa"],
		message: msg(
			"backend",
			"blue",
			"Good catch. That's a real HIPAA violation. I'll add a field-level RBAC check in the Prisma extension \u2014 role \u2192 allowed fields mapping. Give me 5 minutes.",
			"2026-03-09T10:50:15.000Z",
			"Will add field-level RBAC check",
		),
		label: "Backend acknowledges RBAC bug (DM)",
		category: "dm",
	},

	// =========================================================================
	// 10:51:15 — Backend notifies lead of the fix
	// =========================================================================
	{
		inboxes: ["team-lead"],
		message: msg(
			"backend",
			"blue",
			"Heads up \u2014 qa found a role-based access control gap on patient detail endpoint. Fixed: added field-level RBAC in Prisma extension. Nurse role now gets redacted response (SSN \u2192 \"***\", full name \u2192 first initial + last).",
			"2026-03-09T10:51:15.000Z",
			"Fixed RBAC gap found by qa",
		),
		label: "Backend notifies lead of RBAC fix",
		category: "content",
	},

	// =========================================================================
	// 10:52:00 — Lead acknowledges + directs follow-up
	// =========================================================================
	{
		inboxes: ["qa"],
		message: msg(
			"team-lead",
			"gold",
			"Good work both of you. @qa add a test case for role-based field redaction. @privacy \u2014 does the masking layer need to be role-aware too, or is it environment-only?",
			"2026-03-09T10:52:00.000Z",
			"Add test for field redaction",
		),
		label: "Lead to qa: add redaction test",
		category: "content",
	},
	{
		inboxes: ["privacy"],
		message: msg(
			"team-lead",
			"gold",
			"Good work both of you. @qa add a test case for role-based field redaction. @privacy \u2014 does the masking layer need to be role-aware too, or is it environment-only?",
			"2026-03-09T10:52:00.000Z",
			"Is masking layer role-aware?",
		),
		label: "Lead to privacy: masking role-aware?",
		category: "content",
	},

	// =========================================================================
	// 10:52:22 — Privacy responds about masking scope
	// =========================================================================
	{
		inboxes: ["team-lead"],
		message: msg(
			"privacy",
			"purple",
			"Masking is environment-only. Non-prod environments get fully synthetic data regardless of role. The RBAC redaction only matters in prod where we have real PHI.",
			"2026-03-09T10:52:22.000Z",
			"Masking is environment-only, not role-aware",
		),
		label: "Privacy: masking is environment-only",
		category: "content",
	},

	// =========================================================================
	// 10:55:18 — Privacy completes masking (#5), goes idle
	// =========================================================================
	// (Task completion is tracked via task snapshots, but an idle notification follows)
	{
		inboxes: ["team-lead"],
		message: sysMsg(
			"privacy",
			"purple",
			{
				type: "idle_notification",
				idleReason: "All assigned tasks completed",
				completedTaskId: "5",
				completedStatus: "completed",
			},
			"2026-03-09T10:55:18.500Z",
			"privacy is idle",
		),
		label: "Privacy idle after completing #5",
		category: "system",
	},

	// =========================================================================
	// 10:58:41 — Frontend completes accessibility (#7), goes idle
	// =========================================================================
	{
		inboxes: ["team-lead"],
		message: msg(
			"frontend",
			"green",
			"WCAG 2.1 AA audit complete. Fixes:\n\u2022 Added aria-labels to all data tables\n\u2022 Fixed color contrast on vitals chart\n\u2022 Added keyboard navigation for filters\n\u2022 Screen reader testing passed with NVDA",
			"2026-03-09T10:58:41.000Z",
			"Accessibility audit complete",
		),
		label: "Frontend completes #7",
		category: "content",
	},
	{
		inboxes: ["team-lead"],
		message: sysMsg(
			"frontend",
			"green",
			{
				type: "idle_notification",
				idleReason: "All assigned tasks completed",
				completedTaskId: "7",
				completedStatus: "completed",
			},
			"2026-03-09T10:58:41.500Z",
			"frontend is idle",
		),
		label: "Frontend idle after completing #7",
		category: "system",
	},

	// =========================================================================
	// 11:04:33 — QA permission request (test run)
	// =========================================================================
	{
		inboxes: ["team-lead"],
		message: sysMsg(
			"qa",
			"yellow",
			{
				type: "permission_request",
				requestId: "perm-req-002",
				workerId: "agent-005",
				workerName: "qa",
				workerColor: "yellow",
				toolName: "Bash",
				description: "Running test suite with coverage",
				input: { command: "npm test -- --coverage --reporter=json" },
			},
			"2026-03-09T11:04:33.000Z",
			"Permission: npm test with coverage",
		),
		label: "QA requests permission for test run",
		category: "permission",
	},

	// =========================================================================
	// 11:08:12 — QA completes integration tests (#6), claims #8
	// =========================================================================
	{
		inboxes: ["team-lead"],
		message: msg(
			"qa",
			"yellow",
			"Integration test suite complete.\n\n47 tests, 46 passing, 1 flaky\nCoverage: 84% statements, 78% branches\n\nThe flaky test is a timing issue on the vitals WebSocket subscription \u2014 sometimes the connection isn't ready. Added a retry but marking it as known-flaky.\n\nClaiming #8 (HIPAA validation) now.",
			"2026-03-09T11:08:12.000Z",
			"47 tests passing, claiming #8",
		),
		label: "QA completes #6, claims #8",
		category: "content",
	},

	// =========================================================================
	// 11:08:45 — Lead redirects idle agents
	// =========================================================================
	{
		inboxes: ["privacy"],
		message: msg(
			"team-lead",
			"gold",
			"@privacy @frontend \u2014 you're both idle. Could you review each other's work? Privacy review frontend's UI for any PHI leaking into client-side state or console logs. Frontend review privacy's encryption for any UX impact (loading times, error states when decrypt fails).",
			"2026-03-09T11:08:45.000Z",
			"Cross-review: check each other's work",
		),
		label: "Lead to privacy: cross-review",
		category: "content",
	},
	{
		inboxes: ["frontend"],
		message: msg(
			"team-lead",
			"gold",
			"@privacy @frontend \u2014 you're both idle. Could you review each other's work? Privacy review frontend's UI for any PHI leaking into client-side state or console logs. Frontend review privacy's encryption for any UX impact (loading times, error states when decrypt fails).",
			"2026-03-09T11:08:45.000Z",
			"Cross-review: check each other's work",
		),
		label: "Lead to frontend: cross-review",
		category: "content",
	},

	// =========================================================================
	// 11:09:02 — Privacy and frontend accept
	// =========================================================================
	{
		inboxes: ["team-lead"],
		message: msg(
			"privacy",
			"purple",
			"On it. Reviewing frontend components for PHI exposure.",
			"2026-03-09T11:09:02.000Z",
			"Reviewing frontend for PHI exposure",
		),
		label: "Privacy accepts cross-review",
		category: "content",
	},
	{
		inboxes: ["team-lead"],
		message: msg(
			"frontend",
			"green",
			"Sure. Checking encrypt/decrypt latency impact on table render times.",
			"2026-03-09T11:09:02.500Z",
			"Checking encryption latency impact",
		),
		label: "Frontend accepts cross-review",
		category: "content",
	},

	// =========================================================================
	// 11:15:30 — Privacy broadcasts PHI cache finding
	// =========================================================================
	{
		inboxes: ["team-lead", "backend", "frontend", "qa"],
		message: msg(
			"privacy",
			"purple",
			"Found something in the frontend review. The patient search component stores full name in React Query cache. If someone inspects the browser dev tools, they see decrypted PHI in the cache entries.\n\n@frontend \u2014 you should either:\na) disable cache for PHI-containing queries\nb) encrypt the cache entries client-side\n\nI'd recommend (a), simpler and cache isn't that valuable for patient search anyway.",
			"2026-03-09T11:15:30.000Z",
			"PHI leak in React Query cache",
		),
		label: "Privacy broadcasts PHI cache finding",
		category: "broadcast",
	},

	// =========================================================================
	// 11:16:05 — Frontend fixes cache issue
	// =========================================================================
	{
		inboxes: ["team-lead"],
		message: msg(
			"frontend",
			"green",
			"Good catch. Disabled React Query cache for all /api/patients* queries. Added `cacheTime: 0` to the query config. Patient search is still fast because the API responses are small.",
			"2026-03-09T11:16:05.000Z",
			"Disabled cache for patient queries",
		),
		label: "Frontend fixes PHI cache leak",
		category: "content",
	},

	// =========================================================================
	// 11:22:48 — QA completes HIPAA validation (#8)
	// =========================================================================
	{
		inboxes: ["team-lead"],
		message: msg(
			"qa",
			"yellow",
			"HIPAA compliance validation complete.\n\n\u2705 PHI encrypted at rest (AES-256-GCM)\n\u2705 PHI encrypted in transit (TLS 1.3)\n\u2705 Role-based access controls enforced\n\u2705 Audit logging on all PHI access\n\u2705 Data masking in non-prod environments\n\u2705 No PHI in client-side cache\n\u2705 No PHI in server logs\n\u26A0\uFE0F  Missing: BAA documentation (not code)\n\nAll code-level HIPAA requirements met.",
			"2026-03-09T11:22:48.000Z",
			"HIPAA validation complete, all code requirements met",
		),
		label: "QA completes #8, all tasks done",
		category: "content",
	},

	// =========================================================================
	// 11:23:10 — Lead wraps up (broadcast)
	// =========================================================================
	{
		inboxes: ["backend", "frontend", "privacy", "qa"],
		message: msg(
			"team-lead",
			"gold",
			"Great work everyone. All 8 tasks complete. Summary:\n\n\u2022 Schema + API: done (backend)\n\u2022 Dashboard UI: done, accessible (frontend)\n\u2022 PHI encryption + masking: done (privacy)\n\u2022 Integration tests: 47 passing, 84% coverage (qa)\n\u2022 HIPAA: all code requirements met\n\u2022 Bonus: caught RBAC gap + client cache PHI leak\n\nShutting down the team. Nice work.",
			"2026-03-09T11:23:10.000Z",
			"All 8 tasks complete, shutting down",
		),
		label: "Lead wrap-up broadcast",
		category: "broadcast",
	},

	// =========================================================================
	// 11:23:22 — Shutdown sequence: 4 requests + 4 approvals
	// =========================================================================
	{
		inboxes: ["backend"],
		message: sysMsg(
			"team-lead",
			"gold",
			{
				type: "shutdown_request",
				requestId: "shutdown-001",
				reason: "All tasks completed, session ending",
			},
			"2026-03-09T11:23:22.000Z",
			"Shutdown requested",
		),
		label: "Shutdown request to backend",
		category: "system",
	},
	{
		inboxes: ["frontend"],
		message: sysMsg(
			"team-lead",
			"gold",
			{
				type: "shutdown_request",
				requestId: "shutdown-002",
				reason: "All tasks completed, session ending",
			},
			"2026-03-09T11:23:22.100Z",
			"Shutdown requested",
		),
		label: "Shutdown request to frontend",
		category: "system",
	},
	{
		inboxes: ["privacy"],
		message: sysMsg(
			"team-lead",
			"gold",
			{
				type: "shutdown_request",
				requestId: "shutdown-003",
				reason: "All tasks completed, session ending",
			},
			"2026-03-09T11:23:22.200Z",
			"Shutdown requested",
		),
		label: "Shutdown request to privacy",
		category: "system",
	},
	{
		inboxes: ["qa"],
		message: sysMsg(
			"team-lead",
			"gold",
			{
				type: "shutdown_request",
				requestId: "shutdown-004",
				reason: "All tasks completed, session ending",
			},
			"2026-03-09T11:23:22.300Z",
			"Shutdown requested",
		),
		label: "Shutdown request to qa",
		category: "system",
	},

	// Shutdown approvals (arrive in lead's inbox, out of order per transcript)
	{
		inboxes: ["team-lead"],
		message: sysMsg(
			"backend",
			"blue",
			{
				type: "shutdown_approved",
				requestId: "shutdown-001",
				paneId: "pane-002",
				backendType: "claude",
			},
			"2026-03-09T11:23:23.000Z",
			"backend leaving",
		),
		label: "Backend approves shutdown",
		category: "system",
	},
	{
		inboxes: ["team-lead"],
		message: sysMsg(
			"frontend",
			"green",
			{
				type: "shutdown_approved",
				requestId: "shutdown-002",
				paneId: "pane-003",
				backendType: "claude",
			},
			"2026-03-09T11:23:23.200Z",
			"frontend leaving",
		),
		label: "Frontend approves shutdown",
		category: "system",
	},
	{
		inboxes: ["team-lead"],
		message: sysMsg(
			"qa",
			"yellow",
			{
				type: "shutdown_approved",
				requestId: "shutdown-004",
				paneId: "pane-005",
				backendType: "claude",
			},
			"2026-03-09T11:23:23.400Z",
			"qa leaving",
		),
		label: "QA approves shutdown",
		category: "system",
	},
	{
		inboxes: ["team-lead"],
		message: sysMsg(
			"privacy",
			"purple",
			{
				type: "shutdown_approved",
				requestId: "shutdown-003",
				paneId: "pane-004",
				backendType: "claude",
			},
			"2026-03-09T11:23:23.600Z",
			"privacy leaving",
		),
		label: "Privacy approves shutdown",
		category: "system",
	},
];

// === Derived counts for test assertions ===

/** Number of broadcast events (same message in 3+ inboxes) */
export const broadcastCount = events.filter((e) => e.category === "broadcast").length;

/** Number of DM events (teammate-to-teammate, not through lead) */
export const dmCount = events.filter((e) => e.category === "dm").length;

/** Number of unique DM threads (distinct participant pairs) */
export function getDMThreads(): string[] {
	const threads = new Set<string>();
	for (const e of events) {
		if (e.category === "dm") {
			const sender = e.message.from;
			const recipients = e.inboxes;
			for (const r of recipients) {
				const pair = [sender, r].sort().join(":");
				threads.add(pair);
			}
		}
	}
	return [...threads];
}

/** Total number of unique inbox message writes */
export const totalInboxWrites = events.reduce((sum, e) => sum + e.inboxes.length, 0);
