// Chat is now embedded directly on the Overview page (/dashboard).
// This route redirects there to avoid broken bookmarks/links.
import { redirect } from "next/navigation";

export default function ChatPage() {
  redirect("/dashboard");
}
