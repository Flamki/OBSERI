export function getRuntimeEnvironment(): Record<string, string | undefined> {
  const runtime = (
    globalThis as typeof globalThis & {
      __OBSERI_ENV__?: Record<string, unknown>;
    }
  ).__OBSERI_ENV__;
  const processEnvironment = (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;

  return new Proxy(
    {},
    {
      get: (_target, property: string) => {
        const runtimeValue = runtime?.[property];
        return typeof runtimeValue === "string" ? runtimeValue : processEnvironment?.[property];
      },
    },
  ) as Record<string, string | undefined>;
}
