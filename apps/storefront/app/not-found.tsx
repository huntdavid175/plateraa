import { Message } from '../components/ui';

export default function NotFound() {
  return (
    <main>
      <Message icon="🔍" title="Store not found">
        <p className="mt-2 max-w-xs text-sm text-muted">
          This link doesn’t match any store we know. Check with whoever sent it to you.
        </p>
      </Message>
    </main>
  );
}
