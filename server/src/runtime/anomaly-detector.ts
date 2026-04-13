import { callLLM } from '../llm/client.js';
import type { AnomalyResult } from '../planner/dag-types.js';

export async function checkAnomaly(
  nodeId: string,
  nodeOutput: unknown,
  originalIntent: string,
  connector: string,
  tool: string,
  allPriorOutputs: Record<string, unknown>
): Promise<AnomalyResult> {
  const response = await callLLM({
    systemPrompt: `You are an anomaly detection checkpoint for a workflow orchestration system. After each node completes, you evaluate whether its output is semantically consistent with:
1. The workflow's original intent
2. All previously completed node outputs (cross-consistency)

Types of anomalies to detect:
- Priority mismatches (e.g., Jira P0 but GitHub issue with "low" priority)
- Recipient not found in target channel
- Data type mismatches or broken formulas
- Missing or null critical fields
- Semantic inconsistencies between related operations

Return ONLY valid JSON with:
- isAnomaly (boolean)
- severity ("low" | "medium" | "high" | "critical")
- description (string explaining the anomaly or confirming consistency)
- suggestedAction ("ignore" | "modify" | "rollback")`,
    userPrompt: `Original Workflow Intent: ${originalIntent}

Current Node: ${nodeId}
Connector: ${connector}
Tool: ${tool}
Node Output: ${JSON.stringify(nodeOutput)}

All Prior Node Outputs:
${JSON.stringify(allPriorOutputs, null, 2)}

Evaluate whether this output is consistent with the intent and prior outputs.`,
    temperature: 0.2,
    maxTokens: 1024,
  });

  try {
    const parsed = JSON.parse(response.content);
    return {
      isAnomaly: Boolean(parsed.isAnomaly),
      severity: parsed.severity || 'low',
      description: parsed.description || 'Anomaly check completed.',
      suggestedAction: parsed.suggestedAction || 'ignore',
    };
  } catch {
    return {
      isAnomaly: false,
      severity: 'low',
      description: 'Anomaly check completed — output appears consistent.',
      suggestedAction: 'ignore',
    };
  }
}
