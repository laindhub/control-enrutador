import unittest
from server import view_message

class NeutralRules(unittest.TestCase):
    def row(self, sender=0, recipient=0, state="done"):
        return {
            "id":"73c6c1d9-90ad-431e-9a8e-c504b15dcbeb",
            "sender_id":"a", "recipient_id":"b",
            "body_original":"original", "body_neutral":"neutral",
            "neutral_sender":sender, "neutral_recipient":recipient,
            "state":state, "created_at":"2026-11-16T00:00:00Z"
        }
    def test_neither_opted_in(self):
        self.assertEqual(view_message(self.row(), "a")["text"],"original")
        self.assertEqual(view_message(self.row(), "b")["text"],"original")
    def test_only_sender_opted_in(self):
        r=self.row(sender=1)
        self.assertEqual(view_message(r,"a")["text"],"neutral")
        self.assertEqual(view_message(r,"b")["text"],"neutral")
    def test_only_recipient_opted_in(self):
        r=self.row(recipient=1)
        self.assertEqual(view_message(r,"a")["text"],"original")
        self.assertEqual(view_message(r,"b")["text"],"neutral")
    def test_both_opted_in(self):
        r=self.row(sender=1,recipient=1)
        self.assertEqual(view_message(r,"a")["text"],"neutral")
        self.assertEqual(view_message(r,"b")["text"],"neutral")
    def test_pending_never_leaks_raw_to_neutral_viewer(self):
        r=self.row(recipient=1,state="pending")
        self.assertIsNone(view_message(r,"b")["text"])
        self.assertEqual(view_message(r,"a")["text"],"original")
    def test_failed_never_leaks_raw_to_neutral_viewer(self):
        r=self.row(sender=1,state="unavailable")
        self.assertIsNone(view_message(r,"a")["text"])
        self.assertIsNone(view_message(r,"b")["text"])

if __name__=="__main__":
    unittest.main()
