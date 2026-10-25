import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('remote_guard', pathlib.Path(__file__).resolve().parents[1] / 'tv/remote_guard.py')
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.policy = guard.Policy()

    def key(self, code, value, now, protected=True, session='youtube-1'):
        return self.policy.key(code, value, now, protected, session)

    def test_arrows_and_volume_pass_including_hold(self):
        for code in [28, 103, 105, 106, 108, 113, 114, 115, 116, 119, 168, 207, 208, 272, 352]:
            self.assertEqual(self.key(code, 1, 0), 'pass')
            self.assertEqual(self.key(code, 2, 1), 'pass')
            self.assertEqual(self.key(code, 0, 2), 'pass')

    def test_double_press_emits_one_tap_and_swallows_repeats(self):
        for code in guard.KEYS:
            self.assertEqual(self.key(code, 1, 0), 'block')
            self.assertEqual(self.key(code, 2, .2), 'block')
            self.assertEqual(self.key(code, 1, .3), 'block')
            self.assertEqual(self.key(code, 0, .4), 'block')
            self.assertEqual(self.key(code, 1, .8), 'tap')
            self.assertEqual(self.key(code, 2, 1.0), 'block')
            self.assertEqual(self.key(code, 0, 1.2), 'block')

    def test_late_second_press_is_blocked(self):
        self.key(412, 1, 0); self.key(412, 0, .1)
        self.assertEqual(self.key(412, 1, 2.2), 'block')

    def test_other_navigation_cancels_confirmation(self):
        self.key(412, 1, 0); self.key(412, 0, .1)
        self.key(105, 1, .2); self.key(105, 0, .3)
        self.assertEqual(self.key(412, 1, .4), 'block')

    def test_different_protected_key_does_not_confirm(self):
        self.key(412, 1, 0); self.key(412, 0, .1)
        self.assertEqual(self.key(773, 1, .2), 'block')

    def test_context_change_resets_pending_but_swallows_old_release(self):
        self.key(412, 1, 0)
        self.assertEqual(self.key(412, 0, .1, False, 'launcher'), 'block')
        self.assertEqual(self.key(412, 1, .2, False, 'launcher'), 'pass')
        self.key(412, 0, .3, False, 'launcher')
        self.assertEqual(self.key(412, 1, .4, True, 'netflix-2'), 'block')

    def test_disabled_guard_passes_buttons(self):
        for code in guard.KEYS:
            self.assertEqual(self.key(code, 1, 0, False), 'pass')
            self.assertEqual(self.key(code, 0, .1, False), 'pass')

    def test_hold_is_never_a_second_press(self):
        self.key(773, 1, 0)
        for now in [.1, .5, 1, 3, 8]:
            self.assertEqual(self.key(773, 2, now), 'block')
        self.assertEqual(self.key(773, 0, 9), 'block')

    def test_home_routes_once_without_native_key_even_across_app_changes(self):
        self.assertEqual(self.policy.key(773, 1, 0, False, 'launcher', True), 'home')
        for value in [2, 1, 2]:
            self.assertEqual(self.policy.key(773, value, .2, False, 'other', True), 'block')
        self.assertEqual(self.policy.key(773, 0, .5, False, 'other', True), 'block')
        self.assertEqual(self.policy.key(773, 1, .7, False, 'other', True), 'home')

    def test_streaming_home_still_requires_two_released_presses(self):
        self.assertEqual(self.policy.key(773, 1, 0, True, 'netflix', True), 'block')
        self.assertEqual(self.policy.key(773, 2, .2, True, 'netflix', True), 'block')
        self.assertEqual(self.policy.key(773, 0, .3, True, 'netflix', True), 'block')
        self.assertEqual(self.policy.key(773, 1, .5, True, 'netflix', True), 'home')
        self.assertEqual(self.policy.key(773, 2, .6, False, 'launcher', True), 'block')
        self.assertEqual(self.policy.key(773, 0, .7, False, 'launcher', True), 'block')

    def test_home_route_fails_open_when_context_is_stale_disabled_or_unsupported(self):
        value = {'updatedAt': 1000, 'active': True, 'appId': 'netflix',
                 'session': 'n1', 'managerPid': 123, 'homeRouting': True}
        self.assertEqual(guard.context_state(value, 1001, True, True), (True, 'n1', 123))
        self.assertEqual(guard.context_state(value, 7000, True, True), (False, 'n1', None))
        self.assertEqual(guard.context_state(value, 999, True, True), (False, 'n1', None))
        self.assertEqual(guard.context_state(value, 1001, False, True), (False, 'n1', None))
        self.assertEqual(guard.context_state(value, 1001, True, False), (True, 'n1', None))
        value['homeRouting'] = False
        self.assertEqual(guard.context_state(value, 1001, True, True), (True, 'n1', None))
        value['active'] = False
        self.assertEqual(guard.context_state(value, 1001, True, True), (False, 'n1', None))


if __name__ == '__main__':
    unittest.main()
