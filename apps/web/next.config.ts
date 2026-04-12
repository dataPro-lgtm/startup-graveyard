import path from 'path';
import { config as loadEnv } from 'dotenv';
import type { NextConfig } from 'next';

// 与 `services/api` 一致：读 monorepo 根目录 `.env`（`apps/.env` 通常不存在）
loadEnv({ path: path.resolve(__dirname, '..', '..', '.env') });

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;