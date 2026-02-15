/**
 * Logger utility — tagged console logging for easy filtering in Metro/Safari.
 *
 * Usage:
 *   import { log } from '../utils/logger';
 *   log.auth('Login attempt', { email });
 *   log.scan('Upload started');
 *   log.api('POST /auth/login', { status: 200 });
 *   log.error('auth', 'Login failed', err);
 */

type Tag = 'auth' | 'scan' | 'home' | 'api' | 'nav' | 'action' | 'config';

function fmt(tag: Tag, msg: string, data?: unknown): string {
  const ts = new Date().toISOString().slice(11, 23); // HH:mm:ss.sss
  return `[${ts}][${tag.toUpperCase()}] ${msg}`;
}

function info(tag: Tag, msg: string, data?: unknown) {
  if (data !== undefined) {
    console.log(fmt(tag, msg), data);
  } else {
    console.log(fmt(tag, msg));
  }
}

function warn(tag: Tag, msg: string, data?: unknown) {
  if (data !== undefined) {
    console.warn(fmt(tag, msg), data);
  } else {
    console.warn(fmt(tag, msg));
  }
}

function error(tag: Tag, msg: string, err?: unknown) {
  const errMsg = err instanceof Error ? err.message : String(err ?? '');
  console.error(fmt(tag, `${msg}${errMsg ? ': ' + errMsg : ''}`));
}

export const log = {
  auth: (msg: string, data?: unknown) => info('auth', msg, data),
  scan: (msg: string, data?: unknown) => info('scan', msg, data),
  home: (msg: string, data?: unknown) => info('home', msg, data),
  api:  (msg: string, data?: unknown) => info('api', msg, data),
  nav:  (msg: string, data?: unknown) => info('nav', msg, data),
  action: (msg: string, data?: unknown) => info('action', msg, data),
  config: (msg: string, data?: unknown) => info('config', msg, data),
  warn: (tag: Tag, msg: string, data?: unknown) => warn(tag, msg, data),
  error: (tag: Tag, msg: string, err?: unknown) => error(tag, msg, err),
};
