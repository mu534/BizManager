-- Seed plans, features, and usage limits
-- Idempotent: safe to run multiple times

-- Plans
INSERT INTO plans (id, name, "displayName", "isActive", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'STARTER',  'Starter',  true, NOW(), NOW()),
  (gen_random_uuid()::text, 'BUSINESS', 'Business', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'PRO',      'Pro',      true, NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

-- Plan features (STARTER)
INSERT INTO plan_features (id, "planId", "featureKey", enabled)
SELECT gen_random_uuid()::text, p.id, f.key, f.enabled
FROM plans p, (VALUES
  ('OFFLINE_SYNC',     true),
  ('MULTI_USER',       false),
  ('MULTI_BRANCH',     false),
  ('ADVANCED_REPORTS', false)
) AS f(key, enabled)
WHERE p.name = 'STARTER'
ON CONFLICT ("planId", "featureKey") DO NOTHING;

-- Plan features (BUSINESS)
INSERT INTO plan_features (id, "planId", "featureKey", enabled)
SELECT gen_random_uuid()::text, p.id, f.key, f.enabled
FROM plans p, (VALUES
  ('OFFLINE_SYNC',     true),
  ('MULTI_USER',       true),
  ('ADVANCED_REPORTS', true),
  ('MULTI_BRANCH',     false)
) AS f(key, enabled)
WHERE p.name = 'BUSINESS'
ON CONFLICT ("planId", "featureKey") DO NOTHING;

-- Plan features (PRO)
INSERT INTO plan_features (id, "planId", "featureKey", enabled)
SELECT gen_random_uuid()::text, p.id, f.key, f.enabled
FROM plans p, (VALUES
  ('OFFLINE_SYNC',     true),
  ('MULTI_USER',       true),
  ('ADVANCED_REPORTS', true),
  ('MULTI_BRANCH',     true),
  ('TAX_TOOLS',        true)
) AS f(key, enabled)
WHERE p.name = 'PRO'
ON CONFLICT ("planId", "featureKey") DO NOTHING;

-- Usage limits (STARTER)
INSERT INTO usage_limits (id, "planId", "limitKey", value)
SELECT gen_random_uuid()::text, p.id, l.key, l.val
FROM plans p, (VALUES
  ('MAX_PRODUCTS',            200),
  ('MAX_USERS',                 1),
  ('MAX_TRANSACTIONS_MONTH',  500)
) AS l(key, val)
WHERE p.name = 'STARTER'
ON CONFLICT ("planId", "limitKey") DO NOTHING;

-- Usage limits (BUSINESS)
INSERT INTO usage_limits (id, "planId", "limitKey", value)
SELECT gen_random_uuid()::text, p.id, l.key, l.val
FROM plans p, (VALUES
  ('MAX_PRODUCTS',            2000),
  ('MAX_USERS',                  5),
  ('MAX_TRANSACTIONS_MONTH',    -1)
) AS l(key, val)
WHERE p.name = 'BUSINESS'
ON CONFLICT ("planId", "limitKey") DO NOTHING;

-- Usage limits (PRO — all unlimited)
INSERT INTO usage_limits (id, "planId", "limitKey", value)
SELECT gen_random_uuid()::text, p.id, l.key, l.val
FROM plans p, (VALUES
  ('MAX_PRODUCTS',           -1),
  ('MAX_USERS',              -1),
  ('MAX_TRANSACTIONS_MONTH', -1)
) AS l(key, val)
WHERE p.name = 'PRO'
ON CONFLICT ("planId", "limitKey") DO NOTHING;

SELECT name, "displayName" FROM plans ORDER BY name;
