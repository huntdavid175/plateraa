/** A stand-in until the landing page is built to the user's design system. */
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <img src="/logo.png" alt="" width={72} height={72} />
      <h1 className="text-2xl font-semibold">Plateraa</h1>
      <p className="max-w-sm text-sm">
        One order inbox, one record of money and a clear view of profit for food vendors.
      </p>
    </main>
  );
}
