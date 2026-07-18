import { NeonAuthUIProvider } from "@neondatabase/auth-ui";
import type { ReactNode } from "react";

import { authClient } from "@/lib/auth-client";

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <NeonAuthUIProvider
      authClient={authClient}
      defaultTheme="light"
      redirectTo="/app"
      social={{ providers: ["google"] }}
      navigate={(href) => window.location.assign(href)}
      replace={(href) => window.location.replace(href)}
    >
      {children}
    </NeonAuthUIProvider>
  );
}
