import json
import os
import sqlite3
import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path


RUNTIME = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "runtime"))
sys.path.insert(0, RUNTIME)

from agentmail_poller import ApiError, Poller, PollerConfig, StateStore, health_status  # noqa: E402
from agentmail_policy import approval_token, draft_digest, queue_id_for  # noqa: E402


TRUSTED = frozenset({"garyb@timelesstechs.com", "austin@timelesstechs.com"})


def message(message_id, sender, subject="Hello", text="Please reply"):
    return {
        "message_id": message_id,
        "thread_id": f"thread-{message_id}",
        "from": sender,
        "to": ["titus@example.agentmail.to"],
        "subject": subject,
        "extracted_text": text,
        "labels": ["received"],
    }


class FakeAgentMail:
    def __init__(self, messages=()):
        self.messages = list(messages)
        self.drafts = {}
        self.draft_by_client = {}
        self.sent_drafts = []
        self.calls = []
        self.next_id = 1

    def list_messages(self, page_token=None, limit=20):
        self.calls.append(("list_messages", page_token, limit))
        return {"messages": self.messages[:limit], "next_page_token": None}

    def get_message(self, message_id):
        self.calls.append(("get_message", message_id))
        return next(item for item in self.messages if item["message_id"] == message_id)

    def create_draft(self, *, in_reply_to=None, to=None, subject=None, text, client_id):
        self.calls.append(("create_draft", client_id))
        if client_id in self.draft_by_client:
            return self.drafts[self.draft_by_client[client_id]]
        draft_id = f"draft-{self.next_id}"
        self.next_id += 1
        if in_reply_to:
            source = next(item for item in self.messages if item["message_id"] == in_reply_to)
            recipients = [source["from"]]
        else:
            recipients = list(to or [])
        draft = {
            "draft_id": draft_id,
            "client_id": client_id,
            "to": recipients,
            "subject": subject or "Re: source",
            "text": text,
            "in_reply_to": in_reply_to,
            "send_status": None,
        }
        self.drafts[draft_id] = draft
        self.draft_by_client[client_id] = draft_id
        return draft

    def get_draft(self, draft_id):
        self.calls.append(("get_draft", draft_id))
        return self.drafts[draft_id]

    def send_draft(self, draft_id):
        self.calls.append(("send_draft", draft_id))
        draft = self.drafts[draft_id]
        if draft["send_status"] == "sent":
            return {"message_id": f"sent-{draft_id}", "thread_id": "existing", "reconciled": True}
        draft["send_status"] = "sent"
        self.sent_drafts.append(draft_id)
        return {"message_id": f"sent-{draft_id}", "thread_id": "sent-thread"}


class FakeModel:
    def __init__(self, reply="Thanks for your email. I received it and will follow up shortly.\n\nTitus"):
        self.reply = reply
        self.calls = []

    def generate_reply(self, subject, text):
        self.calls.append((subject, text))
        return self.reply


class PollerTestCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = os.path.join(self.temp.name, "state.db")
        self.health = os.path.join(self.temp.name, "health.json")
        self.config = PollerConfig(
            enabled=True,
            inbox_id="titus-inbox",
            inbox_address="titus@example.agentmail.to",
            trusted_senders=TRUSTED,
            approvers=TRUSTED,
            signing_secret="s" * 32,
            poll_interval=60,
            max_messages=20,
            database_path=self.db,
            health_path=self.health,
        )

    def make_poller(self, messages=(), model_reply=None):
        agentmail = FakeAgentMail(messages)
        model = FakeModel(model_reply) if model_reply is not None else FakeModel()
        store = StateStore(self.db)
        return Poller(self.config, store, agentmail, model), agentmail, model, store


