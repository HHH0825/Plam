import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from palm.routes_auth import account_age_days


class AccountAgeTest(unittest.TestCase):
    def test_beijing_day_and_registration_day(self):
        today = date(2026, 10, 11)
        for timestamp in ('2026-10-10 16:00:00', '2026-10-10T16:00:00Z', '2026-10-11T00:00:00+08:00'):
            self.assertEqual(account_age_days({'created_at': timestamp}, today), 1)
        self.assertEqual(account_age_days({'created_at': '2026-10-10 15:59:59'}, today), 2)
        self.assertEqual(account_age_days({'created_at': '2024-02-29T00:00:00+08:00'}, date(2024, 3, 1)), 2)

    def test_missing_invalid_future_are_unknown(self):
        today = date(2026, 10, 11)
        self.assertIsNone(account_age_days({}, today))
        for timestamp in (None, 0, '', 'bad', '2026-13-01', '2026-10-12T00:00:00+08:00'):
            self.assertIsNone(account_age_days({'created_at': timestamp}, today))
        self.assertIsNone(account_age_days({'created_at': '2026-10-11T12:00:00+08:00'}, today,
                                          datetime(2026, 10, 11, 3, tzinfo=timezone.utc)))
