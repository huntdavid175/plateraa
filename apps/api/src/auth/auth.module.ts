import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { AUTH, createAuth } from './auth.factory';

@Global()
@Module({
  providers: [
    {
      provide: AUTH,
      inject: [DATABASE, ENV],
      useFactory: (database: DatabaseHandle, env: Env) => createAuth(database.db, env),
    },
  ],
  exports: [AUTH],
})
export class AuthModule {}
