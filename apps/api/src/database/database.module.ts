import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDatabase } from '@plateraa/db';
import { ENV, type Env } from '../config/env';

export const DATABASE = Symbol('DATABASE');
export type DatabaseHandle = ReturnType<typeof createDatabase>;

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [ENV],
      useFactory: (env: Env): DatabaseHandle => createDatabase(env.DATABASE_URL),
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  async onApplicationShutdown() {
    await this.database.pool.end();
  }
}
