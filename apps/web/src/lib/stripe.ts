import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", {
  apiVersion: "2025-02-24.acacia",
  typescript: true,
});

export async function getOrCreateStripeCustomer(
  db: any,
  workspaceId: string,
  email: string,
  name: string
): Promise<string> {
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { stripeCustomerId: true },
  });

  if (workspace.stripeCustomerId) return workspace.stripeCustomerId;

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { workspaceId },
  });

  await db.workspace.update({
    where: { id: workspaceId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}
