import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resilientFetch } from './resilient-fetch';

const makeRequest = (signal?: AbortSignal): Request =>
  new Request('http://localhost:3000/rpc', {
    method: 'POST',
    body: '{"input":1}',
    signal,
  });

const makeResponse = (status: number): Response =>
  new Response('{}', { status });

describe('resilientFetch', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns a first-attempt success without retrying', async () => {
    const response = makeResponse(200);
    fetchMock.mockResolvedValue(response);

    const result = await resilientFetch(makeRequest(), {});

    expect(result).toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 4xx response', async () => {
    const response = makeResponse(400);
    fetchMock.mockResolvedValue(response);

    const result = await resilientFetch(makeRequest(), {});

    expect(result).toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 3xx response', async () => {
    const response = makeResponse(302);
    fetchMock.mockResolvedValue(response);

    const result = await resilientFetch(makeRequest(), {});

    expect(result).toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a bare 500 response', async () => {
    const response = makeResponse(500);
    fetchMock.mockResolvedValue(response);

    const result = await resilientFetch(makeRequest(), {});

    expect(result).toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('forwards the init options to fetch', async () => {
    fetchMock.mockResolvedValue(makeResponse(200));

    await resilientFetch(makeRequest(), { redirect: 'manual' });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('bounds each attempt with a 180 second timeout signal', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValue(makeResponse(200));

    await resilientFetch(makeRequest(), {});

    expect(timeoutSpy).toHaveBeenCalledWith(180_000);
  });

  it('retries a thrown fetch error and returns the later success', async () => {
    const response = makeResponse(200);
    fetchMock
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValue(response);

    const promise = resilientFetch(makeRequest(), {});
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);

    await expect(promise).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry once the caller aborts the request', async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValue(new Error('aborted'));

    const promise = resilientFetch(makeRequest(controller.signal), {});

    await expect(promise).rejects.toThrow('aborted');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a 503 response and returns the later success', async () => {
    const response = makeResponse(200);
    fetchMock
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValue(response);

    const promise = resilientFetch(makeRequest(), {});
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('drains the body of a discarded retryable response', async () => {
    const discarded = makeResponse(503);
    const cancelSpy = vi.spyOn(discarded.body as ReadableStream, 'cancel');
    fetchMock
      .mockResolvedValueOnce(discarded)
      .mockResolvedValue(makeResponse(200));

    const promise = resilientFetch(makeRequest(), {});
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it('retries anyway when draining a discarded response body rejects', async () => {
    const discarded = makeResponse(503);
    vi.spyOn(discarded.body as ReadableStream, 'cancel').mockRejectedValue(
      new Error('stream already errored'),
    );
    const response = makeResponse(200);
    fetchMock.mockResolvedValueOnce(discarded).mockResolvedValue(response);

    const promise = resilientFetch(makeRequest(), {});
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never drains the body of the response it hands back to the caller', async () => {
    const returned = makeResponse(200);
    const cancelSpy = vi.spyOn(returned.body as ReadableStream, 'cancel');
    fetchMock.mockResolvedValue(returned);

    const result = await resilientFetch(makeRequest(), {});

    expect(result).toBe(returned);
    expect(cancelSpy).not.toHaveBeenCalled();
  });

  it('never drains the final retryable response after six failed attempts', async () => {
    const finalResponse = makeResponse(503);
    const cancelSpy = vi.spyOn(finalResponse.body as ReadableStream, 'cancel');
    fetchMock
      .mockResolvedValueOnce(makeResponse(502))
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValueOnce(makeResponse(504))
      .mockResolvedValueOnce(makeResponse(502))
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValue(finalResponse);

    const promise = resilientFetch(makeRequest(), {});
    await vi.advanceTimersByTimeAsync(31_000);
    await promise;

    expect(cancelSpy).not.toHaveBeenCalled();
  });

  it('sends a fresh, still-readable clone of the request on each attempt', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValue(makeResponse(200));

    const promise = resilientFetch(makeRequest(), {});
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    const first = fetchMock.mock.calls[0][0] as Request;
    const second = fetchMock.mock.calls[1][0] as Request;
    expect(second).not.toBe(first);
    await expect(second.text()).resolves.toBe('{"input":1}');
  });

  it('backs off 1s, 2s, 4s, 8s and 16s across five retries', async () => {
    fetchMock.mockRejectedValue(new Error('fetch failed'));

    const promise = resilientFetch(makeRequest(), {});
    promise.catch(() => undefined);

    const schedule = [1000, 2000, 4000, 8000, 16000];
    let expectedCalls = 1;
    for (const backoffMs of schedule) {
      await vi.advanceTimersByTimeAsync(backoffMs - 1);
      expect(fetchMock).toHaveBeenCalledTimes(expectedCalls);
      await vi.advanceTimersByTimeAsync(1);
      expectedCalls += 1;
      expect(fetchMock).toHaveBeenCalledTimes(expectedCalls);
    }

    await expect(promise).rejects.toThrow('fetch failed');
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('throws the last error after six failed attempts', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('first failure'))
      .mockRejectedValueOnce(new Error('second failure'))
      .mockRejectedValueOnce(new Error('third failure'))
      .mockRejectedValueOnce(new Error('fourth failure'))
      .mockRejectedValueOnce(new Error('fifth failure'))
      .mockRejectedValue(new Error('final failure'));

    const promise = resilientFetch(makeRequest(), {});
    const assertion = expect(promise).rejects.toThrow('final failure');
    await vi.advanceTimersByTimeAsync(31_000);
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('returns the last retryable response after six failed attempts', async () => {
    const finalResponse = makeResponse(503);
    fetchMock
      .mockResolvedValueOnce(makeResponse(502))
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValueOnce(makeResponse(504))
      .mockResolvedValueOnce(makeResponse(502))
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValue(finalResponse);

    const promise = resilientFetch(makeRequest(), {});
    await vi.advanceTimersByTimeAsync(31_000);

    await expect(promise).resolves.toBe(finalResponse);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
