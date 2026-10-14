// Directory entries end in "/"; every other ownership entry is an exact file.
export function matchesOwnershipPath(file, prefix) {
  return prefix.endsWith("/") ? file.startsWith(prefix) : file === prefix;
}
