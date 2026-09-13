import { eq, staffMembers, type Tx } from '@plateraa/db';
import { ulid } from 'ulid';

/**
 * The business's "Online store" staff member, made the first time it's needed. Online orders,
 * their payment links and payments are recorded under it. It's never active, so it can't sign in
 * or unlock a tablet, and the Staff page leaves it out.
 */
export async function onlineStaffId(tx: Tx, tenantId: string): Promise<string> {
  const find = async () => {
    const [row] = await tx
      .select({ id: staffMembers.id })
      .from(staffMembers)
      .where(eq(staffMembers.system, true));
    return row?.id ?? null;
  };
  const existing = await find();
  if (existing) return existing;
  await tx
    .insert(staffMembers)
    .values({
      id: ulid(),
      tenantId,
      displayName: 'Online store',
      role: 'STAFF',
      active: false,
      system: true,
    })
    .onConflictDoNothing();
  return (await find())!;
}
