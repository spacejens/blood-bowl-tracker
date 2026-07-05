import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { RulesSetsController } from './rules-sets.controller';
import { RulesSetsService } from './rules-sets.service';

const fakeRulesSet = {
  id: 1,
  name: 'Blood Bowl 2020',
  createdAt: new Date('2026-01-01'),
};

interface RulesSetsHandlers {
  list: () => Promise<unknown>;
  getById: (args: { params: { id: number } }) => Promise<unknown>;
  create: (args: { body: unknown }) => Promise<unknown>;
}

describe('RulesSetsController', () => {
  let controller: RulesSetsController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };

  async function getHandlers(): Promise<RulesSetsHandlers> {
    return (await controller.handler()) as RulesSetsHandlers;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [RulesSetsController],
      providers: [{ provide: RulesSetsService, useValue: mockService }],
    }).compile();
    controller = module.get(RulesSetsController);
  });

  it('list returns all rules sets with status 200', async () => {
    mockService.findAll.mockResolvedValue([fakeRulesSet]);
    const handlers = await getHandlers();
    const result = await handlers.list();
    expect(result).toEqual({ status: 200, body: [fakeRulesSet] });
  });

  it('getById returns the rules set with status 200 when found', async () => {
    mockService.findById.mockResolvedValue(fakeRulesSet);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 1 } });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual({ status: 200, body: fakeRulesSet });
  });

  it('getById returns 404 when the rules set is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 999 } });
    expect(result).toEqual({
      status: 404,
      body: { message: 'Rules set not found' },
    });
  });

  it('create inserts and returns the new rules set with status 201', async () => {
    mockService.create.mockResolvedValue(fakeRulesSet);
    const handlers = await getHandlers();
    const result = await handlers.create({
      body: { name: 'Blood Bowl 2020' },
    });
    expect(mockService.create).toHaveBeenCalledWith({
      name: 'Blood Bowl 2020',
    });
    expect(result).toEqual({ status: 201, body: fakeRulesSet });
  });
});
