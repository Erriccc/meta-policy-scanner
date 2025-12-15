// Meta Policy Scanner - Main Entry Point

// Export types
export * from './types';

// Export scanner functions
export { scanDirectory } from './scanner/local-scanner';
export { scanGitHubRepo, isGitHubUrl, parseGitHubUrl } from './scanner/github-scanner';
export { SDKDetector, detectMetaPackages, SDK_REGISTRY } from './scanner/sdk-detector';

// Export rule management
export { RuleManager } from './rules/rule-manager';

// Export database client
export { createClient, getClient, testConnection } from './db/supabase';
