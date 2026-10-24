-- Apply as migration owner after schema50, using a validated isolated runtime role identifier.
GRANT SELECT,INSERT ON notification_preferences TO __RUNTIME_ROLE__;
GRANT UPDATE(revision) ON notification_preferences TO __RUNTIME_ROLE__;
GRANT SELECT,INSERT,DELETE ON notification_preference TO __RUNTIME_ROLE__;
GRANT SELECT,INSERT ON inbox_work,notification TO __RUNTIME_ROLE__;
GRANT UPDATE(state,completed_at) ON inbox_work TO __RUNTIME_ROLE__;
GRANT UPDATE(read) ON notification TO __RUNTIME_ROLE__;
GRANT SELECT ON inbox_source TO __RUNTIME_ROLE__;
GRANT USAGE ON SEQUENCE inbox_work_sequence_seq TO __RUNTIME_ROLE__;
-- Existing notice/organization/account/order/message read grants are required by the invoker-security view.
-- Existing organization/account row-lock grants remain required. No commercial write grants are added.
