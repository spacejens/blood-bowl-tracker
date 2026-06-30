import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { PlayersService } from './players.service';

@Controller()
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @TsRestHandler(contract.players)
  async handler(): Promise<any> {
    return tsRestHandler(contract.players, {
      list: async () => ({
        status: 200 as const,
        body: await this.playersService.findAll(),
      }),
      getById: async ({ params: { id } }) => {
        const player = await this.playersService.findById(id);
        if (!player) return { status: 404 as const, body: { message: 'Player not found' } };
        return { status: 200 as const, body: player };
      },
      create: async ({ body }) => ({
        status: 201 as const,
        body: await this.playersService.create(body),
      }),
    });
  }
}
