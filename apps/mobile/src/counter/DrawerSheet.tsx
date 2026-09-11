import type { Pesewas } from '@plateraa/shared';
import { cedis } from '../ui/theme';
import { AmountSheet } from './AmountSheet';

/**
 * Opening the drawer: the float counted into it. At the start of the day the counter asks for it
 * at unlock rather than in the middle of the first sale; "Not now" skips it, and the first cash
 * sale then asks instead. The Drawer tab opens it the same way.
 */
export function DrawerSheet({
  visible,
  onOpen,
  onSkip,
  skipLabel = 'Not now',
}: {
  visible: boolean;
  onOpen: (float: Pesewas) => Promise<void>;
  onSkip: () => void;
  skipLabel?: string;
}) {
  return (
    <AmountSheet
      visible={visible}
      title="Open the cash drawer"
      body="Count the cash in the drawer before the first sale. That's the float the day starts with."
      amountLabel="Cash in the drawer"
      action={(float) => `Open the drawer with ${cedis(float)}`}
      cancelLabel={skipLabel}
      allowZero
      onSubmit={(float) => onOpen(float)}
      onClose={onSkip}
    />
  );
}
