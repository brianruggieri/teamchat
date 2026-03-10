/**
 * Team configuration fixture for the healthdash-sprint session.
 * 5 members: team-lead + 4 teammates, each with a distinct color.
 */
import type { AgentInfo, TeamConfig } from "../../src/shared/types.js";

export const teamName = "healthdash-sprint";

export const members: AgentInfo[] = [
	{
		name: "team-lead",
		agentId: "lead-001",
		agentType: "lead",
		color: "gold",
	},
	{
		name: "backend",
		agentId: "agent-002",
		agentType: "teammate",
		color: "blue",
	},
	{
		name: "frontend",
		agentId: "agent-003",
		agentType: "teammate",
		color: "green",
	},
	{
		name: "privacy",
		agentId: "agent-004",
		agentType: "teammate",
		color: "purple",
	},
	{
		name: "qa",
		agentId: "agent-005",
		agentType: "teammate",
		color: "yellow",
	},
];

export const config: TeamConfig = {
	members,
};
