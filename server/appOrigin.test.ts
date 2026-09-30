import { afterEach, describe, expect, it } from 'vitest';
import { appOrigin } from './appOrigin';

const req = (headers: Record<string, string>) => ({ headers });

describe('appOrigin', () => {
  const saved = process.env.APP_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = saved;
  });

  it('uses APP_URL when set, whatever the request says', () => {
    process.env.APP_URL = 'https://aheadoftime.app/';
    expect(appOrigin(req({ host: 'evil.example' }))).toBe('https://aheadoftime.app');
  });

  it('never trusts a foreign Host or X-Forwarded-Host', () => {
    delete process.env.APP_URL;
    expect(appOrigin(req({ host: 'evil.example' }))).toBe('https://aheadoftime.app');
    expect(appOrigin(req({ host: 'aheadoftime.app', 'x-forwarded-host': 'evil.example' }))).toBe('https://aheadoftime.app');
  });

  it('accepts our own domains and local development', () => {
    delete process.env.APP_URL;
    expect(appOrigin(req({ host: 'www.aheadoftime.app' }))).toBe('https://www.aheadoftime.app');
    expect(appOrigin(req({ host: 'localhost:3000' }))).toBe('http://localhost:3000');
  });
});
