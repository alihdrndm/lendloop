import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Optimistic gate only: signed-out visitors are sent to sign in before they
// reach /app. Every real permission check lives in the Convex functions.
const isMemberRoute = createRouteMatcher(["/app(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isMemberRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
