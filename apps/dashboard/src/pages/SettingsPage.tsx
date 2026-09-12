import type { ReactNode } from 'react';
import { setDark, useDark } from '../lib/theme';
import { VENDOR_TYPE_WORDS } from '../lib/words';
import { useMe } from '../shell/Shell';
import { Section, Toggle } from '../ui/controls';
import { Page } from '../ui/Page';

export function SettingsPage() {
  const me = useMe();
  const dark = useDark();
  return (
    <Page title="Settings" narrow>
      <Section title="Business">
        <Row label="Business name" value={me.businessName} />
        <Row label="Type" value={VENDOR_TYPE_WORDS[me.vendorType]} />
      </Section>

      <Section title="Appearance">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-sm font-medium">Dark mode</p>
            <p className="mt-0.5 text-xs text-muted">
              Switch between light and dark on this browser.
            </p>
          </div>
          <Toggle on={dark} onChange={setDark} label="Dark mode" />
        </div>
      </Section>

      <p className="px-1 text-xs text-muted">
        Order, payment and staff settings are coming to this page next.
      </p>
    </Page>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <span className="text-sm">{label}</span>
      <span className="text-right text-sm text-muted">{value}</span>
    </div>
  );
}
