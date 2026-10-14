-- Each analysis's human decisions form an ordered, append-only review history.
-- A unique revision number fails closed when two reviewers save simultaneously.
create unique index if not exists sera_vnext_reviews_analysis_review_version_unique
  on public.sera_vnext_analysis_reviews (analysis_id, review_version);

create trigger prevent_sera_vnext_review_update
before update on public.sera_vnext_analysis_reviews
for each row execute function public.prevent_sera_vnext_append_only_update();

create trigger prevent_sera_vnext_review_delete
before delete on public.sera_vnext_analysis_reviews
for each row execute function public.prevent_sera_vnext_append_only_delete();
