import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { PlayersService } from './players.service';

@Controller()
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Implement(contract.players)
  handler() {
    return {
      list: implement(contract.players.list).handler(() =>
        this.playersService.findAll(),
      ),
      getById: implement(contract.players.getById).handler(
        async ({ input, errors }) => {
          const player = await this.playersService.findById(input.id);
          if (!player) throw errors.NOT_FOUND({ message: 'Player not found' });
          return player;
        },
      ),
      create: implement(contract.players.create).handler(({ input }) =>
        this.playersService.create(input),
      ),
    };
  }
}
