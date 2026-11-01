/** When each square of the grid lights up, in ms: scattered, so it twinkles rather than sweeps. */
const SQUARES = [0, 500, 900, 700, 200, 1100, 300, 1000, 600];

/** The whole screen while what it needs first is on its way (who's signed in, a lazy screen). */
export function ScreenLoading() {
  return (
    <div
      className="flex h-full items-center justify-center gap-2.5 text-lg text-foreground"
      role="status"
    >
      <span className="grid grid-cols-3 gap-0.5" aria-hidden>
        {SQUARES.map((delay) => (
          <span
            key={delay}
            className="loading-square size-[5px] bg-current"
            style={{ animationDelay: `${delay - 1200}ms` }}
          />
        ))}
      </span>
      <span>
        Loading
        <span aria-hidden>
          .<span className="loading-dot">.</span>
          <span className="loading-dot loading-dot-last">.</span>
        </span>
      </span>
    </div>
  );
}
