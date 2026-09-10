-- Version 1 used rollout modes that are intentionally not part of the direct
-- version 2 policy. Remove the v5-only setting so the maintained default or
-- runtime seed can establish a complete version 2 document.
DELETE FROM "admin_settings" WHERE "key" = 'computeLimitPolicies';