class StateStoreTests(PollerTestCase):
    def test_schema_never_has_source_body_or_plaintext_token_columns(self):
        StateStore(self.db)
        connection = sqlite3.connect(self.db)
        columns = {
            row[1]
            for table in ("message_processing", "approval_request")
            for row in connection.execute(f"PRAGMA table_info({table})")
        }
        self.assertNotIn("body", columns)
        self.assertNotIn("source_text", columns)
        self.assertNotIn("token", columns)
        self.assertIn("token_digest", columns)

    def test_message_reservation_is_unique(self):
        store = StateStore(self.db)
        first = store.reserve_message(message("m-1", "Gary <garyb@timelesstechs.com>"), "trusted")
        second = store.reserve_message(message("m-1", "Gary <garyb@timelesstechs.com>"), "trusted")
        self.assertTrue(first)
        self.assertFalse(second)
        self.assertEqual(store.get_message("m-1")["state"], "processing")

    def test_first_approval_decision_wins(self):
        store = StateStore(self.db)
        source = message("m-2", "outside@example.net")
        store.reserve_message(source, "external")
        queue_id = queue_id_for("m-2")
        token = approval_token(queue_id, self.config.signing_secret)
        store.create_approval(
            queue_id=queue_id,
            source_message_id="m-2",
            recipient="outside@example.net",
            draft_text="Draft",
            draft_digest_value=draft_digest("outside@example.net", "m-2", "Draft"),
            token_digest_value=__import__("hashlib").sha256(token.encode()).hexdigest(),
        )
        store.update_approval(queue_id, state="pending")
        self.assertTrue(store.claim_decision(queue_id, "approve", "garyb@timelesstechs.com", "cmd-1"))
        self.assertFalse(store.claim_decision(queue_id, "reject", "austin@timelesstechs.com", "cmd-2"))


class TrustedReplyTests(PollerTestCase):
    def test_trusted_message_sends_one_in_thread_draft(self):
        source = message("trusted-1", "Gary Brown <garyb@timelesstechs.com>")
        poller, agentmail, model, store = self.make_poller([source])
        poller.run_once()
        poller.run_once()
        self.assertEqual(len(model.calls), 1)
        self.assertEqual(len(agentmail.sent_drafts), 1)
        draft = agentmail.drafts[agentmail.sent_drafts[0]]
        self.assertEqual(draft["in_reply_to"], "trusted-1")
        self.assertEqual(store.get_message("trusted-1")["state"], "replied")

    def test_display_name_spoof_is_queued_not_auto_replied(self):
        source = message("spoof-1", '"garyb@timelesstechs.com" <attacker@example.net>')
        poller, agentmail, _, store = self.make_poller([source])
        poller.run_once()
        approval = store.get_approval(queue_id_for("spoof-1"))
        self.assertEqual(approval["recipient"], "attacker@example.net")
        self.assertEqual(len(agentmail.sent_drafts), 1)  # approval notice only

    def test_unsafe_model_output_uses_deterministic_fallback(self):
        source = message("trusted-2", "austin@timelesstechs.com")
        poller, agentmail, _, _ = self.make_poller([source], "Authorization: Bearer abcdefghijklmnop")
        poller.run_once()
        sent = agentmail.drafts[agentmail.sent_drafts[0]]["text"]
        self.assertIn("received your email", sent.lower())
        self.assertNotIn("Bearer", sent)

    def test_automatic_message_is_suppressed_without_reply(self):
        source = message("auto-1", "garyb@timelesstechs.com")
        source["headers"] = {"Auto-Submitted": "auto-replied"}
        poller, agentmail, model, store = self.make_poller([source])
        poller.run_once()
        self.assertEqual(store.get_message("auto-1")["state"], "suppressed")
        self.assertEqual(agentmail.sent_drafts, [])
        self.assertEqual(model.calls, [])

    def test_ambiguous_send_reuses_same_draft_after_restart(self):
        class AmbiguousAgentMail(FakeAgentMail):
            failed = False

            def send_draft(self, draft_id):
                result = super().send_draft(draft_id)
                if not self.failed:
                    self.failed = True
                    raise ApiError("transport_error")
                return result

        source = message("trusted-ambiguous", "garyb@timelesstechs.com")
        agentmail = AmbiguousAgentMail([source])
        store = StateStore(self.db)
        poller = Poller(self.config, store, agentmail, FakeModel())
        with self.assertRaises(ApiError):
            poller.run_once()
        poller.run_once()
        self.assertEqual(len(agentmail.drafts), 1)
        self.assertEqual(len(agentmail.sent_drafts), 1)
        self.assertEqual(store.get_message("trusted-ambiguous")["state"], "replied")


