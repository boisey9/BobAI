import { reviewEnabled, reviewProjects, tasksFor, reviewReceipts, reviewProjectId } from './ui-review';
import { taskPayload } from './task-contract';

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
}

/** Disposable synthetic state only. Real task routes retain owner authentication. */
export async function reviewTaskAPI(request: Request, id?: string) {
  const url = new URL(request.url);
  const project = url.searchParams.get('project') ?? '';
  if (!reviewEnabled(request.headers.get('host')) || !reviewProjects.includes(project)) {
    return json({ error: { message: 'Not found' } }, 404);
  }
  const checkedAt = new Date().toISOString();
  const taskBinding = (project === 'demo-manufacturing' ? 'A' : 'B').repeat(43);
  const tasks = tasksFor(project);
  if (request.method === 'GET') {
    const task = id ? tasks.find(task => task.id === id) : null;
    if (id && !task) return json({ error: { message: 'Synthetic task not found' } }, 404);
    return json(id ? { task, taskBinding, checkedAt } : { tasks, taskBinding, checkedAt, nextCursor: null });
  }

  // Next can normalize Request.url's hostname. Compare with the separately
  // loopback-validated Host, retaining Origin precedence over Referer.
  let sourceOrigin = request.headers.get('origin');
  if (!sourceOrigin) {
    try { sourceOrigin = new URL(request.headers.get('referer') ?? '').origin; }
    catch { sourceOrigin = null; }
  }
  const expectedOrigin = `http://${request.headers.get('host')}`;
  if (sourceOrigin !== expectedOrigin || request.headers.get('x-bob-task-binding') !== taskBinding) {
    return json({ error: { message: 'Review binding mismatch' } }, 403);
  }
  if (Number(request.headers.get('content-length') ?? 0) > 8192) return new Response(null, { status: 413 });
  const raw = await request.text();
  if (raw.length > 8192) return new Response(null, { status: 413 });
  let input;
  try { input = taskPayload(JSON.parse(raw), !!id); }
  catch { return json({ error: { message: 'Invalid synthetic task' } }, 400); }
  if (!input) return json({ error: { message: 'Invalid synthetic task' } }, 400);

  const key = project + ':' + input.operationId;
  const fingerprint = JSON.stringify({ id, input });
  const existing = reviewReceipts.get(key);
  if (existing) {
    return existing.fingerprint === fingerprint
      ? json(existing.response)
      : json({ error: { message: 'Operation conflict' } }, 409);
  }
  if ((!id && tasks.length >= 100) || reviewReceipts.size >= 200) return new Response(null, { status: 429 });
  let task = tasks.find(task => task.id === id);
  if (id && (!task || task.version !== input.expectedVersion)) {
    return json({ error: { message: 'Synthetic task version conflict' } }, 409);
  }
  if (!task) {
    task = {
      id: crypto.randomUUID(), projectId: reviewProjectId(project), title: input.title!,
      description: null, status: 'open', priority: 'normal', source: 'web', dueAt: null,
      editable: true, requiresApproval: false, version: 1,
      createdAt: checkedAt, updatedAt: checkedAt, completedAt: null,
    };
    tasks.unshift(task);
  } else {
    task.version++;
    task.title = input.newTitle ?? task.title;
  }
  task.description = input.description === undefined ? task.description : input.description;
  task.priority = input.priority ?? task.priority;
  task.status = input.status ?? task.status;
  task.dueAt = input.dueAt === undefined ? task.dueAt : input.dueAt;
  task.updatedAt = checkedAt;
  task.completedAt = task.status === 'done' ? checkedAt : null;
  const response = { task: { ...task }, created: !id, changed: true, idempotent: false };
  reviewReceipts.set(key, { fingerprint, response });
  return json(response);
}
