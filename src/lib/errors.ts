import { ConvexError } from "convex/values";

/** Turn a Convex error into a sentence a person can act on. */
export function friendlyError(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: string } | string;
    if (typeof data === "string") return data;
    if (data?.message) return data.message;
  }
  return "Something went wrong. Please try again.";
}
