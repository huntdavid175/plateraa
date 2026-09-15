import { Message } from '../components/ui';

/** Plateraa's own address: each store lives at its own link, such as /amas-kitchen. */
export default function Home() {
  return (
    <main>
      <Message
        icon={<img src="/logo.png" alt="" width={72} height={72} className="mx-auto" />}
        title="Plateraa"
      >
        <p className="mt-2 max-w-xs text-sm text-muted">
          Order from your favourite food spot with the link they shared with you.
        </p>
      </Message>
    </main>
  );
}
