type Kind = "a" | "b";

export function label(kind: Kind): string {
  switch (kind) {
    case "a":
      return "a";
    case "b":
      return "b";
  }
}
