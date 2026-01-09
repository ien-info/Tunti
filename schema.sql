
-- Tunti game DB schema (PostgreSQL-first)
-- Note: This schema uses PostgreSQL types/checks. For MySQL, replace SERIAL with INT AUTO_INCREMENT,
-- and adjust CHECK constraints accordingly.

CREATE TABLE IF NOT EXISTS kingdoms (
  id SERIAL PRIMARY KEY,
  code VARCHAR(16) UNIQUE NOT NULL,
  name VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS resources (
  kingdom_id INTEGER PRIMARY KEY REFERENCES kingdoms(id) ON DELETE CASCADE,
  rice INTEGER NOT NULL DEFAULT 0,
  gold INTEGER NOT NULL DEFAULT 0,
  timber INTEGER NOT NULL DEFAULT 0,
  spices INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tiles (
  id SERIAL PRIMARY KEY,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  terrain VARCHAR(16) NOT NULL CHECK (terrain IN ('plains','forest','mountain','water','city')),
  is_city BOOLEAN NOT NULL DEFAULT FALSE,
  owner_id INTEGER REFERENCES kingdoms(id) ON DELETE SET NULL,
  building VARCHAR(16) CHECK (building IN ('farm','lumber','market','barracks','port','pagoda','palace')),
  UNIQUE (x, y)
);

CREATE INDEX IF NOT EXISTS idx_tiles_owner ON tiles(owner_id);
CREATE INDEX IF NOT EXISTS idx_tiles_xy ON tiles(x, y);

CREATE TABLE IF NOT EXISTS units (
  id SERIAL PRIMARY KEY,
  type VARCHAR(16) NOT NULL CHECK (type IN ('infantry','archer','cavalry','ship')),
  hp INTEGER NOT NULL DEFAULT 3 CHECK (hp >= 0),
  tile_id INTEGER NOT NULL REFERENCES tiles(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_units_tile ON units(tile_id);
CREATE INDEX IF NOT EXISTS idx_units_owner ON units(owner_id);

CREATE TABLE IF NOT EXISTS capitals (
  kingdom_id INTEGER PRIMARY KEY REFERENCES kingdoms(id) ON DELETE CASCADE,
  tile_id INTEGER NOT NULL UNIQUE REFERENCES tiles(id) ON DELETE CASCADE,
  hp INTEGER NOT NULL DEFAULT 5 CHECK (hp >= 0)
);

-- Optional: game sessions (for future multiplayer/save slots)
CREATE TABLE IF NOT EXISTS game_sessions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(64),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
