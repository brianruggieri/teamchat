/**
 * Task fixtures for the healthdash-sprint session.
 * 8 tasks with dependency chains matching the transcript.
 *
 * Dependency graph:
 *   #1 (schema) → blocks #2, #3, #4
 *   #4 (encryption) → blocks #5
 *   #2 + #3 + #4 → block #6
 *   #3 → blocks #7
 *   #4 + #5 + #6 → block #8
 */
import type { RawTaskData } from "../../src/shared/types.js";

/** Initial task definitions at team creation (10:00:00) */
export const initialTasks: RawTaskData[] = [
	{
		id: "1",
		subject: "Design database schema for patient records",
		description: "Create Prisma schema with patients, encounters, vitals, and medications tables. Mark PHI columns.",
		status: "pending",
		owner: null,
		blockedBy: null,
		activeForm: null,
		created: "2026-03-09T10:00:00.000Z",
		updated: "2026-03-09T10:00:00.000Z",
	},
	{
		id: "2",
		subject: "Build REST API endpoints",
		description: "CRUD endpoints for patients, encounters, vitals, medications. Bearer token auth with RBAC middleware.",
		status: "pending",
		owner: null,
		blockedBy: ["1"],
		activeForm: null,
		created: "2026-03-09T10:00:00.000Z",
		updated: "2026-03-09T10:00:00.000Z",
	},
	{
		id: "3",
		subject: "Implement React dashboard components",
		description: "Patient list with search/filter, detail view with vitals chart (Recharts), medication table. Use shadcn/ui.",
		status: "pending",
		owner: null,
		blockedBy: ["1"],
		activeForm: null,
		created: "2026-03-09T10:00:00.000Z",
		updated: "2026-03-09T10:00:00.000Z",
	},
	{
		id: "4",
		subject: "Add field-level encryption for PHI columns",
		description: "AES-256-GCM via node:crypto module. KMS-managed keys. Prisma client extension for encrypt-on-write, decrypt-on-read.",
		status: "pending",
		owner: null,
		blockedBy: ["1"],
		activeForm: null,
		created: "2026-03-09T10:00:00.000Z",
		updated: "2026-03-09T10:00:00.000Z",
	},
	{
		id: "5",
		subject: "Data masking layer for non-prod environments",
		description: "Replace PHI with faker-generated values keyed by deterministic seed per record. X-Data-Masked response header.",
		status: "pending",
		owner: null,
		blockedBy: ["4"],
		activeForm: null,
		created: "2026-03-09T10:00:00.000Z",
		updated: "2026-03-09T10:00:00.000Z",
	},
	{
		id: "6",
		subject: "Write integration tests",
		description: "Vitest + Playwright. Integration test suite covering API endpoints, encryption, masking, RBAC.",
		status: "pending",
		owner: null,
		blockedBy: ["2", "3", "4"],
		activeForm: null,
		created: "2026-03-09T10:00:00.000Z",
		updated: "2026-03-09T10:00:00.000Z",
	},
	{
		id: "7",
		subject: "Accessibility + WCAG 2.1 AA audit",
		description: "Aria-labels, color contrast, keyboard navigation, screen reader testing.",
		status: "pending",
		owner: null,
		blockedBy: ["3"],
		activeForm: null,
		created: "2026-03-09T10:00:00.000Z",
		updated: "2026-03-09T10:00:00.000Z",
	},
	{
		id: "8",
		subject: "HIPAA compliance validation",
		description: "Validate PHI encrypted at rest and in transit, RBAC enforced, audit logging, data masking, no PHI in logs or client cache.",
		status: "pending",
		owner: null,
		blockedBy: ["4", "5", "6"],
		activeForm: null,
		created: "2026-03-09T10:00:00.000Z",
		updated: "2026-03-09T10:00:00.000Z",
	},
];

/**
 * Task state transition snapshots, in chronological order.
 * Each snapshot represents the full tasks array at that point in time.
 * The processor can diff consecutive snapshots to detect claims, completions, and unblocks.
 */
