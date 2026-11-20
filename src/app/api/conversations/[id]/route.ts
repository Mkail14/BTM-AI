import * as conversations from "@/server/controllers/conversations/conversations.controller";
import { signedIn } from "@/server/middlewares/api";

export const GET = signedIn(conversations.messages);
export const DELETE = signedIn(conversations.remove, { write: true });
