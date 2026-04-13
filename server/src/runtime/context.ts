import type { RuntimeContext } from '../planner/dag-types.js';
import { callLLM } from '../llm/client.js';

const CONTEXT_TOKEN_THRESHOLD = parseInt(process.env.CONTEXT_TOKEN_THRESHOLD || '2000');

export class ContextManager {
  private context: RuntimeContext = {
    outputs: {},
    summaries: {},
    fullPayloads: {},
  };

  getContext(): RuntimeContext {
    return this.context;
  }

  async storeOutput(nodeId: string, output: unknown): Promise<void> {
    this.context.fullPayloads[nodeId] = output;

    // Check token size (rough estimate: 4 chars per token)
    const outputStr = JSON.stringify(output);
    const estimatedTokens = Math.ceil(outputStr.length / 4);

    if (estimatedTokens > CONTEXT_TOKEN_THRESHOLD) {
      // Summarize large outputs
      const summary = await this.summarizeOutput(outputStr);
      this.context.summaries[nodeId] = summary;
      this.context.outputs[nodeId] = JSON.parse(summary);
    } else {
      this.context.outputs[nodeId] = output;
    }
  }

  getOutput(nodeId: string): unknown {
    return this.context.outputs[nodeId];
  }

  getFullPayload(nodeId: string): unknown {
    return this.context.fullPayloads[nodeId];
  }

  getAllOutputs(): Record<string, unknown> {
    return { ...this.context.outputs };
  }

  // Resolve $output.nodeId.field references in parameters
  resolveReferences(params: Record<string, unknown>): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        resolved[key] = this.resolveStringValue(value);
      } else if (Array.isArray(value)) {
        resolved[key] = value.map(v =>
          typeof v === 'string' ? this.resolveStringValue(v) : v
        );
      } else if (typeof value === 'object' && value !== null) {
        resolved[key] = this.resolveReferences(value as Record<string, unknown>);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  private resolveStringValue(value: string): unknown {
    // Match $output.nodeId.field patterns
    const refPattern = /\$output\.([a-zA-Z0-9_]+)\.([a-zA-Z0-9_.]+)/g;

    // If the entire string is a single reference, return the raw value (not stringified)
    const singleMatch = value.match(/^\$output\.([a-zA-Z0-9_]+)\.([a-zA-Z0-9_.]+)$/);
    if (singleMatch) {
      const [, nodeId, fieldPath] = singleMatch;
      return this.resolveFieldPath(nodeId, fieldPath);
    }

    // If there are embedded references in a string, replace them inline
    return value.replace(refPattern, (match, nodeId, fieldPath) => {
      const resolved = this.resolveFieldPath(nodeId, fieldPath);
      return String(resolved ?? match);
    });
  }

  private resolveFieldPath(nodeId: string, fieldPath: string): unknown {
    const output = this.context.outputs[nodeId];
    if (output === undefined || output === null) return undefined;

    const parts = fieldPath.split('.');
    let current: unknown = output;

    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  private async summarizeOutput(outputStr: string): Promise<string> {
    const response = await callLLM({
      systemPrompt: 'You are a data summarization engine. Summarize the following API response into a concise JSON object containing only the most important fields needed for downstream workflow steps. Return ONLY valid JSON.',
      userPrompt: outputStr,
      maxTokens: 500,
      temperature: 0.1,
    });

    return response.content;
  }

  reset(): void {
    this.context = {
      outputs: {},
      summaries: {},
      fullPayloads: {},
    };
  }
}
