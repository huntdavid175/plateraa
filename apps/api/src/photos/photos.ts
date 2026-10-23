import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Inject,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  Put,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { and, eq, isNull, items, tenantSettings, withTenant } from '@brixx/db';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { ulid } from 'ulid';
import { z } from 'zod';
import { recordAudit } from '../audit/audit';
import { ENV, type Env } from '../config/env';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { Authorized, CurrentActor } from '../identity/guards';
import type { Actor } from '../identity/request-context';
import { PHOTO_STORE, PHOTO_TYPES, R2PhotoStore, type PhotoStore } from './photo-store';

const MAX_BYTES = 1_500_000;

const FORMATS = {
  webp: { extension: 'webp', contentType: 'image/webp' },
  jpeg: { extension: 'jpg', contentType: 'image/jpeg' },
  png: { extension: 'png', contentType: 'image/png' },
} as const;
type Format = keyof typeof FORMATS;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** What the bytes really are, whatever the request says. */
function formatOf(bytes: Buffer): Format | null {
  if (
    bytes.length > 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.subarray(0, 8).equals(PNG)) return 'png';
  return null;
}

/** The store's own pictures on its online page. */
const STORE_PHOTOS = ['cover', 'logo'] as const;
type StorePhoto = (typeof STORE_PHOTOS)[number];

class PhotoDto extends createZodDto(z.object({ url: z.string() })) {}

/**
 * Menu and store photos (plan.md §4.0), kept in Cloudflare R2 under the business's own folder.
 * Each upload gets a new name, and the one it replaces is removed.
 */
@Injectable()
export class PhotosService {
  private readonly logger = new Logger(PhotosService.name);

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(PHOTO_STORE) private readonly store: PhotoStore,
  ) {}

  private checked(body: unknown): { bytes: Buffer; format: Format } {
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new UnsupportedMediaTypeException('Send the photo as a WebP, JPEG or PNG picture');
    }
    if (body.length > MAX_BYTES) {
      throw new BadRequestException('That photo is too big. Pick a smaller one.');
    }
    const format = formatOf(body);
    if (!format) throw new BadRequestException("That file isn't a picture we can use");
    if (!this.store.ready) {
      throw new ServiceUnavailableException("Photos aren't set up on the server yet");
    }
    return { bytes: body, format };
  }

  private async keep(key: string, photo: { bytes: Buffer; format: Format }) {
    await this.store.put(key, photo.bytes, FORMATS[photo.format].contentType);
  }

  /** The old photo goes once nothing points at it; a failure only leaves an unused file behind. */
  private forget(key: string | null) {
    if (!key) return;
    this.store.remove(key).catch((error: unknown) => {
      this.logger.warn(`Couldn't remove the old photo ${key}: ${(error as Error).message}`);
    });
  }

  private async itemPhoto(actor: Actor, itemId: string): Promise<string | null> {
    const [item] = await withTenant(this.database.db, actor.tenantId, (tx) =>
      tx
        .select({ photoKey: items.photoKey })
        .from(items)
        .where(and(eq(items.id, itemId), isNull(items.deletedAt))),
    );
    if (!item) throw new NotFoundException('That item is not on the menu');
    return item.photoKey;
  }

  private async saveItemKey(
    actor: Actor,
    itemId: string,
    before: string | null,
    key: string | null,
  ) {
    await withTenant(this.database.db, actor.tenantId, async (tx) => {
      await tx.update(items).set({ photoKey: key }).where(eq(items.id, itemId));
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorStaffId: actor.staffId,
        action: 'item.photo',
        entityType: 'item',
        entityId: itemId,
        before: { photoKey: before },
        after: { photoKey: key },
      });
    });
  }

  async setItemPhoto(actor: Actor, itemId: string, body: unknown) {
    const photo = this.checked(body);
    const before = await this.itemPhoto(actor, itemId);
    const key = `${actor.tenantId}/items/${itemId}/${ulid()}.${FORMATS[photo.format].extension}`;
    await this.keep(key, photo);
    await this.saveItemKey(actor, itemId, before, key);
    this.forget(before);
    return { url: this.store.urlOf(key) };
  }

  async removeItemPhoto(actor: Actor, itemId: string) {
    const before = await this.itemPhoto(actor, itemId);
    if (!before) return;
    await this.saveItemKey(actor, itemId, before, null);
    this.forget(before);
  }

  private async storePhoto(actor: Actor, which: StorePhoto): Promise<string | null> {
    const [settings] = await withTenant(this.database.db, actor.tenantId, (tx) =>
      tx
        .select({
          cover: tenantSettings.storefrontCoverKey,
          logo: tenantSettings.storefrontLogoKey,
        })
        .from(tenantSettings),
    );
    return settings?.[which] ?? null;
  }

  private async saveStoreKey(
    actor: Actor,
    which: StorePhoto,
    before: string | null,
    key: string | null,
  ) {
    await withTenant(this.database.db, actor.tenantId, async (tx) => {
      await tx
        .update(tenantSettings)
        .set(which === 'cover' ? { storefrontCoverKey: key } : { storefrontLogoKey: key })
        .where(eq(tenantSettings.tenantId, actor.tenantId));
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorStaffId: actor.staffId,
        action: `storefront.${which}`,
        entityType: 'tenant',
        entityId: actor.tenantId,
        before: { photoKey: before },
        after: { photoKey: key },
      });
    });
  }

  async setStorePhoto(actor: Actor, which: StorePhoto, body: unknown) {
    const photo = this.checked(body);
    const before = await this.storePhoto(actor, which);
    const key = `${actor.tenantId}/store/${which}-${ulid()}.${FORMATS[photo.format].extension}`;
    await this.keep(key, photo);
    await this.saveStoreKey(actor, which, before, key);
    this.forget(before);
    return { url: this.store.urlOf(key) };
  }

  async removeStorePhoto(actor: Actor, which: StorePhoto) {
    const before = await this.storePhoto(actor, which);
    if (!before) return;
    await this.saveStoreKey(actor, which, before, null);
    this.forget(before);
  }
}

