import { readSentryContext, withSentryContext } from "./error-context";

describe("withSentryContext", () => {
  it("adds context to an error and returns the same error", () => {
    const error = new Error("boom");
    const result = withSentryContext(error, { tags: { a: "1" } });
    expect(result).toBe(error);
    expect(readSentryContext(error)).toEqual({
      tags: { a: "1" },
      contexts: {},
    });
  });

  it("merges with context the error already carries", () => {
    const error = withSentryContext(new Error("boom"), {
      tags: { a: "1", b: "1" },
      contexts: { first: { x: 1 } },
    });
    withSentryContext(error, {
      tags: { b: "2" },
      contexts: { second: { y: 2 } },
    });
    expect(readSentryContext(error)).toEqual({
      tags: { a: "1", b: "2" },
      contexts: { first: { x: 1 }, second: { y: 2 } },
    });
  });

  it("wraps a thrown value that isn't an Error", () => {
    const result = withSentryContext("plain string", { tags: { a: "1" } });
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("plain string");
    expect((result as Error & { cause?: unknown }).cause).toBe("plain string");
    expect(readSentryContext(result).tags).toEqual({ a: "1" });
  });
});

describe("readSentryContext", () => {
  it("collects context along the cause chain, the outer error winning", () => {
    const inner = withSentryContext(new Error("inner"), {
      tags: { shared: "inner", innerOnly: "yes" },
    });
    const outer = withSentryContext(
      Object.assign(new Error("outer"), { cause: inner }),
      { tags: { shared: "outer" } },
    );
    expect(readSentryContext(outer).tags).toEqual({
      shared: "outer",
      innerOnly: "yes",
    });
  });

  it("returns empty context for values without any", () => {
    for (const value of [undefined, null, "text", 42, new Error("plain")]) {
      expect(readSentryContext(value)).toEqual({ tags: {}, contexts: {} });
    }
  });

  it("stops at a cycle in the cause chain", () => {
    const a = new Error("a") as Error & { cause?: unknown };
    const b = new Error("b") as Error & { cause?: unknown };
    a.cause = b;
    b.cause = a;
    withSentryContext(a, { tags: { a: "1" } });
    expect(readSentryContext(a).tags).toEqual({ a: "1" });
  });
});
