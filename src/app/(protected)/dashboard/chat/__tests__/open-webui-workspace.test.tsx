import { renderToStaticMarkup } from "react-dom/server";
import {
  OpenChatUnavailable,
  OpenWebuiWorkspace,
} from "../open-webui-workspace";
import { AgentSelector } from "../../agent-selector";
import type { AgentWorkspace } from "@/lib/open-webui-workspace";

const titus: AgentWorkspace = {
  key: "titus",
  identity: {
    name: "Titus",
    logo: { src: "/agents/titus-mark.svg", alt: "Titus agent mark" },
  },
  useCaseName: "Timeless Tech Solutions",
  workspaceUrl: "https://titus-chat.overnightdesk.com/",
  fallbackMessage:
    "Your existing Titus Matrix room and approved email channel remain available and independent of Open Chat.",
};

const walter: AgentWorkspace = {
  key: "walter",
  identity: {
    name: "Walter",
    logo: { src: "/agents/walter-mark.svg", alt: "Walter agent mark" },
  },
  useCaseName: "OvernightDesk platform operations",
  workspaceUrl: "https://walter-chat.overnightdesk.com/",
  fallbackMessage:
    "Walter's existing advanced runtime dashboard remains available independently of Open Chat.",
};

describe("OpenWebuiWorkspace", () => {
  it("renders the selected assigned workspace with visible variable identity", () => {
    const markup = renderToStaticMarkup(
      <OpenWebuiWorkspace selected={titus} workspaces={[titus]} />,
    );

    expect(markup).toContain("Titus");
    expect(markup).toContain("Timeless Tech Solutions");
    expect(markup).toContain("Titus agent mark");
    expect(markup).toContain('title="Titus chat workspace"');
    expect(markup).toContain('src="https://titus-chat.overnightdesk.com/"');
    expect(markup).toContain('allow="clipboard-write"');
    expect(markup).not.toContain("microphone");
    expect(markup).not.toContain("camera");
  });

  it("renders the same shared interface for another deployed agent", () => {
    const markup = renderToStaticMarkup(
      <OpenWebuiWorkspace selected={walter} workspaces={[titus, walter]} />,
    );

    expect(markup).toContain("Walter");
    expect(markup).toContain("Walter agent mark");
    expect(markup).toContain('src="https://walter-chat.overnightdesk.com/"');
    expect(markup).not.toContain("rollout pending");
  });

  it("keeps the selected workspace fallback visible", () => {
    const markup = renderToStaticMarkup(
      <OpenWebuiWorkspace selected={titus} workspaces={[titus]} />,
    );

    expect(markup).toContain("Matrix");
    expect(markup).toContain("email");
    expect(markup).toContain("independent of Open Chat");
  });

  it("shows an honest state when assignments cannot be verified", () => {
    const markup = renderToStaticMarkup(<OpenChatUnavailable />);

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Open Chat is unavailable");
    expect(markup).toContain("could not be safely verified");
    expect(markup).not.toContain("<iframe");
  });

  it("distinguishes an authorized member with no configured workspace", () => {
    const markup = renderToStaticMarkup(
      <OpenChatUnavailable reason="not-configured" />,
    );

    expect(markup).toContain("None of your authorized agents has an active Open Chat workspace yet");
    expect(markup).toContain("existing approved agent channels");
    expect(markup).not.toContain("could not be safely verified");
  });

  it("uses dynamic viewport height and a mobile-first full-width workspace", () => {
    const markup = renderToStaticMarkup(
      <OpenWebuiWorkspace selected={titus} workspaces={[titus]} />,
    );

    expect(markup).toContain("min-h-[calc(100dvh-12rem)]");
    expect(markup).toContain("w-full");
    expect(markup).toContain("flex-1");
  });

  it("renders only the membership-filtered workspaces supplied by the server", () => {
    const garyMarkup = renderToStaticMarkup(
      <AgentSelector
        agents={[titus, walter]}
        basePath="/dashboard/chat"
        selectedKey="titus"
      />,
    );
    const austinMarkup = renderToStaticMarkup(
      <AgentSelector
        agents={[titus]}
        basePath="/dashboard/chat"
        selectedKey="titus"
      />,
    );

    expect(garyMarkup).toContain('href="/dashboard/chat?agent=titus"');
    expect(garyMarkup).toContain('href="/dashboard/chat?agent=walter"');
    expect(garyMarkup).toContain("Walter");
    expect(austinMarkup).toContain("Titus");
    expect(austinMarkup).not.toContain("Walter");
    expect(austinMarkup).not.toContain("agent=walter");
  });
});
