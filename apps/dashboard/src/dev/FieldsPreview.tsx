import { useEffect, useState } from 'react';
import { toast } from '../ui/Toast';
import { TimePicker } from '@/components/arc/time-picker/time-picker';
import { CediInput } from '@/components/app/money-field';
import { Page } from '../ui/Page';

/** Development only: the fields that live in dialogs and drawers, laid out to be looked at. */
export default function FieldsPreview() {
  const [amount, setAmount] = useState<number | null>(4_550);
  const [empty, setEmpty] = useState<number | null>(null);
  const [time, setTime] = useState('08:00');
  // Two toasts, a short one and a long one, to see how wide they sit.
  useEffect(() => {
    toast.ok('Item saved');
    toast.problem(
      'That payment account wasn’t accepted. Check the public key and the account number, then try again.',
    );
  }, []);
  return (
    <Page title="Fields" narrow>
      <div className="flex flex-col gap-6">
        <CediInput label="Amount given back" value={amount} onChange={setAmount} quickAdd={[]} />
        <CediInput label="Amount paid out" value={empty} onChange={setEmpty} />
        <TimePicker label="Opens" value={time} onChange={setTime} minuteStep={15} />
      </div>
    </Page>
  );
}
