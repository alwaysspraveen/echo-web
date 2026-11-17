// Vercel entry: every /api/* request is rewritten here (see vercel.json) and handled by Hono.
import { handle } from 'hono/vercel';
import { app } from '../src/app.js';


const h = handle(app);
export const GET = h;
export const POST = h;
export const OPTIONS = h;
