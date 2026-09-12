UPDATE distribution_opportunities
SET status='skipped',
    human_required=0,
    next_action='Excluded from the human distribution queue because no verified ToolScout submission route was established.',
    updated_at=datetime('now')
WHERE surface_slug IN (
  'bedfit-app',
  'myastrid-ai',
  'mejorarcalidaddeimagen-ai',
  'aifordevelopers-org'
)
AND status='human_action_required';
