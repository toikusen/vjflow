// The style worlds' two layouts, known to the validator only for a treatment made on a world: the director's catalog
// (templates.ts) and the paid planner's list never offer them.
import type { TemplateSpec } from './treatment';

const spec = (id: string, persist: boolean) => ({ id, description: '風格世界的版型', params: {}, persist } as unknown as TemplateSpec);
export const WORLD_TEMPLATES: Record<string, TemplateSpec> = { 'world-set': spec('world-set', false), 'world-pair': spec('world-pair', true) };
