import { AuthView } from "@neondatabase/auth-ui";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/$pathname")({
  component: AuthPage,
  head: ({ params }) => ({
    meta: [
      {
        title: `${params.pathname === "sign-up" ? "Create account" : "Sign in"} · Obseri`,
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function AuthPage() {
  const { pathname } = Route.useParams();

  return (
    <main className="obseri-auth-page">
      <div className="obseri-auth-glow" aria-hidden="true" />
      <Link to="/" className="obseri-auth-brand" aria-label="Obseri home">
        <img src="/obseri-pulse-mark.svg" alt="" />
        <span>obseri</span>
      </Link>

      <section className="obseri-auth-shell" aria-label="Account access">
        <div className="obseri-auth-copy">
          <span>YOUR WEBSITE, ALWAYS ON.</span>
          <h1>Turn every visit into a conversation.</h1>
          <p>
            Sign in to train, shape, test, and publish your website's voice and chat
            agent.
          </p>
        </div>
        <div className="obseri-auth-form">
          <AuthView callbackURL="/app" path={pathname} redirectTo="/app" />
        </div>
      </section>

      <a className="obseri-auth-help" href="mailto:flamki@obseri.com">
        Need help? flamki@obseri.com
      </a>
    </main>
  );
}
