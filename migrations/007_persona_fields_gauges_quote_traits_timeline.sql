-- Étend le check constraint persona_section_fields.type pour inclure
-- les nouveaux types "gauges", "quote", "traits", "timeline".

ALTER TABLE public.persona_section_fields
  DROP CONSTRAINT IF EXISTS persona_section_fields_type_check;

ALTER TABLE public.persona_section_fields
  ADD CONSTRAINT persona_section_fields_type_check
  CHECK (type IN ('title', 'text', 'stats', 'separator', 'input', 'textarea', 'image-grid', 'inventory', 'skills', 'gauges', 'quote', 'traits', 'timeline'));
