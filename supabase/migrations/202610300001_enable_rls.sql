-- 防止匿名或已登录的客户端绕过应用直接访问业务表。
-- 应用服务端的 service_role 仍会绕过 RLS，因此此迁移不能替代应用层的身份认证和病例归属校验。
-- 如果已有自定义策略，请在执行前核查；本迁移不会删除已有策略。
alter table public.patients enable row level security;
alter table public.surgical_plans enable row level security;
alter table public.plan_versions enable row level security;
alter table public.plan_feedback enable row level security;
alter table public.simulations enable row level security;
alter table public.knowledge_entries enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.generated_images enable row level security;
