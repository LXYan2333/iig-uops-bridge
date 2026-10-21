import { beforeEach } from 'vitest';
import { setLanguage } from '../src/i18n';
// Existing regression assertions explicitly exercise the Chinese UI.
beforeEach(() => setLanguage('zh-CN'));
