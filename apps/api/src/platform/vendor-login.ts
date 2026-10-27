import { eq, staffMembers, withPlatform, type Database } from '@brixx/db';

/**
 * Brixx's team and vendors never share a login, so the team never shows up as a vendor: a team
 * login can't make a business (`OnboardingService`), and a vendor's login can't join the team.
 */
export const VENDOR_LOGIN =
  'That email is a vendor’s login, part of a business on Brixx. Use a separate email for the Brixx team.';

/** Whether a login belongs to any business (as its owner, manager or staff). */
export async function vendorLogin(db: Database, userId: string): Promise<boolean> {
  const [row] = await withPlatform(db, (tx) =>
    tx
      .select({ id: staffMembers.id })
      .from(staffMembers)
      .where(eq(staffMembers.userId, userId))
      .limit(1),
  );
  return Boolean(row);
}
