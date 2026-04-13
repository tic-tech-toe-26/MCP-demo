import { v4 as uuidv4 } from 'uuid';
import { BaseMCPConnector } from '../base-connector.js';
import type { ToolManifest, ToolInvocationResult } from '../../planner/dag-types.js';

interface SheetRow {
  rowIndex: number;
  values: string[];
}

interface Sheet {
  id: string;
  name: string;
  headers: string[];
  rows: SheetRow[];
}

export class SheetsConnector extends BaseMCPConnector {
  readonly name = 'sheets';
  readonly category = 'data_analytics';
  readonly description = 'Google Sheets - read, write, and manage spreadsheet data';

  private sheets: Map<string, Sheet> = new Map([
    ['Bug Tracker', {
      id: 'sheet-1',
      name: 'Bug Tracker',
      headers: ['ID', 'Title', 'Priority', 'Status', 'Assignee', 'Date'],
      rows: [
        { rowIndex: 1, values: ['BUG-001', 'Login page crash', 'P0', 'Open', 'dev1', '2024-01-15'] },
        { rowIndex: 2, values: ['BUG-002', 'Slow API response', 'P2', 'In Progress', 'dev2', '2024-01-16'] },
      ],
    }],
    ['Deployment Log', {
      id: 'sheet-2',
      name: 'Deployment Log',
      headers: ['Version', 'Date', 'Status', 'Deployer', 'Notes'],
      rows: [
        { rowIndex: 1, values: ['v1.0.0', '2024-01-10', 'Success', 'devops1', 'Initial release'] },
      ],
    }],
  ]);

  getTools(): ToolManifest[] {
    return [
      {
        name: 'append_row',
        description: 'Append a new row to a spreadsheet',
        inputSchema: {
          type: 'object',
          properties: {
            sheetName: { type: 'string', description: 'Sheet name' },
            values: { type: 'array', items: { type: 'string' }, description: 'Row values in column order' },
          },
          required: ['sheetName', 'values'],
        },
      },
      {
        name: 'read_range',
        description: 'Read a range of rows from a spreadsheet',
        inputSchema: {
          type: 'object',
          properties: {
            sheetName: { type: 'string', description: 'Sheet name' },
            startRow: { type: 'number', description: 'Start row (1-indexed)' },
            endRow: { type: 'number', description: 'End row (1-indexed)' },
          },
          required: ['sheetName'],
        },
      },
      {
        name: 'update_cell',
        description: 'Update a specific cell value',
        inputSchema: {
          type: 'object',
          properties: {
            sheetName: { type: 'string', description: 'Sheet name' },
            row: { type: 'number', description: 'Row index (1-indexed)' },
            column: { type: 'number', description: 'Column index (0-indexed)' },
            value: { type: 'string', description: 'New cell value' },
          },
          required: ['sheetName', 'row', 'column', 'value'],
        },
      },
      {
        name: 'create_sheet',
        description: 'Create a new spreadsheet with headers',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Sheet name' },
            headers: { type: 'array', items: { type: 'string' }, description: 'Column headers' },
          },
          required: ['name', 'headers'],
        },
      },
      {
        name: 'delete_row',
        description: 'Delete a specific row from a spreadsheet',
        inputSchema: {
          type: 'object',
          properties: {
            sheetName: { type: 'string', description: 'Sheet name' },
            rowIndex: { type: 'number', description: 'Row index to delete (1-indexed)' },
          },
          required: ['sheetName', 'rowIndex'],
        },
      },
      {
        name: 'get_formula',
        description: 'Get the formula or value at a cell position',
        inputSchema: {
          type: 'object',
          properties: {
            sheetName: { type: 'string', description: 'Sheet name' },
            row: { type: 'number', description: 'Row index (1-indexed)' },
            column: { type: 'number', description: 'Column index (0-indexed)' },
          },
          required: ['sheetName', 'row', 'column'],
        },
      },
    ];
  }

  async executeTool(toolName: string, params: Record<string, unknown>): Promise<ToolInvocationResult> {
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 60));

    switch (toolName) {
      case 'append_row': {
        const sheet = this.sheets.get(params.sheetName as string);
        if (!sheet) return { success: false, error: `Sheet "${params.sheetName}" not found`, duration: Date.now() - start };
        const newIndex = sheet.rows.length > 0 ? Math.max(...sheet.rows.map(r => r.rowIndex)) + 1 : 1;
        const row: SheetRow = { rowIndex: newIndex, values: params.values as string[] };
        sheet.rows.push(row);
        return { success: true, data: { sheetName: sheet.name, rowIndex: newIndex, values: row.values }, duration: Date.now() - start };
      }

      case 'read_range': {
        const sheet = this.sheets.get(params.sheetName as string);
        if (!sheet) return { success: false, error: `Sheet "${params.sheetName}" not found`, duration: Date.now() - start };
        const startRow = (params.startRow as number) || 1;
        const endRow = (params.endRow as number) || sheet.rows.length;
        const filtered = sheet.rows.filter(r => r.rowIndex >= startRow && r.rowIndex <= endRow);
        return { success: true, data: { headers: sheet.headers, rows: filtered, total: filtered.length }, duration: Date.now() - start };
      }

      case 'update_cell': {
        const sheet = this.sheets.get(params.sheetName as string);
        if (!sheet) return { success: false, error: `Sheet "${params.sheetName}" not found`, duration: Date.now() - start };
        const row = sheet.rows.find(r => r.rowIndex === (params.row as number));
        if (!row) return { success: false, error: `Row ${params.row} not found`, duration: Date.now() - start };
        const col = params.column as number;
        if (col < 0 || col >= sheet.headers.length) return { success: false, error: 'Column out of range', duration: Date.now() - start };
        const oldValue = row.values[col];
        row.values[col] = params.value as string;
        return { success: true, data: { sheetName: sheet.name, row: params.row, column: col, oldValue, newValue: params.value }, duration: Date.now() - start };
      }

      case 'create_sheet': {
        const name = params.name as string;
        if (this.sheets.has(name)) return { success: false, error: `Sheet "${name}" already exists`, duration: Date.now() - start };
        const sheet: Sheet = { id: uuidv4(), name, headers: (params.headers as string[]) || [], rows: [] };
        this.sheets.set(name, sheet);
        return { success: true, data: sheet, duration: Date.now() - start };
      }

      case 'delete_row': {
        const sheet = this.sheets.get(params.sheetName as string);
        if (!sheet) return { success: false, error: `Sheet "${params.sheetName}" not found`, duration: Date.now() - start };
        const idx = sheet.rows.findIndex(r => r.rowIndex === (params.rowIndex as number));
        if (idx === -1) return { success: false, error: `Row ${params.rowIndex} not found`, duration: Date.now() - start };
        const [deleted] = sheet.rows.splice(idx, 1);
        return { success: true, data: { deleted: deleted.values, rowIndex: params.rowIndex }, duration: Date.now() - start };
      }

      case 'get_formula': {
        const sheet = this.sheets.get(params.sheetName as string);
        if (!sheet) return { success: false, error: `Sheet "${params.sheetName}" not found`, duration: Date.now() - start };
        const row = sheet.rows.find(r => r.rowIndex === (params.row as number));
        if (!row) return { success: false, error: `Row ${params.row} not found`, duration: Date.now() - start };
        const col = params.column as number;
        const value = row.values[col] ?? null;
        return { success: true, data: { value, header: sheet.headers[col] }, duration: Date.now() - start };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}`, duration: Date.now() - start };
    }
  }
}
