/** While an order's status page is read: its own placeholder, not the store's menu. */
export default function LoadingOrder() {
  return (
    <div
      className="mx-auto flex min-h-screen max-w-[430px] flex-col items-center gap-4 px-6 pt-24"
      aria-busy="true"
    >
      <p className="sr-only" role="status">
        Getting your order…
      </p>
      <span className="skeleton h-16 w-16 rounded-full" aria-hidden />
      <span className="skeleton h-6 w-48 rounded" aria-hidden />
      <span className="skeleton h-4 w-64 rounded" aria-hidden />
      <span className="skeleton mt-6 h-40 w-full rounded-xl" aria-hidden />
    </div>
  );
}
