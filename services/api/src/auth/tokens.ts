import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../config/index.js';

export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
  role: 'user' | 'admin';
  subscription: 'free' | 'pro';
}

const ACCESS_TTL = 15 * 60; // 15 minutes in seconds
const REFRESH_TTL_DAYS = 30;

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: ACCESS_TTL,
    issuer: 'startup-graveyard',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    return jwt.verify(token, config.auth.jwtSecret, {
      issuer: 'startup-graveyard',
    }) as AccessTokenPayload;
  } catch {
    return null;
  }
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export function refreshTokenExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TTL_DAYS);
  return d;
}

export const ACCESS_TOKEN_TTL_SECONDS = ACCESS_TTL;
