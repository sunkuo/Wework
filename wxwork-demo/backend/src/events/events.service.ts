import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;

  public monitor = {
    enabled: false,
    running: false,
    lastCheckAt: '',
    lastReconnectAt: '',
    reconnecting: false,
    timer: null as NodeJS.Timeout | null,
  };

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  onModuleInit() {
    const interval = this.configService.get<number>(
      'EVENT_CLEANUP_INTERVAL',
      60000,
    );
    this.startCleanup(interval);
  }

  onModuleDestroy() {
    this.stopCleanup();
    if (this.monitor.timer) {
      clearInterval(this.monitor.timer);
    }
  }

  private truncateString(text: any, max = 240) {
    const s = String(text ?? '');
    if (s.length <= max) return s;
    return `${s.slice(0, max)}...<truncated ${s.length - max} chars>`;
  }

  private sanitizeForLog(value: any, key = '', depth = 0): any {
    if (depth > 6) return '[max_depth]';
    if (value == null) return value;

    if (typeof value === 'string') {
      if (key === 'qrcode_data') return this.truncateString(value, 80);
      if (key === 'raw' || key === 'payload')
        return this.truncateString(value, 1000);
      return this.truncateString(value, 240);
    }

    if (Array.isArray(value)) {
      const maxItems = 30;
      const out = value
        .slice(0, maxItems)
        .map((item) => this.sanitizeForLog(item, '', depth + 1));
      if (value.length > maxItems)
        out.push(`[truncated_items:${value.length - maxItems}]`);
      return out;
    }

    if (typeof value === 'object') {
      const out: any = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = this.sanitizeForLog(v, k, depth + 1);
      }
      return out;
    }

    return value;
  }

  async pushEvent(event: any) {
    const sanitized = this.sanitizeForLog(event);
    const sessionUuid =
      sanitized.request?.uuid || sanitized.payload?.uuid || '';
    const stage = sanitized.stage || '';
    const eventType = sanitized.eventType || '';
    const finalSessionUuid = sessionUuid || undefined;

    try {
      await this.prisma.event.create({
        data: {
          session_uuid: finalSessionUuid,
          stage,
          event_type: eventType,
          payload: sanitized as Prisma.InputJsonValue,
        },
      });
    } catch (err: any) {
      if (err.code === 'P2003' && finalSessionUuid) {
        this.logger.warn(
          `[pushEvent] session ${finalSessionUuid} not found, saving as orphan event`,
        );
        try {
          await this.prisma.event.create({
            data: {
              session_uuid: undefined,
              stage: `${stage} (orphan)`,
              event_type: eventType,
              payload: {
                ...sanitized,
                original_uuid: finalSessionUuid,
              } as Prisma.InputJsonValue,
            },
          });
        } catch (retryErr: any) {
          this.logger.error(
            `[pushEvent] orphan retry error: ${retryErr.message}`,
          );
        }
      } else {
        this.logger.error(`[pushEvent] error: ${err.message}`);
      }
    }
  }

  async safePushEvent(event: any) {
    try {
      await this.pushEvent(event);
    } catch (e: any) {
      this.logger.error(`[safePushEvent] fallback: ${e.message}`);
    }
  }

  async getEventsCount() {
    return await this.prisma.event.count();
  }

  async getEvents(limit?: number) {
    const maxEvents = this.configService.get<number>('MAX_EVENTS', 100);
    const events = await this.prisma.event.findMany({
      orderBy: { created_at: 'desc' },
      take: limit || maxEvents,
    });

    return events.map((row) => {
      const payload: any = row.payload || {};
      return {
        time: row.created_at ? row.created_at.toISOString() : '',
        stage: row.stage || '',
        ...payload,
      };
    });
  }

  private async cleanupOldEvents() {
    try {
      const maxEvents = this.configService.get<number>('MAX_EVENTS', 100);
      const count = await this.prisma.event.count();
      if (count > maxEvents) {
        const deleteCount = count - maxEvents;
        const eventsToDelete = await this.prisma.event.findMany({
          select: { id: true },
          orderBy: { created_at: 'asc' },
          take: deleteCount,
        });

        if (eventsToDelete.length > 0) {
          const ids = eventsToDelete.map((e) => e.id);
          await this.prisma.event.deleteMany({
            where: { id: { in: ids } },
          });
        }
      }
    } catch (err: any) {
      this.logger.error(`[cleanup] error: ${err.message}`);
    }
  }

  startCleanup(intervalMs = 60000) {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = setInterval(() => this.cleanupOldEvents(), intervalMs);
  }

  stopCleanup() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }
}
