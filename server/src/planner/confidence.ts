import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface SensitivityRule {
  operation: string;
  connector: string;
  sensitivity: string;
  reason: string;
  requiresApproval: boolean;
}

interface SensitivityConfig {
  rules: SensitivityRule[];
  thresholds: {
    confidenceGateThreshold: number;
    autoApproveAbove: number;
  };
}

let cachedConfig: SensitivityConfig | null = null;

export function loadSensitivityConfig(): SensitivityConfig {
  if (cachedConfig) return cachedConfig;

  try {
    const raw = readFileSync(join(__dirname, '..', 'config', 'sensitivity.yaml'), 'utf-8');
    cachedConfig = parse(raw) as SensitivityConfig;
    return cachedConfig;
  } catch {
    cachedConfig = {
      rules: [],
      thresholds: { confidenceGateThreshold: 70, autoApproveAbove: 95 },
    };
    return cachedConfig;
  }
}

export function loadSensitivityRules(): SensitivityRule[] {
  return loadSensitivityConfig().rules;
}

export function getConfidenceThreshold(): number {
  return loadSensitivityConfig().thresholds.confidenceGateThreshold;
}

export function getAutoApproveThreshold(): number {
  return loadSensitivityConfig().thresholds.autoApproveAbove;
}

export function isOperationSensitive(connector: string, operation: string): boolean {
  const rules = loadSensitivityRules();
  const rule = rules.find(r => r.connector === connector && r.operation === operation);
  return rule?.requiresApproval ?? false;
}

export function getSensitivityInfo(connector: string, operation: string): SensitivityRule | undefined {
  return loadSensitivityRules().find(r => r.connector === connector && r.operation === operation);
}
