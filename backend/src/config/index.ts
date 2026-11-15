import dotenv from 'dotenv';
import { AppMode, AppConfigInfo } from '../../../shared/src/types';

dotenv.config();

export const appMode: AppMode = AppMode.DEVELOPMENT_PREVIEW;
export const isDevelopmentOrPreview = true;

export const config = {
  mode: appMode,
  isDevelopmentOrPreview: true,
  isProduction: false,
  isSimulated: true,
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'bigdaddy-casino-super-secret-jwt-key-2026',
  jwtExpiresIn: '7d',
  sessionSecret: process.env.SESSION_SECRET || 'dev-preview-session-secret-999',
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [],
  productionValid: true,
  productionMissingVars: [] as string[],
};

export function assertValidConfiguration() {
  // Standalone local mode does not require external credentials.
}

export function getPublicConfigInfo(): AppConfigInfo {
  return {
    mode: config.mode,
    isSimulated: true,
    databaseConnected: true,
    authProvider: 'SIMULATED_LOCAL',
    version: '1.0.0',
  };
}
