import { describe, expect, it } from 'vitest';
import { jobProgress, jobState, JobStatus, totalCost } from './job-status';

const job = (stages: JobStatus['stages']): JobStatus => ({ id: 'j', title: 't', updatedAt: '', stages });

describe('job status', () => {
  it('weights stage progress', () => {
    expect(jobProgress(job({}))).toBe(0);
    expect(jobProgress(job({ director: { state: 'done' }, assets: { state: 'running', done: 5, total: 10 } }))).toBeCloseTo(0.4);
    expect(jobProgress(job({ director: { state: 'done' }, assets: { state: 'done' }, render: { state: 'done' } }))).toBeCloseTo(1);
  });

  it('derives the overall state and cost', () => {
    expect(jobState(job({}))).toBe('pending');
    expect(jobState(job({ director: { state: 'done' } }))).toBe('running');
    expect(jobState(job({ director: { state: 'done' }, assets: { state: 'failed' } }))).toBe('failed');
    expect(totalCost(job({ director: { state: 'done', costUSD: 0.3 }, assets: { state: 'running', costUSD: 5 } }))).toBeCloseTo(5.3);
  });
});
