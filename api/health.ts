/**
 * Vercel Serverless Function: /api/health
 * Returns build version information for debugging deployment issues
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptions } from './utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  
  if (handleOptions(req, res)) {
    return;
  }
  
  // Get build version fingerprint
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA 
    ? process.env.VERCEL_GIT_COMMIT_SHA.substring(0, 7)
    : process.env.VERCEL_DEPLOYMENT_ID || 'local';
  
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || 'local';
  const gitCommitSha = process.env.VERCEL_GIT_COMMIT_SHA || 'unknown';
  const vercelEnv = process.env.VERCEL_ENV || 'local';
  const vercelUrl = process.env.VERCEL_URL || 'local';
  
  res.status(200).json({
    status: 'ok',
    build: buildId,
    deployment: deploymentId,
    commit: gitCommitSha,
    env: vercelEnv,
    url: vercelUrl,
    timestamp: new Date().toISOString(),
  });
}
