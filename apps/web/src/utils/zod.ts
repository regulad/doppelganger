import { z } from "zod";

// zod 4 reworded its default messages ("String must contain at least 6
// character(s)" became "Too small: expected string to have >=6 characters"),
// and the forms show them to users. This keeps zod 3's wording for the checks
// the forms use; messages a schema sets itself still take precedence, and
// anything not handled here falls back to zod 4's own message.

const receivedType = (input: unknown): string => {
  if (input === null) return "null";
  if (Array.isArray(input)) return "array";
  if (input instanceof Date) return "date";
  if (typeof input === "number" && Number.isNaN(input)) return "nan";
  return typeof input;
};

z.config({
  customError: (issue) => {
    switch (issue.code) {
      case "invalid_type":
        if (issue.input === undefined) return "Required";
        if (issue.expected === "int") return "Expected integer, received float";
        return `Expected ${issue.expected}, received ${receivedType(issue.input)}`;
      case "too_small":
        if (issue.origin === "string")
          return `String must contain ${issue.exact ? "exactly" : issue.inclusive ? "at least" : "over"} ${issue.minimum} character(s)`;
        if (issue.origin === "number")
          return `Number must be ${issue.exact ? "exactly equal to" : issue.inclusive ? "greater than or equal to" : "greater than"} ${issue.minimum}`;
        return undefined;
      case "too_big":
        if (issue.origin === "string")
          return `String must contain ${issue.exact ? "exactly" : issue.inclusive ? "at most" : "under"} ${issue.maximum} character(s)`;
        if (issue.origin === "number")
          return `Number must be ${issue.exact ? "exactly equal to" : issue.inclusive ? "less than or equal to" : "less than"} ${issue.maximum}`;
        return undefined;
      case "invalid_format":
        if (issue.format === "email") return "Invalid email";
        return undefined;
      default:
        return undefined;
    }
  },
});

export { z };
