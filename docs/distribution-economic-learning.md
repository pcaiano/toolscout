# Distribution Economic Learning

The Distribution Engine keeps a structural baseline score for each surface and adds a bounded positive boost from observed 30-day performance.

Priority evidence, strongest first:

1. confirmed/paid attributed revenue
2. monetized outbound clicks
3. outbound clicks
4. likely-human sessions

Missing performance evidence never reduces a surface's baseline score. The learned score is deterministic from the stored baseline plus the current bounded boost, so repeated cycles do not compound scores artificially.
