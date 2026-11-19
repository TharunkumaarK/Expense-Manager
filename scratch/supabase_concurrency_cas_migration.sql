-- ============================================================================
-- Expense Manager — Phase 5 Cloud Concurrency CAS Migration Specification
-- ============================================================================
-- IMPORTANT: DO NOT EXECUTE ON PRODUCTION SUPABASE WITHOUT EXPLICIT APPROVAL.
-- This script documents the database-enforced optimistic concurrency mechanism
-- for public.app_state to guarantee zero lost updates across multiple devices.
-- ============================================================================

-- 1. Ensure public.app_state table has an explicit revision column if desired,
-- or operate on JSONB state->>'revision'
ALTER TABLE public.app_state
ADD COLUMN IF NOT EXISTS revision BIGINT DEFAULT 1;

-- 2. Backfill revision from state jsonb if present, defaulting to 1
UPDATE public.app_state
SET revision = COALESCE((state->>'revision')::bigint, 1)
WHERE revision IS NULL;

-- 3. Stored Procedure for Atomic Compare-And-Swap (CAS)
CREATE OR REPLACE FUNCTION public.commit_app_state_cas(
    p_expected_revision BIGINT,
    p_new_state JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_current_rev BIGINT;
    v_row app_state%ROWTYPE;
    v_new_rev BIGINT;
BEGIN
    -- Require authenticated caller
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Lock the row for update to serialize concurrent transactions
    SELECT * INTO v_row
    FROM app_state
    WHERE user_id = v_user_id
    FOR UPDATE;

    -- Compute new revision
    v_new_rev := COALESCE(p_expected_revision, 0) + 1;

    -- Ensure new state has the advanced revision embedded
    p_new_state := jsonb_set(p_new_state, '{revision}', to_jsonb(v_new_rev));

    -- Case 1: Initial state insertion
    IF v_row.user_id IS NULL THEN
        INSERT INTO app_state(user_id, state, updated_at, revision)
        VALUES (v_user_id, p_new_state, now(), v_new_rev)
        RETURNING * INTO v_row;

        RETURN jsonb_build_object(
            'success', true,
            'revision', v_new_rev,
            'updated_at', v_row.updated_at
        );
    END IF;

    -- Extract current database revision
    v_current_rev := COALESCE(v_row.revision, (v_row.state->>'revision')::bigint, 0);

    -- Case 2: Stale write rejection (CAS check failed)
    IF v_current_rev <> p_expected_revision THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'CLOUD_REVISION_CONFLICT',
            'conflict', true,
            'server_revision', v_current_rev,
            'expected_revision', p_expected_revision,
            'server_updated_at', v_row.updated_at
        );
    END IF;

    -- Case 3: Successful compare-and-swap
    UPDATE app_state
    SET state = p_new_state,
        revision = v_new_rev,
        updated_at = now()
    WHERE user_id = v_user_id
    RETURNING * INTO v_row;

    RETURN jsonb_build_object(
        'success', true,
        'revision', v_new_rev,
        'updated_at', v_row.updated_at
    );
END;
$$;

-- 4. Grant execution permission to authenticated users only
REVOKE ALL ON FUNCTION public.commit_app_state_cas(BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_app_state_cas(BIGINT, JSONB) TO authenticated;

