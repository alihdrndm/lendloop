import type { AuthConfig } from "convex/server";

// Convex trusts session tokens issued by our Clerk instance. Set
// CLERK_JWT_ISSUER_DOMAIN in the Convex environment to the Clerk Frontend API
// URL (Clerk dashboard > Integrations > Convex).
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
