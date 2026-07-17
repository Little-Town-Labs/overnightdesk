import hashlib
import os
import sys
import unittest


RUNTIME = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "runtime"))
sys.path.insert(0, RUNTIME)

from agentmail_policy import (  # noqa: E402
    ConfigError,
    approval_token,
    classify_sender,
    draft_digest,
    is_automated_message,
    normalize_single_sender,
    parse_address_set,
    parse_approval_command,
    queue_id_for,
    validate_reply,
)


TRUSTED = {"garyb@timelesstechs.com", "austin@timelesstechs.com"}


class SenderPolicyTests(unittest.TestCase):
    def test_normalizes_display_name_and_case(self):
        self.assertEqual(
            normalize_single_sender("Gary Brown <GaryB@TimelessTechs.com>"),
            "garyb@timelesstechs.com",
        )

    def test_rejects_multiple_mailboxes(self):
        self.assertIsNone(
            normalize_single_sender("Gary <garyb@timelesstechs.com>, attacker@example.net")
        )

    def test_rejects_display_name_spoof(self):
        self.assertEqual(
            normalize_single_sender('"garyb@timelesstechs.com" <attacker@example.net>'),
            "attacker@example.net",
        )

    def test_rejects_header_injection_and_invalid_mailbox(self):
        self.assertIsNone(normalize_single_sender("Gary <gary@example.net>\r\nBcc: bad@evil.test"))
        self.assertIsNone(normalize_single_sender("not-an-address"))

    def test_parses_exact_configured_set(self):
        self.assertEqual(
            parse_address_set("garyb@timelesstechs.com, AUSTIN@timelesstechs.com"),
            TRUSTED,
        )
        with self.assertRaises(ConfigError):
            parse_address_set("Gary <garyb@timelesstechs.com>")

    def test_classifies_only_exact_trusted_address(self):
        self.assertEqual(classify_sender("garyb@timelesstechs.com", TRUSTED), "trusted")
        self.assertEqual(classify_sender("garyb@timelesstechs.com.evil", TRUSTED), "external")
        self.assertEqual(classify_sender(None, TRUSTED), "invalid_sender")


class ApprovalPolicyTests(unittest.TestCase):
    def test_queue_identifier_is_deterministic_and_nonrevealing(self):
        first = queue_id_for("message-secret-id")
        self.assertEqual(first, queue_id_for("message-secret-id"))
        self.assertRegex(first, r"^TITUS-[A-F0-9]{12}$")
        self.assertNotIn("message", first.lower())

    def test_approval_token_is_deterministic_keyed_and_256_bit(self):
        token = approval_token("TITUS-A1B2C3D4E5F6", "s" * 32)
        self.assertEqual(token, approval_token("TITUS-A1B2C3D4E5F6", "s" * 32))
        self.assertRegex(token, r"^[A-Za-z0-9_-]{43}$")
        self.assertNotEqual(token, approval_token("TITUS-000000000000", "s" * 32))

    def test_accepts_exact_first_nonempty_approval_line(self):
        token = "A" * 43
        command = parse_approval_command(f"\nAPPROVE TITUS-A1B2C3D4E5F6 {token}\nquoted text")
        self.assertEqual(command, ("approve", "TITUS-A1B2C3D4E5F6", token))

    def test_accepts_exact_rejection_line(self):
        token = "b" * 43
        self.assertEqual(
            parse_approval_command(f"REJECT TITUS-001122AABBCC {token}"),
            ("reject", "TITUS-001122AABBCC", token),
        )

    def test_rejects_quoted_embedded_or_malformed_command(self):
        token = "C" * 43
        self.assertIsNone(parse_approval_command(f"> APPROVE TITUS-A1B2C3D4E5F6 {token}"))
        self.assertIsNone(parse_approval_command(f"Please APPROVE TITUS-A1B2C3D4E5F6 {token}"))
        self.assertIsNone(parse_approval_command(f"approve TITUS-A1B2C3D4E5F6 {token}"))
        self.assertIsNone(parse_approval_command("APPROVE TITUS-A1B2C3D4E5F6 short"))

    def test_draft_digest_binds_recipient_source_and_text(self):
        digest = draft_digest("outside@example.net", "m-1", "Hello")
        self.assertEqual(len(digest), 64)
        self.assertNotEqual(digest, draft_digest("other@example.net", "m-1", "Hello"))
        self.assertNotEqual(digest, draft_digest("outside@example.net", "m-2", "Hello"))
        self.assertNotEqual(digest, draft_digest("outside@example.net", "m-1", "Changed"))
        self.assertEqual(digest, hashlib.sha256(b"outside@example.net\0m-1\0Hello").hexdigest())


class ReplyValidationTests(unittest.TestCase):
    def test_accepts_and_normalizes_bounded_plain_text(self):
        self.assertEqual(validate_reply("  Hello Gary.\n\nTitus  "), "Hello Gary.\n\nTitus")

    def test_rejects_empty_oversized_or_credential_like_output(self):
        self.assertIsNone(validate_reply("   "))
        self.assertIsNone(validate_reply("x" * 1201))
        self.assertIsNone(validate_reply("Use Authorization: Bearer abcdefghijklmnop"))
        self.assertIsNone(validate_reply("The key is sk-or-v1-abcdefghijklmnop"))
        self.assertIsNone(validate_reply("AgentMail am_abcdefghijklmnop"))

    def test_detects_automatic_and_bulk_messages(self):
        self.assertTrue(is_automated_message({"headers": {"Auto-Submitted": "auto-replied"}}))
        self.assertTrue(is_automated_message({"headers": {"Precedence": "bulk"}}))
        self.assertTrue(is_automated_message({"headers": {"X-Auto-Response-Suppress": "All"}}))
        self.assertFalse(is_automated_message({"headers": {"Auto-Submitted": "no"}}))


if __name__ == "__main__":
    unittest.main()
