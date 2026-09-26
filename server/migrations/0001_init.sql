-- Encrypted vaults. The server stores only a hash of each vault's access key.
CREATE TABLE IF NOT EXISTS vaults (
  id TEXT PRIMARY KEY,
  auth_hash TEXT NOT NULL,
  rev INTEGER NOT NULL,
  blob TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS vaults_updated ON vaults (updated_at);

-- Short-lived device pairing sessions (10 minutes).
CREATE TABLE IF NOT EXISTS pairs (
  code TEXT PRIMARY KEY,
  pub_a TEXT NOT NULL,
  pub_b TEXT,
  payload TEXT,
  expires_at INTEGER NOT NULL
);

-- Rate-limit counters, keyed by a hash of the IP address.
CREATE TABLE IF NOT EXISTS hits (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
