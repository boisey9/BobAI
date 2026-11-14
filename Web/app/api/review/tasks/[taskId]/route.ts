import {reviewTaskAPI} from '@/lib/ui-review-api';
export const dynamic='force-dynamic';
type Context={params:Promise<{taskId:string}>};
export const GET=async(request:Request,context:Context)=>reviewTaskAPI(request,(await context.params).taskId);
export const PATCH=GET;
