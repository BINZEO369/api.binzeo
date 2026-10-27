BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_projects WHERE project_key = 'jabiyen') THEN
    RAISE EXCEPTION 'JABIYEN central project is not registered';
  END IF;
END;
$$;

-- Older JABIYEN payments predate central fulfillment tracking. Do not mark them
-- fulfilled without calling the separately hosted JABIYEN database RPC.
UPDATE public.payment_requests AS request
SET fulfillment_status = 'pending'
FROM (
  SELECT id FROM public.platform_projects WHERE project_key = 'jabiyen' LIMIT 1
) AS project
WHERE request.project_id = project.id
  AND request.fulfillment_status = 'not_required';

COMMENT ON COLUMN public.payment_requests.fulfillment_status IS
  'Server-side site fulfillment state. JABIYEN requests remain pending until its exact-amount RPC confirms the paid order; do not mark fulfilled manually.';

COMMIT;
