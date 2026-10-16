-- Default sectors for BINZEO and future brand projects such as JABIYEN.
-- Idempotent by sector_code so deployments can safely run this migration once.
insert into public.sectors (sector_code, sector_name, description, is_active)
values
  ('fashion_apparel', 'Fashion & Apparel', 'Fashion brands, clothing, accessories and apparel operations.', true),
  ('technology_software', 'Technology & Software', 'Software products, platforms, IT services and digital infrastructure.', true),
  ('design_creative', 'Design & Creative', 'Graphic design, branding, photography, video and creative production.', true),
  ('marketing_communications', 'Marketing & Communications', 'Marketing, advertising, public relations and communications.', true),
  ('ecommerce_retail', 'E-commerce & Retail', 'Online commerce, stores, merchandising and retail operations.', true),
  ('finance_accounting', 'Finance & Accounting', 'Finance, accounting, payments, investment and financial operations.', true),
  ('education_training', 'Education & Training', 'Schools, courses, coaching, skills and professional training.', true),
  ('health_wellness', 'Health & Wellness', 'Healthcare, fitness, wellbeing and personal care services.', true),
  ('travel_hospitality', 'Travel & Hospitality', 'Travel, tourism, hotels, restaurants and hospitality services.', true),
  ('manufacturing_supply_chain', 'Manufacturing & Supply Chain', 'Manufacturing, sourcing, logistics, procurement and distribution.', true)
on conflict (sector_code) do update
set sector_name = excluded.sector_name,
    description = excluded.description,
    is_active = true;
