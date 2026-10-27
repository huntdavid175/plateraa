import { Controller, Get, Header, Inject, Injectable, Query, StreamableFile } from '@nestjs/common';
import { sql, withPlatform, type Tx } from '@brixx/db';
import { ApiBearerAuth, ApiOkResponse, ApiProduces } from '@nestjs/swagger';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { Platform } from './guard';
import { AuditQueryDto, AuditRowDto } from './schemas';

export interface AuditFilter {
  tenantId?: string;
  who: 'all' | 'brixx' | 'vendor';
  action?: string;
  from?: string;
  to?: string;
  before?: string;
  limit: number;
}

/**
 * The audit log across businesses, newest first. A Brixx team member's actions carry their login
 * id in `actor_platform` ('admin' from the command line), and show as "Name (Brixx)".
 */
export async function auditRows(tx: Tx, filter: AuditFilter) {
  const where = [sql`true`];
  if (filter.tenantId) where.push(sql`a.tenant_id = ${filter.tenantId}`);
  if (filter.who === 'brixx') where.push(sql`a.actor_platform is not null`);
  if (filter.who === 'vendor') where.push(sql`a.actor_platform is null`);
  if (filter.action) where.push(sql`a.action ilike ${`${filter.action.replace(/[\\%_]/g, '')}%`}`);
  if (filter.from)
    where.push(sql`a.created_at >= (${filter.from}::date at time zone 'Africa/Accra')`);
  if (filter.to) {
    where.push(sql`a.created_at < ((${filter.to}::date + 1) at time zone 'Africa/Accra')`);
  }
  if (filter.before) where.push(sql`a.id < ${filter.before}`);

  const { rows } = await tx.execute<{
    id: string;
    tenant_id: string;
    business_name: string;
    actor_platform: string | null;
    platform_name: string | null;
    staff_name: string | null;
    action: string;
    entity_type: string;
    entity_id: string;
    before: unknown;
    after: unknown;
    created_at: Date;
  }>(sql`
    select a.id, a.tenant_id, t.name as business_name, a.actor_platform, u.name as platform_name,
      s.display_name as staff_name, a.action, a.entity_type, a.entity_id, a.before, a.after,
      a.created_at
    from audit_events a
    join tenants t on t.id = a.tenant_id
    left join "user" u on u.id = a.actor_platform
    left join staff_members s on s.id = a.actor_staff_id
    where ${sql.join(where, sql` and `)}
    order by a.id desc limit ${filter.limit}`);

  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    businessName: row.business_name,
    actorName: row.actor_platform
      ? `${row.platform_name ?? 'Command line'} (Brixx)`
      : (row.staff_name ?? 'System'),
    byBrixx: row.actor_platform !== null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    before: row.before,
    after: row.after,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

/** Lets Excel read the file as UTF-8 (cedi signs, names). */
const BOM = String.fromCharCode(0xfeff);

const csvCell = (value: unknown) => {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  // Quote everything; a leading = + - @ could run as a formula in a spreadsheet.
  return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
};

@Injectable()
export class PlatformAudit {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  list(filter: AuditFilter) {
    return withPlatform(this.database.db, (tx) => auditRows(tx, filter));
  }

  /** Up to 50,000 rows as CSV, for an Admin to keep or hand over. */
  async csv(filter: AuditFilter) {
    const rows = await this.list({ ...filter, before: undefined, limit: 50_000 });
    const header = [
      'When (UTC)',
      'Business',
      'Who',
      'By Brixx',
      'Action',
      'Entity',
      'Entity id',
      'Before',
      'After',
    ];
    const lines = rows.map((r) =>
      [
        r.createdAt,
        r.businessName,
        r.actorName,
        r.byBrixx ? 'yes' : 'no',
        r.action,
        r.entityType,
        r.entityId,
        r.before,
        r.after,
      ]
        .map(csvCell)
        .join(','),
    );
    return [header.map(csvCell).join(','), ...lines].join('\r\n');
  }
}

@Controller('platform/audit')
@ApiBearerAuth()
export class PlatformAuditController {
  constructor(private readonly audit: PlatformAudit) {}

  @Get()
  @Platform('platform.view')
  @ApiOkResponse({ type: AuditRowDto.Output, isArray: true })
  list(@Query() query: AuditQueryDto) {
    return this.audit.list(query);
  }

  @Get('export')
  @Platform('audit.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="brixx-audit-log.csv"')
  @ApiProduces('text/csv')
  @ApiOkResponse({ schema: { type: 'string' } })
  async export(@Query() query: AuditQueryDto) {
    return new StreamableFile(Buffer.from(BOM + (await this.audit.csv(query)), 'utf8'));
  }
}
