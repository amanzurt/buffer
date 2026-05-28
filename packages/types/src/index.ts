export type Role = "OWNER" | "ADMIN" | "EDITOR" | "APPROVER" | "CLIENT";

export type PostType = "FEED_IMAGE" | "CAROUSEL" | "REEL" | "STORY";

export type PostStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "FAILED"
  | "CANCELED";

export type SubscriptionStatus = "active" | "past_due" | "canceled" | "trialing";

export type PlanTier = "free" | "starter" | "pro" | "agency";
