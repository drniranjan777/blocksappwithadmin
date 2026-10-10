-- Staff invitations expire: the temporary password stops working after this time.
ALTER TABLE "admin_users" ADD COLUMN "invite_expires_at" TIMESTAMPTZ(3);
