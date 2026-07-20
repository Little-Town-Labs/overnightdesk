import { renderToStaticMarkup } from "react-dom/server";

let search = "";

jest.mock("@/lib/auth-client", () => ({
  authClient: {
    requestPasswordReset: jest.fn(),
    resetPassword: jest.fn(),
    signIn: { email: jest.fn() },
    signUp: { email: jest.fn() },
  },
}));
jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import ResetPasswordPage from "@/app/(auth)/reset-password/page";
import SignInPage from "@/app/(auth)/sign-in/page";
import SignUpPage from "@/app/(auth)/sign-up/page";

describe("authentication form autocomplete contracts", () => {
  afterEach(() => {
    search = "";
  });

  it("identifies sign-in credentials for password managers", () => {
    const markup = renderToStaticMarkup(<SignInPage />);

    expect(markup).toContain('id="email"');
    expect(markup).toContain('autoComplete="email"');
    expect(markup).toContain('id="password"');
    expect(markup).toContain('autoComplete="current-password"');
  });

  it("identifies account-creation credentials as new values", () => {
    const markup = renderToStaticMarkup(<SignUpPage />);

    expect(markup).toContain('autoComplete="name"');
    expect(markup).toContain('autoComplete="email"');
    expect(markup).toContain('autoComplete="new-password"');
  });

  it("identifies reset-request and replacement credentials", () => {
    expect(renderToStaticMarkup(<ResetPasswordPage />)).toContain(
      'autoComplete="email"',
    );

    search = "?token=qualification-token";
    expect(renderToStaticMarkup(<ResetPasswordPage />)).toContain(
      'autoComplete="new-password"',
    );
  });
});
