import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const EMPTY_ACTIVE = {
  uuid: '',
  vid: '',
  isLogin: false,
  qrcode: '',
  qrcodeKey: '',
  lastEvent: '',
  lastError: '',
  updatedAt: '',
};

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(private prisma: PrismaService) {}

  private rowToActive(row: any) {
    if (!row) return { ...EMPTY_ACTIVE };
    return {
      uuid: row.uuid || '',
      vid: row.vid || '',
      isLogin: Boolean(row.is_login),
      qrcode: row.qrcode || '',
      qrcodeKey: row.qrcode_key || '',
      lastEvent: row.last_event || '',
      lastError: row.last_error || '',
      updatedAt: row.updated_at ? row.updated_at.toISOString() : '',
    };
  }

  async getActive(uuid: string) {
    if (!uuid) return { ...EMPTY_ACTIVE };
    const row = await this.prisma.session.findUnique({
      where: { uuid },
    });
    return this.rowToActive(row);
  }

  async getLatestActive() {
    const row = await this.prisma.session.findFirst({
      orderBy: { updated_at: 'desc' },
    });
    return this.rowToActive(row);
  }

  async updateActive(patch: any) {
    const uuid = patch.uuid;
    if (!uuid) {
      this.logger.warn(
        `[updateActive] Missing uuid, skipping DB write. lastEvent=${patch.lastEvent || ''}`,
      );
      return { ...EMPTY_ACTIVE, ...patch, updatedAt: new Date().toISOString() };
    }

    const dataToUpdate: any = {};
    if (patch.vid !== undefined) dataToUpdate.vid = patch.vid;
    if (patch.isLogin !== undefined)
      dataToUpdate.is_login = patch.isLogin ? 1 : 0;
    if (patch.qrcode !== undefined) dataToUpdate.qrcode = patch.qrcode;
    if (patch.qrcodeKey !== undefined)
      dataToUpdate.qrcode_key = patch.qrcodeKey;
    if (patch.lastEvent !== undefined)
      dataToUpdate.last_event = patch.lastEvent;
    if (patch.lastError !== undefined)
      dataToUpdate.last_error = patch.lastError;

    const dataToCreate = {
      uuid,
      vid: patch.vid ?? '',
      is_login: patch.isLogin ? 1 : 0,
      qrcode: patch.qrcode ?? null,
      qrcode_key: patch.qrcodeKey ?? '',
      last_event: patch.lastEvent ?? '',
      last_error: patch.lastError ?? null,
    };

    const row = await this.prisma.session.upsert({
      where: { uuid },
      update: dataToUpdate,
      create: dataToCreate,
    });

    return this.rowToActive(row);
  }

  async safeUpdateActive(patch: any) {
    try {
      await this.updateActive(patch);
    } catch (e) {
      this.logger.error(`[safeUpdateActive] fallback: ${e.message}`);
    }
  }
}