const storePhotoOf = (which: string): StorePhoto => {
  if (!(STORE_PHOTOS as readonly string[]).includes(which)) throw new NotFoundException();
  return which as StorePhoto;
};

/** The picture is the request body itself (image/webp, image/jpeg or image/png). */
const PICTURE = { schema: { type: 'string', format: 'binary' } };

@Controller()
@ApiBearerAuth()
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Put('menu/items/:itemId/photo')
  @Authorized('catalog.manage')
  @ApiConsumes(...PHOTO_TYPES)
  @ApiBody(PICTURE)
  @ApiOkResponse({ type: PhotoDto.Output })
  setItemPhoto(
    @CurrentActor() actor: Actor,
    @Param('itemId') itemId: string,
    @Body() body: Buffer,
  ) {
    return this.photos.setItemPhoto(actor, itemId, body);
  }

  @Delete('menu/items/:itemId/photo')
  @Authorized('catalog.manage')
  @HttpCode(204)
  @ApiNoContentResponse()
  async removeItemPhoto(@CurrentActor() actor: Actor, @Param('itemId') itemId: string) {
    await this.photos.removeItemPhoto(actor, itemId);
  }

  /** The store's cover picture or logo, for its online page. */
  @Put('storefront/photos/:which')
  @Authorized('storefront.manage')
  @ApiConsumes(...PHOTO_TYPES)
  @ApiBody(PICTURE)
  @ApiOkResponse({ type: PhotoDto.Output })
  setStorePhoto(@CurrentActor() actor: Actor, @Param('which') which: string, @Body() body: Buffer) {
    return this.photos.setStorePhoto(actor, storePhotoOf(which), body);
  }

  @Delete('storefront/photos/:which')
  @Authorized('storefront.manage')
  @HttpCode(204)
  @ApiNoContentResponse()
  async removeStorePhoto(@CurrentActor() actor: Actor, @Param('which') which: string) {
    await this.photos.removeStorePhoto(actor, storePhotoOf(which));
  }
}

@Module({
  controllers: [PhotosController],
  providers: [
    PhotosService,
    {
      provide: PHOTO_STORE,
      inject: [ENV],
      useFactory: (env: Env): PhotoStore => new R2PhotoStore(env),
    },
  ],
  // The menu and the storefront turn photo names into addresses with it.
  exports: [PHOTO_STORE],
})
export class PhotosModule {}
