import { AlignmentCancelledError, findHoles, LyricAlignerService } from './lyric-aligner.service';

describe('findHoles', () => {
  it('finds long stretches without recognized words, including the edges', () => {
    const w = (start: number, end: number) => ({ text: 'x', start, end });
    expect(findHoles([w(10, 11), w(12, 13), w(40, 41)], 60)).toEqual([[0, 10], [13, 40], [41, 60]]);
    expect(findHoles([w(1, 2), w(5, 6)], 10)).toEqual([]);
    expect(findHoles([], 30)).toEqual([[0, 30]]);
  });
});

describe('LyricAlignerService cancellation', () => {
  class FakeWorker {
    terminated = false;
    readonly posted: { id: number }[] = [];
    private listener?: (e: MessageEvent) => void;
    addEventListener(_: string, l: (e: MessageEvent) => void) {
      this.listener = l;
    }
    removeEventListener() {
      this.listener = undefined;
    }
    postMessage(msg: { id: number }) {
      this.posted.push(msg);
    }
    terminate() {
      this.terminated = true;
    }
    reply(data: object) {
      this.listener?.(new MessageEvent('message', { data }));
    }
  }

  class TestAligner extends LyricAlignerService {
    readonly workers: FakeWorker[] = [];
    protected override createWorker(): Worker {
      const w = new FakeWorker();
      this.workers.push(w);
      return w as unknown as Worker;
    }
    run(generation: number) {
      type Transcribe = (r: object, p: () => void, g: number) => Promise<unknown>;
      const transcribe = (this as unknown as { transcribe: Transcribe }).transcribe.bind(this);
      return transcribe({ id: 1, audio: new Float32Array(4) }, () => {}, generation);
    }
    get gen() {
      return (this as unknown as { generation: number }).generation;
    }
  }

  it('rejects the superseded request, terminates its worker, and blocks further steps of that run', async () => {
    const aligner = new TestAligner();
    const oldGeneration = aligner.gen;
    const first = aligner.run(oldGeneration);
    aligner.cancel();
    await expect(first).rejects.toBeInstanceOf(AlignmentCancelledError);
    expect(aligner.workers[0].terminated).toBe(true);
    await expect(aligner.run(oldGeneration)).rejects.toBeInstanceOf(AlignmentCancelledError);

    const next = aligner.run(aligner.gen);
    aligner.workers[1].reply({ id: 1, type: 'result', words: [], language: 'ja' });
    await expect(next).resolves.toMatchObject({ words: [], language: 'ja' });
  });
});
