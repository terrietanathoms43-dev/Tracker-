revoke execute on function public.tw_audit_change(),public.tw_audit_plan(),public.tw_can_manage(uuid),public.tw_is_member(uuid) from public,anon;
revoke execute on function public.tw_audit_change(),public.tw_audit_plan() from authenticated;
grant execute on function public.tw_can_manage(uuid),public.tw_is_member(uuid) to authenticated;