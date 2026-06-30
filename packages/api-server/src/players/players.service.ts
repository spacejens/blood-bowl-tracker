import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { players } from '@blood-bowl-tracker/db';
import type { Player, NewPlayer } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';

@Injectable()
export class PlayersService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findAll(): Promise<Player[]> {
    return this.db.select().from(players);
  }

  async findById(id: number): Promise<Player | undefined> {
    const result = await this.db.select().from(players).where(eq(players.id, id));
    return result[0];
  }

  async create(data: NewPlayer): Promise<Player> {
    const result = await this.db.insert(players).values(data).returning();
    return result[0];
  }
}
