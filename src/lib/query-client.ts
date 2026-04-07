import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 14 * 24 * 60 * 60_000, // 14 days — must be >= persister maxAge
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});