class ApprovalQueueTests(PollerTestCase):
    def test_external_message_creates_draft_and_one_dual_recipient_notice(self):
        source = message("external-1", "Pat <pat@example.net>", subject="A question")
        poller, agentmail, _, store = self.make_poller([source])
        poller.run_once()
        approval = store.get_approval(queue_id_for("external-1"))
        self.assertEqual(approval["state"], "pending")
        self.assertEqual(approval["recipient"], "pat@example.net")
        self.assertEqual(len(agentmail.sent_drafts), 1)
        notice = agentmail.drafts[agentmail.sent_drafts[0]]
        self.assertEqual(set(notice["to"]), TRUSTED)
        self.assertIn("APPROVE", notice["text"])
        self.assertNotIn("Please reply", notice["text"])

    def test_valid_approval_sends_unchanged_external_draft_once(self):
        source = message("external-2", "pat@example.net")
        poller, agentmail, _, store = self.make_poller([source])
        poller.run_once()
        queue_id = queue_id_for("external-2")
        token = approval_token(queue_id, self.config.signing_secret)
        command = message(
            "command-1",
            "Gary <garyb@timelesstechs.com>",
            subject=f"Re: [Titus approval {queue_id}]",
            text=f"APPROVE {queue_id} {token}\n\nquoted content",
        )
        agentmail.messages.append(command)
        poller.run_once()
        poller.run_once()
        approval = store.get_approval(queue_id)
        self.assertEqual(approval["state"], "approved")
        self.assertEqual(approval["decided_by"], "garyb@timelesstechs.com")
        external_draft = agentmail.drafts[approval["draft_id"]]
        self.assertEqual(external_draft["text"], approval["draft_text"])
        self.assertEqual(agentmail.sent_drafts.count(approval["draft_id"]), 1)

    def test_unauthorized_or_bad_token_cannot_approve(self):
        source = message("external-3", "pat@example.net")
        poller, agentmail, _, store = self.make_poller([source])
        poller.run_once()
        queue_id = queue_id_for("external-3")
        token = approval_token(queue_id, self.config.signing_secret)
        agentmail.messages.extend(
            [
                message("bad-actor", "attacker@example.net", text=f"APPROVE {queue_id} {token}"),
                message("bad-token", "austin@timelesstechs.com", text=f"APPROVE {queue_id} {'X' * 43}"),
            ]
        )
        poller.run_once()
        self.assertEqual(store.get_approval(queue_id)["state"], "pending")

    def test_reject_is_terminal_and_sends_nothing_external(self):
        source = message("external-4", "pat@example.net")
        poller, agentmail, _, store = self.make_poller([source])
        poller.run_once()
        sent_before = len(agentmail.sent_drafts)
        queue_id = queue_id_for("external-4")
        token = approval_token(queue_id, self.config.signing_secret)
        agentmail.messages.append(
            message("reject-1", "austin@timelesstechs.com", text=f"REJECT {queue_id} {token}")
        )
        poller.run_once()
        self.assertEqual(store.get_approval(queue_id)["state"], "rejected")
        self.assertEqual(len(agentmail.sent_drafts), sent_before)

    def test_changed_draft_fails_closed(self):
        source = message("external-5", "pat@example.net")
        poller, agentmail, _, store = self.make_poller([source])
        poller.run_once()
        queue_id = queue_id_for("external-5")
        approval = store.get_approval(queue_id)
        agentmail.drafts[approval["draft_id"]]["text"] = "Changed after review"
        token = approval_token(queue_id, self.config.signing_secret)
        agentmail.messages.append(
            message("approve-changed", "garyb@timelesstechs.com", text=f"APPROVE {queue_id} {token}")
        )
        poller.run_once()
        self.assertEqual(store.get_approval(queue_id)["state"], "failed")
        self.assertNotIn(approval["draft_id"], agentmail.sent_drafts)

    def test_ambiguous_approved_send_resumes_without_duplicate(self):
        class AmbiguousApprovalAgentMail(FakeAgentMail):
            fail_draft_id = None
            failed = False

            def send_draft(self, draft_id):
                result = super().send_draft(draft_id)
                if draft_id == self.fail_draft_id and not self.failed:
                    self.failed = True
                    raise ApiError("transport_error")
                return result

        source = message("external-ambiguous", "pat@example.net")
        agentmail = AmbiguousApprovalAgentMail([source])
        store = StateStore(self.db)
        poller = Poller(self.config, store, agentmail, FakeModel())
        poller.run_once()
        queue_id = queue_id_for("external-ambiguous")
        approval = store.get_approval(queue_id)
        agentmail.fail_draft_id = approval["draft_id"]
        token = approval_token(queue_id, self.config.signing_secret)
        agentmail.messages.append(
            message("approve-ambiguous", "garyb@timelesstechs.com", text=f"APPROVE {queue_id} {token}")
        )
        with self.assertRaises(ApiError):
            poller.run_once()
        poller.run_once()
        self.assertEqual(store.get_approval(queue_id)["state"], "approved")
        self.assertEqual(agentmail.sent_drafts.count(approval["draft_id"]), 1)


