-- Forward reconcile note (2026-09-10)
-- Production project lrnhrzpwgyhkruwxeppw ("De Todo un Poco") had drifted migration
-- history (different timestamps / out-of-band tables). Missing Neuramark objects from
-- local files 20260829240000..20260831120000 were applied remotely via Management API
-- / supabase db query --linked, including:
--   playbooks, trends, provider catalog, cost policies, voice_id,
--   strategies → scripts → captions → spend → video jobs → assembly → branding →
--   QA → approvals → calendar → metrics → weekly cycle.
-- Storage CHECK alterations that would reject existing logo-* keys were skipped;
-- the logo-compatible CHECK (20260901220000) was applied instead.
-- This file documents the reconcile for repo history; DDL already live on remote.

SELECT 1;
