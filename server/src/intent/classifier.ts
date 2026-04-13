import { callLLM } from '../llm/client.js';
import type { IntentCategory } from '../planner/dag-types.js';

export interface ClassificationResult {
  category: IntentCategory;
  confidence: number;
}

export async function classifyIntent(input: string, intentsConfig: IntentConfig[]): Promise<ClassificationResult> {
  const categoriesList = intentsConfig.map(c => `- ${c.id}: ${c.name} (keywords: ${c.keywords.join(', ')})`).join('\n');

  const response = await callLLM({
    systemPrompt: `You are an intent classification engine. Classify the user's natural language workflow description into one of the following categories. Return ONLY valid JSON with "category" and "confidence" (0-100) fields.

Categories:
${categoriesList}

If no category fits well, use "custom".`,
    userPrompt: input,
    temperature: 0.1,
  });

  try {
    const parsed = JSON.parse(response.content);
    return {
      category: parsed.category as IntentCategory,
      confidence: parsed.confidence as number,
    };
  } catch {
    // Fallback: keyword matching
    return keywordMatch(input, intentsConfig);
  }
}

function keywordMatch(input: string, configs: IntentConfig[]): ClassificationResult {
  const lower = input.toLowerCase();
  let bestMatch: IntentCategory = 'custom';
  let bestScore = 0;

  for (const config of configs) {
    const matches = config.keywords.filter(k => lower.includes(k.toLowerCase())).length;
    if (matches > bestScore) {
      bestScore = matches;
      bestMatch = config.id as IntentCategory;
    }
  }

  return {
    category: bestMatch,
    confidence: Math.min(95, 50 + bestScore * 15),
  };
}

export interface IntentConfig {
  id: string;
  name: string;
  keywords: string[];
  runbookId: string;
  defaultRisk: string;
}
