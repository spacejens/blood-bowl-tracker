import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { RulesSetsController } from './rules-sets.controller';
import { RulesSetsService } from './rules-sets.service';

const fakeRulesSet = {
  id: 1,
  name: 'Blood Bowl 2020',
  createdAt: new Date('2026-01-01'),
};

describe('RulesSetsController', () => {
  let controller: RulesSetsController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [RulesSetsController],
      providers: [{ provide: RulesSetsService, useValue: mockService }],
    }).compile();
    controller = module.get(RulesSetsController);
  });

  it('list returns all rules sets', async () => {
    mockService.findAll.mockResolvedValue([fakeRulesSet]);
    const handlers = controller.handler();
    const result = await call(handlers.list, undefined);
    expect(result).toEqual([fakeRulesSet]);
  });

  it('getById returns the rules set when found', async () => {
    mockService.findById.mockResolvedValue(fakeRulesSet);
    const handlers = controller.handler();
    const result = await call(handlers.getById, { id: 1 });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual(fakeRulesSet);
  });

  it('getById throws NOT_FOUND when the rules set is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = controller.handler();
    await expect(call(handlers.getById, { id: 999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Rules set not found',
    });
  });

  it('create inserts and returns the new rules set', async () => {
    mockService.create.mockResolvedValue(fakeRulesSet);
    const handlers = controller.handler();
    const result = await call(handlers.create, { name: 'Blood Bowl 2020' });
    expect(mockService.create).toHaveBeenCalledWith({
      name: 'Blood Bowl 2020',
    });
    expect(result).toEqual(fakeRulesSet);
  });
});