export interface TaskSnapshot {
	timestamp: string;
	description: string;
	tasks: RawTaskData[];
}

function cloneTasks(tasks: RawTaskData[]): RawTaskData[] {
	return tasks.map((t) => ({ ...t, blockedBy: t.blockedBy ? [...t.blockedBy] : null }));
}

function applyChange(
	tasks: RawTaskData[],
	id: string,
	changes: Partial<RawTaskData>,
): RawTaskData[] {
	const result = cloneTasks(tasks);
	const task = result.find((t) => t.id === id);
	if (task) {
		Object.assign(task, changes);
	}
	return result;
}

function buildSnapshots(): TaskSnapshot[] {
	const snapshots: TaskSnapshot[] = [];
	let current = cloneTasks(initialTasks);

	// Snapshot 0: Initial state — all pending
	snapshots.push({
		timestamp: "2026-03-09T10:00:00.000Z",
		description: "Team created, 8 tasks pending",
		tasks: cloneTasks(current),
	});

	// Snapshot 1: 10:00:48 — backend claims #1
	current = applyChange(current, "1", {
		status: "in_progress",
		owner: "backend",
		activeForm: "Exploring codebase for existing Prisma schema",
		updated: "2026-03-09T10:00:48.000Z",
	});
	snapshots.push({
		timestamp: "2026-03-09T10:00:48.000Z",
		description: "backend claimed #1",
		tasks: cloneTasks(current),
	});

	// Snapshot 2: 10:01:15 — privacy claims #4
	current = applyChange(current, "4", {
		status: "in_progress",
		owner: "privacy",
		activeForm: "Reading encryption config",
		updated: "2026-03-09T10:01:15.000Z",
	});
	snapshots.push({
		timestamp: "2026-03-09T10:01:15.000Z",
		description: "privacy claimed #4",
		tasks: cloneTasks(current),
	});

	// Snapshot 3: 10:05:58 — backend completes #1 + frontend claims #3
	current = applyChange(current, "1", {
		status: "completed",
		activeForm: null,
		updated: "2026-03-09T10:05:58.000Z",
	});
	current = applyChange(current, "3", {
		status: "in_progress",
		owner: "frontend",
		activeForm: "Building patient list and detail views",
		updated: "2026-03-09T10:05:58.000Z",
	});
	snapshots.push({
		timestamp: "2026-03-09T10:05:58.000Z",
		description: "backend completed #1, frontend claimed #3, #2/#3/#4 unblocked",
		tasks: cloneTasks(current),
	});

	// Snapshot 4: 10:06:12 — backend claims #2
	current = applyChange(current, "2", {
		status: "in_progress",
		owner: "backend",
		activeForm: "Building REST API endpoints",
		updated: "2026-03-09T10:06:12.000Z",
	});
	snapshots.push({
		timestamp: "2026-03-09T10:06:12.000Z",
		description: "backend claimed #2",
		tasks: cloneTasks(current),
	});

	// Snapshot 5: 10:28:44 — backend completes #2
	current = applyChange(current, "2", {
		status: "completed",
		activeForm: null,
		updated: "2026-03-09T10:28:44.000Z",
	});
	snapshots.push({
		timestamp: "2026-03-09T10:28:44.000Z",
		description: "backend completed #2, #6 partially unblocked",
		tasks: cloneTasks(current),
	});

	// Snapshot 6: 10:35:12 — privacy completes #4
	current = applyChange(current, "4", {
		status: "completed",
		activeForm: null,
		updated: "2026-03-09T10:35:12.000Z",
	});
	snapshots.push({
		timestamp: "2026-03-09T10:35:12.000Z",
		description: "privacy completed #4, #5 unblocked, #8 partially unblocked",
		tasks: cloneTasks(current),
	});

	// Snapshot 7: 10:35:12 — privacy claims #5
	current = applyChange(current, "5", {
		status: "in_progress",
		owner: "privacy",
		activeForm: "Implementing data masking layer",
		updated: "2026-03-09T10:35:12.500Z",
	});
	snapshots.push({
		timestamp: "2026-03-09T10:35:12.500Z",
		description: "privacy claimed #5",
		tasks: cloneTasks(current),
	});

	// Snapshot 8: 10:42:55 — frontend completes #3
	current = applyChange(current, "3", {
		status: "completed",
		activeForm: null,
		updated: "2026-03-09T10:42:55.000Z",
	});
	snapshots.push({
		timestamp: "2026-03-09T10:42:55.000Z",
		description: "frontend completed #3, #7 unblocked, #6 fully unblocked",
		tasks: cloneTasks(current),
	});

	// Snapshot 9: 10:42:55 — frontend claims #7
	current = applyChange(current, "7", {
		status: "in_progress",
		owner: "frontend",
		activeForm: "Running accessibility audit",
		updated: "2026-03-09T10:42:55.500Z",
	});
	snapshots.push({
		timestamp: "2026-03-09T10:42:55.500Z",
		description: "frontend claimed #7",
		tasks: cloneTasks(current),
	});

	// Snapshot 10: 10:43:08 — qa claims #6
	current = applyChange(current, "6", {
		status: "in_progress",
		owner: "qa",
		activeForm: "Running integration test suite",
		updated: "2026-03-09T10:43:08.000Z",
	});
	snapshots.push({
		timestamp: "2026-03-09T10:43:08.000Z",
		description: "qa claimed #6",
		tasks: cloneTasks(current),
	});

	// Snapshot 11: 10:55:18 — privacy completes #5
	current = applyChange(current, "5", {
		status: "completed",
		activeForm: null,
		updated: "2026-03-09T10:55:18.000Z",
	});
	snapshots.push({
		timestamp: "2026-03-09T10:55:18.000Z",
		description: "privacy completed #5, privacy idle",
		tasks: cloneTasks(current),
	});

	// Snapshot 12: 10:58:41 — frontend completes #7
	current = applyChange(current, "7", {
		status: "completed",
		activeForm: null,
		updated: "2026-03-09T10:58:41.000Z",
	});
	snapshots.push({
		timestamp: "2026-03-09T10:58:41.000Z",
		description: "frontend completed #7, frontend idle",
		tasks: cloneTasks(current),
	});

	// Snapshot 13: 11:08:12 — qa completes #6
	current = applyChange(current, "6", {
		status: "completed",
		activeForm: null,
		updated: "2026-03-09T11:08:12.000Z",
	});
	snapshots.push({
		timestamp: "2026-03-09T11:08:12.000Z",
		description: "qa completed #6, #8 fully unblocked",
		tasks: cloneTasks(current),
	});

	// Snapshot 14: 11:08:12 — qa claims #8
	current = applyChange(current, "8", {
		status: "in_progress",
		owner: "qa",
		activeForm: "Running HIPAA compliance validation",
		updated: "2026-03-09T11:08:12.500Z",
	});
	snapshots.push({
		timestamp: "2026-03-09T11:08:12.500Z",
		description: "qa claimed #8",
		tasks: cloneTasks(current),
	});

	// Snapshot 15: 11:22:48 — qa completes #8
	current = applyChange(current, "8", {
		status: "completed",
		activeForm: null,
		updated: "2026-03-09T11:22:48.000Z",
	});
	snapshots.push({
		timestamp: "2026-03-09T11:22:48.000Z",
		description: "qa completed #8, ALL TASKS COMPLETED",
		tasks: cloneTasks(current),
	});

	// Snapshot 16: 11:23:22 — team disbanded
	snapshots.push({
		timestamp: "2026-03-09T11:23:22.000Z",
		description: "Team disbanded, all 8 tasks completed",
		tasks: cloneTasks(current),
	});

	return snapshots;
}

export const taskSnapshots: TaskSnapshot[] = buildSnapshots();

/** The final state of all tasks (all completed) */
export const finalTasks: RawTaskData[] = taskSnapshots[taskSnapshots.length - 1].tasks;
