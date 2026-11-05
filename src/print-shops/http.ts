import { StoreConflictError, StoreUnavailableError } from "./store";
import type { ZodError } from "zod";

export function jsonError(error: unknown): Response {
  if (error instanceof StoreConflictError) return Response.json({ error: error.message }, { status: 409 });
  if (error instanceof StoreUnavailableError) return Response.json({ error: error.message }, { status: 503 });
  if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON request." }, { status: 400 });
  console.error(error);
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export function noStoreJson(value: unknown, init?: ResponseInit): Response {
  const response = Response.json(value, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function validationError(error: ZodError): Response {
  return noStoreJson({ error: error.issues[0]?.message ?? "Please check the form.", issues: error.flatten().fieldErrors }, { status: 400 });
}
