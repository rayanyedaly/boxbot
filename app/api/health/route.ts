// Liveness probe for the load balancer's target-group health check.
//
// Deliberately does NOT touch the database: it answers "is the web process up and
// serving?", not "is every dependency healthy?". A DB blip should not pull every
// task out of service and trigger a thundering-herd of replacements.

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}
