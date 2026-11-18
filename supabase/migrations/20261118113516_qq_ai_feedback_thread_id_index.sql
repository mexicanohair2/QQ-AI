create index if not exists qq_ai_feedback_thread_id_idx
  on public.qq_ai_feedback (thread_id)
  where thread_id is not null;
