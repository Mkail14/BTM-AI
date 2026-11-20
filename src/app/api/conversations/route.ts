import * as conversations from "@/server/controllers/conversations/conversations.controller";
import { signedIn } from "@/server/middlewares/api";

export const GET = signedIn(conversations.list);
export const POST = signedIn(conversations.importGuest, { write: true });
