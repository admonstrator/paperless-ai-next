// Sanitises configuration before it is serialised into the setup bootstrap
// payload (window.__SETUP_BOOTSTRAP__) delivered to the browser. Any secret
// listed here must never reach client-side HTML, even in partial/degraded
// setup states. Related advisory: GHSA-84cq-vv67-g8xx.
const BOOTSTRAP_SECRET_FIELDS = [
  'PAPERLESS_API_TOKEN',
  'OPENAI_API_KEY',
  'OLLAMA_API_KEY',
  'CUSTOM_API_KEY',
  'AZURE_API_KEY',
  'OCR_API_KEY',
  'MISTRAL_API_KEY',
  'API_KEY',
  'JWT_SECRET',
];

// Returns a shallow copy of config with every secret field removed.
function sanitizeConfigForBootstrap(config) {
  const sanitized = { ...config };
  for (const field of BOOTSTRAP_SECRET_FIELDS) {
    delete sanitized[field];
  }
  return sanitized;
}

module.exports = {
  BOOTSTRAP_SECRET_FIELDS,
  sanitizeConfigForBootstrap,
};
