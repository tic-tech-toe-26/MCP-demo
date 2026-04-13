import { callLLM } from '../llm/client.js';
import type { RiskLevel } from '../planner/dag-types.js';

export interface RiskAssessment {
  level: RiskLevel;
  rationale: string;
}

export async function assessRisk(
  input: string,
  intentCategory: string,
  defaultRisk: string,
  connectors: string[]
): Promise<RiskAssessment> {
  const response = await callLLM({
    systemPrompt: `You are a risk assessment engine for workflow automation. Analyze the described workflow and determine its risk level.

Factors to consider:
- Number of external services involved (more = higher risk)
- Whether destructive operations are involved (delete, merge to main, etc.)
- Whether production data is being accessed or modified
- Whether external communications are being sent
- The intent category context

Return ONLY valid JSON with "level" ("low", "medium", or "high") and "rationale" (string) fields.`,
    userPrompt: `Intent Category: ${intentCategory}
Default Risk: ${defaultRisk}
Services Involved: ${connectors.join(', ')}
Workflow Description: ${input}`,
    temperature: 0.2,
  });

  try {
    const parsed = JSON.parse(response.content);
    return {
      level: parsed.level as RiskLevel,
      rationale: parsed.rationale,
    };
  } catch {
    return {
      level: defaultRisk as RiskLevel,
      rationale: `Default risk level for ${intentCategory} workflows.`,
    };
  }
}
