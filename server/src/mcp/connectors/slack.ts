import { v4 as uuidv4 } from 'uuid';
import { BaseMCPConnector } from '../base-connector.js';
import type { ToolManifest, ToolInvocationResult } from '../../planner/dag-types.js';

interface SlackMessage {
  id: string;
  channel: string;
  text: string;
  sender: string;
  timestamp: string;
}

interface SlackChannel {
  id: string;
  name: string;
  members: string[];
  createdAt: string;
}

export class SlackConnector extends BaseMCPConnector {
  readonly name = 'slack';
  readonly category = 'communication';
  readonly description = 'Slack communication - send messages, manage channels';

  private messages: Map<string, SlackMessage> = new Map();
  private channels: Map<string, SlackChannel> = new Map([
    ['general', { id: 'C001', name: 'general', members: ['user1', 'user2', 'bot'], createdAt: new Date().toISOString() }],
    ['engineering', { id: 'C002', name: 'engineering', members: ['dev1', 'dev2', 'devlead'], createdAt: new Date().toISOString() }],
    ['incidents', { id: 'C003', name: 'incidents', members: ['oncall1', 'oncall2', 'manager'], createdAt: new Date().toISOString() }],
    ['releases', { id: 'C004', name: 'releases', members: ['dev1', 'dev2', 'pm1', 'qa1'], createdAt: new Date().toISOString() }],
  ]);

  getTools(): ToolManifest[] {
    return [
      {
        name: 'send_message',
        description: 'Send a message to a Slack channel',
        inputSchema: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'Channel name' },
            text: { type: 'string', description: 'Message text (supports Slack markdown)' },
            sender: { type: 'string', description: 'Sender name/bot name' },
          },
          required: ['channel', 'text'],
        },
      },
      {
        name: 'create_channel',
        description: 'Create a new Slack channel',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Channel name' },
            members: { type: 'array', items: { type: 'string' }, description: 'Initial members' },
          },
          required: ['name'],
        },
      },
      {
        name: 'list_channels',
        description: 'List all Slack channels',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get_channel_members',
        description: 'Get members of a Slack channel',
        inputSchema: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'Channel name' },
          },
          required: ['channel'],
        },
      },
      {
        name: 'delete_message',
        description: 'Delete a previously sent message',
        inputSchema: {
          type: 'object',
          properties: {
            messageId: { type: 'string', description: 'Message ID to delete' },
          },
          required: ['messageId'],
        },
      },
    ];
  }

  async executeTool(toolName: string, params: Record<string, unknown>): Promise<ToolInvocationResult> {
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 30 + Math.random() * 80));

    switch (toolName) {
      case 'send_message': {
        const channel = params.channel as string;
        const ch = this.channels.get(channel);
        if (!ch) return { success: false, error: `Channel #${channel} not found`, duration: Date.now() - start };

        const msg: SlackMessage = {
          id: uuidv4(),
          channel,
          text: params.text as string,
          sender: (params.sender as string) || 'MCP Gateway Bot',
          timestamp: new Date().toISOString(),
        };
        this.messages.set(msg.id, msg);
        return { success: true, data: { messageId: msg.id, channel, timestamp: msg.timestamp }, duration: Date.now() - start };
      }

      case 'create_channel': {
        const name = params.name as string;
        if (this.channels.has(name)) {
          return { success: false, error: `Channel #${name} already exists`, duration: Date.now() - start };
        }
        const ch: SlackChannel = {
          id: uuidv4(),
          name,
          members: (params.members as string[]) || [],
          createdAt: new Date().toISOString(),
        };
        this.channels.set(name, ch);
        return { success: true, data: ch, duration: Date.now() - start };
      }

      case 'list_channels': {
        const channels = Array.from(this.channels.values());
        return { success: true, data: { channels, total: channels.length }, duration: Date.now() - start };
      }

      case 'get_channel_members': {
        const ch = this.channels.get(params.channel as string);
        if (!ch) return { success: false, error: `Channel #${params.channel} not found`, duration: Date.now() - start };
        return { success: true, data: { channel: ch.name, members: ch.members }, duration: Date.now() - start };
      }

      case 'delete_message': {
        const msgId = params.messageId as string;
        const deleted = this.messages.delete(msgId);
        if (!deleted) return { success: false, error: `Message ${msgId} not found`, duration: Date.now() - start };
        return { success: true, data: { deleted: msgId }, duration: Date.now() - start };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}`, duration: Date.now() - start };
    }
  }
}
