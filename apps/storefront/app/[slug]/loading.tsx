/**
 * What shows the moment a store's link is opened, while its page is read from Brixx (user
 * request, 19 Nov). It used to be a blank white screen, for a minute or more when the server
 * had gone to sleep. Laid out like the store itself (the band, the three facts, the category
 * pills and the menu), in neutral greys: the store's own colours aren't known yet.
 */
export default function LoadingStore() {
  return (
    <div className="mx-auto min-h-screen max-w-[430px] lg:max-w-6xl" aria-busy="true">
      <p className="sr-only" role="status">
        Opening the store…
      </p>
      <div className="skeleton h-56 w-full sm:h-64" aria-hidden />
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border" aria-hidden>
        {[0, 1, 2].map((fact) => (
          <div key={fact} className="flex flex-col items-center gap-2 px-2 py-4">
            <span className="skeleton h-3.5 w-14 rounded" />
            <span className="skeleton h-3 w-20 rounded" />
          </div>
        ))}
      </div>
      <div className="flex gap-5 border-b border-border px-4 py-4" aria-hidden>
        {[16, 20, 14].map((width, pill) => (
          <span key={pill} className="skeleton h-4 rounded" style={{ width: `${width * 4}px` }} />
        ))}
      </div>
      <div className="px-4" aria-hidden>
        <span className="skeleton mt-6 mb-2 block h-6 w-32 rounded" />
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex items-start gap-4 border-b border-border py-5">
            <div className="flex flex-1 flex-col gap-2.5 pt-1">
              <span className="skeleton h-4 w-3/5 rounded" />
              <span className="skeleton h-3.5 w-2/5 rounded" />
              <span className="skeleton h-4 w-24 rounded" />
            </div>
            <span className="skeleton h-24 w-24 shrink-0 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
