-- Autorise le nouveau type de champ persona "dl" (liste descriptive)
ALTER TABLE public.persona_section_fields
  DROP CONSTRAINT persona_section_fields_type_check;

ALTER TABLE public.persona_section_fields
  ADD CONSTRAINT persona_section_fields_type_check
  CHECK (type = ANY (ARRAY[
    'title'::text, 'text'::text, 'stats'::text, 'separator'::text,
    'input'::text, 'textarea'::text, 'image-grid'::text, 'inventory'::text,
    'skills'::text, 'gauges'::text, 'quote'::text, 'traits'::text,
    'timeline'::text, 'dl'::text
  ]));
