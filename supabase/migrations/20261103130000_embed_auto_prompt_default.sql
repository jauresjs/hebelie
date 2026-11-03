-- New clinics: welcome popup on by default.

alter table public.clinics
  alter column embed_auto_prompt set default true;
