import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {reviewTaskAPI} from '../../Web/lib/ui-review-api';
import {reviewTasks, reviewReceipts} from '../../Web/lib/ui-review';

const origin = 'http://127.0.0.1:3448';
function request(method='GET', project='demo-manufacturing', body, headers={}) {
  return new Request(`${origin}/api/review/tasks?project=${project}`, {
    method, headers: {host:'127.0.0.1:3448', origin, 'x-bob-task-binding':'A'.repeat(43), ...headers},
    ...(body ? {body:JSON.stringify(body)} : {}),
  });
}
beforeEach(() => {
  vi.stubEnv('BOB_UI_REVIEW_ENABLED','true');
  vi.stubEnv('NODE_ENV','development');
  for (const key of ['VERCEL','VERCEL_ENV','DATABASE_URL','BOB_AUTH_DATABASE_URL','BOB_CORE_DEVICE_TOKEN','AI_API_KEY','OPENAI_API_KEY','ZAI_API_KEY','BOB_AUTH_SECRET','BOB_CONTROL_CENTER_SESSION_SECRET']) vi.stubEnv(key,undefined);
  reviewTasks.clear(); reviewReceipts.clear();
});
afterEach(() => vi.unstubAllEnvs());
describe('isolated synthetic preview API', () => {
  it('requires the explicit development flag and refuses real projects', async () => {
    expect((await reviewTaskAPI(request('GET','bobai'))).status).toBe(404);
    vi.stubEnv('BOB_UI_REVIEW_ENABLED','false');
    expect((await reviewTaskAPI(request())).status).toBe(404);
  });
  it('rejects foreign origins and bindings without changing tasks', async () => {
    const body={operationId:'synthetic-create-1',title:'Preview only'};
    expect((await reviewTaskAPI(request('POST','demo-manufacturing',body,{origin:'https://foreign.example'}))).status).toBe(403);
    expect((await reviewTaskAPI(request('POST','demo-manufacturing',body,{'x-bob-task-binding':'B'.repeat(43)}))).status).toBe(403);
    expect(reviewTasks.get('demo-manufacturing')).toHaveLength(4);
  });
  it('replays identical operations once and refuses changed operation content', async () => {
    const body={operationId:'synthetic-create-2',title:'Preview only'};
    const first=await (await reviewTaskAPI(request('POST','demo-manufacturing',body))).json();
    expect(await (await reviewTaskAPI(request('POST','demo-manufacturing',body))).json()).toEqual(first);
    expect((await reviewTaskAPI(request('POST','demo-manufacturing',{...body,title:'Changed'}))).status).toBe(409);
    expect(reviewTasks.get('demo-manufacturing')).toHaveLength(5);
    expect((await (await reviewTaskAPI(request('GET','demo-planning'))).json()).tasks).toHaveLength(4);
  });
  it('accepts a same-origin referrer only when Origin is absent', async () => {
    const body={operationId:'synthetic-referrer-1',title:'Referrer fallback'};
    const local=new Request(`${origin}/api/review/tasks?project=demo-manufacturing`,{method:'POST',headers:{host:'127.0.0.1:3448',referer:`${origin}/review`,'x-bob-task-binding':'A'.repeat(43)},body:JSON.stringify(body)});
    expect((await reviewTaskAPI(local)).status).toBe(200);
    const missing=new Request(`${origin}/api/review/tasks?project=demo-manufacturing`,{method:'POST',headers:{host:'127.0.0.1:3448','x-bob-task-binding':'A'.repeat(43)},body:JSON.stringify(body)});
    expect((await reviewTaskAPI(missing)).status).toBe(403);
  });
  it('enforces version checks and does not mutate another project', async () => {
    const task=(await (await reviewTaskAPI(request())).json()).tasks[0];
    const patch={operationId:'synthetic-update-1',expectedVersion:99,newTitle:'Changed'};
    expect((await reviewTaskAPI(request('PATCH','demo-manufacturing',patch),task.id)).status).toBe(409);
    const updated=await (await reviewTaskAPI(request('PATCH','demo-manufacturing',{...patch,expectedVersion:1}),task.id)).json();
    expect(updated.task.version).toBe(2);
    expect(updated.task.title).toBe('Changed');
    const other=await (await reviewTaskAPI(request('GET','demo-planning'))).json();
    expect(other.tasks[0].title).not.toBe('Changed');
    expect(other.tasks[0].projectId).not.toBe(updated.task.projectId);
  });
});
