import {reviewTaskAPI} from '@/lib/ui-review-api';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>reviewTaskAPI(request);
export const POST=(request:Request)=>reviewTaskAPI(request);
