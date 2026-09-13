import type { QueryKey } from '@tanstack/react-query';
import { queryClient } from './query';

/**
 * For switches that save the moment they're flipped. The new value goes into the loaded data at
 * once, so the switch moves and stays put while it saves (nothing flicks back to the old value
 * when the save ends before the reload), and the old data comes back if saving fails. Spread it
 * into useMutation's options, with the page's reload as `onSettled`.
 */
export function saveInPlace<T, V>(queryKey: QueryKey, apply: (current: T, next: V) => T) {
  return {
    onMutate: async (next: V) => {
      // A reload already on its way would bring the old value back.
      await queryClient.cancelQueries({ queryKey });
      const before = queryClient.getQueryData<T>(queryKey);
      if (before !== undefined) queryClient.setQueryData<T>(queryKey, apply(before, next));
      return { before };
    },
    onError: (_error: Error, _next: V, saved?: { before: T | undefined }) => {
      if (saved?.before !== undefined) queryClient.setQueryData<T>(queryKey, saved.before);
    },
  };
}
