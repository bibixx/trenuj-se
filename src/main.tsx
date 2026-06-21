import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { indexedDbPersister } from "./lib/query-persister.ts";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import whatInput from "what-input";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/jetbrains-mono";
import "./styles/global.css";
import { initTheme } from "./lib/theme.ts";
import { queryClient } from "./lib/query-client.ts";
import { routeTree } from "./routeTree.gen";
import { registerSW } from "virtual:pwa-register";

// Ignore modifier keys (defaults) + Escape + arrow keys so they
// don't flip the intent to "keyboard" when navigating within components.
whatInput.ignoreKeys([
  13, // Enter
  16, // Shift
  17, // Control
  18, // Alt
  27, // Escape
  37, // ArrowLeft
  38, // ArrowUp
  39, // ArrowRight
  40, // ArrowDown
  91, // Left Cmd
  93, // Right Cmd
]);

const router = createRouter({
  routeTree,
  context: { queryClient },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

initTheme();

// A freshly deployed SW takes control immediately (skipWaiting + clientsClaim, forced
// by registerType: "autoUpdate"); reload so the user lands on the new version. Edits are
// agent-driven, so reloading mid-edit is not a concern.
registerSW({ immediate: true });

const persistOptions = {
  persister: indexedDbPersister,
  maxAge: 14 * 24 * 60 * 60_000, // 14 days
};

const rootElement = document.getElementById("root")!;
createRoot(rootElement).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <RouterProvider router={router} />
    </PersistQueryClientProvider>
  </StrictMode>,
);
