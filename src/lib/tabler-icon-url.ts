export function getTablerIconUrl(name: string): string {
  if (name.endsWith("-filled")) {
    return `/icons/filled/${name.slice(0, -7)}.svg`;
  }
  return `/icons/outline/${name}.svg`;
}