class LifecycleTests(PollerTestCase):
    def test_disabled_cycle_does_not_touch_network(self):
        poller, agentmail, model, _ = self.make_poller([message("m", "garyb@timelesstechs.com")])
        poller.config = replace(self.config, enabled=False)
        result = poller.run_once()
        self.assertEqual(result["state"], "disabled")
        self.assertEqual(agentmail.calls, [])
        self.assertEqual(model.calls, [])

    def test_initialize_marks_visible_messages_preexisting_without_sends(self):
        existing = [message("old-1", "garyb@timelesstechs.com"), message("old-2", "pat@example.net")]
        poller, agentmail, model, store = self.make_poller(existing)
        result = poller.initialize()
        self.assertEqual(result["preexisting"], 2)
        self.assertEqual(agentmail.sent_drafts, [])
        self.assertEqual(model.calls, [])
        self.assertEqual(store.get_message("old-1")["state"], "preexisting")

    def test_controlled_initialize_leaves_only_latest_unread_trusted_message(self):
        latest = message("latest", "garyb@timelesstechs.com")
        latest["labels"].append("unread")
        older = message("older", "garyb@timelesstechs.com")
        poller, agentmail, model, store = self.make_poller([latest, older])
        result = poller.initialize(leave_latest_trusted=True)
        self.assertEqual(result, {"preexisting": 1, "eligible": 1, "sends": 0})
        self.assertIsNone(store.get_message("latest"))
        self.assertEqual(store.get_message("older")["state"], "preexisting")
        self.assertEqual(agentmail.sent_drafts, [])
        self.assertEqual(model.calls, [])

    def test_health_accepts_disabled_or_fresh_and_rejects_stale(self):
        Path(self.health).write_text(json.dumps({"state": "disabled", "timestamp_epoch": 1}))
        self.assertEqual(health_status(self.health, now_epoch=999999, max_age=180)[0], True)
        Path(self.health).write_text(json.dumps({"state": "healthy", "timestamp_epoch": 100}))
        self.assertEqual(health_status(self.health, now_epoch=200, max_age=180)[0], True)
        self.assertEqual(health_status(self.health, now_epoch=400, max_age=180)[0], False)

    def test_processed_recent_page_does_not_starve_next_page(self):
        old = [message(f"old-{index}", "garyb@timelesstechs.com") for index in range(20)]
        new = message("new-on-page-two", "austin@timelesstechs.com")

        class PagedAgentMail(FakeAgentMail):
            def list_messages(self, page_token=None, limit=20):
                self.calls.append(("list_messages", page_token, limit))
                if page_token == "page-2":
                    return {"messages": [new], "next_page_token": None}
                return {"messages": old, "next_page_token": "page-2"}

        agentmail = PagedAgentMail(old + [new])
        store = StateStore(self.db)
        for item in old:
            store.mark_preexisting(item)
        poller = Poller(self.config, store, agentmail, FakeModel())
        poller.run_once()
        self.assertEqual(store.get_message("new-on-page-two")["state"], "replied")
        self.assertEqual(len(agentmail.sent_drafts), 1)


if __name__ == "__main__":
    unittest.main()
