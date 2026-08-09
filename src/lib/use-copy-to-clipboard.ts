import { Toast } from "@base-ui/react/toast";

/** Copies a value to the clipboard and confirms with a toast. */
export function useCopyToClipboard() {
  const toastManager = Toast.useToastManager();
  return (value: string) => {
    navigator.clipboard.writeText(value);
    toastManager.add({ title: "Copied to clipboard", type: "success" });
  };
}
