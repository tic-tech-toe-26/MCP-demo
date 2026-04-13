import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';
import { BaseMCPConnector } from './base-connector.js';
import type { ConnectorManifest, PermissionRule } from '../planner/dag-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ConnectorRegistry {
  private connectors: Map<string, BaseMCPConnector> = new Map();
  private permissions: Map<string, PermissionRule> = new Map();

  constructor() {
    this.loadPermissions();
  }

  private loadPermissions(): void {
    try {
      const permPath = join(__dirname, '..', 'config', 'permissions.yaml');
      const raw = readFileSync(permPath, 'utf-8');
      const parsed = parse(raw) as { connectors: PermissionRule[] };
      if (parsed?.connectors) {
        for (const rule of parsed.connectors) {
          this.permissions.set(rule.connector, rule);
        }
      }
    } catch {
      console.warn('No permissions.yaml found, using defaults');
    }
  }

  register(connector: BaseMCPConnector): void {
    const perm = this.permissions.get(connector.name);
    if (perm) {
      connector.setPermissions(perm.allowedOperations, perm.deniedOperations);
    }
    this.connectors.set(connector.name, connector);
  }

  get(name: string): BaseMCPConnector | undefined {
    return this.connectors.get(name);
  }

  getAll(): BaseMCPConnector[] {
    return Array.from(this.connectors.values());
  }

  getAllManifests(): ConnectorManifest[] {
    return this.getAll().map((c) => c.getManifest());
  }

  listConnectorNames(): string[] {
    return Array.from(this.connectors.keys());
  }
}
