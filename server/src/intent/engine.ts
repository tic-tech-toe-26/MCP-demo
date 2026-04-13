import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';
import { v4 as uuidv4 } from 'uuid';
import { classifyIntent, type IntentConfig } from './classifier.js';
import { assessRisk } from './risk-assessor.js';
import type {
  IntentAnalysis,
  ClarificationQuestion,
  RunbookTemplate,
  IntentCategory,
} from '../planner/dag-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface RunbookConfig {
  id: string;
  name: string;
  description: string;
  requiredFields: string[];
  suggestedSteps: string[];
  connectors: string[];
}

let intentsConfig: IntentConfig[] | null = null;
let runbooksConfig: RunbookConfig[] | null = null;

function loadIntentsConfig(): IntentConfig[] {
  if (intentsConfig) return intentsConfig;
  try {
    const raw = readFileSync(join(__dirname, '..', 'config', 'intents.yaml'), 'utf-8');
    const parsed = parse(raw) as { categories: IntentConfig[] };
    intentsConfig = parsed.categories;
    return intentsConfig;
  } catch {
    console.warn('Failed to load intents.yaml, using defaults');
    intentsConfig = [];
    return intentsConfig;
  }
}

function loadRunbooksConfig(): RunbookConfig[] {
  if (runbooksConfig) return runbooksConfig;
  try {
    const raw = readFileSync(join(__dirname, '..', 'config', 'runbooks.yaml'), 'utf-8');
    const parsed = parse(raw) as { runbooks: RunbookConfig[] };
    runbooksConfig = parsed.runbooks;
    return runbooksConfig;
  } catch {
    console.warn('Failed to load runbooks.yaml, using defaults');
    runbooksConfig = [];
    return runbooksConfig;
  }
}

export async function analyzeIntent(input: string): Promise<IntentAnalysis> {
  const intents = loadIntentsConfig();
  const runbooks = loadRunbooksConfig();

  // Step 1: Classify intent
  const classification = await classifyIntent(input, intents);

  // Step 2: Find matching intent config and runbook
  const intentConfig = intents.find(i => i.id === classification.category);
  const runbookId = intentConfig?.runbookId || 'runbook_custom';
  const runbookConfig = runbooks.find(r => r.id === runbookId);

  // Step 3: Build runbook template
  const runbookTemplate: RunbookTemplate = {
    id: runbookId,
    name: runbookConfig?.name || 'Custom Workflow',
    description: runbookConfig?.description || 'A custom workflow',
    requiredFields: runbookConfig?.requiredFields || [],
    suggestedSteps: runbookConfig?.suggestedSteps || [],
    connectors: runbookConfig?.connectors || [],
  };

  // Step 4: Infer missing context → generate clarification questions
  const clarifications = inferClarifications(input, runbookTemplate);

  // Step 5: Detect ambiguities
  const ambiguities = detectAmbiguities(input);

  // Step 6: Assess risk
  const defaultRisk = intentConfig?.defaultRisk || 'medium';
  const risk = await assessRisk(input, classification.category, defaultRisk, runbookTemplate.connectors);

  return {
    category: classification.category,
    confidence: classification.confidence,
    riskLevel: risk.level,
    riskRationale: risk.rationale,
    clarifications,
    ambiguities,
    runbookId,
    runbookTemplate,
  };
}

function inferClarifications(input: string, runbook: RunbookTemplate): ClarificationQuestion[] {
  const questions: ClarificationQuestion[] = [];
  const lower = input.toLowerCase();

  const fieldChecks: Record<string, { keywords: string[]; question: string; default?: string }> = {
    project: {
      keywords: ['proj', 'project', 'jira project'],
      question: 'Which Jira project should this be created in?',
      default: 'PROJ',
    },
    severity: {
      keywords: ['p0', 'p1', 'p2', 'p3', 'p4', 'critical', 'high', 'medium', 'low', 'severity', 'priority'],
      question: 'What severity/priority level should be assigned?',
      default: 'P2',
    },
    assignee: {
      keywords: ['assign', 'assignee', 'owner', 'responsible'],
      question: 'Who should be assigned to this task?',
      default: 'unassigned',
    },
    notificationChannel: {
      keywords: ['channel', 'slack', 'notify', '#'],
      question: 'Which Slack channel should be notified?',
      default: 'general',
    },
    version: {
      keywords: ['version', 'v1', 'v2', 'release'],
      question: 'What version number is this for?',
      default: 'v1.0.0',
    },
    targetBranch: {
      keywords: ['branch', 'main', 'develop', 'staging'],
      question: 'Which target branch should be used?',
      default: 'main',
    },
    description: {
      keywords: ['description', 'details', 'body', 'content'],
      question: 'Provide additional description or details.',
      default: '',
    },
    sourceSheet: {
      keywords: ['sheet', 'spreadsheet', 'source'],
      question: 'Which spreadsheet should be used?',
      default: 'Bug Tracker',
    },
  };

  for (const field of runbook.requiredFields) {
    const check = fieldChecks[field];
    if (check) {
      const present = check.keywords.some(k => lower.includes(k));
      if (!present) {
        questions.push({
          id: uuidv4(),
          question: check.question,
          field,
          required: true,
          defaultValue: check.default,
        });
      }
    }
  }

  return questions;
}

function detectAmbiguities(input: string): string[] {
  const ambiguities: string[] = [];
  const lower = input.toLowerCase();

  // Check for vague references
  if (lower.includes('it') && !lower.includes('item')) {
    ambiguities.push('Ambiguous reference "it" — please specify which entity you are referring to.');
  }

  if (lower.includes('them') || lower.includes('those')) {
    ambiguities.push('Ambiguous reference to multiple entities — please specify which items you are referring to.');
  }

  // Check for conflicting instructions
  if (lower.includes('delete') && lower.includes('create')) {
    if (lower.indexOf('delete') < lower.indexOf('create')) {
      ambiguities.push('Delete followed by create may indicate replacement intent — please confirm if you want to delete before creating, or just update.');
    }
  }

  // Check for missing target specificity
  if (lower.includes('all') && (lower.includes('delete') || lower.includes('remove'))) {
    ambiguities.push('Destructive operation on "all" items detected — please confirm the exact scope to avoid unintended data loss.');
  }

  return ambiguities;
}
