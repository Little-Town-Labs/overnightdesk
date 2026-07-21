import { renderToStaticMarkup } from "react-dom/server";

let pathname = "/dashboard";
jest.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { DashboardContent } from "../dashboard-content";

describe("DashboardContent", () => {
  it("keeps overview and management pages at a readable width", () => {
    pathname = "/dashboard";
    const markup = renderToStaticMarkup(
      <DashboardContent><p>Overview</p></DashboardContent>,
    );

    expect(markup).toContain("max-w-4xl");
  });

  it("gives Open Chat the wide desktop workspace shell", () => {
    pathname = "/dashboard/chat";
    const markup = renderToStaticMarkup(
      <DashboardContent><p>Chat</p></DashboardContent>,
    );

    expect(markup).toContain("max-w-[1600px]");
    expect(markup).toContain("min-w-0");
  });
});
